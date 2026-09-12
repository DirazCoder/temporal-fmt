// Host side of the mod sandbox. Everything in scripts/modWorker.mjs runs
// inside a subprocess spawned from here; this file decides what that
// subprocess is allowed to do, talks to it, and keeps the results.
//
// The security model in one paragraph: a mod's code never runs in this
// process. It runs in a child Node started with the permission-model
// flag for the running Node version, so Node itself refuses any fs,
// child-process, or worker access the mod wasn't granted. The only way a
// mod affects the host is through the registration records and override
// replies it sends back over a pipe — the same narrow ModContext surface
// as before, now actually enforced instead of just conventional.
//
// Runtime overrides (overrideFormat/overrideParse and the other
// ctx.override* points) are the hard case: the mod's impl is a closure
// living in the child, but format()/parse() are synchronous APIs whose
// result must come back inside the caller's stack frame. So the host
// writes the call to the child and blocks reading the reply back — no
// event loop turns in between. On macOS and Linux that rides the fork
// pipes via their raw fds, the one synchronous parent-child channel
// Node offers there. On Windows the host's end of a named pipe has no fd
// (child.stdin._handle.fd is -1), so each worker instead gets a private
// scratch dir whose call/ret files carry the same newline-delimited
// protocol — senders append, readers do positioned reads. While blocked,
// the host polls with Atomics.wait(…, a few ms) because the pipes are
// non-blocking on some Node versions and a file read returns 0 at its
// current end, checking the clock each round so a hung mod can't hold
// the CLI hostage: past the deadline the child is killed and the host
// falls back to the built-in implementation.

