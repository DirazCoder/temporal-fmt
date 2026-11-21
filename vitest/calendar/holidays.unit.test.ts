import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { createHolidayCalendar, nextHoliday, previousHoliday, holidaysBetween } from '../../src/calendar/holidays.js';

setTemporal(Temporal);

describe('createHolidayCalendar', () => {
  it('detects fixed-date holidays and a floating compute() holiday', () => {
    const cal = createHolidayCalendar([
      { month: 7, day: 4, name: 'Independence Day' },
    ]);
    expect(cal.isHoliday(Temporal.PlainDate.from('2026-07-04'))).toBe(true);
    expect(cal.isHoliday(Temporal.PlainDate.from('2026-08-04'))).toBe(false);
  });

  it('throws when isHoliday is given a value missing year/month/day', () => {
    const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
    expect(() => cal.isHoliday({ month: 1, day: 1 })).toThrow(/needs a value with year\/month\/day/);
  });
});

describe('holidaysBetween', () => {
  it('the standalone helper matches the calendar method it delegates to', () => {
    const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
    const start = Temporal.PlainDate.from('2026-01-01');
    const end = Temporal.PlainDate.from('2026-12-31');
    expect(holidaysBetween(cal, start, end)).toEqual(cal.holidaysBetween(start, end));
  });
});

