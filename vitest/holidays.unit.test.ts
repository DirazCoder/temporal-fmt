import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { createHolidayCalendar, nextHoliday, previousHoliday, holidaysBetween } from '../src/holidays.js';

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