import { fork, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { readSync, writeSync, realpathSync, openSync, closeSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import {
  GRANTABLE_PERMISSIONS,
  SETUP_TIMEOUT_MS,
  RUNTIME_TIMEOUT_MS,
  permissionFlagName,
  toWire,
  fromWire,
  errorFromWire,
  stableStringify,
} from './modWire.mjs';

const WORKER_PATH = fileURLToPath(new URL('./modWorker.mjs', import.meta.url));
const CHUNK = Buffer.alloc(65536);

// How many distinct (format string, options) keys to remember the
// "mod passes this through to the built-in" answer for. No TTL: a mod's
// compiled behavior can't change mid-process, so entries only go stale
// if the process itself does.
const MAX_OVERRIDE_KEY_CACHE = 1024;

// The RSS ceiling per mod subprocess and how often to look. Node's own
// resourceLimits are no good for this — they bound the JS heap only,
// ignore ArrayBuffer allocations entirely, and get silently overridden
// when --max-old-space-size is set anywhere in the process tree (npm
// run test:coverage sets it to 4096), so a heap limit that depends on
// nobody setting that flag is a limit that silently stops existing.
// Watching actual RSS from the parent covers all of it: heap, buffers,
// and native allocations are all resident memory. 512MB leaves generous
// headroom over a bare Node + library baseline (~80MB) while still
// catching a mod that allocates without bound.
const DEFAULT_MEMORY_CEILING_MB = 512;
const RSS_POLL_INTERVAL_MS = 250;

// The env a sandboxed mod starts with. Deliberately not process.env:
// reading environment variables is one of the easiest ways for a mod to
// pick up secrets (CI tokens, database URLs), and the permission model
// has no flag that could gate it — so it doesn't get the chance. What's
// passed is what Node or the mod's own output could plausibly need:
// PATH for granted child-process spawns, TZ because Temporal math is
// timezone-sensitive, LANG/LC_* for Intl locale selection, and the
// variables Windows needs to bootstrap. NODE_OPTIONS is conspicuously
// absent — it would let the parent's env inject flags into the child.
const PASSTHROUGH_ENV_KEYS = [
  'PATH', 'TZ', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'HOMEDRIVE', 'HOMEPATH',
];

const liveChildren = new Set();
// File transport only: scratch dir per worker, tracked alongside the
// child so every exit path (clean teardown, watchdog kill, host crash)
// has one place that knows what to remove.
const bridgeDirs = new Map();
const warnedBridges = new Set();

// Why a child was killed by the watchdog, hung off the ChildProcess
// itself so whoever notices the death (a blocked bridge read, the exit
// listener, a later call) can say why instead of reporting a bare EPIPE.
const watchdogReason = Symbol('temporal-fmt watchdog kill reason');

// The idle half of the RSS watchdog. A timer can't be the whole story
// here: while the host is blocked inside bridge.call() there is no event
// loop turning, so no timer fires — which is exactly when a mod can spin
// and grow. The blocked loops in WorkerBridge therefore check RSS
// themselves; this interval covers the other case, a long-lived
// override bridge that balloons while the host is doing something else.
let rssPollTimer = null;

function ensureRssPolling() {
  if (rssPollTimer) return;
  rssPollTimer = setInterval(() => {
    if (liveChildren.size === 0) {
      clearInterval(rssPollTimer);
      rssPollTimer = null;
      return;
    }
    for (const child of liveChildren) {
      const rss = readChildRssBytes(child.pid);
      if (rss !== null && rss > memoryCeilingBytes()) {
        killForMemory(child, rss);
      }
    }
  }, RSS_POLL_INTERVAL_MS);
  // Never the reason a loaded process stays alive.
  rssPollTimer.unref();
}

// One subprocess's resident set, read from the parent — dependency-free,
// so the mechanism is whatever the platform offers: /proc on Linux, `ps`
// on macOS, `tasklist` on Windows. A read that fails or parses into
// nothing returns null and the caller skips this tick; a measurement
// problem must not become a kill.
function readChildRssBytes(pid) {
  try {
    if (process.platform === 'linux') {
      const fd = openSync(`/proc/${pid}/status`, 'r');
      try {
        const chunk = Buffer.alloc(8192);
        const n = readSync(fd, chunk, 0, chunk.length);
        const match = chunk.toString('utf8', 0, n).match(/^VmRSS:\s+(\d+) kB$/m);
        return match ? Number(match[1]) * 1024 : null;
      } finally {
        closeSync(fd);
      }
    }
    if (process.platform === 'darwin') {
      const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim());
      return Number.isFinite(kb) && kb > 0 ? kb * 1024 : null;
    }
    if (process.platform === 'win32') {
      // tasklist localizes everything except numbers; the memory column
      // is the last CSV field, so "12,345 K" → 12345 KB survives.
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      const lastField = out.trim().split('\n')[0]?.split('","').pop() ?? '';
      const kb = Number(lastField.replace(/[^0-9]/g, ''));
      return Number.isFinite(kb) && kb > 0 ? kb * 1024 : null;
    }
  } catch {
    return null;
  }
  return null;
}

function killForMemory(child, rssBytes) {
  child[watchdogReason] =
    `killed for exceeding the ${memoryCeilingMb()}MB memory ceiling (RSS reached ${Math.round(rssBytes / 1048576)}MB)`;
  liveChildren.delete(child);
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

// Children outliving the load pass (runtime override bridges) are killed
// from the CLI's normal exit path; this hook catches every other way out
// (process.exit on an error path, a thrown top-level error) so a mod's
// subprocess can't outlive the command that loaded it.
process.on('exit', () => {
  for (const child of liveChildren) {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
  // Sync-only context here: the child-exit listeners that normally
  // remove these can't run, so sweep them directly. Some may fail on
  // Windows (handles release asynchronously after a kill) — leaked
  // temp beats crashing during teardown.
  for (const dir of bridgeDirs.values()) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* see removeBridgeDir */ }
  }
});

export function stopModSubprocesses() {
  for (const child of liveChildren) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  liveChildren.clear();
  if (rssPollTimer) {
    clearInterval(rssPollTimer);
    rssPollTimer = null;
  }
}

// Debug/testing knobs — the defaults are the contract, the env vars exist
// so a test can watch a timeout fire without sleeping for five seconds.
export function setupTimeoutMs() {
  return positiveInt(process.env.TEMPORAL_FMT_SANDBOX_SETUP_TIMEOUT_MS) ?? SETUP_TIMEOUT_MS;
}

export function runtimeTimeoutMs() {
  return positiveInt(process.env.TEMPORAL_FMT_SANDBOX_RUNTIME_TIMEOUT_MS) ?? RUNTIME_TIMEOUT_MS;
}

export function memoryCeilingMb() {
  return positiveInt(process.env.TEMPORAL_FMT_SANDBOX_MEMORY_LIMIT_MB) ?? DEFAULT_MEMORY_CEILING_MB;
}

function memoryCeilingBytes() {
  return memoryCeilingMb() * 1024 * 1024;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function createSandboxContext() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(scriptsDir, '..', 'dist');

  // The child needs a Temporal to do anything date-shaped (parse()
  // especially), same as the host. Node 26+ has it natively; below that
  // the host resolves its polyfill once and hands the child the absolute
  // path, because a bare 'temporal-polyfill' import from inside a
  // zero-permission child can't walk node_modules without grants the
  // sandbox would rather not give out. The host imports the polyfill by
  // the same bare specifier the CLI used, so both share one module
  // instance and one set of Temporal classes.
  let hostTemporal = globalThis.Temporal ?? null;
  let polyfillPath = null;
  let nodeModulesRoot = null;
  if (!hostTemporal) {
    try {
      polyfillPath = createRequire(import.meta.url).resolve('temporal-polyfill/full');
      nodeModulesRoot = nodeModulesRootOf(realpathSync(polyfillPath));
      ({ Temporal: hostTemporal } = await import('temporal-polyfill/full'));
    } catch {
      // No Temporal and no polyfill — the CLI refuses to start in this
      // state, so this is a standalone loadMods() caller on an old Node
      // with nothing installed. Values degrade to plain field objects
      // (see fromWire), which format() still accepts.
    }
  }

  const baselineReadRoots = [scriptsDir, distDir];
  if (nodeModulesRoot) baselineReadRoots.push(nodeModulesRoot);
  return { scriptsDir, distDir, polyfillPath, hostTemporal, baselineReadRoots };
}

function nodeModulesRootOf(resolvedPath) {
  const marker = `${sep}node_modules${sep}`;
  const idx = resolvedPath.lastIndexOf(marker);
  return idx < 0 ? null : resolvedPath.slice(0, idx + marker.length - 1);
}

function scrubbedEnv() {
  const env = {};
  for (const key of PASSTHROUGH_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

// The coarse end of the permission model: granting "fs:read" means the
// whole filesystem, because a path-scoped grant isn't something a single
// yes/no terminal answer can express honestly. On Windows that's the
// system drive rather than '/'.
function fullFsRoot() {
  return process.platform === 'win32' ? (process.env.SystemDrive ?? 'C:\\') : '/';
}

// Windows (and any platform forced onto it for testing) talks over
// files instead of pipe fds — see the header comment for why the fork
// pipes can't carry the synchronous bridge there.
function usesFileBridge() {
  return process.platform === 'win32' || process.env.TEMPORAL_FMT_SANDBOX_FORCE_FILE_BRIDGE === '1';
}

// Permission-model grants are matched against the paths the child
// actually resolves, and the ESM loader resolves symlinks when importing
// a mod — so a grant captured through a symlinked prefix (tmpdir under
// /var on macOS, a redirected user folder on Windows) would deny the
// very file it was meant to allow. Canonicalize every root once, here,
// at the single place the flags are built.
function realRoot(root) {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

// A just-killed worker can hold its bridge files open for a beat on
// Windows, where deleting a file with open handles fails. One delayed
// retry, and after that the dir is leaked temp — ugly, but crashing
// during teardown would be worse, and the OS temp cleaner eventually
// collects it.
function removeBridgeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    const retry = setTimeout(() => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* leaked temp; see comment above */ }
    }, 250);
    retry.unref();
  }
}

