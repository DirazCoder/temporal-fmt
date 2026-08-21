import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import {
  createBusinessCalendar,
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  addBusinessDays,
  differenceInBusinessDays,
} from '../src/businessCalendar.js';
import { createHolidayCalendar } from '../src/holidays.js';

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
    expect(() => nextBusinessDay(cal, Temporal.PlainDate.from('2026-08-04'))).toThrow(/gave up after 14 days/);
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
