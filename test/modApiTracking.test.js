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
