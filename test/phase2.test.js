import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysInMonth, daysInYear, monthsInYear, isLeapYear, isLeapMonth,
  dayOfYear, weekOfYear, weekYear, getQuarter, getMonth, getWeekday,
  startOf, endOf,
  add, subtract, difference,
  addYears, addMonths, addWeeks, addDays, addHours, addMinutes, addSeconds, addMilliseconds,
  subtractYears, subtractMonths, subtractDays, subtractHours,
  differenceInYears, differenceInMonths, differenceInWeeks, differenceInDays,
  differenceInHours, differenceInMinutes, differenceInSeconds, differenceInMilliseconds,
  compare, isEqual, isBefore, isAfter, min, max, clamp, isBetween,
  isToday, isTomorrow, isYesterday,
  isSameDay, isSameWeek, isSameMonth, isSameQuarter, isSameYear,
  isWeekend, isWeekday,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Calendar utilities (Section L)

test('daysInMonth: returns the correct day count for every month, including Feb leap year', () => {
  assert.equal(daysInMonth(Temporal.PlainDate.from('2026-02-15')), 28); // non-leap
  assert.equal(daysInMonth(Temporal.PlainDate.from('2024-02-15')), 29); // leap
  assert.equal(daysInMonth(Temporal.PlainDate.from('2026-01-15')), 31);
  assert.equal(daysInMonth(Temporal.PlainDate.from('2026-04-15')), 30);
});

test('daysInYear: returns 365/366 based on Gregorian leap year rules', () => {
  assert.equal(daysInYear(Temporal.PlainDate.from('2026-08-04')), 365);
  assert.equal(daysInYear(Temporal.PlainDate.from('2024-08-04')), 366); // divisible by 4
  assert.equal(daysInYear(Temporal.PlainDate.from('1900-08-04')), 365); // divisible by 100, not 400
  assert.equal(daysInYear(Temporal.PlainDate.from('2000-08-04')), 366); // divisible by 400
});

test('monthsInYear: always 12 for Gregorian (documented limitation)', () => {
  assert.equal(monthsInYear(Temporal.PlainDate.from('2026-08-04')), 12);
});

test('isLeapYear: matches Gregorian rules', () => {
  assert.equal(isLeapYear(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isLeapYear(Temporal.PlainDate.from('2024-08-04')), true);
  assert.equal(isLeapYear(Temporal.PlainDate.from('1900-08-04')), false);
  assert.equal(isLeapYear(Temporal.PlainDate.from('2000-08-04')), true);
});

test('isLeapMonth: always false for Gregorian (no leap month in Gregorian)', () => {
  assert.equal(isLeapMonth(Temporal.PlainDate.from('2026-08-04')), false);
});

test('dayOfYear: matches Temporal.PlainDate.dayOfYear', () => {
  assert.equal(dayOfYear(Temporal.PlainDate.from('2026-01-01')), 1);
  assert.equal(dayOfYear(Temporal.PlainDate.from('2026-08-04')), 216);
  assert.equal(dayOfYear(Temporal.PlainDate.from('2024-12-31')), 366); // leap year
  assert.equal(dayOfYear(Temporal.PlainDate.from('2026-12-31')), 365);
});

test('weekOfYear: matches Temporal.PlainDate.weekOfYear', () => {
  // 2026-01-01 is a Thursday — week 1
  assert.equal(weekOfYear(Temporal.PlainDate.from('2026-01-01')), 1);
  // 2026-08-04 is a Tuesday — let's see what week
  const aug4 = Temporal.PlainDate.from('2026-08-04');
  assert.equal(weekOfYear(aug4), aug4.weekOfYear);
});

test('weekYear: matches Temporal.PlainDate.weekYear', () => {
  const aug4 = Temporal.PlainDate.from('2026-08-04');
  assert.equal(weekYear(aug4), aug4.weekOfYear ? aug4.year : aug4.year);
  // Boundary case: Dec 31, 2024 should be in week 1 of 2025
  const dec31 = Temporal.PlainDate.from('2024-12-31');
  assert.equal(weekYear(dec31), 2025); // 2024-12-31 is a Tuesday → week 1 of 2025
});

test('getQuarter: 1-3=Q1, 4-6=Q2, 7-9=Q3, 10-12=Q4', () => {
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-01-15')), 1);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-03-31')), 1);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-04-01')), 2);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-06-30')), 2);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-07-01')), 3);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-09-30')), 3);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-10-01')), 4);
  assert.equal(getQuarter(Temporal.PlainDate.from('2026-12-31')), 4);
});

test('getMonth / getWeekday: read the field off the value', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(getMonth(date), 8);
  assert.equal(getWeekday(date), date.dayOfWeek); // 1=Mon..7=Sun
});

