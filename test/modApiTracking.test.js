import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrackedModContext, buildModContextFor, isMod, parse, setTemporal, format, interval, formatRange } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// overrideParse installs a process-global override with no public way to
// undo it (see runtime.ts) — test/mods.test.js works around that by
// running every overrideFormat/overrideParse call in its own CLI
// subprocess. That's the right call for state isolation, but it means
// setParseOverride's success path and getParseImpl's overridden branch
// never show up in this file's own coverage. node --test gives each
// test *file* its own process, so as long as this stays the only file
// that installs a parse override in-process, it's safe to do it directly
// here instead of paying for another subprocess.
test('overrideParse: installs cleanly on first use and parse() reflects it', () => {
  const touched = [];
  const ctx = buildTrackedModContext('tracker-mod', (k) => touched.push(k));
  let callCount = 0;

  const before = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(before.year, 2026);
  assert.equal(callCount, 0);

  ctx.overrideParse((original, ...args) => {
    callCount += 1;
    return original(...args);
  });

  const after = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(after.year, 2026);
  assert.equal(callCount, 1);
  assert.deepEqual(touched, [{ kind: 'overrideParse', key: 'parse' }]);
});

// hasPermission on a host-built context: in-process there's no sandbox,
// so every governable capability reads as available and anything outside
// the closed list (net, typos) reads as false. The sandboxed worker
// overrides this with the granted-set answer — mods.sandbox.test.js
// covers that side of it in a real subprocess.
test('buildModContextFor: hasPermission says every capability is available in-process and nothing else is', () => {
  const ctx = buildModContextFor('perm-probe');
  assert.equal(ctx.hasPermission('fs:read'), true);
  assert.equal(ctx.hasPermission('fs:write'), true);
  assert.equal(ctx.hasPermission('child-process'), true);
  assert.equal(ctx.hasPermission('worker'), true);
  assert.equal(ctx.hasPermission('net'), false);
  assert.equal(ctx.hasPermission('banana'), false);
});

// Depends on the previous test having already installed a parse
// override — setParseOverride's collision guard (`if (parseOverride)
// throw ...`) only has something to collide with once one is already
// in place, and there's no public way to reset it mid-process. node
// --test runs a file's top-level tests sequentially by default, so this
// ordering is reliable as long as nothing above adds concurrency.
test('overrideParse: a second install from another mod collides', () => {
  const other = buildTrackedModContext('other-mod', () => {});
  assert.throws(
    () => other.overrideParse((original, ...args) => original(...args)),
    /already overridden by mod "tracker-mod"/,
  );
});

// registerLocale, registerRelativeGrammar, and createFormatter are the
// three registration points buildTrackedModContext wraps to report
// which mod touched which locale/grammar/token — see the doc comment on
// buildTrackedModContext in modApi.ts for why these three specifically
// need tracking and the other 81 override points don't.
test('buildTrackedModContext: tracks registerLocale, registerRelativeGrammar, and createFormatter', () => {
  const touched = [];
  const ctx = buildTrackedModContext('tracker-mod', (k) => touched.push(k));

  ctx.registerLocale('xx-TRACKED', {
    monthLong: ['Mo1', 'Mo2', 'Mo3', 'Mo4', 'Mo5', 'Mo6', 'Mo7', 'Mo8', 'Mo9', 'Mo10', 'Mo11', 'Mo12'],
    monthShort: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'],
    weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
    weekdayShort: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
    dayPeriod: ['AM', 'PM'],
  });
  ctx.registerRelativeGrammar({ language: 'xx-TRACKED', matchers: [() => null] });
  ctx.createFormatter({ tokens: [{ name: 'xTrackedToken', handler: () => 'x', field: 'year' }] });

  assert.deepEqual(touched, [
    { kind: 'locale', key: 'xx-TRACKED' },
    { kind: 'relativeGrammar', key: 'xx-TRACKED' },
    { kind: 'formatterTokens', key: 'xTrackedToken' },
  ]);
});

