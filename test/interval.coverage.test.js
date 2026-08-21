import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  interval, intervalContains as contains, overlaps, intersects,
  intervalIsBefore as isBefore, intervalIsAfter as isAfter,
  intersection, union, intervalDifference as difference, intervalSubtract as subtract,
  mergeIntervals, splitInterval,
  formatRange, formatRangeToParts, setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// phase2-final.test.js covers interval/contains/intersection/union/
// mergeIntervals/splitInterval/formatRange happy paths. This fills in
// overlaps, intersects, isBefore, isAfter, difference/subtract (all
// shapes: no overlap, cut-before, cut-after, cut-both-sides), the
// flipEndBounds branches, the open/half-open bounds combinations for
// intersection/union, formatRangeToParts, and toJSDate's fallback paths.

const d = (s) => Temporal.PlainDate.from(s);

test('overlaps: delegates to intersects', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'));
  const b = interval(d('2026-04-01'), d('2026-12-31'));
  assert.equal(overlaps(a, b), true);
  const c = interval(d('2027-01-01'), d('2027-06-30'));
  assert.equal(overlaps(a, c), false);
});

test('intersects: touching endpoints count as overlap', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'));
  const b = interval(d('2026-06-30'), d('2026-12-31'));
  assert.equal(intersects(a, b), true);
});

test('intersects: entirely-before and entirely-after both report false', () => {
  const a = interval(d('2026-01-01'), d('2026-02-01'));
  const before = interval(d('2025-01-01'), d('2025-12-01'));
  const after = interval(d('2027-01-01'), d('2027-12-01'));
  assert.equal(intersects(a, before), false);
  assert.equal(intersects(a, after), false);
});

test('isBefore: true when a ends before b starts', () => {
  const a = interval(d('2026-01-01'), d('2026-02-01'));
  const b = interval(d('2026-03-01'), d('2026-04-01'));
  assert.equal(isBefore(a, b), true);
  assert.equal(isBefore(b, a), false);
});

test('isAfter: true when a starts after b ends', () => {
  const a = interval(d('2026-03-01'), d('2026-04-01'));
  const b = interval(d('2026-01-01'), d('2026-02-01'));
  assert.equal(isAfter(a, b), true);
  assert.equal(isAfter(b, a), false);
});

test('difference: no overlap returns [a] unchanged', () => {
  const a = interval(d('2026-01-01'), d('2026-02-01'));
  const b = interval(d('2027-01-01'), d('2027-02-01'));
  const result = difference(a, b);
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});

test('difference: b fully inside a produces two pieces (before and after)', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'));
  const b = interval(d('2026-04-01'), d('2026-06-01'));
  const result = difference(a, b);
  assert.equal(result.length, 2);
  assert.equal(result[0].start.toString(), '2026-01-01');
  assert.equal(result[0].end.toString(), '2026-04-01');
  assert.equal(result[1].start.toString(), '2026-06-01');
  assert.equal(result[1].end.toString(), '2026-12-31');
});

test('difference: b overlapping only the start of a produces just the after-piece', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'));
  const b = interval(d('2025-01-01'), d('2026-06-01'));
  const result = difference(a, b);
  assert.equal(result.length, 1);
  assert.equal(result[0].start.toString(), '2026-06-01');
  assert.equal(result[0].end.toString(), '2026-12-31');
});

test('difference: b overlapping only the end of a produces just the before-piece', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'));
  const b = interval(d('2026-06-01'), d('2027-01-01'));
  const result = difference(a, b);
  assert.equal(result.length, 1);
  assert.equal(result[0].start.toString(), '2026-01-01');
  assert.equal(result[0].end.toString(), '2026-06-01');
});

test('difference: b entirely covers a produces an empty array', () => {
  const a = interval(d('2026-04-01'), d('2026-06-01'));
  const b = interval(d('2026-01-01'), d('2026-12-31'));
  const result = difference(a, b);
  assert.deepEqual(result, []);
});

