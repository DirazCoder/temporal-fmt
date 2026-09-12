import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Sandbox behavior for the mod loader (scripts/modSandbox.mjs +
// scripts/modWorker.mjs): permissions are real, denials are loud, and a
// runtime override rides a subprocess bridge that can time out and fall
// back. Same subprocess-per-test harness as mods.test.js — the load
// report and override state are process-level, so tests can't share a
// process.

function buildTfmod(destPath, files) {
  const stageDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-tfmod-stage-'));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = join(stageDir, name);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, contents);
  }
  execFileSync('tar', ['-czf', destPath, ...Object.keys(files)], { cwd: stageDir });
  rmSync(stageDir, { recursive: true, force: true });
}

const CLI_PATH = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

function withModsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, 'mods', name), contents);
  }
  return dir;
}

function runCliIn(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status ?? 1 };
}

const FORMAT_ARGS = ['format', '2026-08-04T15:45:30', 'yyyy-MM-dd'];

test('sandbox: a loose .mjs mod touching fs fails with the zero-permission explanation, not a bare stack trace', () => {
  const dir = withModsDir({
    'reader.mjs': `
      import { readFileSync } from 'node:fs';
      export default {
        name: 'reader',
        register() { readFileSync('/etc/hostname', 'utf8'); },
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed reader\.mjs: register\(\) threw: Access to this API has been restricted/);
  assert.match(stderr, /this mod has no granted capabilities \(a loose \.mjs mod can't request any\)/);
  assert.match(stderr, /Package it as a \.tfmod with a "permissions" field/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a mod never sees the host environment — secrets stay in the parent process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  // The vocab's month names encode whatever the mod can see of
  // process.env — a secret in the parent's environment would surface
  // here if it leaked through to the sandbox.
  writeFileSync(join(dir, 'mods', 'env-echo.mjs'), `
    export default {
      name: 'env-echo',
      register(ctx) {
        const secret = process.env.SANDBOX_TEST_SECRET ?? 'SECRET-NOT-VISIBLE';
        ctx.registerLocaleVocab('xx-env', {
          monthLong: Array.from({ length: 12 }, (_, i) => secret + '-' + (i + 1) + 'L'),
          monthShort: Array.from({ length: 12 }, (_, i) => secret + '-' + (i + 1) + 'S'),
          weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
          dayPeriod: ['AM', 'PM'],
        });
      },
    };
  `);
  const result = spawnSync(process.execPath, [CLI_PATH, 'format', '2026-08-04', 'MMMM', '--locale=xx-env'], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', SANDBOX_TEST_SECRET: 'hunter2-the-real-one' },
  });
  assert.equal(result.status, 0);
  assert.match((result.stderr ?? ''), /loaded env-echo/);
  assert.match((result.stdout ?? '').trim(), /^SECRET-NOT-VISIBLE/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a .tfmod reading outside its archive needs fs:read — granted via the cache file it works', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, 'outside.txt'), 'outside-data');
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'outside-reader@1.0.0': { 'fs:read': true } }));
  buildTfmod(join(dir, 'mods', 'outside-reader.tfmod'), {
    'mod.json': JSON.stringify({ name: 'outside-reader', version: '1.0.0', main: 'main.mjs', permissions: ['fs:read'] }),
    'main.mjs': `
      import { readFileSync } from 'node:fs';
      export default {
        register(ctx) {
          const secret = readFileSync(${JSON.stringify(join(dir, 'outside.txt'))}, 'utf8').trim();
          ctx.registerLocaleVocab('xx-out', {
            monthLong: Array.from({ length: 12 }, (_, i) => secret + '-' + (i + 1) + 'L'),
            monthShort: Array.from({ length: 12 }, (_, i) => secret + '-' + (i + 1) + 'S'),
            weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
            dayPeriod: ['AM', 'PM'],
          });
        },
      };
    `,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, 'format', '2026-08-04', 'MMMM', '--locale=xx-out');
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded outside-reader@1\.0\.0.*sandboxed: fs:read granted/);
  assert.match(stdout.trim(), /^outside-data/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a bare-string manifest is all-required — a denied fs:read fails the mod before its code runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, 'outside.txt'), 'outside-data');
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'outside-reader@1.0.0': { 'fs:read': false } }));
  buildTfmod(join(dir, 'mods', 'outside-reader.tfmod'), {
    'mod.json': JSON.stringify({ name: 'outside-reader', version: '1.0.0', main: 'main.mjs', permissions: ['fs:read'] }),
    'main.mjs': `
      import { readFileSync } from 'node:fs';
      export default {
        register() { readFileSync(${JSON.stringify(join(dir, 'outside.txt'))}, 'utf8'); },
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed outside-reader\.tfmod: denied required permission: fs:read — "outside-reader" won't load without it/);
  assert.match(stderr, /node scripts\/managePermissions\.mjs grant outside-reader@1\.0\.0 fs:read/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: no terminal to ask in means denied by default, and a required permission fails with that said', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'asker.tfmod'), {
    'mod.json': JSON.stringify({ name: 'asker', version: '1.0.0', main: 'main.mjs', permissions: ['fs:read'] }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed asker\.tfmod: denied required permission: fs:read — "asker" won't load without it \(denied automatically: no terminal to ask\)/);
  // The denial was also persisted as an answer, so a second run is
  // quiet about it rather than re-deciding every time.
  const cached = JSON.parse(readFileSync(join(dir, '.temporal-fmt-permissions.json'), 'utf8'));
  assert.equal(cached['asker@1.0.0']['fs:read'], false);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a version bump re-asks rather than reusing the old answer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  // Cached answer for 1.0.0; the archive on disk is 2.0.0.
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'asker@1.0.0': { 'fs:read': true } }));
  buildTfmod(join(dir, 'mods', 'asker.tfmod'), {
    'mod.json': JSON.stringify({ name: 'asker', version: '2.0.0', main: 'main.mjs', permissions: ['fs:read'] }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  // Non-TTY run: 2.0.0 had no cached answer, so it's denied fresh —
  // the 1.0.0 grant didn't carry over, and being required, that fails
  // the mod outright.
  assert.match(stderr, /failed asker\.tfmod: denied required permission: fs:read/);
  const cached = JSON.parse(readFileSync(join(dir, '.temporal-fmt-permissions.json'), 'utf8'));
  assert.equal(cached['asker@2.0.0']['fs:read'], false);
  assert.equal(cached['asker@1.0.0']['fs:read'], true);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: an unknown capability in the manifest fails with the closed list and why net is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'netty.tfmod'), {
    'mod.json': JSON.stringify({ name: 'netty', main: 'main.mjs', permissions: ['net'] }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed netty\.tfmod: mod\.json "permissions" includes "net" — supported capabilities are fs:read, fs:write, child-process, worker/);
  assert.match(stderr, /Network access isn't offered/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: child-process is granted only when asked for and answered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'spawner@': { 'child-process': true } }));
  buildTfmod(join(dir, 'mods', 'spawner.tfmod'), {
    'mod.json': JSON.stringify({ name: 'spawner', main: 'main.mjs', permissions: ['child-process'] }),
    'main.mjs': `
      import { execFileSync } from 'node:child_process';
      export default {
        register(ctx) {
          // node -e rather than echo: there is no echo.exe on Windows,
          // and the point is the spawn, not what got spawned.
          const out = execFileSync(process.execPath, ['-e', 'process.stdout.write("spawned-ok")']).toString().trim();
          ctx.registerLocaleVocab('xx-spawn', {
            monthLong: Array.from({ length: 12 }, (_, i) => out + '-' + (i + 1) + 'L'),
            monthShort: Array.from({ length: 12 }, (_, i) => out + '-' + (i + 1) + 'S'),
            weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
            dayPeriod: ['AM', 'PM'],
          });
        },
      };
    `,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, 'format', '2026-08-04', 'MMMM', '--locale=xx-spawn');
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded spawner.*sandboxed: child-process granted/);
  assert.match(stdout.trim(), /^spawned-ok/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a runtime override that stops responding falls back to the built-in and warns once', () => {
  const dir = withModsDir({
    'hung.mjs': `
      export default {
        name: 'hung',
        register(ctx) {
          ctx.overrideFormat(() => { while (true) {} });
        },
      };
    `,
  });
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TEMPORAL_FMT_SANDBOX_RUNTIME_TIMEOUT_MS: '400',
  };
  const result = spawnSync(process.execPath, [CLI_PATH, ...FORMAT_ARGS], { encoding: 'utf8', cwd: dir, env });
  const { stdout, stderr, exitCode } = { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status ?? 1 };
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.match(stderr, /loaded hung \(hung\.mjs\).*format override via subprocess, 400ms timeout/);
  assert.match(stderr, /mod "hung"'s override subprocess stopped answering/);
  assert.match(stderr, /fall back to the built-in behavior/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a parse override still returns a working Temporal object across the process boundary', () => {
  const dir = withModsDir({
    'parse-mod.mjs': `
      export default {
        name: 'parse-mod',
        register(ctx) {
          ctx.overrideParse((original, formatStr, input, options) => {
            if (input === '0001-01-01') return original(formatStr, '2026-08-04', options);
            return original(formatStr, input, options);
          });
        },
      };
    `,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, 'parse', 'yyyy-MM-dd', '0001-01-01');
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded parse-mod.*parse override via subprocess/);
  // The CLI stringifies the result — this only prints as a clean ISO
  // date if the Temporal instance survived serialization, the pipe, and
  // reconstruction on the host side.
  assert.equal(stdout.trim(), '2026-08-04');
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a denied optional permission runs the mod as downgraded, with hasPermission to branch on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({
    'brancher@1.0.0': { 'fs:read': false, 'fs:write': true },
  }));
  buildTfmod(join(dir, 'mods', 'brancher.tfmod'), {
    'mod.json': JSON.stringify({
      name: 'brancher',
      version: '1.0.0',
      main: 'main.mjs',
      permissions: [
        { capability: 'fs:read', required: false },
        { capability: 'fs:write', required: true },
      ],
    }),
    'main.mjs': `
      export default {
        register(ctx) {
          // Encodes what the subprocess's hasPermission answers, so the
          // formatted month proves the mod saw the real grant state.
          const canRead = ctx.hasPermission('fs:read');
          const canWrite = ctx.hasPermission('fs:write');
          const canNet = ctx.hasPermission('net');
          ctx.registerLocaleVocab('xx-branch', {
            monthLong: Array.from({ length: 12 }, (_, i) => \`r=\${canRead},w=\${canWrite},n=\${canNet}-\${i + 1}L\`),
            monthShort: Array.from({ length: 12 }, (_, i) => \`S\${i + 1}\`),
            weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
            dayPeriod: ['AM', 'PM'],
          });
        },
      };
    `,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, 'format', '2026-08-04', 'MMMM', '--locale=xx-branch');
  assert.equal(exitCode, 0);
  assert.match(stderr, /downgraded brancher@1\.0\.0 \(brancher\.tfmod\) \[sandboxed: fs:read denied \(optional\), fs:write granted\]/);
  assert.match(stdout.trim(), /^r=false,w=true,n=false/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a mod that ignores a denied optional permission just fails when it hits the wall', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'careless@1.0.0': { 'fs:read': false } }));
  buildTfmod(join(dir, 'mods', 'careless.tfmod'), {
    'mod.json': JSON.stringify({
      name: 'careless',
      version: '1.0.0',
      main: 'main.mjs',
      permissions: [{ capability: 'fs:read', required: false }],
    }),
    'main.mjs': `
      import { readFileSync } from 'node:fs';
      export default {
        register() { readFileSync('/etc/hostname', 'utf8'); },
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  // hasPermission offers graceful degradation; nothing forces a mod
  // author to take it. This one reads anyway and dies on the permission
  // wall like any other register() crash.
  assert.match(stderr, /failed careless\.tfmod: register\(\) threw: Access to this API has been restricted/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a subprocess that outgrows the memory ceiling is killed and the mod fails', () => {
  const dir = withModsDir({
    'hog.mjs': `
      export default {
        name: 'hog',
        register(ctx) {
          // ArrayBuffer, not JS objects: the point is memory the V8 heap
          // limit wouldn't count, only the parent's RSS watchdog can see.
          // Held well past one watchdog tick (250ms) rather than flashed:
          // the watchdog samples, so a spike that finishes between ticks
          // is uncatchable by design — the test has to stay fat to
          // honestly test what "outgrows the ceiling" means.
          const buf = new ArrayBuffer(600 * 1024 * 1024);
          new Uint8Array(buf).fill(1);
          const until = Date.now() + 3000;
          while (Date.now() < until) {}
          ctx.registerLocaleVocab('xx-hog', {
            monthLong: Array.from({ length: 12 }, (_, i) => \`H\${i + 1}L\`),
            monthShort: Array.from({ length: 12 }, (_, i) => \`H\${i + 1}S\`),
            weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
            dayPeriod: ['AM', 'PM'],
          });
        },
      };
    `,
  });
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TEMPORAL_FMT_SANDBOX_MEMORY_LIMIT_MB: '150',
  };
  const result = spawnSync(process.execPath, [CLI_PATH, ...FORMAT_ARGS], { encoding: 'utf8', cwd: dir, env, timeout: 60_000 });
  const stderr = result.stderr ?? '';
  assert.equal(result.status, 0);
  assert.match(stderr, /failed hog\.mjs: register\(\) didn't complete in its sandbox: register\(\) of "hog": the mod's subprocess was killed for exceeding the 150MB memory ceiling/);
  rmSync(dir, { recursive: true, force: true });
});

test('sandbox: a process that loads a runtime-override mod still exits on its own', () => {
  const modsDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  writeFileSync(join(modsDir, 'shout.mjs'), `
    export default {
      name: 'shout',
      register(ctx) {
        ctx.overrideFormat((original, ...args) => original(...args).toUpperCase() + '!');
      }
    };
  `);
  const scratchDir = mkdtempSync(join(fileURLToPath(new URL('..', import.meta.url)), '.tmp-sandbox-test-'));
  const script = `
    import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
    import { loadMods } from ${JSON.stringify(new URL('../scripts/loadMods.mjs', import.meta.url).href)};
    import { format } from ${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)};
    const Temporal = globalThis.Temporal ?? PolyfillTemporal;
    await loadMods(${JSON.stringify(modsDir)});
    console.log(format(Temporal.PlainDate.from('2026-08-04'), 'MMM d'));
  `;
  const scriptPath = join(scratchDir, 'exit-proof.mjs');
  writeFileSync(scriptPath, script);
  // No explicit teardown call: if loadMods() let the bridge pipes hold
  // the event loop, this would hang and the test would time out.
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `script should exit cleanly, got status ${result.status}, stderr: ${result.stderr ?? ''}`);
  assert.equal((result.stdout ?? '').trim(), 'AUG 4!');
  rmSync(scratchDir, { recursive: true, force: true });
  rmSync(modsDir, { recursive: true, force: true });
});
