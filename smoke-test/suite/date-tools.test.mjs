import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  addDays,
  addMonths,
  compare,
  dayOfYear,
  daysInMonth,
  formatISO,
  fromUnixSeconds,
  isLeapYear,
  parseISO,
  round,
  setTemporal,
  toUnixSeconds,
  weekOfYear,
} from 'temporal-fmt';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('calendar, arithmetic, comparison, and rounding operate on Temporal values', () => {
  const leapDay = Temporal.PlainDate.from('2024-02-29');
  assert.equal(daysInMonth(leapDay), 29);
  assert.equal(isLeapYear(leapDay), true);
  assert.equal(dayOfYear(Temporal.PlainDate.from('2026-01-01')), 1);
  assert.equal(typeof weekOfYear(Temporal.PlainDate.from('2026-08-04')), 'number');

  assert.equal(addDays(Temporal.PlainDate.from('2026-08-04'), 1).day, 5);
  assert.equal(addMonths(Temporal.PlainDate.from('2026-08-04'), 1).month, 9);
  assert.equal(compare(
    Temporal.PlainDate.from('2026-08-04'),
    Temporal.PlainDate.from('2026-08-05'),
  ), -1);
  const rounded = round(Temporal.PlainDateTime.from('2026-08-04T15:45:00'), { unit: 'hour' });
  assert.deepEqual(
    { year: rounded.year, month: rounded.month, day: rounded.day, hour: rounded.hour },
    { year: 2026, month: 8, day: 4, hour: 16 },
  );
});

test('ISO and Unix-time serialization round-trips through the package', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(formatISO(date), '2026-08-04');
  assert.equal(parseISO('2026-08-04').toString(), '2026-08-04');

  const instant = fromUnixSeconds(1_786_000_000);
  assert.equal(toUnixSeconds(instant), 1_786_000_000);
});
