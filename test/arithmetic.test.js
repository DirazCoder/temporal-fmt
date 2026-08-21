import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  add,
  addDays,
  addHours,
  addMilliseconds,
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  clamp,
  compare,
  difference,
  differenceInDays,
  differenceInHours,
  differenceInMilliseconds,
  differenceInMinutes,
  differenceInMonths,
  differenceInSeconds,
  differenceInWeeks,
  differenceInYears,
  setTemporal,
  subtract,
  subtractDays,
  subtractHours,
  subtractMilliseconds,
  subtractMinutes,
  subtractMonths,
  subtractSeconds,
  subtractWeeks,
  subtractYears,
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

test('add: years, months, days, weeks add to the right unit', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(add(date, 1, 'years').year, 2027);
  assert.equal(add(date, 1, 'years').month, 8);
  assert.equal(add(date, 1, 'months').month, 9);
  assert.equal(add(date, 1, 'weeks').day, 11); // 4 + 7
  assert.equal(add(date, 1, 'days').day, 5);
});

test('add: months overflow to next year correctly', () => {
  const date = Temporal.PlainDate.from('2026-11-04');
  const result = add(date, 3, 'months');
  assert.equal(result.year, 2027);
  assert.equal(result.month, 2);
});

test('add: years clamp Feb 29 on non-leap year (Temporal "constrain" overflow mode)', () => {
  // 2024-02-29 + 1 year = 2025-02-28 (clamp), not 2025-02-29 (invalid)
  // or 2025-03-01 (reject-style overflow).
  const date = Temporal.PlainDate.from('2024-02-29');
  const result = add(date, 1, 'years');
  assert.equal(result.year, 2025);
  assert.equal(result.month, 2);
  assert.equal(result.day, 28);
});

test('add: hours overflow to next day correctly', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T23:30:00');
  const result = add(dt, 1, 'hours');
  assert.equal(result.day, 5);
  assert.equal(result.hour, 0);
  assert.equal(result.minute, 30);
});

test('add: subtracting via negative amount works', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(add(date, -1, 'days').day, 3);
  assert.equal(add(date, -7, 'days').day, 28);
  assert.equal(add(date, -7, 'days').month, 7);
});

test('subtract: is add(value, -amount, unit)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.deepEqual(subtract(date, 1, 'days'), add(date, -1, 'days'));
});

test('addYears / addMonths / etc.: per-unit convenience wrappers match add(value, n, unit)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.deepEqual(addYears(date, 1), add(date, 1, 'years'));
  assert.deepEqual(addMonths(date, 1), add(date, 1, 'months'));
  assert.deepEqual(addWeeks(date, 1), add(date, 1, 'weeks'));
  assert.deepEqual(addDays(date, 1), add(date, 1, 'days'));
  assert.deepEqual(addHours(date, 1), add(date, 1, 'hours'));
  assert.deepEqual(addMinutes(date, 1), add(date, 1, 'minutes'));
  assert.deepEqual(addSeconds(date, 1), add(date, 1, 'seconds'));
  assert.deepEqual(addMilliseconds(date, 1), add(date, 1, 'milliseconds'));
});

test('subtractYears / subtractMonths / etc.: per-unit convenience wrappers match subtract', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.deepEqual(subtractYears(date, 1), subtract(date, 1, 'years'));
  assert.deepEqual(subtractMonths(date, 1), subtract(date, 1, 'months'));
  assert.deepEqual(subtractDays(date, 1), subtract(date, 1, 'days'));
  assert.deepEqual(subtractHours(date, 1), subtract(date, 1, 'hours'));
});

test('difference: years, months, weeks, days, hours, minutes, seconds, ms', () => {
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2027-06-15');
  assert.equal(difference(a, b, 'years'), 1);
  assert.equal(difference(a, b, 'months'), 17);
  assert.equal(difference(a, b, 'weeks'), 75); // 530 days / 7 = 75.71 → 75
  assert.equal(difference(a, b, 'days'), 530); // 365 + 31 + 28 + 31 + 30 + 31 + 15 = 531, but Jan 1 to Jan 1 next year is 365, then to Jun 15 is 165 (31+28+31+30+31+15) = 530
});

test('difference: returns negative when b < a', () => {
  const a = Temporal.PlainDate.from('2027-06-15');
  const b = Temporal.PlainDate.from('2026-01-01');
  assert.equal(difference(a, b, 'years'), -1);
  assert.equal(difference(a, b, 'days'), -530);
});

test('difference: time-only differences with full datetime', () => {
  const a = Temporal.PlainDateTime.from('2026-08-04T00:00:00');
  const b = Temporal.PlainDateTime.from('2026-08-04T03:30:15');
  assert.equal(difference(a, b, 'hours'), 3);
  assert.equal(difference(a, b, 'minutes'), 210); // 3*60 + 30
  assert.equal(difference(a, b, 'seconds'), 12615); // 3*3600 + 30*60 + 15
});

test('differenceInYears / Months / Days: per-unit wrappers', () => {
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2027-03-15');
  assert.equal(differenceInYears(a, b), 1);
  assert.equal(differenceInMonths(a, b), 14);
  assert.equal(differenceInDays(a, b), 438); // 365 + 31 + 28 + 15 - 1
});

test('compare: leap-year day-of-year offset (March onward in a leap year)', () => {
  // toComparableMs's leap-year +1 day adjustment only applies for
  // month > 2 in a leap year — every other compare test in this file
  // uses non-leap-year dates, so this exercises that specific branch.
  const mar1 = Temporal.PlainDate.from('2024-03-01');
  const feb28 = Temporal.PlainDate.from('2024-02-28');
  assert.equal(compare(mar1, feb28), 1);
  assert.equal(compare(feb28, mar1), -1);
});