function spawnWorker({ readRoots, writeRoots = [], allowChildProcess = false, allowWorker = false }) {
  const execArgv = [permissionFlagName()];
  const workerArgs = [];
  let bridgeDir = null;
  if (usesFileBridge()) {
    // The two channels of the file transport, created empty up front so
    // neither side can race the other's first append. The worker needs
    // read+write on this dir even when the mod was denied fs:write: it's
    // the worker's own reply channel and nothing else, so mod code
    // still can't write anywhere a human keeps files. A deliberate,
    // documented carve-out rather than a hidden one.
    bridgeDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-bridge-'));
    for (const name of ['call', 'ret']) closeSync(openSync(join(bridgeDir, name), 'w'));
    readRoots = [...readRoots, bridgeDir];
    writeRoots = [...writeRoots, bridgeDir];
    workerArgs.push(realRoot(bridgeDir));
  }
  for (const root of readRoots) execArgv.push(`--allow-fs-read=${realRoot(root)}`);
  for (const root of writeRoots) execArgv.push(`--allow-fs-write=${realRoot(root)}`);
  if (allowChildProcess) execArgv.push('--allow-child-process');
  if (allowWorker) execArgv.push('--allow-worker');

  const child = fork(WORKER_PATH, workerArgs, {
    execArgv,
    stdio: ['pipe', 'pipe', 'inherit', 'ipc'],
    env: scrubbedEnv(),
  });
  // fork insists on an ipc channel; nothing here uses it (all traffic is
  // the pipes or the bridge files) and it would hold the parent's event
  // loop open for as long as a runtime-override child lives. Close it
  // immediately.
  child.disconnect();
  liveChildren.add(child);
  if (bridgeDir) bridgeDirs.set(child, bridgeDir);
  child.on('exit', () => {
    liveChildren.delete(child);
    const dir = bridgeDirs.get(child);
    if (dir) {
      bridgeDirs.delete(child);
      removeBridgeDir(dir);
    }
  });
  ensureRssPolling();
  return { child, bridgeDir };
}

