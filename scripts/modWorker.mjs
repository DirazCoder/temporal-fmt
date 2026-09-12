#!/usr/bin/env node
// Sandbox worker — the process every mod actually runs in. The host
// loader (scripts/modSandbox.mjs) spawns this file with Node's
// permission-model flags on the command line, which is the entire
// security story: nothing this worker does can grant itself capabilities
// the flags didn't allow, because the flags are enforced by Node itself.
//
// stdin carries newline-delimited JSON requests from the host; stdout
// carries newline-delimited JSON replies back. Both directions go
// through channels the permission model doesn't gate, and the host reads
// its end synchronously (see modSandbox.mjs) because format()/parse() are
// synchronous APIs — a mod's runtime override has to answer inside the
// caller's stack frame, not on a later event loop turn.
//
// On Windows the host's end of a pipe has no file descriptor at all, so
// the host passes this process a scratch dir as argv[2] instead: the
// same line protocol rides two files there (call in, ret out). argv[2]
// absent means pipes, present means files — nothing else differs.
//
// One worker process handles one of two jobs, decided by the first
// message:
//
//   describe — pass one. Import the mod file, report its
//     name/requires/priority, exit. The host needs the mod's identity to
//     resolve load order before anything can register; a plain .mjs file
//     has no manifest to read that from, so the import has to happen —
//     in here, sandboxed, rather than in the host as it used to. A
//     zero-permission .mjs mod can't leave side effects behind from a
//     second import (no fs/net/process, scrubbed env), which is what
//     makes running it twice in two short-lived workers safe.
//
//   init — pass two. Import the mod (again for .mjs — fresh process,
//     fresh module registry), run register() against a recording context,
//     ship the registrations back for host-side replay. If register()
//     installed a runtime override (overrideFormat/overrideParse/any
//     ctx.override*), this process then stays alive as the bridge
//     target: every later format()/parse() call in the host forwards here
//     over the channel.

import { writeSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import * as tfmt from '../dist/index.js';
import { buildModContextFor, isMod, setTemporal, OverrideConflictError } from '../dist/index.js';
import { toWire, fromWire, errorToWire } from './modWire.mjs';

// Every path this worker imports (mod files, the polyfill) arrives as a
// plain filesystem path from the host. Node's ESM loader only accepts
// file:/data:/node: URLs, and on POSIX a bare absolute path happens to
// also parse as one — but on Windows "C:\Users\..." gets read as a URL
// with scheme "c:", which the loader rejects outright. pathToFileURL
// does the OS-correct conversion (drive letter, backslashes, spaces,
// etc.) so imports work the same on both platforms.
function toImportSpecifier(path) {
  return pathToFileURL(path).href;
}

// fd 1 (pipes) or the ret file (files) is the protocol channel. A mod
// calling console.log or writing to stdout would otherwise splice junk
// into the middle of a reply stream, so stdout writes are rerouted to
// stderr before any mod code can run — the output still reaches the
// user, just on the other channel. The worker itself talks to the real
// channel directly via writeSync, bypassing this.
process.stdout.write = (...args) => process.stderr.write(...args);

// A mod's impl receives the value the caller passed, rebuilt from wire
// fields. Temporal is whatever this process bootstrapped — native on
// Node 26+, the polyfill otherwise (path supplied by the host, which
// resolved it without the permission restrictions this process runs
// under).
let Temporal = globalThis.Temporal ?? null;

const bridgeDir = process.argv[2] ?? null;
let replyFd = null;

function send(message) {
  const line = JSON.stringify(message) + '\n';
  if (bridgeDir) {
    replyFd ??= openSync(join(bridgeDir, 'ret'), 'a');
    writeSync(replyFd, line);
  } else {
    writeSync(1, line);
  }
}

async function bootstrapTemporal(polyfillPath) {
  if (!Temporal && polyfillPath) {
    ({ Temporal } = await import(toImportSpecifier(polyfillPath)));
  }
  if (Temporal) {
    setTemporal(Temporal);
    // In-process mods see whatever Temporal global the host had, which
    // under the CLI is the polyfill object without the global installed.
    // Giving sandboxed mods the global is a small deliberate divergence
    // in the friendlier direction — the object is the same one the
    // library itself uses.
    if (!globalThis.Temporal) globalThis.Temporal = Temporal;
  }
}

// 'overrideFormat' names the exported function it replaces — 'format',
// 'overrideGetDocUrl' → 'getDocUrl'. Every override point in ModContext
// follows that one rule, so deriving it mechanically beats hand-listing
// 86 pairs that would have to be kept in sync with src/modApi.ts.
function overrideMethodToFn(methodName) {
  const rest = methodName.slice('override'.length);
  return rest[0].toLowerCase() + rest.slice(1);
}

// register() runs against a context that records everything the mod
// registers instead of applying it to this process's throwaway copy of
// the library. The records are what the host replays against its own
// real registry state, where the results actually persist. Functions
// with a return value the mod might use during register()
// (createHolidayCalendar, createFormatter) also call through to the real
// thing locally so the mod sees a working object, not a stub.
//
// hasPermission answers from the granted set the host sent with init —
// the flag-level truth for this subprocess. The host-side contexts that
// never see mod code answer differently (see buildModContextFor); this
// is the one whose answer a mod branches on.
function buildRecordingContext(modName, state) {
  const base = buildModContextFor(modName);
  const ctx = { ...base };

  ctx.hasPermission = (capability) => state.granted.includes(capability);

  for (const fn of ['registerLocale', 'registerLocaleVocab', 'registerRelativeGrammar']) {
    ctx[fn] = (...args) => {
      state.registrations.push({ fn, args: toWire(args) });
      return base[fn](...args);
    };
  }

  ctx.createHolidayCalendar = (specs) => {
    state.registrations.push({ fn: 'createHolidayCalendar', args: toWire([specs]) });
    return base.createHolidayCalendar(specs);
  };

  // The token table crosses as handler source text, not live functions.
  // serializeFormatterOptions (below) refuses handlers that close over
  // state that wouldn't survive, so the host can rebuild each handler
  // from source and get the same behavior.
  ctx.createFormatter = (options) => {
    state.registrations.push({ fn: 'createFormatter', args: [serializeFormatterOptions(options)] });
    return base.createFormatter(options);
  };

  for (const key of Object.keys(ctx)) {
    if (!key.startsWith('override')) continue;
    ctx[key] = (impl) => {
      const fnName = overrideMethodToFn(key);
      if (state.overrides.has(fnName)) {
        throw new OverrideConflictError(
          `temporal-fmt: "${fnName}" is already overridden by mod "${state.modName}" — mod "${state.modName}" can't also override it. ` +
          `One mod calling ctx.${key}() twice is the same conflict as two mods fighting over it; the second call has nothing left to wrap.`
        );
      }
      state.overrides.set(fnName, impl);
    };
  }

  return ctx;
}

// Captures a custom token table as data: name, field, and the handler's
// source text. Before trusting that source, revive it with new Function
// and call both the original and the revival on a synthetic field
// object: if the revival throws a ReferenceError the original didn't,
// the handler closes over something outside its own body, and shipping
// it would only defer the failure to the first format() call on the
// host. Both handlers throwing (the probe object isn't a real Temporal
// instance and the handler wanted one) is inconclusive rather than
// guilty, so the source still ships.
function serializeFormatterOptions(options) {
  if (options === undefined) return {};
  const { tokens, defaultLocale } = options ?? {};
  if (tokens !== undefined && !Array.isArray(tokens)) {
    throw new Error('createFormatter "tokens" must be an array of custom tokens');
  }
  const wireTokens = (tokens ?? []).map((token) => {
    if (!token || typeof token.name !== 'string' || typeof token.handler !== 'function') {
      throw new Error('custom tokens need a "name" string and a "handler" function');
    }
    return { name: token.name, field: token.field, handlerSource: String(token.handler) };
  });

  for (const wire of wireTokens) {
    const revived = reviveFunction(wire.handlerSource);
    if (!revived) continue;
    const probe = { year: 2026, month: 9, day: 12, hour: 15, minute: 45, second: 30 };
    const original = tokens.find((t) => t.name === wire.name);
    let originalResult;
    try {
      originalResult = original.handler(probe, 'en-US');
    } catch {
      continue;
    }
    let revivedResult;
    try {
      revivedResult = revived(probe, 'en-US');
    } catch (err) {
      if (err instanceof ReferenceError) {
        throw new Error(
          `custom token "${wire.name}" closes over state outside its own handler body — ` +
          `a sandboxed mod's token handlers run in the host process rebuilt from source, so they must be self-contained. ` +
          `Move the outer values into the handler body.`
        );
      }
      continue;
    }
    if (String(originalResult) !== String(revivedResult)) {
      throw new Error(
        `custom token "${wire.name}" behaves differently when rebuilt from its source — ` +
        `its handler likely closes over outer state and can't be sent to the host process.`
      );
    }
  }

  const out = {};
  if (wireTokens.length > 0) out.tokens = wireTokens;
  if (defaultLocale !== undefined) out.defaultLocale = defaultLocale;
  return out;
}

function reviveFunction(source) {
  try {
    return new Function(`return (${source});`)();
  } catch {
    return null;
  }
}

// Token handlers arrive host→child the same way they left child→host:
// as source text. Rebuild the functions with new Function on this side
// so the local createFormatter gets the same table the host's will.
function rehydrateFormatterOptions(wireOptions) {
  if (!wireOptions || !wireOptions.tokens) return wireOptions;
  return {
    ...wireOptions,
    tokens: wireOptions.tokens.map((t) => ({
      name: t.name,
      field: t.field,
      handler: reviveFunction(t.handlerSource),
    })),
  };
}

// Dispatches one runtime call to the mod's override impl. `original` is
// wrapped in a tracking shim so the host can learn, per call, whether
// the impl just forwarded to the built-in — that's the "cache the
// compiled per-format-string behavior" signal: a format string the mod
// always passes through never needs another round trip once the host
// knows.
async function dispatchOverride(state, fn, args) {
  const impl = state.overrides.get(fn);
  if (impl === undefined) {
    throw new Error(`no ${fn} override installed in this worker`);
  }
  const original = tfmt[fn];
  const live = args.map((a) => fromWire(a, Temporal));

  let firstCall;
  let callCount = 0;
  const trackingOriginal = (...callArgs) => {
    callCount += 1;
    const result = original(...callArgs);
    if (callCount === 1) firstCall = { args: callArgs, result };
    return result;
  };

  const value = await impl(trackingOriginal, ...live);
  if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
    throw new Error(`the ${fn} override installed by mod "${state.modName}" returned a Promise — override impls must be synchronous`);
  }

  const passthrough =
    callCount === 1 &&
    firstCall !== undefined &&
    argsForwardedUnchanged(firstCall.args, live) &&
    firstCall.result === value;
  return { value: toWire(value), passthrough };
}

