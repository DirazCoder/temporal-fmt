import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, safeParse, parseToParts, setTemporal,
  createHolidayCalendar, holidaysBetween,
  recurrence, skip,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Regression tests for the security fixes backported to 0.8.x LTS from
// 0.9.2's audit (ReDoS in parse()'s compiled regex, and the two unbounded-
// traversal DoS fixes in recurrence.ts / holidays.ts). 0.8.x keeps the
// pre-0.9.0 plain-Error throw convention throughout — these assertions
// match on message text, not on typed error classes.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function timeMs(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

const BUDGET_MS = 500; // generous; healthy cases land in single-digit ms

// ---------------------------------------------------------------------------
// ReDoS — catastrophic backtracking in parse()'s generated regex
// ---------------------------------------------------------------------------

test('ReDoS: a long glued run of unpadded numeric tokens parses in linear time ("Md" x 50, near-miss input)', () => {
  const formatStr = 'Md'.repeat(50);
  const input = '1'.repeat(150) + 'x';
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches|is ambiguous/);
  });
  assert.ok(ms < BUDGET_MS, `"Md" x 50 took ${ms}ms, expected < ${BUDGET_MS}ms`);
});

test('ReDoS: a 3-token glued run shape ("Hms" x 20) parses in linear time', () => {
  const formatStr = 'Hms'.repeat(20);
  const input = '1'.repeat(80) + 'x';
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches|is ambiguous/);
  });
  assert.ok(ms < BUDGET_MS, `"Hms" x 20 took ${ms}ms, expected < ${BUDGET_MS}ms`);
});

test('ReDoS: glued-run semantics are unchanged after the single-group rewrite', () => {
  assert.equal(parse('yyyy-Md', '2026-34').month, 3);
  assert.equal(parse('yyyy-Md', '2026-34').day, 4);
  assert.equal(parse('yyyy-Md', '2026-1225').month, 12);
  assert.equal(parse('yyyy-Md', '2026-1225').day, 25);
  assert.throws(() => parse('yyyy-Md', '2026-125'), /is ambiguous/);
  assert.throws(() => parse('yyyy-Md', '2026-304'), /no valid pattern matches/);
  assert.equal(parse('yyyy-Md', '2026-121', { lenient: true }).day, 1);
});

test('ReDoS: a run whose digit span has no valid split is a mismatch, not a hang', () => {
  // "999" matches the run's width window (2..4 digits) but no per-token
  // split is valid (M tops out at 12).
  assert.throws(() => parse('Md', '999'), /no valid pattern matches/);
  assert.throws(() => parse('Md', '99999'), /no valid pattern matches/);
});

test('ReDoS: many unpadded tokens glued to digit literals are rejected at build time (ambiguity budget)', () => {
  // "M1" x 13 attack shape — exponential before the budget guard,
  // rejected outright at 13 (13 bits > the 12-bit budget).
  assert.throws(() => parse('M1'.repeat(13), '1'.repeat(20) + 'x'), /too many variable-width/);
  // A small, legitimate count of such adjacencies still parses.
  const r = parse('yyyy-M1d', '2026-1211');
  assert.equal(r.month, 12);
  assert.equal(r.day, 1);
});

test('ReDoS: yyyy followed by a digit-starting literal uses the exact 4-digit fragment', () => {
  const formatStr = 'yyyy1'.repeat(8);
  const input = '1'.repeat(80) + 'x';
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches/);
  });
  assert.ok(ms < BUDGET_MS, `"yyyy1" x 8 took ${ms}ms, expected < ${BUDGET_MS}ms`);
  assert.equal(parse('yyyy1-MM-dd', '20261-08-04').year, 2026);
});

test('safeParse surfaces the same ReDoS-guard rejection without throwing', () => {
  const result = safeParse('M1'.repeat(13), '1'.repeat(20) + 'x');
  assert.equal(result.ok, false);
});

test('parseToParts resolves a unique glued-run split into per-token parts', () => {
  const parts = parseToParts('yyyy-Md', '2026-34');
  assert.deepEqual(parts.map((p) => p.token), ['yyyy', 'M', 'd']);
  assert.equal(parts[1].raw, '3');
  assert.equal(parts[2].raw, '4');
});

test('parseToParts mirrors parse()\'s glued-run handling: 0 splits and lenient picks', () => {
  assert.throws(() => parseToParts('Md', '999'), /no valid pattern matches/);
  const parts = parseToParts('yyyy-Md', '2026-121', { lenient: true });
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((p) => p.token), ['yyyy', 'M', 'd']);
  assert.equal(parts[1].raw, '12');
  assert.equal(parts[2].raw, '1');
});

// ---------------------------------------------------------------------------
// Unbounded traversal guards
// ---------------------------------------------------------------------------

test('holidaysBetween rejects year ranges beyond the 5000-year cap instead of walking them', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1, name: 'NY' }]);
  assert.throws(
    () => holidaysBetween(cal, { year: 1, month: 1, day: 1 }, { year: 300000, month: 1, day: 1 }),
    /exceeds the .*-year limit/,
  );
  const list = holidaysBetween(cal, { year: 2026, month: 1, day: 1 }, { year: 2026, month: 12, day: 31 });
  assert.equal(list.length, 1);
});

test('holidaysBetween validates that endpoints carry year/month/day', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
  assert.throws(
    () => holidaysBetween(cal, { nope: 1 }, { year: 2026, month: 1, day: 1 }),
    /needs start\/end values with year\/month\/day/,
  );
});

test('skip() on a bounded rule still works normally', () => {
  const iter = recurrence({ year: 2026, month: 1, day: 1, dayOfWeek: 4 }, { frequency: 'daily', interval: 1, count: 10 });
  assert.equal(skip(iter, 2).length, 8);
});

test('skip() on an unbounded rule throws once it collects past the cap, instead of looping forever', () => {
  const iter = recurrence({ year: 2026, month: 1, day: 1, dayOfWeek: 4 }, { frequency: 'daily', interval: 1 });
  assert.throws(() => skip(iter, 3), /still producing/);
});