class BridgeDownError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BridgeDownError';
  }
}

function pipeFd(stream, role) {
  const fd = stream?._handle?.fd;
  if (typeof fd !== 'number' || fd < 0) {
    throw new Error(
      `can't get the ${role} pipe fd for the mod sandbox on this platform — ` +
      `the synchronous override bridge depends on it. This is the POSIX path ` +
      `(Node 20/22/24/26, macOS and Linux); Windows uses the file transport instead`
    );
  }
  return fd;
}

// One bridge per worker process. call() is synchronous and single-flight:
// the host blocks inside it, so requests and replies pair up strictly in
// order and ids are a sanity check rather than a dispatcher.
class WorkerBridge {
  constructor(child, bridgeDir) {
    this.child = child;
    // Atomics.wait on a dummy cell is the only sleep that doesn't yield
    // to the event loop — which is the point, since there's no loop
    // turning while we're blocked here.
    this.sleeper = new Int32Array(new SharedArrayBuffer(4));
    this.rxLeftover = Buffer.alloc(0);
    this.lastRssCheck = 0;
    this.dead = null;
    if (bridgeDir) {
      // File transport: senders append, so a 'w' side never needs a
      // position and an 'r' side always knows where it left off. Two
      // opens of the same file interleave fine — libuv opens with full
      // share flags on Windows and POSIX doesn't lock at all.
      this.files = {
        requestFd: openSync(join(bridgeDir, 'call'), 'a'),
        replyFd: openSync(join(bridgeDir, 'ret'), 'r'),
        replyOffset: 0,
      };
      this.requestFd = null;
      this.replyFd = null;
    } else {
      this.files = null;
      this.requestFd = pipeFd(child.stdin, 'request');
      this.replyFd = pipeFd(child.stdout, 'reply');
    }
    // A child killed between calls (the idle RSS watchdog, usually) needs
    // the next call to say why it died, not just that the channel is
    // broken.
    child.on('exit', () => {
      this.dead ??= child[watchdogReason] ?? 'the subprocess exited';
      this.closeFiles();
    });
  }