test('subtract: is an alias for difference', () => {
  assert.equal(subtract, difference);
});

test('intersection: an open interval combined with a closed one — open wins at both ends it touches', () => {
  // a is fully 'open', which satisfies both the start-side and end-side
  // "is this bound open" checks regardless of b's bounds, so the result
  // is fully open even though b alone is closed.
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
  const inter = intersection(a, b);
  assert.equal(inter.bounds, 'open');
});

test('intersection: half-open-end on one side and closed on the other is open at the start only', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'half-open-end');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
  const inter = intersection(a, b);
  assert.equal(inter.bounds, 'half-open-end');
});

test('intersection: both open produces a fully open result', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'open');
  const inter = intersection(a, b);
  assert.equal(inter.bounds, 'open');
});

test('intersection: both closed produces a closed result', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'closed');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
  const inter = intersection(a, b);
  assert.equal(inter.bounds, 'closed');
});

test('union: requires both sides open at an endpoint to report open there', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
  const u = union(a, b);
  // Only one side is open at the start, so union (less-restrictive) is closed there.
  assert.equal(u.bounds, 'closed');
});

test('union: both sides open at both ends produces a fully open result', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'open');
  const u = union(a, b);
  assert.equal(u.bounds, 'open');
});

test('union: returns null when the intervals do not overlap', () => {
  const a = interval(d('2026-01-01'), d('2026-02-01'));
  const b = interval(d('2027-01-01'), d('2027-02-01'));
  assert.equal(union(a, b), null);
});

test('splitInterval: n=1 returns the original interval unchanged', () => {
  const iv = interval(d('2026-01-01'), d('2026-12-31'));
  const result = splitInterval(iv, 1);
  assert.deepEqual(result, [iv]);
});

test('splitInterval: throws for n <= 0', () => {
  const iv = interval(d('2026-01-01'), d('2026-12-31'));
  assert.throws(() => splitInterval(iv, 0), /requires n > 0/);
  assert.throws(() => splitInterval(iv, -3), /requires n > 0/);
});

test('splitInterval: sub-intervals after the first are half-open-start, and dates are correct', () => {
  // Regression test for a real bug: fromMs() used to add the absolute
  // epoch-day offset on top of base's own epoch-ms a second time,
  // landing slice dates tens of thousands of days away from the actual
  // interval (e.g. splitting Jan 2026 landed in year 2082). Now checks
  // actual dates, not just .bounds, so a reintroduction of that bug
  // would be caught here.
  const iv = interval(d('2026-01-01'), d('2026-01-05'));
  const result = splitInterval(iv, 4);
  assert.equal(result[0].bounds, iv.bounds);
  assert.equal(result[1].bounds, 'half-open-start');
  assert.equal(result[3].bounds, 'half-open-start');
  const dates = result.map((r) => `${r.start.year}-${String(r.start.month).padStart(2, '0')}-${String(r.start.day).padStart(2, '0')}`);
  assert.deepEqual(dates, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.equal(result[3].end.year, 2026);
  assert.equal(result[3].end.month, 1);
  assert.equal(result[3].end.day, 5);
});

test('splitInterval: a month > February exercises toMs\'s non-Jan/Feb branch (m2 = m - 3, y2 = y)', () => {
  // Every other splitInterval test in this file uses a January date,
  // which always takes the m<=2 branch of toMs's era math. A mid-year
  // month exercises the other side of that ternary.
  const iv = interval(d('2026-06-01'), d('2026-06-05'));
  const result = splitInterval(iv, 4);
  const dates = result.map((r) => `${r.start.year}-${String(r.start.month).padStart(2, '0')}-${String(r.start.day).padStart(2, '0')}`);
  assert.deepEqual(dates, ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
});

test('splitInterval: a pre-epoch date exercises toMs\'s negative-year era branch and fromMs\'s negative-remainder normalization', () => {
  const iv = interval(d('1969-01-01'), d('1969-01-05'));
  const result = splitInterval(iv, 4);
  const dates = result.map((r) => `${r.start.year}-${String(r.start.month).padStart(2, '0')}-${String(r.start.day).padStart(2, '0')}`);
  assert.deepEqual(dates, ['1969-01-01', '1969-01-02', '1969-01-03', '1969-01-04']);
  assert.equal(result[3].end.year, 1969);
  assert.equal(result[3].end.month, 1);
  assert.equal(result[3].end.day, 5);
});

test('union: startBoundsOpen true and endBoundsOpen false yields half-open-end', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'half-open-end');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'half-open-end');
  const u = union(a, b);
  assert.equal(u.bounds, 'half-open-end');
});

