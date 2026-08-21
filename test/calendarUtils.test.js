import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOfYear,
  daysInMonth,
  daysInYear,
  endOf,
  getMonth,
  getQuarter,
  getWeekday,
  isLeapMonth,
  isLeapYear,
  max,
  monthsInYear,
  setTemporal,
  startOf,
  weekOfYear,
  weekYear,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

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