test('startOf: zeroes finer fields', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.deepEqual(startOf(dt, 'day'), { year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0, millisecond: 0, dayOfWeek: 2, calendarId: 'iso8601' });
  // Aug 1 2026 is a Saturday (dayOfWeek 6), Jan 1 2026 is a Thursday
  // (dayOfWeek 4) — startOf recomputes dayOfWeek for the new date
  // rather than carrying over the input's Tuesday (2).
  assert.deepEqual(startOf(dt, 'month'), { year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, dayOfWeek: 6, calendarId: 'iso8601' });
  assert.deepEqual(startOf(dt, 'year'), { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0, dayOfWeek: 4, calendarId: 'iso8601' });
  assert.deepEqual(startOf(dt, 'hour'), { year: 2026, month: 8, day: 4, hour: 15, minute: 0, second: 0, millisecond: 0, dayOfWeek: 2, calendarId: 'iso8601' });
});

test('startOf: minute and second units zero only the fields finer than themselves', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.deepEqual(startOf(dt, 'minute'), { year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 0, millisecond: 0, dayOfWeek: 2, calendarId: 'iso8601' });
  assert.deepEqual(startOf(dt, 'second'), { year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30, millisecond: 0, dayOfWeek: 2, calendarId: 'iso8601' });
});

test('endOf: maxes finer fields', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.deepEqual(endOf(dt, 'day'), { year: 2026, month: 8, day: 4, hour: 23, minute: 59, second: 59, millisecond: 999, dayOfWeek: 2, calendarId: 'iso8601' });
  // Aug 31 2026 is a Monday (dayOfWeek 1), Dec 31 2026 is a Thursday
  // (dayOfWeek 4) — same recompute as startOf above.
  assert.deepEqual(endOf(dt, 'month'), { year: 2026, month: 8, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999, dayOfWeek: 1, calendarId: 'iso8601' });
  assert.deepEqual(endOf(dt, 'year'), { year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999, dayOfWeek: 4, calendarId: 'iso8601' });
});

test('endOf: hour, minute, and second units max only the fields finer than themselves', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.deepEqual(endOf(dt, 'hour'), { year: 2026, month: 8, day: 4, hour: 15, minute: 59, second: 59, millisecond: 999, dayOfWeek: 2, calendarId: 'iso8601' });
  assert.deepEqual(endOf(dt, 'minute'), { year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 59, millisecond: 999, dayOfWeek: 2, calendarId: 'iso8601' });
  assert.deepEqual(endOf(dt, 'second'), { year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30, millisecond: 999, dayOfWeek: 2, calendarId: 'iso8601' });
});

test('startOf/endOf: recomputed dayOfWeek on a Sunday resolves to 7, not 0 (the jsDow===0 fold-in)', () => {
  // Aug 9 2026 is a Sunday. getUTCDay() reports Sunday as 0 — recomputeDayOfWeek
  // folds that into Temporal's 1=Mon..7=Sun numbering, so this is the only way
  // to exercise that specific ternary side.
  const dt = Temporal.PlainDateTime.from('2026-08-09T10:00:00');
  assert.equal(startOf(dt, 'day').dayOfWeek, 7);
  assert.equal(endOf(dt, 'day').dayOfWeek, 7);
});

test('startOf: a plain field bag with no dayOfWeek field stays without one (recomputeDayOfWeek skips silently)', () => {
  const result = startOf({ year: 2026, month: 8, day: 4 }, 'day');
  assert.deepEqual(result, { year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0, millisecond: 0 });
  assert.ok(!('dayOfWeek' in result));
});

test('asDateFieldView: throws when year/month/day are not all present', () => {
  assert.throws(() => startOf({ hour: 5 }, 'day'), /missing year\/month\/day fields/);
});

test('asDateFieldView: throws on a non-object value (null, primitive)', () => {
  assert.throws(() => startOf(null, 'day'), /expected a date-carrying Temporal value, got null/);
  assert.throws(() => startOf('not a date', 'day'), /expected a date-carrying Temporal value/);
  assert.throws(() => startOf(42, 'day'), /expected a date-carrying Temporal value/);
});

// Date arithmetic (Section M)

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

// Comparison (Section O)

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

test('compare: leap-year day-of-year offset (March onward in a leap year)', () => {
  // toComparableMs's leap-year +1 day adjustment only applies for
  // month > 2 in a leap year — every other compare test in this file
  // uses non-leap-year dates, so this exercises that specific branch.
  const mar1 = Temporal.PlainDate.from('2024-03-01');
  const feb28 = Temporal.PlainDate.from('2024-02-28');
  assert.equal(compare(mar1, feb28), 1);
  assert.equal(compare(feb28, mar1), -1);
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