  // Idempotent on purpose: kill() and the exit listener both arrive.
  closeFiles() {
    if (!this.files) return;
    const { requestFd, replyFd } = this.files;
    this.files = null;
    try { closeSync(requestFd); } catch { /* already closed */ }
    try { closeSync(replyFd); } catch { /* already closed */ }
  }

  kill(reason) {
    if (this.dead) return;
    this.dead = reason;
    // Close before the kill lands so the child-exit cleanup can remove
    // the scratch dir on the first try on Windows, where open handles
    // would make it fail and fall to the delayed retry.
    this.closeFiles();
    liveChildren.delete(this.child);
    try { this.child.kill('SIGKILL'); } catch { /* already gone */ }
  }

  call(payload, timeoutMs, what) {
    if (this.dead) throw new BridgeDownError(`${what}: bridge is down (${this.dead})`);
    const deadline = Date.now() + timeoutMs;
    this.writeLine(JSON.stringify(payload), deadline, timeoutMs, what);
    return this.readLine(deadline, timeoutMs, what);
  }

  writeLine(line, deadline, timeoutMs, what) {
    const buf = Buffer.from(`${line}\n`, 'utf8');
    const viaFile = this.files !== null;
    const fd = viaFile ? this.files.requestFd : this.requestFd;
    let written = 0;
    while (written < buf.length) {
      if (Date.now() > deadline) {
        this.kill('timed out writing a request');
        throw new BridgeDownError(`${what}: the mod's subprocess stopped accepting requests within ${timeoutMs}ms`);
      }
      try {
        // Append mode on the file side: every write lands at the end, so
        // keeping a position would only duplicate what the file already
        // tracks.
        written += writeSync(fd, buf, written, buf.length - written);
      } catch (err) {
        if (err.code === 'EAGAIN') {
          Atomics.wait(this.sleeper, 0, 0, 2);
          continue;
        }
        this.kill(`request ${viaFile ? 'file' : 'pipe'} failed: ${err.message}`);
        throw new BridgeDownError(`${what}: ${err.message}`);
      }
    }
  }

