import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  createBusinessCalendar,
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  addBusinessDays,
  subtractBusinessDays,
  differenceInBusinessDays,
} from '../../src/calendar/businessCalendar.js';
import { createHolidayCalendar } from '../../src/calendar/holidays.js';

setTemporal(Temporal);

describe('createBusinessCalendar / isBusinessDay', () => {
  it('excludes the default weekend and a registered holiday', () => {
    const holidays = createHolidayCalendar([{ month: 8, day: 5, name: 'Test Holiday' }]);
    const cal = createBusinessCalendar({ holidays });
    expect(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-08'))).toBe(false); // Saturday
    expect(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-05'))).toBe(false); // holiday
    expect(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-06'))).toBe(true);
  });
});

describe('nextBusinessDay / previousBusinessDay', () => {
  it('skips forward and backward over a weekend', () => {
    const cal = createBusinessCalendar();
    const monday = Temporal.PlainDate.from('2026-08-10');
    expect(previousBusinessDay(cal, monday)).toMatchObject({ year: 2026, month: 8, day: 7 });
    const friday = Temporal.PlainDate.from('2026-08-07');
    expect(nextBusinessDay(cal, friday)).toMatchObject({ year: 2026, month: 8, day: 10 });
  });

  it('throws once every candidate in the search window is excluded', () => {
    const cal = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
    expect(() => nextBusinessDay(cal, Temporal.PlainDate.from('2026-08-04'))).toThrow(/found no business day within 732 days/);
  });
});

describe('addBusinessDays / differenceInBusinessDays', () => {
  it('advances by business days only and counts the gap between two dates', () => {
    const cal = createBusinessCalendar();
    const monday = Temporal.PlainDate.from('2026-08-10');
    expect(addBusinessDays(cal, monday, 3)).toMatchObject({ year: 2026, month: 8, day: 13 });
    expect(differenceInBusinessDays(cal, Temporal.PlainDate.from('2026-08-03'), monday)).toBe(5);
  });
});

// --- additions for full coverage -----------------------------------------

const pd = (iso: string) => Temporal.PlainDate.from(iso);

describe('createBusinessCalendar options', () => {
  it('defaults to a Sat/Sun weekend, 8h weekdays, 0h weekends, no half days', () => {
    const cal = createBusinessCalendar();
    expect(cal.weekend).toEqual(new Set([6, 7]));
    expect(cal.workingHours).toEqual({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0, 7: 0 });
    expect(cal.halfDays).toEqual(new Set());
    expect(cal.holidays).toBeUndefined();
  });

  it('copies workingHours and fills gaps without mutating the caller object', () => {
    const hours: Record<number, number> = { 1: 6 };
    const cal = createBusinessCalendar({ weekend: [5, 6], workingHours: hours, halfDays: [3] });
    expect(cal.workingHours).toEqual({ 1: 6, 2: 8, 3: 8, 4: 8, 5: 0, 6: 0, 7: 8 }); // Sun is a workday here
    expect(cal.weekend).toEqual(new Set([5, 6]));
    expect(cal.halfDays).toEqual(new Set([3]));
    expect(hours).toEqual({ 1: 6 }); // caller's object untouched
  });
});

describe('isBusinessDay input handling', () => {
  it('throws when the value has neither dayOfWeek nor year/month/day', () => {
    expect(() => isBusinessDay(createBusinessCalendar(), {})).toThrow(/needs a value with dayOfWeek/);
  });

  it('uses a provided dayOfWeek when year/month/day are (partially) missing', () => {
    const cal = createBusinessCalendar(); // no holidays: dayOfWeek-only values can't be date-checked
    expect(isBusinessDay(cal, { dayOfWeek: 6 })).toBe(false);
    expect(isBusinessDay(cal, { dayOfWeek: 3 })).toBe(true);
    expect(isBusinessDay(cal, { year: 2026, dayOfWeek: 3 })).toBe(true); // month missing -> no recompute
    expect(isBusinessDay(cal, { year: 2026, month: 8, dayOfWeek: 6 })).toBe(false); // day missing
  });

  it('recomputes dayOfWeek from year/month/day instead of trusting a stale one', () => {
    const cal = createBusinessCalendar();
    // 2026-08-10 is a Monday; a stale dayOfWeek claiming Sunday must be ignored
    expect(isBusinessDay(cal, { year: 2026, month: 8, day: 10, dayOfWeek: 7 })).toBe(true);
    // 2026-08-08 is a Saturday; a stale dayOfWeek claiming Monday must be ignored
    expect(isBusinessDay(cal, { year: 2026, month: 8, day: 8, dayOfWeek: 1 })).toBe(false);
  });
});

describe('custom weeks and holidays', () => {
  it('supports a Fri/Sat weekend (Sun-Thu work week)', () => {
    const cal = createBusinessCalendar({ weekend: [5, 6] });
    expect(isBusinessDay(cal, pd('2026-08-07'))).toBe(false); // Friday
    expect(isBusinessDay(cal, pd('2026-08-09'))).toBe(true); // Sunday
    expect(nextBusinessDay(cal, pd('2026-08-06'))).toMatchObject({ year: 2026, month: 8, day: 9 }); // Thu -> Sun
    expect(previousBusinessDay(cal, pd('2026-08-09'))).toMatchObject({ year: 2026, month: 8, day: 6 }); // Sun -> Thu
  });

  it('skips holidays on top of weekends', () => {
    const holidays = createHolidayCalendar([{ month: 8, day: 10, name: 'Summer shutdown' }]); // Monday
    const cal = createBusinessCalendar({ holidays });
    expect(isBusinessDay(cal, pd('2026-08-10'))).toBe(false);
    expect(nextBusinessDay(cal, pd('2026-08-07'))).toMatchObject({ year: 2026, month: 8, day: 11 }); // Fri -> Tue
    expect(previousBusinessDay(cal, pd('2026-08-11'))).toMatchObject({ year: 2026, month: 8, day: 7 }); // Tue -> Fri
  });

  it('throws from previousBusinessDay when every candidate is excluded', () => {
    const cal = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
    expect(() => previousBusinessDay(cal, pd('2026-08-05'))).toThrow(/found no business day within 732 days/);
  });
});

describe('addBusinessDays / subtractBusinessDays', () => {
  it('returns the input for 0 and walks backwards for negative counts', () => {
    const cal = createBusinessCalendar();
    const friday = pd('2026-08-07');
    expect(addBusinessDays(cal, friday, 0)).toBe(friday);
    expect(addBusinessDays(cal, friday, -1)).toMatchObject({ year: 2026, month: 8, day: 6 }); // Thu
    expect(addBusinessDays(cal, pd('2026-08-10'), -3)).toMatchObject({ year: 2026, month: 8, day: 5 }); // Mon -> Wed
  });

  it('crosses several weekends', () => {
    const cal = createBusinessCalendar();
    expect(addBusinessDays(cal, pd('2026-08-10'), 10)).toMatchObject({ year: 2026, month: 8, day: 24 });
  });

  it('starts on a weekend or holiday without counting the start day', () => {
    const holidays = createHolidayCalendar([{ month: 8, day: 10 }]); // Monday holiday
    const cal = createBusinessCalendar({ holidays });
    expect(addBusinessDays(cal, pd('2026-08-08'), 1)).toMatchObject({ year: 2026, month: 8, day: 11 }); // Sat -> Tue
  });

  it('rejects non-integer and out-of-range counts', () => {
    const cal = createBusinessCalendar();
    const d = pd('2026-08-10');
    expect(() => addBusinessDays(cal, d, 1.5)).toThrow(RangeError);
    expect(() => addBusinessDays(cal, d, NaN)).toThrow(/finite safe integer/);
    expect(() => addBusinessDays(cal, d, -100_001)).toThrow(/100000-day limit/);
    expect(() => addBusinessDays(cal, d, 100_001)).toThrow(/100000-day limit/);
  });

  it('subtractBusinessDays walks backwards and validates its count', () => {
    const holidays = createHolidayCalendar([{ month: 8, day: 10 }]); // Monday holiday
    const cal = createBusinessCalendar({ holidays });
    expect(subtractBusinessDays(cal, pd('2026-08-11'), 1)).toMatchObject({ year: 2026, month: 8, day: 7 }); // Tue -> Fri
    expect(subtractBusinessDays(cal, pd('2026-08-10'), 0)).toMatchObject({ year: 2026, month: 8, day: 10 });
    expect(() => subtractBusinessDays(cal, pd('2026-08-10'), 2.5)).toThrow(RangeError);
    expect(() => subtractBusinessDays(cal, pd('2026-08-10'), -100_001)).toThrow(/100000-day limit/);
  });
});

describe('differenceInBusinessDays', () => {
  it('returns 0 for identical dates and negates when the arguments flip', () => {
    const cal = createBusinessCalendar();
    const a = pd('2026-08-03');
    const b = pd('2026-08-10');
    expect(differenceInBusinessDays(cal, a, a)).toBe(0);
    expect(differenceInBusinessDays(cal, b, a)).toBe(-5);
  });

  it('counts weekends and holidays in either direction', () => {
    const holidays = createHolidayCalendar([{ month: 8, day: 11 }]); // Tuesday holiday
    const cal = createBusinessCalendar({ holidays });
    const fri = pd('2026-08-07');
    const nextFri = pd('2026-08-14');
    expect(differenceInBusinessDays(cal, fri, nextFri)).toBe(4); // Mon, Wed, Thu, Fri
    expect(differenceInBusinessDays(cal, nextFri, fri)).toBe(-4);
  });

  it('throws when the dates are more than 100000 days apart', () => {
    const cal = createBusinessCalendar();
    expect(() => differenceInBusinessDays(cal, pd('1900-01-01'), pd('2200-01-01'))).toThrow(RangeError);
    expect(() => differenceInBusinessDays(cal, pd('2200-01-01'), pd('1900-01-01'))).toThrow(/100000-day traversal limit/);
  });
});