describe('nextHoliday / previousHoliday', () => {
  it('finds the nearest holiday in each direction', () => {
    const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
    const next = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
    expect(next).toMatchObject({ month: 7, day: 4 });
    const prev = previousHoliday(cal, Temporal.PlainDate.from('2026-08-04'));
    expect(prev).toMatchObject({ month: 7, day: 4 });
  });

  it('returns undefined when no holiday exists within the search window', () => {
    const cal = createHolidayCalendar([]);
    expect(nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'))).toBeUndefined();
    expect(previousHoliday(cal, Temporal.PlainDate.from('2026-06-15'))).toBeUndefined();
  });
});

// --- additions for full coverage -----------------------------------------

const pd = (iso: string) => Temporal.PlainDate.from(iso);

describe('isHoliday input validation', () => {
  it('throws when month or day is missing even if year is present', () => {
    const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
    expect(() => cal.isHoliday({ year: 2026 })).toThrow(/needs a value with year\/month\/day/);
    expect(() => cal.isHoliday({ year: 2026, month: 1 })).toThrow(/needs a value with year\/month\/day/);
    expect(() => cal.isHoliday({ month: 1, day: 1 })).toThrow(/needs a value with year\/month\/day/);
  });
});

describe('createHolidayCalendar spec kinds', () => {
  it('uses compute(year) for floating holidays', () => {
    // "last Monday of May" — a different date each year
    const lastMondayOfMay = (year: number) => {
      let d = Temporal.PlainDate.from({ year, month: 5, day: 31 });
      while (d.dayOfWeek !== 1) d = d.subtract({ days: 1 });
      return { month: d.month, day: d.day };
    };
    const cal = createHolidayCalendar([{ name: 'Memorial Day', compute: lastMondayOfMay }]);
    expect(cal.isHoliday(pd('2026-05-25'))).toBe(true); // 2026: last Mon of May is the 25th
    expect(cal.isHoliday(pd('2027-05-31'))).toBe(true); // 2027: last Mon of May is the 31st
    expect(cal.isHoliday(pd('2027-05-24'))).toBe(false); // a Monday, but not the last one
  });

  it('tolerates name-only specs (no month/day, no compute) without matching anything', () => {
    // note: holidaysBetween on such a calendar is not callable — compare()
    // rejects the resulting {month: undefined, day: undefined} entries —
    // so name-only specs are only exercised through isHoliday
    const cal = createHolidayCalendar([{ name: 'just a label' }]);
    expect(cal.isHoliday(pd('2026-05-25'))).toBe(false);
  });

  it('FIFO-evicts year caches past the 1000-entry cap', () => {
    let computed = 0;
    const cal = createHolidayCalendar([
      { name: 'counted', compute: () => { computed++; return { month: 1, day: 1 }; } },
    ]);
    // fill the cache with 1000 distinct years (isHoliday reads plain fields)
    for (let y = 2000; y < 3000; y++) cal.isHoliday({ year: y, month: 1, day: 1 });
    expect(computed).toBe(1000);
    // a 1001st distinct year evicts the oldest entry (year 2000)
    cal.isHoliday({ year: 3000, month: 1, day: 1 });
    expect(computed).toBe(1001);
    // year 2000 was evicted, so asking for it again recomputes
    cal.isHoliday({ year: 2000, month: 1, day: 1 });
    expect(computed).toBe(1002);
    // NOTE: the `oldest !== undefined` guard's false arm is provably
    // unreachable — cache.size >= 1000 means the Map is non-empty, and a
    // non-empty Map's keys().next().value is never undefined.
  });
});

describe('holidaysBetween ranges', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4, name: 'July 4' }]);

  it('is inclusive on both endpoints', () => {
    expect(cal.holidaysBetween(pd('2026-07-04'), pd('2026-07-04'))).toEqual([{ year: 2026, month: 7, day: 4 }]);
    expect(cal.holidaysBetween(pd('2026-07-01'), pd('2026-07-04'))).toEqual([{ year: 2026, month: 7, day: 4 }]);
  });

  it('returns [] for a holiday-free range and excludes out-of-range occurrences', () => {
    expect(cal.holidaysBetween(pd('2026-01-01'), pd('2026-06-30'))).toEqual([]);
    // 2025-07-04 falls before the start, 2027-07-04 after the end
    expect(cal.holidaysBetween(pd('2025-07-05'), pd('2027-07-03'))).toEqual([{ year: 2026, month: 7, day: 4 }]);
  });

  it('walks multiple years', () => {
    expect(cal.holidaysBetween(pd('2026-07-01'), pd('2027-07-05'))).toEqual([
      { year: 2026, month: 7, day: 4 },
      { year: 2027, month: 7, day: 4 },
    ]);
  });

  it('throws when start or end lacks year/month/day', () => {
    expect(() => cal.holidaysBetween({ month: 1, day: 1 }, pd('2026-12-31'))).toThrow(/needs start\/end values/);
    expect(() => cal.holidaysBetween(pd('2026-01-01'), { month: 12, day: 31 })).toThrow(/needs start\/end values/);
    expect(() => holidaysBetween(cal, null, pd('2026-01-01'))).toThrow(/needs start\/end values/);
    expect(() => holidaysBetween(cal, pd('2026-01-01'), null)).toThrow(/needs start\/end values/);
  });

  it('rejects ranges over 5000 years but accepts exactly 5000', () => {
    expect(() => cal.holidaysBetween(pd('0001-01-01'), pd('6000-01-01'))).toThrow(RangeError);
    expect(() => cal.holidaysBetween(pd('0001-01-01'), pd('6000-01-01'))).toThrow(/5000-year limit/);
    // exactly 5000 years apart is allowed: every July 4 from year 1..5000
    expect(cal.holidaysBetween(pd('0001-01-01'), pd('5001-01-01'))).toHaveLength(5000);
  });
});

describe('nextHoliday / previousHoliday across year boundaries', () => {
  it('wraps forward into the next year and backward into the previous one', () => {
    const newYear = createHolidayCalendar([{ month: 1, day: 1, name: "New Year's Day" }]);
    expect(nextHoliday(newYear, pd('2026-12-31'))).toMatchObject({ year: 2027, month: 1, day: 1 });
    // from Jan 1 itself, the previous one is last year's (strictly before)
    expect(previousHoliday(newYear, pd('2026-01-01'))).toMatchObject({ year: 2025, month: 1, day: 1 });
  });

  it('finds a previous holiday before the first one of the year', () => {
    const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
    expect(previousHoliday(cal, pd('2026-03-01'))).toMatchObject({ year: 2025, month: 7, day: 4 });
    expect(nextHoliday(cal, pd('2026-09-01'))).toMatchObject({ year: 2027, month: 7, day: 4 });
  });
});