// createFormatter's tracking wrapper reads `options?.tokens ?? []` before
// looping — this hits that fallback for a caller that passes no tokens
// (or no options at all), the two shapes `test/extensibility.test.js`
// already covers on the untracked formatter but that this tracked
// wrapper hadn't seen with either shape.
test('buildTrackedModContext: createFormatter with no tokens option registers nothing and still returns a working formatter', () => {
  const touched = [];
  const ctx = buildTrackedModContext('tracker-mod', (k) => touched.push(k));

  const fmt = ctx.createFormatter();
  assert.equal(touched.length, 0);
  assert.equal(fmt.format(Temporal.PlainDate.from('2026-08-04'), 'yyyy'), '2026');
});

// isMod's four validation branches, largely untouched here because
// test/mods.test.js only checks the null/non-object cases (via a
// subprocess, since a .mjs file can't default-export a bare string or
// number). The rest — a bad `register`, and bad `requires`/`priority`
// shapes — are pure-function checks with no shared state to leak, so
// they don't need that isolation.
test('isMod: validates register, requires, and priority shapes', () => {
  assert.equal(isMod({ name: 'x', register: 'not-a-function' }), false);
  assert.equal(isMod({ name: 'x', register() {} }), true);
  assert.equal(isMod({ name: 'x', register() {}, requires: ['ok', 42] }), false);
  assert.equal(isMod({ name: 'x', register() {}, requires: ['a', 'b'] }), true);
  assert.equal(isMod({ name: 'x', register() {}, priority: '1' }), false);
  assert.equal(isMod({ name: 'x', register() {}, priority: 5 }), true);
  // The name-shape sub-branches. These used to be covered only through
  // the mod loader running in a spawned CLI (c8 follows subprocesses),
  // but the loader's isMod call now lives in the sandboxed worker whose
  // coverage output the permission model denies — so the check lives
  // here now, where it runs in-process.
  assert.equal(isMod({ name: 42, register() {} }), false);
  assert.equal(isMod({ name: '', register() {} }), false);
});

// callFormatImplBatch's batch branch: an override impl can attach a
// formatMany property (the mod sandbox's bridge does — see
// scripts/modSandbox.mjs — so formatRange() can answer both endpoints
// with one subprocess round trip), and the wrapper overrideFormat()
// installs must carry it through with the built-in format() injected so
// the batch's own fallbacks can reach it. Same process-global-override
// reasoning as the overrideParse test at the top of this file: this
// stays the only test installing a format override in-process, and it's
// last in the file so nothing after it can observe the change. The
// single-call path passes straight through to the original, so even
// that exposure is inert.
test('overrideFormat: a formatMany on the impl rides through to formatRange as the batch form', () => {
  const ctx = buildTrackedModContext('batch-mod', () => {});
  const impl = (original, ...args) => original(...args);
  let batchUses = 0;
  impl.formatMany = (values, formatStr, options, original) => {
    batchUses += 1;
    return values.map((v) => `batched(${original(v, formatStr, options)})`);
  };
  ctx.overrideFormat(impl);

  const range = interval(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-06'));
  assert.equal(formatRange(range, 'yyyy-MM-dd'), 'batched(2026-08-04) – batched(2026-08-06)');
  assert.equal(batchUses, 1);

  // Single-value format() still goes through the impl itself, not the
  // batch — the two entry points are for different call shapes.
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'yyyy'), '2026');
  assert.equal(batchUses, 1);
});

// buildModContextFor's log()/reportIssue() are the untracked fallback —
// no loadMods() load report to attach to, so they write straight to
// globalThis.console instead of dropping the line. Each level routes to
// its matching console method (debug/info/warn/error for log, always
// error for reportIssue regardless of severity), which is the specific
// thing an earlier version of this code got wrong: debug/info both fell
// through to console.error until a level-by-level test caught it. Swap
// out globalThis.console for the duration of the test and put the real
// one back after, so this doesn't affect any other file's output.
test('buildModContextFor: log() routes each level to the matching console method', () => {
  const ctx = buildModContextFor('console-mod');
  const calls = [];
  const realConsole = globalThis.console;
  globalThis.console = {
    debug: (...a) => calls.push(['debug', ...a]),
    info: (...a) => calls.push(['info', ...a]),
    warn: (...a) => calls.push(['warn', ...a]),
    error: (...a) => calls.push(['error', ...a]),
  };
  try {
    ctx.log('debug', 'debug message');
    ctx.log('info', 'info message', { key: 'value' });
    ctx.log('warn', 'warn message');
    ctx.log('error', 'error message');
  } finally {
    globalThis.console = realConsole;
  }

  assert.equal(calls.length, 4);
  assert.equal(calls[0][0], 'debug');
  assert.equal(calls[0][1], '[console-mod] debug: debug message');
  assert.equal(calls[1][0], 'info');
  assert.equal(calls[1][1], '[console-mod] info: info message {"key":"value"}');
  assert.equal(calls[2][0], 'warn');
  assert.equal(calls[2][1], '[console-mod] warn: warn message');
  assert.equal(calls[3][0], 'error');
  assert.equal(calls[3][1], '[console-mod] error: error message');
});