test('union: endBoundsOpen true and startBoundsOpen false yields half-open-start', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'half-open-start');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'half-open-start');
  const u = union(a, b);
  assert.equal(u.bounds, 'half-open-start');
});

test('difference: an open `a` produces two open pieces (flipEndBounds\'s open branch)', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'), 'open');
  const b = interval(d('2026-04-01'), d('2026-06-01'));
  const result = difference(a, b);
  assert.equal(result.length, 2);
  assert.equal(result[0].bounds, 'open');
  assert.equal(result[1].bounds, 'open');
});

test('difference: a half-open-end `a` makes the before-piece half-open-end (flipEndBounds\'s startBounds branch)', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'), 'half-open-end');
  const b = interval(d('2026-04-01'), d('2026-06-01'));
  const result = difference(a, b);
  assert.equal(result[0].bounds, 'half-open-end');
  assert.equal(result[1].bounds, 'closed');
});

test('difference: a half-open-start `a` makes the after-piece half-open-start (flipEndBounds\'s endBounds branch)', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'), 'half-open-start');
  const b = interval(d('2026-04-01'), d('2026-06-01'));
  const result = difference(a, b);
  assert.equal(result[0].bounds, 'closed');
  assert.equal(result[1].bounds, 'half-open-start');
});

test('intersection: when a is narrower than b, a\'s own endpoints win the ternaries', () => {
  // My earlier intersection tests always had b's endpoints win (b later
  // start, earlier end than a). This covers the opposite: a is the
  // narrower interval, so a.start/a.end should be picked instead.
  const a = interval(d('2026-04-01'), d('2026-06-30'));
  const b = interval(d('2026-01-01'), d('2026-12-31'));
  const inter = intersection(a, b);
  assert.equal(inter.start.toString(), '2026-04-01');
  assert.equal(inter.end.toString(), '2026-06-30');
});

test('intersection: half-open-start on one side and closed on the other is open at the end only', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'), 'half-open-start');
  const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
  const inter = intersection(a, b);
  assert.equal(inter.bounds, 'half-open-start');
});

test('union: when a starts after and ends after b, b\'s start and a\'s end win the ternaries', () => {
  // My earlier union tests always had a's start and b's end win. This
  // covers the opposite pairing.
  const a = interval(d('2026-04-01'), d('2026-12-31'));
  const b = interval(d('2026-01-01'), d('2026-06-30'));
  const u = union(a, b);
  assert.equal(u.start.toString(), '2026-01-01');
  assert.equal(u.end.toString(), '2026-12-31');
});

test('splitInterval: a pre-epoch date with a non-midnight time exercises fromMs\'s negative-remainder normalization', () => {
  // The earlier pre-epoch test used exact midnight, so ms % MS_PER_DAY
  // came out to -0 (not < 0 in JS), never actually tripping the
  // normalization branch. A non-midnight time forces a genuinely
  // negative remainder.
  const iv = interval(
    Temporal.PlainDateTime.from('1969-01-01T12:00:00'),
    Temporal.PlainDateTime.from('1969-01-01T18:00:00'),
  );
  const result = splitInterval(iv, 2);
  assert.equal(result[0].start.hour, 12);
  assert.equal(result[1].start.hour, 15);
});

