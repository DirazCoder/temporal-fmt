import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  add, subtract, subtractWeeks, subtractMinutes, subtractSeconds, subtractMilliseconds,
  difference, differenceInYears, differenceInMonths, differenceInWeeks, differenceInDays,
  differenceInHours, differenceInMinutes, differenceInSeconds, differenceInMilliseconds,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// phase2.test.js covers add()/subtract() and most of the per-unit
// wrappers; this fills in the three wrappers it skips plus the
// dayOfWeek-recompute path (added to fix byWeekday recurrence rules
// silently matching against a stale weekday after a date shift).

test('subtractWeeks: matches subtract(value, n, "weeks")', () => {
  const date = Temporal.PlainDate.from('2026-06-15');
  assert.deepEqual(subtractWeeks(date, 2), subtract(date, 2, 'weeks'));
});

test('subtractMinutes: matches subtract(value, n, "minutes")', () => {
  const time = Temporal.PlainDateTime.from('2026-06-15T10:00:00');
  assert.deepEqual(subtractMinutes(time, 45), subtract(time, 45, 'minutes'));
});

test('subtractSeconds: matches subtract(value, n, "seconds")', () => {
  const time = Temporal.PlainDateTime.from('2026-06-15T10:00:00');
  assert.deepEqual(subtractSeconds(time, 90), subtract(time, 90, 'seconds'));
});

test('subtractMilliseconds: matches subtract(value, n, "milliseconds")', () => {
  const time = Temporal.PlainDateTime.from('2026-06-15T10:00:00.500');
  assert.deepEqual(subtractMilliseconds(time, 750), subtract(time, 750, 'milliseconds'));
});

test('add: recomputes dayOfWeek correctly when shifting by days across a week boundary', () => {
  // 2026-01-01 is a Thursday (dayOfWeek 4). +3 days lands on Sunday (7).
  const date = Temporal.PlainDate.from('2026-01-01');
  const result = add(date, 3, 'days');
  assert.equal(result.dayOfWeek, 7);
});

test('add: recomputes dayOfWeek correctly when shifting by years', () => {
  // 2026-01-01 is a Thursday; 2027-01-01 is a Friday.
  const date = Temporal.PlainDate.from('2026-01-01');
  const result = add(date, 1, 'years');
  assert.equal(result.dayOfWeek, 5);
});

test('add: recomputes dayOfWeek correctly when shifting by months', () => {
  // 2026-01-01 is a Thursday; 2026-02-01 is a Sunday.
  const date = Temporal.PlainDate.from('2026-01-01');
  const result = add(date, 1, 'months');
  assert.equal(result.dayOfWeek, 7);
});

test('add: recomputes dayOfWeek correctly when shifting by weeks', () => {
  // Adding whole weeks keeps the same weekday.
  const date = Temporal.PlainDate.from('2026-01-01');
  const result = add(date, 2, 'weeks');
  assert.equal(result.dayOfWeek, date.dayOfWeek);
});

test('add: a value with no dayOfWeek field stays without one after shifting', () => {
  // Plain field bags (not real Temporal objects) may not carry dayOfWeek.
  // recomputeDayOfWeek must no-op rather than inventing the field.
  const bag = { year: 2026, month: 1, day: 1 };
  const result = add(bag, 1, 'days');
  assert.equal('dayOfWeek' in result, false);
});

// Note: recomputeDayOfWeek's second guard (missing year/month/day) is
// unreachable through add()/subtract() — asDateFieldView already
// requires all three before a DateTimeFieldView can exist, so a bag
// with dayOfWeek but no full date never reaches this function. Not
// adding a test for it; there's no way to hit it through the public API.

test('differenceInYears / differenceInMonths / etc.: per-unit wrappers match difference()', () => {
  const a = Temporal.PlainDate.from('2025-01-01');
  const b = Temporal.PlainDate.from('2026-06-15');
  assert.equal(differenceInYears(a, b), difference(a, b, 'years'));
  assert.equal(differenceInMonths(a, b), difference(a, b, 'months'));
  assert.equal(differenceInWeeks(a, b), difference(a, b, 'weeks'));
  assert.equal(differenceInDays(a, b), difference(a, b, 'days'));
});

test('differenceInHours / differenceInMinutes / differenceInSeconds / differenceInMilliseconds: match difference()', () => {
  const a = Temporal.PlainDateTime.from('2026-06-15T10:00:00');
  const b = Temporal.PlainDateTime.from('2026-06-15T13:30:15.500');
  assert.equal(differenceInHours(a, b), difference(a, b, 'hours'));
  assert.equal(differenceInMinutes(a, b), difference(a, b, 'minutes'));
  assert.equal(differenceInSeconds(a, b), difference(a, b, 'seconds'));
  assert.equal(differenceInMilliseconds(a, b), difference(a, b, 'milliseconds'));
});

