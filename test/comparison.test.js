import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  add,
  clamp,
  compare,
  isAfter,
  isBefore,
  isBetween,
  isEqual,
  isSameDay,
  isSameMonth,
  isSameQuarter,
  isSameWeek,
  isSameYear,
  isToday,
  isTomorrow,
  isWeekday,
  isWeekend,
  isYesterday,
  max,
  min,
  setTemporal,
  subtract,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('compare: returns -1/0/1 matching Temporal.PlainDate.compare convention', () => {
  const a = Temporal.PlainDate.from('2026-08-04');
  const b = Temporal.PlainDate.from('2026-08-05');
  const c = Temporal.PlainDate.from('2026-08-04');
  assert.equal(compare(a, b), -1);
  assert.equal(compare(b, a), 1);
  assert.equal(compare(a, c), 0);
});

test('isEqual / isBefore / isAfter: derived from compare', () => {
  const a = Temporal.PlainDate.from('2026-08-04');
  const b = Temporal.PlainDate.from('2026-08-05');
  assert.equal(isEqual(a, b), false);
  assert.equal(isEqual(a, a), true);
  assert.equal(isBefore(a, b), true);
  assert.equal(isBefore(b, a), false);
  assert.equal(isAfter(a, b), false);
  assert.equal(isAfter(b, a), true);
});

test('min / max: pick from a list', () => {
  const a = Temporal.PlainDate.from('2026-08-04');
  const b = Temporal.PlainDate.from('2024-01-01');
  const c = Temporal.PlainDate.from('2027-12-31');
  assert.equal(min([a, b, c]).toString(), b.toString());
  assert.equal(max([a, b, c]).toString(), c.toString());
});

test('min: throws on empty array', () => {
  assert.throws(() => min([]), /requires a non-empty array/);
  assert.throws(() => max([]), /requires a non-empty array/);
});

test('clamp: returns lo if value < lo, hi if value > hi, value otherwise', () => {
  const lo = Temporal.PlainDate.from('2026-01-01');
  const hi = Temporal.PlainDate.from('2026-12-31');
  const v1 = Temporal.PlainDate.from('2025-06-15'); // before lo
  const v2 = Temporal.PlainDate.from('2027-06-15'); // after hi
  const v3 = Temporal.PlainDate.from('2026-08-04'); // in range
  assert.equal(clamp(v1, lo, hi).toString(), lo.toString());
  assert.equal(clamp(v2, lo, hi).toString(), hi.toString());
  assert.equal(clamp(v3, lo, hi).toString(), v3.toString());
});

test('isBetween: inclusive range check', () => {
  const lo = Temporal.PlainDate.from('2026-01-01');
  const hi = Temporal.PlainDate.from('2026-12-31');
  assert.equal(isBetween(Temporal.PlainDate.from('2026-08-04'), lo, hi), true);
  assert.equal(isBetween(Temporal.PlainDate.from('2025-08-04'), lo, hi), false);
  assert.equal(isBetween(lo, lo, hi), true); // inclusive
  assert.equal(isBetween(hi, lo, hi), true); // inclusive
});

test('isSameDay / isToday / isTomorrow / isYesterday', () => {
  const today = Temporal.Now.plainDateISO();
  const tomorrow = add(today, 1, 'days');
  const yesterday = subtract(today, 1, 'days');
  assert.equal(isSameDay(today, today), true);
  assert.equal(isSameDay(today, tomorrow), false);
  assert.equal(isToday(today), true);
  assert.equal(isToday(tomorrow), false);
  assert.equal(isTomorrow(tomorrow), true);
  assert.equal(isTomorrow(today), false);
  assert.equal(isYesterday(yesterday), true);
  assert.equal(isYesterday(today), false);
});

test('isSameMonth / isSameQuarter / isSameYear', () => {
  const a = Temporal.PlainDate.from('2026-08-04');
  const b = Temporal.PlainDate.from('2026-08-15');
  const c = Temporal.PlainDate.from('2026-09-04');
  const d = Temporal.PlainDate.from('2027-08-04');
  assert.equal(isSameMonth(a, b), true);
  assert.equal(isSameMonth(a, c), false);
  assert.equal(isSameQuarter(a, c), true); // Aug + Sep are both Q3
  assert.equal(isSameQuarter(a, Temporal.PlainDate.from('2026-10-04')), false);
  assert.equal(isSameYear(a, d), false);
  assert.equal(isSameYear(a, b), true);
});

test('isSameWeek: same Mon-Sun span', () => {
  // 2026-08-04 is a Tuesday. Same week: Mon 2026-08-03 through Sun 2026-08-09.
  const tue = Temporal.PlainDate.from('2026-08-04');
  const mon = Temporal.PlainDate.from('2026-08-03');
  const sun = Temporal.PlainDate.from('2026-08-09');
  const nextMon = Temporal.PlainDate.from('2026-08-10');
  assert.equal(isSameWeek(tue, mon), true);
  assert.equal(isSameWeek(tue, sun), true);
  assert.equal(isSameWeek(tue, nextMon), false); // crosses week boundary
});

test("isSameWeek: Jan/Feb dates (sameWeek's month<=2 day-count branch)", () => {
  // sameWeek's internal day-count helper treats Jan/Feb specially (shifts
  // them into the previous "civil year" for the day-count formula) — every
  // other isSameWeek test in this file uses an August date.
  const tue = Temporal.PlainDate.from('2026-01-06');
  const mon = Temporal.PlainDate.from('2026-01-05');
  assert.equal(isSameWeek(tue, mon), true);
});

test('isSameWeek: dates 7+ days apart are never the same week', () => {
  const aug1 = Temporal.PlainDate.from('2026-08-01');
  const sep1 = Temporal.PlainDate.from('2026-09-01');
  assert.equal(isSameWeek(aug1, sep1), false);
});

test('isSameWeek: negative (BCE-range) years', () => {
  // sameWeek's day-count helper has a distinct branch for years before
  // its era boundary (proleptic Gregorian, negative ISO year) — Temporal
  // supports these years directly, so this is real, reachable input, not
  // a synthetic edge case.
  const thu = Temporal.PlainDate.from('-000100-03-15');
  const fri = Temporal.PlainDate.from('-000100-03-16');
  assert.equal(isSameWeek(thu, fri), true);
});

test('isWeekend: Sat/Sun (Temporal dayOfWeek 6/7)', () => {
  // 2026-08-04 is a Tuesday
  assert.equal(isWeekend(Temporal.PlainDate.from('2026-08-04')), false); // Tue
  assert.equal(isWeekend(Temporal.PlainDate.from('2026-08-08')), true); // Sat
  assert.equal(isWeekend(Temporal.PlainDate.from('2026-08-09')), true); // Sun
  assert.equal(isWeekday(Temporal.PlainDate.from('2026-08-04')), true);
  assert.equal(isWeekday(Temporal.PlainDate.from('2026-08-08')), false);
});

test('isWeekend: throws descriptively on PlainTime (no dayOfWeek field)', () => {
  const t = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => isWeekend(t), /needs a value with a dayOfWeek field/);
});

test('isWeekend: throws descriptively on null', () => {
  assert.throws(() => isWeekend(null), /expected a Temporal value, got null/);
});

test('isWeekend: throws descriptively on a non-object primitive', () => {
  assert.throws(() => isWeekend('not a date'), /expected a Temporal value, got not a date/);
  assert.throws(() => isWeekend(42), /expected a Temporal value, got 42/);
});
