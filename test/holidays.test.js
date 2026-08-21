import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHolidayCalendar,
  holidaysBetween,
  nextHoliday,
  previousHoliday,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('createHolidayCalendar: detects fixed-date holidays', () => {
  const cal = createHolidayCalendar([
    { month: 1, day: 1, name: 'New Year' },
    { month: 7, day: 4, name: 'Independence Day' },
  ]);
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-01-01')));
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-07-04')));
  assert.ok(!cal.isHoliday(Temporal.PlainDate.from('2026-08-04')));
});

test('createHolidayCalendar: detects floating holidays via a compute() spec', () => {
  // "Last Monday of May" style rule — compute() takes the year and
  // returns { month, day } for that year, rather than a fixed date.
  const memorialDay = (year) => {
    let d = Temporal.PlainDate.from({ year, month: 5, day: 31 });
    while (d.dayOfWeek !== 1) d = d.subtract({ days: 1 });
    return { month: d.month, day: d.day };
  };
  const cal = createHolidayCalendar([{ compute: memorialDay, name: 'Memorial Day' }]);
  // Memorial Day 2026 is Monday, May 25.
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-05-25')));
  assert.ok(!cal.isHoliday(Temporal.PlainDate.from('2026-05-24')));
});

test('createHolidayCalendar: isHoliday throws on a value missing year/month/day', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
  assert.throws(
    () => cal.isHoliday({ month: 1, day: 1 }), // no year
    /needs a value with year\/month\/day/,
  );
});

test('holidaysBetween: enumerates holidays in range', () => {
  const cal = createHolidayCalendar([
    { month: 1, day: 1 },
    { month: 7, day: 4 },
    { month: 12, day: 25 },
  ]);
  const list = cal.holidaysBetween(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.equal(list.length, 3);
});

test('holidaysBetween: the standalone exported helper delegates to cal.holidaysBetween', () => {
  // The exported holidaysBetween(cal, start, end) function is a thin
  // wrapper around the calendar's own method — separate from the
  // cal.holidaysBetween(...) call the test above exercises.
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const viaHelper = holidaysBetween(cal, Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  const viaMethod = cal.holidaysBetween(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.deepEqual(viaHelper, viaMethod);
  assert.equal(viaHelper.length, 1);
});

test('nextHoliday: finds next holiday', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const r = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.ok(r !== undefined);
  const d = r;
  assert.equal(d.month, 7);
  assert.equal(d.day, 4);
});

test('nextHoliday: returns undefined when no holiday is found within 5 years', () => {
  // Empty calendar — isHoliday() never matches, so the loop should run
  // its full 365*5 iterations and fall through to the `return undefined`.
  const cal = createHolidayCalendar([]);
  const r = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.equal(r, undefined);
});

test('previousHoliday: finds the most recent holiday before the given date', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const r = previousHoliday(cal, Temporal.PlainDate.from('2026-08-04'));
  assert.ok(r !== undefined);
  assert.equal(r.month, 7);
  assert.equal(r.day, 4);
});

test('previousHoliday: returns undefined when no holiday is found within 5 years', () => {
  const cal = createHolidayCalendar([]);
  const r = previousHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.equal(r, undefined);
});