  readLine(deadline, timeoutMs, what) {
    for (;;) {
      // A reply already in hand outranks the bridge being down — a
      // worker that answered and then died still answered.
      const nl = this.rxLeftover.indexOf(10);
      if (nl >= 0) {
        const line = this.rxLeftover.subarray(0, nl);
        this.rxLeftover = this.rxLeftover.subarray(nl + 1);
        return this.parseLine(line, what);
      }

      if (this.dead) throw new BridgeDownError(`${what}: bridge is down (${this.dead})`);

      if (Date.now() - this.lastRssCheck >= RSS_POLL_INTERVAL_MS) {
        this.lastRssCheck = Date.now();
        // A file never hits EOF the way a pipe does, so a worker that
        // dies without saying anything would only be noticed at the
        // deadline. Probing the pid closes most of that gap wherever
        // kill(pid, 0) can see the truth; where it can't, the deadline
        // still bounds the wait. EPERM means "alive, not ours to signal"
        // and is not a death.
        //
        // Windows is excluded: process.kill(pid, 0) there is signal
        // emulation, not a real liveness check, and has been observed to
        // report ESRCH for a child that is alive and about to answer —
        // a false "the subprocess exited" that races against a genuine,
        // slightly-delayed reply. The child's own 'exit' event (which
        // sets this.dead unconditionally, see the constructor) is the
        // authoritative signal there; this probe is a POSIX-only
        // early-detection optimization, not the only way death is caught.
        if (process.platform !== 'win32') {
          try {
            process.kill(this.child.pid, 0);
          } catch (err) {
            if (err.code === 'ESRCH') {
              this.dead ??= this.child[watchdogReason] ?? 'the subprocess exited';
              throw new BridgeDownError(`${what}: ${this.dead}`);
            }
          }
        }
        const rss = readChildRssBytes(this.child.pid);
        if (rss !== null && rss > memoryCeilingBytes()) {
          killForMemory(this.child, rss);
          this.dead = this.child[watchdogReason];
          throw new BridgeDownError(`${what}: the mod's subprocess was ${this.dead}`);
        }
      }

      if (Date.now() > deadline) {
        this.kill(`no reply within ${timeoutMs}ms`);
        throw new BridgeDownError(`${what}: the mod's subprocess didn't answer within ${timeoutMs}ms`);
      }

      let n;
      if (this.files) {
        try {
          n = readSync(this.files.replyFd, CHUNK, 0, CHUNK.length, this.files.replyOffset);
        } catch (err) {
          this.kill(`reply file failed: ${err.message}`);
          throw new BridgeDownError(`${what}: ${err.message}`);
        }
        if (n > 0) {
          this.files.replyOffset += n;
        } else {
          // Nothing new appended yet — between calls that's ordinary
          // quiet, not a death, so it's a short wait rather than an EOF.
          Atomics.wait(this.sleeper, 0, 0, 1);
          continue;
        }
      } else {
        try {
          n = readSync(this.replyFd, CHUNK, 0, CHUNK.length);
        } catch (err) {
          if (err.code === 'EAGAIN') {
            Atomics.wait(this.sleeper, 0, 0, 2);
            continue;
          }
          this.kill(`reply pipe failed: ${err.message}`);
          throw new BridgeDownError(`${what}: ${err.message}`);
        }
        if (n === 0) {
          const why = this.child[watchdogReason];
          this.kill(why ?? 'the subprocess exited');
          throw new BridgeDownError(
            why
              ? `${what}: the mod's subprocess was ${why}`
              : `${what}: the mod's subprocess exited before answering`
          );
        }
      }
      this.rxLeftover = Buffer.concat([this.rxLeftover, CHUNK.subarray(0, n)]);
    }
  }

  parseLine(line, what) {
    try {
      return JSON.parse(line.toString('utf8'));
    } catch {
      this.kill('sent an unreadable reply');
      throw new BridgeDownError(`${what}: the mod's subprocess sent an unreadable reply`);
    }
  }
}

// Pass-one worker for a loose .mjs: import it sandboxed, report the
// default export's identity. All children are spawned up front so their
// Node boot overlaps; each reply is then read in turn.
export async function describeMjsMods(absDir, mjsFiles, sandboxCtx) {
  const entries = [];
  const failed = [];
  const readRoots = [absDir, ...sandboxCtx.baselineReadRoots];
  const pending = mjsFiles.map((file) => {
    const { child, bridgeDir } = spawnWorker({ readRoots });
    return { file, bridge: new WorkerBridge(child, bridgeDir) };
  });

  for (const { file, bridge } of pending) {
    let reply;
    try {
      reply = bridge.call(
        { describe: { modPath: join(absDir, file), polyfillPath: sandboxCtx.polyfillPath } },
        setupTimeoutMs(),
        `loading ${file}`
      );
    } catch (err) {
      failed.push({ file, reason: `sandboxed import failed: ${err.message}` });
      bridge.kill('load pass done');
      continue;
    }
    bridge.kill('load pass done');
    if (reply.error) {
      failed.push({ file, reason: reply.error });
      continue;
    }
    entries.push({
      file,
      kind: 'mjs',
      mod: reply.described,
      importPath: join(absDir, file),
      configSchema: undefined,
      permissions: [],
    });
  }
  return { entries, failed };
}