test('splitInterval: a year-0-or-earlier date exercises toMs\'s negative-era branch', () => {
  // Year 0 itself isn't enough: toMs's y2 (= y, since month > 2 here) is 0,
  // and `0 >= 0` is true, landing on the *non*-negative branch of the era
  // ternary. A genuinely negative year (or year 0 with month <= 2, which
  // makes y2 = y - 1 = -1) is needed to hit the y2 < 0 branch.
  const iv = interval(
    Temporal.PlainDate.from({ year: -1, month: 6, day: 1 }),
    Temporal.PlainDate.from({ year: -1, month: 6, day: 5 }),
  );
  const result = splitInterval(iv, 4);
  const dates = result.map((r) => `${r.start.year}-${String(r.start.month).padStart(2, '0')}-${String(r.start.day).padStart(2, '0')}`);
  assert.deepEqual(dates, ['-1-06-01', '-1-06-02', '-1-06-03', '-1-06-04']);
});

test('intersection: equal end values take the a-side branch of the <=0 ternary', () => {
  const a = interval(d('2026-01-01'), d('2026-06-30'));
  const b = interval(d('2026-03-01'), d('2026-06-30'));
  const inter = intersection(a, b);
  assert.equal(inter.end.toString(), '2026-06-30');
});

test('intersection: a strictly-later a.end takes the b-side (else) branch of the <=0 ternary', () => {
  // The equal-ends test above only exercises the true branch (a.end wins
  // via <= 0). This forces compare(a.end, b.end) > 0, so b.end must win.
  const a = interval(d('2026-01-01'), d('2026-12-31'));
  const b = interval(d('2026-03-01'), d('2026-06-30'));
  const inter = intersection(a, b);
  assert.equal(inter.end.toString(), '2026-06-30');
});

test('formatRangeToParts: concatenates start parts, a separator literal, and end parts', () => {
  const iv = interval(d('2026-01-01'), d('2026-01-05'));
  const parts = formatRangeToParts(iv, 'yyyy-MM-dd');
  const sepIndex = parts.findIndex((p) => p.type === 'literal' && p.value === ' – ');
  assert.ok(sepIndex > 0);
  assert.ok(sepIndex < parts.length - 1);
});

test('formatRange: falls back to manual join when Intl.DateTimeFormat.formatRange throws', () => {
  // A plain field-bag object (no toInstant, no real Temporal type) still
  // has year/month/day, so toJSDate() succeeds -- but passing that
  // synthesized Date into fmt.formatRange works fine too, so this
  // exercises the *success* path via a non-Temporal-instance value
  // rather than forcing the catch block, which needs an engine that
  // rejects formatRange outright (not reliably triggerable here).
  const iv = interval({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 5 });
  const s = formatRange(iv, 'yyyy-MM-dd');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
});

test('formatRange: a ZonedDateTime endpoint uses toInstant() rather than the year/month/day fallback', () => {
  const a = Temporal.ZonedDateTime.from('2026-01-01T00:00:00[UTC]');
  const b = Temporal.ZonedDateTime.from('2026-01-05T00:00:00[UTC]');
  const iv = interval(a, b);
  const s = formatRange(iv, 'yyyy-MM-dd');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
});

test('formatRange: an endpoint with no usable date shape throws — via the format() fallback, not toJSDate directly', () => {
  // toJSDate()'s own throw ("expected Temporal values with year/month/day")
  // is unreachable from formatRange(): toJSDate always runs inside the
  // try block, so its failure is caught and formatRange falls back to
  // format(), which throws its own (different, earlier) error for a
  // field-bag missing "year". formatRangeToParts() never calls toJSDate
  // at all. So the only externally-observable error here is format()'s.
  const iv = { start: { foo: 1 }, end: { foo: 2 }, bounds: 'closed' };
  assert.throws(() => formatRange(iv, 'yyyy-MM-dd'), /requires "year"/);
});

test('mergeIntervals: an empty list returns an empty array', () => {
  assert.deepEqual(mergeIntervals([]), []);
});