test('buildModContextFor: reportIssue() always writes via console.error, defaulting severity to warning', () => {
  const ctx = buildModContextFor('issue-mod');
  const calls = [];
  const realConsole = globalThis.console;
  globalThis.console = { error: (...a) => calls.push(a) };
  try {
    ctx.reportIssue({ message: 'no severity given' });
    ctx.reportIssue({ message: 'explicit warning', severity: 'warning' });
    ctx.reportIssue({ message: 'explicit error', severity: 'error', detail: { code: 7 } });
  } finally {
    globalThis.console = realConsole;
  }

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], '[issue-mod] warning: no severity given');
  assert.equal(calls[1][0], '[issue-mod] warning: explicit warning');
  assert.equal(calls[2][0], '[issue-mod] error: explicit error {"code":7}');
});

// If globalThis.console doesn't exist at all (a truly console-less
// runtime — the module's own doc comment calls this out as the reason
// it reaches through globalThis instead of the bare `console` global),
// log()/reportIssue() drop the line instead of throwing.
test('buildModContextFor: log() and reportIssue() are no-ops, not throws, with no console present', () => {
  const ctx = buildModContextFor('consoleless-mod');
  const realConsole = globalThis.console;
  // eslint-disable-next-line no-undefined
  globalThis.console = undefined;
  try {
    assert.doesNotThrow(() => ctx.log('info', 'nowhere to go'));
    assert.doesNotThrow(() => ctx.reportIssue({ message: 'nowhere to go' }));
  } finally {
    globalThis.console = realConsole;
  }
});

// buildTrackedModContext wraps log()/reportIssue() to also call
// onDiagnostic — this is the path scripts/loadMods.mjs uses to collect
// events for the printed load report. Both still fall through to the
// base (console) implementation too, per the source comment on
// buildTrackedModContext, so a tracked mod's diagnostics are never only
// visible in the report and never only on the console.
test('buildTrackedModContext: log() and reportIssue() both notify onDiagnostic and fall through to base', () => {
  const events = [];
  const ctx = buildTrackedModContext('diag-mod', () => {}, (e) => events.push(e));
  const calls = [];
  const realConsole = globalThis.console;
  globalThis.console = {
    debug: (...a) => calls.push(a),
    info: (...a) => calls.push(a),
    warn: (...a) => calls.push(a),
    error: (...a) => calls.push(a),
  };
  try {
    ctx.log('info', 'loaded holidays', { count: 340 });
    ctx.reportIssue({ message: 'fs:read denied', severity: 'warning', detail: { capability: 'fs:read' } });
    ctx.reportIssue({ message: 'defaults to warning' });
  } finally {
    globalThis.console = realConsole;
  }

  assert.deepEqual(events, [
    { source: 'log', level: 'info', message: 'loaded holidays', meta: { count: 340 } },
    { source: 'reportIssue', level: 'warn', message: 'fs:read denied', detail: { capability: 'fs:read' } },
    { source: 'reportIssue', level: 'warn', message: 'defaults to warning', detail: undefined },
  ]);
  // reportIssue's onDiagnostic level is 'error' only when severity is
  // literally 'error' — everything else (including no severity at all)
  // reports as 'warn', matching the [warn]/[error] prefixes the load
  // report actually prints.
  assert.equal(calls.length, 3);
});

test("buildTrackedModContext: reportIssue()'s severity: 'error' maps to onDiagnostic level 'error'", () => {
  const events = [];
  const ctx = buildTrackedModContext('diag-mod-2', () => {}, (e) => events.push(e));
  const realConsole = globalThis.console;
  globalThis.console = { error: () => {} };
  try {
    ctx.reportIssue({ message: 'fatal-ish but non-fatal', severity: 'error' });
  } finally {
    globalThis.console = realConsole;
  }
  assert.equal(events[0].level, 'error');
});