// Permission answers, keyed by name@version: a version bump re-asks,
// the same version reuses whatever was answered before, and only
// capabilities that were actually answered get cached — a mod that adds
// a new permission in a patch release gets asked about the new one
// rather than inheriting an implicit "no".
async function readGrantCache(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeGrantCache(cachePath, cache, modName) {
  try {
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(
      `temporal-fmt: couldn't save permission answers to ${cachePath} (${err.message}) — ` +
      `the choices made for "${modName}" apply to this run only.\n`
    );
  }
}

// Ask the human. Returns true/false, or null when there's no way to ask:
// empty input counts as no, and a non-TTY context (CI, piped stdin)
// never grants — an unanswered permission question is a denial, not a
// quiet yes.
async function promptPermission(modName, permission) {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`temporal-fmt: allow "${modName}" to access ${permission}? (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function resolvePermissions({ modName, version, requested, cachePath }) {
  const cache = await readGrantCache(cachePath);
  const cacheKey = `${modName}@${version ?? ''}`;
  const answers = cache[cacheKey] ?? {};
  const granted = new Set();
  const denials = [];
  let changed = false;

  for (const permission of requested) {
    if (Object.prototype.hasOwnProperty.call(answers, permission)) {
      if (answers[permission]) granted.add(permission);
      else denials.push({ permission, reason: 'previously denied' });
      continue;
    }
    const allowed = await promptPermission(modName, permission);
    answers[permission] = allowed === true;
    changed = true;
    if (allowed === true) granted.add(permission);
    else denials.push({ permission, reason: allowed === null ? 'no terminal to ask — denied by default' : 'declined' });
  }

  if (changed) {
    cache[cacheKey] = answers;
    await writeGrantCache(cachePath, cache, modName);
  }
  return { granted, denials };
}

// The pass-two run: spawn the worker that executes register() and report
// back what registered. A mod whose register() throws, hangs past the
// setup deadline, or dies from a permission violation fails right here —
// only that mod, exactly as an in-process register() throw always has.
export async function runModInSandbox({ kind, modPath, modName, modReadRoot, version, config, grantedPermissions, priorRegistrations, sandboxCtx }) {
  const readRoots = [modReadRoot, ...sandboxCtx.baselineReadRoots];
  const writeRoots = [];
  if (grantedPermissions.has('fs:read')) readRoots.push(fullFsRoot());
  if (grantedPermissions.has('fs:write')) writeRoots.push(fullFsRoot());

  const { child, bridgeDir } = spawnWorker({
    readRoots,
    writeRoots,
    allowChildProcess: grantedPermissions.has('child-process'),
    allowWorker: grantedPermissions.has('worker'),
  });
  const bridge = new WorkerBridge(child, bridgeDir);

  let reply;
  try {
    reply = bridge.call(
      {
        init: {
          kind,
          modPath,
          modName,
          config,
          grantedPermissions: [...grantedPermissions],
          priorRegistrations,
          polyfillPath: sandboxCtx.polyfillPath,
        },
      },
      setupTimeoutMs(),
      `register() of "${modName}"`
    );
  } catch (err) {
    return { ok: false, reason: `register() didn't complete in its sandbox: ${err.message}` };
  }

  if (reply.error) {
    bridge.kill('register failed');
    const err = reply.error;
    // The worker tags a register()-time throw so the report keeps the
    // wording the in-process loader used for it; anything else is a
    // load failure that already carries its own phrasing.
    return {
      ok: false,
      reason: err?.kind === 'register'
        ? `register() threw: ${err.message}`
        : typeof err === 'string' ? err : err.message,
    };
  }

  const { registrations, overrides } = reply.result;
  if (!overrides?.length) {
    // Setup-only mod: state lives on the host now, the worker has already
    // exited, and closing our end releases everything.
    bridge.kill('done');
    return { ok: true, registrations, overrides: [], bridge: null };
  }

  // This mod's overrides make the worker a long-lived bridge target. The
  // pipes would hold the host's event loop open for its whole lifetime,
  // which would hang any process that called loadMods() without knowing
  // about subprocesses — loadMods() must not change whether its caller
  // can exit. unref keeps the fds usable (readSync/writeSync don't care)
  // while letting the loop drain; when the host exits, the worker sees
  // stdin close and exits on its own, and the exit hook below SIGKILLs
  // anything that lingers.
  child.unref();
  child.stdin?.unref();
  child.stdout?.unref();

  return { ok: true, registrations, overrides, bridge };
}