function argsForwardedUnchanged(forwarded, incoming) {
  if (forwarded.length !== incoming.length) return false;
  return forwarded.every((a, i) => {
    if (a === incoming[i]) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(incoming[i]);
    } catch {
      return false;
    }
  });
}

async function handleCall(state, msg) {
  const { id, fn, args } = msg;
  try {
    if (fn === 'formatMany') {
      const [values, formatStr, options] = args;
      const results = [];
      let allPassthrough = true;
      for (const value of values) {
        const one = await dispatchOverride(state, 'format', [value, formatStr, options]);
        results.push(one.value);
        allPassthrough = allPassthrough && one.passthrough;
      }
      send({ response: { id, ok: true, value: results, passthrough: allPassthrough } });
      return;
    }
    const { value, passthrough } = await dispatchOverride(state, fn, args);
    send({ response: { id, ok: true, value, passthrough } });
  } catch (err) {
    send({ response: { id, ok: false, error: errorToWire(err) } });
  }
}

async function runDescribe(desc) {
  await bootstrapTemporal(desc.polyfillPath);
  let mod;
  try {
    ({ default: mod } = await import(toImportSpecifier(desc.modPath)));
  } catch (err) {
    send({ error: `failed to import: ${err.message}` });
    process.exit(0);
    return;
  }
  if (!isMod(mod)) {
    send({
      error:
        'default export must be an object with a "name" string, a "register" function, and — if present — "requires" as a string array and "priority" as a number',
    });
    process.exit(0);
    return;
  }
  send({ described: { name: mod.name, version: mod.version, requires: mod.requires, priority: mod.priority } });
  process.exit(0);
}

async function runRegister(init) {
  await bootstrapTemporal(init.polyfillPath);

  const state = { modName: init.modName, granted: init.grantedPermissions ?? [], registrations: [], overrides: new Map() };
  activeState = state;

  // Later mods can read what earlier mods registered (a relative-time
  // grammar that supplements an existing language's vocab, say). The
  // host's registry state can't be read from in here, so the records of
  // everything registered so far this load pass come along and replay
  // into this process's local library first — through a plain context,
  // not the recording one, so prior mods' data doesn't get re-recorded
  // and re-applied a second time host-side.
  if (init.priorRegistrations?.length) {
    const replayCtx = buildModContextFor(init.modName);
    for (const record of init.priorRegistrations) {
      const args = record.fn === 'createFormatter'
        ? [rehydrateFormatterOptions(record.args[0])]
        : record.args.map((a) => fromWire(a, Temporal));
      replayCtx[record.fn](...args);
    }
  }

  const ctx = buildRecordingContext(init.modName, state);

  let registerFn;
  if (init.kind === 'tfmod') {
    let mainExport;
    try {
      ({ default: mainExport } = await import(toImportSpecifier(init.modPath)));
    } catch (err) {
      send({ error: `failed to import "${init.modName}"'s main file: ${err.message}` });
      process.exit(0);
      return;
    }
    if (typeof mainExport?.register !== 'function') {
      send({ error: `"${init.modName}"'s main file's default export must have a "register" function` });
      process.exit(0);
      return;
    }
    registerFn = mainExport.register;
  } else {
    let mod;
    try {
      ({ default: mod } = await import(toImportSpecifier(init.modPath)));
    } catch (err) {
      send({ error: `failed to import: ${err.message}` });
      process.exit(0);
      return;
    }
    if (!isMod(mod)) {
      send({
        error:
          'default export must be an object with a "name" string, a "register" function, and — if present — "requires" as a string array and "priority" as a number',
      });
      process.exit(0);
      return;
    }
    registerFn = mod.register;
  }

  try {
    await registerFn(ctx, init.config ?? {});
  } catch (err) {
    // Tagged so the host can restore the distinction the old in-process
    // loader made between a mod that failed to load and one whose
    // register() threw — the load report text for each is different.
    send({ error: { kind: 'register', message: err instanceof Error ? err.message : String(err) } });
    process.exit(0);
    return;
  }

  send({
    result: {
      ok: true,
      registrations: state.registrations,
      overrides: [...state.overrides.keys()],
    },
  });

  // A mod that only registered data is done — its state lives on the
  // host now and this process is pure overhead. A mod that installed a
  // runtime override has code the host still needs on every call, so the
  // process stays put and serves the channel.
  if (state.overrides.size === 0) process.exit(0);
  startServing();
}