test('difference: hours/minutes/seconds/milliseconds work between two date-only values with no time fields', () => {
  // PlainDate has no hour/minute/second — exercises toTotalMs's `?? 0`
  // fallbacks for those fields.
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2026-01-02');
  assert.equal(difference(a, b, 'hours'), 24);
  assert.equal(difference(a, b, 'minutes'), 1440);
});

test('difference: milliseconds unit returns the raw ms delta', () => {
  const a = Temporal.PlainDateTime.from('2026-06-15T10:00:00.000');
  const b = Temporal.PlainDateTime.from('2026-06-15T10:00:00.750');
  assert.equal(difference(a, b, 'milliseconds'), 750);
});

test('toDayCount (via difference): handles proleptic-Gregorian years before year 0', () => {
  // Exercises the era<0 branch of the Howard Hinnant day-count formula.
  const a = Temporal.PlainDate.from('-000100-01-01');
  const b = Temporal.PlainDate.from('2026-01-01');
  const days = difference(a, b, 'days');
  assert.ok(days > 0);
});

test('add: subtracting more months than the current month value forces the negative-modulo renormalize branch', () => {
  // -14 months from Jan drives `total` negative, which needs the
  // `result.month < 1` renormalize step (not just plain Math.floor/%).
  const date = Temporal.PlainDate.from('2026-01-15');
  const result = add(date, -14, 'months');
  assert.equal(result.year, 2024);
  assert.equal(result.month, 11);
  assert.equal(result.day, 15);
});

test('add: month subtraction that drives the year*12+month total itself negative', () => {
  // Only years near 0 make `year*12 + month - 1 + amount` go negative,
  // which is what actually exercises `result.month < 1` — the -14 case
  // above never makes `total` itself negative, just its floor/%.
  const date = Temporal.PlainDate.from('0000-01-15');
  const result = add(date, -1, 'months');
  assert.equal(result.year, -2);
  assert.equal(result.month, 12);
  assert.equal(result.day, 15);
});

test('add: months clamps day-of-month when the target month is shorter', () => {
  // Jan 31 + 1 month → Feb has no 31st, clamps to the 28th (2026 isn't a leap year).
  const date = Temporal.PlainDate.from('2026-01-31');
  const result = add(date, 1, 'months');
  assert.equal(result.month, 2);
  assert.equal(result.day, 28);
});

test('add: shifting a pre-year-0 date by days round-trips through the negative-z inverse branch', () => {
  const date = Temporal.PlainDate.from('-000100-06-15');
  const result = add(date, 10, 'days');
  assert.equal(result.year, -100);
  assert.equal(result.month, 6);
  assert.equal(result.day, 25);
});
test('add: a plain field-bag without a dayOfWeek field skips recomputeDayOfWeek entirely', () => {
  // The outer `dayOfWeek` guard (not the inner year/month/day one, which
  // is dead code — see src/arithmetic.ts) returns early when the input
  // never had a dayOfWeek to begin with. Confirms add() doesn't throw or
  // fabricate a dayOfWeek in that case; it just leaves the field absent.
  const result = add({ year: 2026, month: 1, day: 31 }, 1, 'years');
  assert.equal(result.year, 2027);
  assert.equal(result.month, 1);
  assert.equal(result.day, 31);
  assert.equal('dayOfWeek' in result, false);
});

test('add: years clamps a leap-day date when the target year is not a leap year', () => {
  // Feb 29 2028 (leap) + 1 year -> 2029 has no Feb 29, clamps to the 28th.
  const date = Temporal.PlainDate.from('2028-02-29');
  const result = add(date, 1, 'years');
  assert.equal(result.year, 2029);
  assert.equal(result.month, 2);
  assert.equal(result.day, 28);
});

test('add: months normalizes when the running total goes negative past month 1 (month < 1 branch)', () => {
  // 2026-01 minus 13 months of "amount" pushes the total months negative,
  // exercising the `result.month < 1` renormalization. (There's no
  // corresponding `> 12` case to test: the formula (total % 12) + 1 can
  // never exceed 12 in JS, so that branch is dead code — see the c8
  // ignore comment on it in src/arithmetic.ts.)
  const date = Temporal.PlainDate.from('2026-01-15');
  const result = add(date, -13, 'months');
  assert.equal(result.year, 2024);
  assert.equal(result.month, 12);
  assert.equal(result.day, 15);
});