// registerFormatToken is additive at this level (Level 3) but shares the
// same last-write-wins/priority-tiebreak reasoning as registerLocale
// etc. — buildTrackedModContext tracks it under its own 'formatToken'
// kind (distinct from createFormatter's 'formatterTokens', a genuinely
// different, non-conflicting registration scoped to one Formatter
// instance rather than the shared format()/parse() table). "kk" isn't a
// built-in token prefix (checked against tokens.ts's TOKENS table), so
// this exercises the token reaching the real, shared table rather than
// silently falling through to literal passthrough or colliding with an
// existing token's greedy match.
test('buildTrackedModContext: tracks registerFormatToken under its own kind, distinct from createFormatter tokens', () => {
  const touched = [];
  const ctx = buildTrackedModContext('token-mod', (k) => touched.push(k));

  ctx.registerFormatToken({ name: 'kk', handler: () => 'ahoy', field: 'year' });

  assert.deepEqual(touched, [{ kind: 'formatToken', key: 'kk' }]);
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'kk'), 'ahoy');
});

// The subtle part of registerFormatToken: tokenize.ts/format.ts cache
// tokenized format strings (tokenizeCache in format.ts) and the
// tokenizer's own idea of which strings ARE tokens (SORTED_TOKEN_STRINGS
// in tokenize.ts). If a format string was already formatted (and thus
// cached as "kn is literal text") before a mod registers "kn" as a
// token, the cache has to be invalidated — otherwise that exact string
// would tokenize as literal text forever, even after registration.
test('registerFormatToken: invalidates the tokenize cache so an already-cached format string picks up a token registered afterward', () => {
  const before = format(Temporal.PlainDate.from('2026-08-04'), 'kn');
  assert.equal(before, 'kn'); // no such token yet — passes through as literal

  const ctx = buildTrackedModContext('cache-mod', () => {});
  ctx.registerFormatToken({ name: 'kn', handler: () => 'now-a-token', field: 'year' });

  const after = format(Temporal.PlainDate.from('2026-08-04'), 'kn');
  assert.equal(after, 'now-a-token');
});

// Last-write-wins by name: a second mod registering the same token name
// replaces the first mod's handler, same rule as registerLocale.
test('registerFormatToken: a second mod registering the same name overwrites the first (last-write-wins)', () => {
  const ctx1 = buildTrackedModContext('first-token-mod', () => {});
  const ctx2 = buildTrackedModContext('second-token-mod', () => {});

  ctx1.registerFormatToken({ name: 'kp', handler: () => 'first', field: 'year' });
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'kp'), 'first');

  ctx2.registerFormatToken({ name: 'kp', handler: () => 'second', field: 'year' });
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'kp'), 'second');
});

// buildTrackedModContext's onDiagnostic parameter defaults to a no-op
// () => {} so the older two-argument call shape (this file's own
// buildTrackedModContext('tracker-mod', onRegister) calls above, and
// scripts/loadMods.mjs before it started passing a diagnostic callback)
// keeps working unchanged. That default is only actually invoked when
// log()/reportIssue() are called on a context built the two-argument
// way — nothing else on this page exercises it.
test('buildTrackedModContext: onDiagnostic defaults to a no-op when omitted, log()/reportIssue() still work', () => {
  const ctx = buildTrackedModContext('no-diagnostic-callback-mod', () => {});
  assert.doesNotThrow(() => ctx.log('info', 'no one is listening'));
  assert.doesNotThrow(() => ctx.reportIssue({ message: 'no one is listening either' }));
});

// A mod can shadow a built-in token name — allowed, matching
// createFormatter's own merge rule, but here the blast radius is every
// format() call in the process rather than one Formatter instance.
test('registerFormatToken: can shadow a built-in token name process-wide', () => {
  const original = format(Temporal.PlainDate.from('2026-08-04'), 'yyyy');
  assert.equal(original, '2026');

  const ctx = buildTrackedModContext('shadow-mod', () => {});
  ctx.registerFormatToken({ name: 'yyyy', handler: () => 'SHADOWED', field: 'year' });

  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'yyyy'), 'SHADOWED');
});