// Request ingestion, transport-agnostic. Whichever way bytes arrive,
// they land in deliver() as text and the phase machine decides what a
// line means: the first message picks the job, lines that show up while
// register() is still running are held rather than answered out of
// order, and once serving starts every line is a runtime call. That one
// structure serves both transports — with pipes the held lines used to
// sit in the kernel's buffer between listeners instead, but a poll loop
// has no such buffer, so the queue lives here where both can use it.
let phase = 'first'; // first → registering → serving ('done' once describe has dispatched)
let lineBuffer = '';
let heldDuringRegister = '';
let activeState = null;

function deliver(text) {
  lineBuffer += text;
  let newlineIndex;
  while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
    const line = lineBuffer.slice(0, newlineIndex);
    lineBuffer = lineBuffer.slice(newlineIndex + 1);
    if (line.trim() === '') continue;
    if (phase === 'first') {
      const msg = JSON.parse(line);
      if (msg.describe) {
        phase = 'done';
        runDescribe(msg.describe);
      } else if (msg.init) {
        phase = 'registering';
        runRegister(msg.init);
      } else {
        send({ error: `worker got an unexpected first message: ${Object.keys(msg).join(', ')}` });
        process.exit(1);
      }
    } else if (phase === 'serving') {
      handleCall(activeState, JSON.parse(line));
    } else {
      // register() is mid-flight; a call that arrives now is held, not
      // answered — the host can't have anything to call before its init
      // reply came back, except when it sends both back-to-back.
      heldDuringRegister += `${line}\n`;
    }
  }
}

function startServing() {
  phase = 'serving';
  const held = heldDuringRegister + lineBuffer;
  heldDuringRegister = '';
  lineBuffer = '';
  deliver(held);
}

// A crash the mod's code triggers would otherwise look like silence: the
// host is blocked waiting for a reply, and on the file transport a dead
// process appends nothing more. Noting the crash into the reply channel
// turns "no reply within 10s" into the actual error; on pipes it upgrades
// a bare EOF to the same.
process.on('uncaughtException', (err) => {
  try {
    send({ error: `the mod's subprocess crashed: ${err instanceof Error ? err.message : String(err)}` });
  } catch { /* channel already gone */ }
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  try {
    send({ error: `the mod's subprocess hit an unhandled rejection: ${err instanceof Error ? err.message : String(err)}` });
  } catch { /* channel already gone */ }
  process.exit(1);
});

process.stdin.setEncoding('utf8');
// stdin closing means the host is gone — nothing left to serve. True in
// the file mode too, where stdin carries no requests but its EOF is
// still how "the host is gone" looks from in here.
process.stdin.on('end', () => process.exit(0));

if (bridgeDir) {
  const callFd = openSync(join(bridgeDir, 'call'), 'r');
  const buf = Buffer.alloc(65536);
  // The decoder, not per-chunk toString: a multi-byte character can
  // split across reads and a naive decode would corrupt the line.
  const decoder = new StringDecoder('utf8');
  let callOffset = 0;
  // Polling rather than fs.watch: watch events have platform-by-platform
  // reliability caveats, and a millisecond read of a file that's usually
  // idle costs nothing measurable. The interval is also what keeps this
  // process alive as a long-lived bridge target, which the host wants.
  setInterval(() => {
    let n;
    while ((n = readSync(callFd, buf, 0, buf.length, callOffset)) > 0) {
      callOffset += n;
      deliver(decoder.write(buf.subarray(0, n)));
    }
  }, 1);
  // No 'data' listener in this mode, so resume() is what lets the end
  // event fire at all.
  process.stdin.resume();
} else {
  process.stdin.on('data', (chunk) => deliver(chunk));
}