function warnBridgeDown(modName, detail) {
  if (warnedBridges.has(modName)) return;
  warnedBridges.add(modName);
  process.stderr.write(
    `temporal-fmt: mod "${modName}"'s override subprocess stopped answering (${detail}) — ` +
    `its overrides fall back to the built-in behavior for the rest of this process.\n`
  );
}

// The impl handed to the tracked context's overrideXxx() during host-side
// replay. It stands in for the mod's closure, which can't leave the
// subprocess; the tracked context wraps it exactly as it would a real
// one, so conflict detection and the load report both see the same thing
// they always have.
export function makeOverrideBridgeImpl(bridge, fnName, modName, sandboxCtx) {
  const keyCache = new Map();

  const impl = (original, ...args) => {
    let key;
    if (fnName === 'format' || fnName === 'parse') {
      try {
        // The value being formatted varies every call and must stay out
        // of the key or nothing would ever hit; the format string and
        // options are what identifies the behavior being asked for.
        key = fnName === 'parse'
          ? stableStringify([args[0], args[2]])
          : stableStringify([args[1], args[2]]);
      } catch {
        key = undefined;
      }
    }
    if (key !== undefined && keyCache.get(key)) return original(...args);

    let reply;
    try {
      reply = bridge.call({ fn: fnName, args: args.map((a) => toWire(a)) }, runtimeTimeoutMs(), `${fnName}() override from "${modName}"`);
    } catch (err) {
      warnBridgeDown(modName, err.message);
      return original(...args);
    }
    const response = reply.response;
    if (!response) {
      bridge.kill('sent a malformed reply');
      warnBridgeDown(modName, 'malformed reply');
      return original(...args);
    }
    if (!response.ok) throw errorFromWire(response.error);
    if (key !== undefined && response.passthrough) rememberPassthrough(keyCache, key);
    return fromWire(response.value, sandboxCtx.hostTemporal);
  };

  // formatRange() asks for both endpoints at once; one round trip per
  // range call instead of two. Attached here rather than in the library
  // because only a bridge impl ever has a subprocess to batch over —
  // built-in format() has nothing to save. `original` arrives as the
  // fourth argument, injected by the wrapper that carries the batch —
  // the fallbacks below need the built-in and can't reach it otherwise.
  if (fnName === 'format') {
    impl.formatMany = (values, formatStr, options, original) => {
      let key;
      try {
        key = stableStringify([formatStr, options]);
      } catch {
        key = undefined;
      }
      if (key !== undefined && keyCache.get(key)) {
        return values.map((v) => original(v, formatStr, options));
      }
      let reply;
      try {
        reply = bridge.call(
          { fn: 'formatMany', args: [values.map((v) => toWire(v)), formatStr, options] },
          runtimeTimeoutMs(),
          `formatRange() override from "${modName}"`
        );
      } catch (err) {
        warnBridgeDown(modName, err.message);
        return values.map((v) => original(v, formatStr, options));
      }
      const response = reply.response;
      if (!response) {
        bridge.kill('sent a malformed reply');
        warnBridgeDown(modName, 'malformed reply');
        return values.map((v) => original(v, formatStr, options));
      }
      if (!response.ok) throw errorFromWire(response.error);
      if (key !== undefined && response.passthrough) rememberPassthrough(keyCache, key);
      return response.value.map((v) => fromWire(v, sandboxCtx.hostTemporal));
    };
  }

  return impl;
}

function rememberPassthrough(cache, key) {
  if (cache.size >= MAX_OVERRIDE_KEY_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, true);
}

export { GRANTABLE_PERMISSIONS };
