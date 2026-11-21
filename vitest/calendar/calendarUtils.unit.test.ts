import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  startOf,
  endOf,
  asDateFieldView,
  daysInMonth,
  daysInYear,
  monthsInYear,
  isLeapYear,
  isLeapMonth,
  dayOfYearHelper,
  weekOfYear,
  weekYear,
  getQuarter,
  getMonth,
  getWeekday,
  type StartOfUnit,
} from '../../src/calendar/calendarUtils.js';

setTemporal(Temporal);

// startOf/endOf reassign year/month/day but used to copy dayOfWeek
// straight from the input via `{ ...view }` without recomputing it.
// Any call that crosses a month or year boundary landed on the wrong
// weekday. Jan 1 2026 is a Thursday (ISO dayOfWeek 4) — picked here
// because it's a real boundary case, not a coincidence where the
// input's dayOfWeek happens to already be correct.

describe('startOf', () => {
  it('recomputes dayOfWeek when year boundary changes the date', () => {
    // Aug 4 2026 is a Tuesday (dayOfWeek 2).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = startOf(input, 'year');
    expect(result.year).toBe(2026);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(4); // Thursday, not the stale 2
  });

  it('recomputes dayOfWeek when month boundary changes the date', () => {
    // Aug 4 2026 is a Tuesday; Aug 1 2026 is a Saturday (dayOfWeek 6).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = startOf(input, 'month');
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(6);
  });

  it('leaves dayOfWeek untouched when the unit does not change the date', () => {
    const input = { year: 2026, month: 8, day: 4, hour: 15, dayOfWeek: 2 };
    const result = startOf(input, 'hour');
    expect(result.dayOfWeek).toBe(2);
  });
});

describe('endOf', () => {
  it('recomputes dayOfWeek when year boundary changes the date', () => {
    // Dec 31 2026 is a Thursday (dayOfWeek 4).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = endOf(input, 'year');
    expect(result.month).toBe(12);
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(4);
  });

  it('recomputes dayOfWeek when month boundary changes the date', () => {
    // Aug 31 2026 is a Monday (dayOfWeek 1).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = endOf(input, 'month');
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(1);
  });

  it('handles a leap-year month-end correctly', () => {
    // Feb 29 2024 is a Thursday (dayOfWeek 4).
    const input = { year: 2024, month: 2, day: 10, dayOfWeek: 6 };
    const result = endOf(input, 'month');
    expect(result.day).toBe(29);
    expect(result.dayOfWeek).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Branch-cluster coverage additions (task 3-b1a). Cases above are untouched.
// ---------------------------------------------------------------------------

describe('daysInMonth', () => {
  it('returns the standard month lengths for a non-leap year', () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let month = 1; month <= 12; month++) {
      expect(daysInMonth({ year: 2023, month })).toBe(expected[month - 1]);
    }
  });

  it('returns 29 for February of a leap year', () => {
    expect(daysInMonth({ year: 2024, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29); // 400-year cycle
    expect(daysInMonth({ year: 0, month: 2 })).toBe(29); // proleptic: year 0 is leap
    expect(daysInMonth({ year: -4, month: 2 })).toBe(29); // BCE leap year
  });

  it('returns 28 for February of a non-leap year (centuries included)', () => {
    expect(daysInMonth({ year: 2023, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 1900, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28);
  });

  it('accepts a Temporal.PlainDate directly', () => {
    expect(daysInMonth(Temporal.PlainDate.from('2024-02-10'))).toBe(29);
    expect(daysInMonth(Temporal.PlainDate.from('2023-02-10'))).toBe(28);
  });

  it('throws when year or month is missing', () => {
    expect(() => daysInMonth({})).toThrow(/requires "year"/);
    expect(() => daysInMonth({ year: 2024 })).toThrow(/requires "month"/);
  });
});

describe('daysInYear', () => {
  it('returns 365/366 per the Gregorian leap rule', () => {
    expect(daysInYear({ year: 2023 })).toBe(365);
    expect(daysInYear({ year: 2024 })).toBe(366);
    expect(daysInYear({ year: 1900 })).toBe(365);
    expect(daysInYear({ year: 2000 })).toBe(366); // 400-year cycle
    expect(daysInYear({ year: 2100 })).toBe(365);
  });

  it('applies the same rule to year 0 and BCE years', () => {
    expect(daysInYear({ year: 0 })).toBe(366);
    expect(daysInYear({ year: -1 })).toBe(365);
    expect(daysInYear({ year: -4 })).toBe(366);
    expect(daysInYear({ year: -100 })).toBe(365);
    expect(daysInYear({ year: -400 })).toBe(366);
  });

  it('throws when year is missing', () => {
    expect(() => daysInYear({ month: 5 })).toThrow(/requires "year"/);
  });
});

describe('monthsInYear', () => {
  it('always returns 12 for the Gregorian calendar', () => {
    expect(monthsInYear({ year: 2024, month: 5, day: 1 })).toBe(12);
  });

  it('is documented Gregorian-only: a non-Gregorian view still gets 12', () => {
    // The module doesn't carry calendar-aware logic (see the file-level
    // comment) — e.g. Hebrew leap years have 13 months, which this
    // helper deliberately doesn't model.
    expect(monthsInYear({ year: 5784, month: 6, calendarId: 'hebrew' })).toBe(12);
  });
});

describe('isLeapYear', () => {
  it('follows the 4/100/400 rule including the 400-year cycle', () => {
    expect(isLeapYear({ year: 2024 })).toBe(true);
    expect(isLeapYear({ year: 2023 })).toBe(false);
    expect(isLeapYear({ year: 2000 })).toBe(true);
    expect(isLeapYear({ year: 1900 })).toBe(false);
    expect(isLeapYear({ year: 400 })).toBe(true);
    expect(isLeapYear({ year: 100 })).toBe(false);
  });

  it('handles year 0 and negative (BCE) years', () => {
    expect(isLeapYear({ year: 0 })).toBe(true);
    expect(isLeapYear({ year: -4 })).toBe(true);
    expect(isLeapYear({ year: -100 })).toBe(false);
    expect(isLeapYear({ year: -400 })).toBe(true);
  });

  it('throws when year is missing', () => {
    expect(() => isLeapYear({ month: 5 })).toThrow(/requires "year"/);
  });
});

describe('isLeapMonth', () => {
  it('returns false unconditionally for Gregorian (no leap month exists)', () => {
    expect(isLeapMonth({ year: 2024, month: 2, day: 29 })).toBe(false);
    expect(isLeapMonth({ year: 2023, month: 1, day: 1 })).toBe(false);
  });

  it('is not calendar-aware: a non-Gregorian view also gets false', () => {
    // Documented limitation — Gregorian has no leap month and this
    // module doesn't implement non-Gregorian calendars.
    expect(isLeapMonth({ year: 5784, month: 6, calendarId: 'hebrew' })).toBe(false);
  });
});

describe('dayOfYearHelper', () => {
  it('counts days since Jan 1, with the leap day after February', () => {
    expect(dayOfYearHelper({ year: 2026, month: 1, day: 1 })).toBe(1);
    expect(dayOfYearHelper({ year: 2023, month: 3, day: 1 })).toBe(60);
    expect(dayOfYearHelper({ year: 2024, month: 3, day: 1 })).toBe(61);
    expect(dayOfYearHelper({ year: 2024, month: 12, day: 31 })).toBe(366);
    expect(dayOfYearHelper({ year: 2023, month: 12, day: 31 })).toBe(365);
  });

  it('handles negative years with the same rule', () => {
    // 4 BCE is a leap year in the proleptic Gregorian calendar.
    expect(dayOfYearHelper({ year: -4, month: 3, day: 1 })).toBe(61);
  });

  it('throws when a date field is missing', () => {
    expect(() => dayOfYearHelper({ year: 2024, month: 2 })).toThrow(/requires "day"/);
    expect(() => dayOfYearHelper({ month: 2, day: 1 })).toThrow(/requires "year"/);
  });
});

describe('weekOfYear', () => {
  // These helpers are ISO-8601 only (Mon-Sun weeks, week 1 = the week of
  // the first Thursday); there is no US Sunday-start numbering option.
  it('returns the ISO week number', () => {
    expect(weekOfYear({ year: 2026, month: 8, day: 4, dayOfWeek: 2 })).toBe(32);
    expect(weekOfYear({ year: 2021, month: 1, day: 1, dayOfWeek: 5 })).toBe(53);
    expect(weekOfYear({ year: 2023, month: 1, day: 1, dayOfWeek: 7 })).toBe(52);
    // Late-Dec date whose week's Thursday is in the next year → week 1.
    expect(weekOfYear({ year: 2025, month: 12, day: 29, dayOfWeek: 1 })).toBe(1);
  });

  it('accepts a Temporal.PlainDate directly', () => {
    // 2021-01-01 was a Friday → ISO week 53 of 2020.
    expect(weekOfYear(Temporal.PlainDate.from('2021-01-01'))).toBe(53);
  });

  it('throws when dayOfWeek (or any date field) is missing', () => {
    expect(() => weekOfYear({ year: 2026, month: 8, day: 4 })).toThrow(/requires "dayOfWeek"/);
    expect(() => weekOfYear({ year: 2026, month: 8, dayOfWeek: 2 })).toThrow(/requires "day"/);
  });
});

describe('weekYear', () => {
  it('returns the ISO week-numbering year, which can differ by ±1', () => {
    expect(weekYear({ year: 2026, month: 8, day: 4, dayOfWeek: 2 })).toBe(2026);
    expect(weekYear({ year: 2021, month: 1, day: 1, dayOfWeek: 5 })).toBe(2020);
    expect(weekYear({ year: 2023, month: 1, day: 1, dayOfWeek: 7 })).toBe(2022);
    expect(weekYear({ year: 2025, month: 12, day: 29, dayOfWeek: 1 })).toBe(2026);
  });

  it('accepts a Temporal.PlainDate directly', () => {
    // 2020-12-31 (a Thursday) closes a 53-week ISO year.
    expect(weekYear(Temporal.PlainDate.from('2020-12-31'))).toBe(2020);
  });

  it('throws when a required field is missing', () => {
    expect(() => weekYear({ year: 2021, month: 1, day: 1 })).toThrow(/requires "dayOfWeek"/);
  });
});

describe('getQuarter', () => {
  it('maps months to calendar quarters when no options are given', () => {
    const expected = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
    for (let month = 1; month <= 12; month++) {
      expect(getQuarter({ month })).toBe(expected[month - 1]);
    }
  });

  it('explicit startMonth 1 behaves like the calendar default', () => {
    expect(getQuarter({ month: 2 }, { startMonth: 1 })).toBe(1);
    expect(getQuarter({ month: 11 }, { startMonth: 1 })).toBe(4);
  });

  it('fiscal year starting in July (the common FY convention)', () => {
    // Jul-Sep → Q1, Oct-Dec → Q2, Jan-Mar → Q3, Apr-Jun → Q4.
    const byMonth: Record<number, number> = { 7: 1, 9: 1, 12: 2, 1: 3, 3: 3, 4: 4, 6: 4 };
    for (const [month, quarter] of Object.entries(byMonth)) {
      expect(getQuarter({ month: Number(month) }, { startMonth: 7 })).toBe(quarter);
    }
  });

  it('fiscal year starting in February', () => {
    expect(getQuarter({ month: 1 }, { startMonth: 2 })).toBe(4); // month before start → Q4
    expect(getQuarter({ month: 2 }, { startMonth: 2 })).toBe(1);
    expect(getQuarter({ month: 4 }, { startMonth: 2 })).toBe(1);
    expect(getQuarter({ month: 12 }, { startMonth: 2 })).toBe(4);
  });

  it('fiscal year starting in December (boundary startMonth 12)', () => {
    expect(getQuarter({ month: 12 }, { startMonth: 12 })).toBe(1);
    expect(getQuarter({ month: 1 }, { startMonth: 12 })).toBe(1);
    expect(getQuarter({ month: 3 }, { startMonth: 12 })).toBe(2);
    expect(getQuarter({ month: 11 }, { startMonth: 12 })).toBe(4);
  });

  it('throws on out-of-range or non-integer startMonth', () => {
    for (const bad of [0, 13, -1, 1.5, NaN]) {
      expect(() => getQuarter({ month: 5 }, { startMonth: bad })).toThrow(
        /startMonth must be an integer from 1 to 12/
      );
    }
  });

  it('throws when month is missing', () => {
    expect(() => getQuarter({ year: 2026 })).toThrow(/requires "month"/);
  });
});

describe('getMonth / getWeekday', () => {
  it('getMonth reads the month field', () => {
    expect(getMonth({ year: 2026, month: 8, day: 4 })).toBe(8);
    expect(() => getMonth({ year: 2026 })).toThrow(/requires "month"/);
  });

  it('getWeekday reads the ISO dayOfWeek field (1=Mon..7=Sun)', () => {
    expect(getWeekday({ dayOfWeek: 7 })).toBe(7);
    expect(getWeekday({ year: 2026, month: 8, day: 4, dayOfWeek: 2 })).toBe(2);
    expect(() => getWeekday({ year: 2026 })).toThrow(/requires "dayOfWeek"/);
  });
});

describe('startOf — remaining units', () => {
  const full = {
    year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
    millisecond: 250, dayOfWeek: 2,
  };

  it("'day' zeroes all time fields but keeps the date", () => {
    expect(startOf(full, 'day')).toEqual({
      year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0,
      millisecond: 0, dayOfWeek: 2,
    });
  });

  it("'minute' zeroes only second/millisecond", () => {
    expect(startOf(full, 'minute')).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 0,
      millisecond: 0, dayOfWeek: 2,
    });
  });

  it("'second' zeroes only the millisecond", () => {
    expect(startOf(full, 'second')).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
      millisecond: 0, dayOfWeek: 2,
    });
  });

  it('an unknown unit matches no branch and leaves the view unchanged', () => {
    // No throw exists for invalid units — the if/else-if chain just
    // falls through. 'week' isn't in StartOfUnit; the cast exists only
    // to exercise that final false branch.
    expect(startOf(full, 'week' as StartOfUnit)).toEqual(full);
  });

  it('recomputes dayOfWeek for a first-century date (no 1900s remap)', () => {
    // 0001-01-01 (proleptic Gregorian) was a Monday. The old
    // Date.UTC(year, ...) form remapped years 0-99 to 1900-1999.
    const result = startOf({ year: 1, month: 3, day: 5, dayOfWeek: 1 }, 'year');
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(1);
  });

  it('recomputes dayOfWeek for a negative (BCE) leap-year February', () => {
    // 4 BCE is a leap year; -0004-02-01 was a Thursday (dow 4).
    const result = startOf({ year: -4, month: 2, day: 10, dayOfWeek: 3 }, 'month');
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(4);
  });

  it('works on a Temporal.PlainDate (no time fields on the input)', () => {
    expect(startOf(Temporal.PlainDate.from('2026-08-04'), 'day')).toEqual({
      year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0,
      millisecond: 0, dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it("startOf 'hour' on a PlainDate leaves hour absent (only zeroes finer fields)", () => {
    expect(startOf(Temporal.PlainDate.from('2026-08-04'), 'hour')).toEqual({
      year: 2026, month: 8, day: 4, minute: 0, second: 0, millisecond: 0,
      dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it('skips the dayOfWeek recompute when the input has no dayOfWeek field', () => {
    // A plain bag without dayOfWeek passes asDateFieldView fine; the
    // recompute must bail out instead of inventing a weekday.
    expect(startOf({ year: 2026, month: 8, day: 4 }, 'month')).toEqual({
      year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
    });
  });

  it('throws for non-object input', () => {
    expect(() => startOf(42, 'day')).toThrow(/expected a date-carrying Temporal value/);
    expect(() => startOf(null, 'day')).toThrow(/expected a date-carrying Temporal value/);
  });
});

describe('endOf — remaining units', () => {
  const full = {
    year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
    millisecond: 250, dayOfWeek: 2,
  };

  it("'day' maxes all time fields", () => {
    expect(endOf(full, 'day')).toEqual({
      year: 2026, month: 8, day: 4, hour: 23, minute: 59, second: 59,
      millisecond: 999, dayOfWeek: 2,
    });
  });

  it("'hour' maxes minute/second/millisecond but keeps the hour", () => {
    expect(endOf(full, 'hour')).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 59, second: 59,
      millisecond: 999, dayOfWeek: 2,
    });
  });

  it("'minute' maxes second/millisecond but keeps the minute", () => {
    expect(endOf(full, 'minute')).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 59,
      millisecond: 999, dayOfWeek: 2,
    });
  });

  it("'second' maxes only the millisecond", () => {
    expect(endOf(full, 'second')).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
      millisecond: 999, dayOfWeek: 2,
    });
  });

  it('an unknown unit matches no branch and leaves the view unchanged', () => {
    expect(endOf(full, 'week' as StartOfUnit)).toEqual(full);
  });

  it('handles a negative (BCE) year end: 2 BCE Dec 31 was a Friday', () => {
    const result = endOf({ year: -1, month: 2, day: 10, dayOfWeek: 2 }, 'year');
    expect(result.month).toBe(12);
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(5);
  });

  it('handles a negative leap-year January end: -0004-01-31 was a Wednesday', () => {
    const result = endOf({ year: -4, month: 1, day: 15, dayOfWeek: 5 }, 'month');
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(3);
  });

  it('works on a Temporal.PlainDate (no time fields on the input)', () => {
    // Feb 28 2023 was a Tuesday; non-leap February month-end.
    expect(endOf(Temporal.PlainDate.from('2023-02-10'), 'month')).toEqual({
      year: 2023, month: 2, day: 28, hour: 23, minute: 59, second: 59,
      millisecond: 999, dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it('throws for non-object input', () => {
    expect(() => endOf(undefined, 'day')).toThrow(/expected a date-carrying Temporal value/);
    expect(() => endOf('2026-08-04', 'day')).toThrow(/expected a date-carrying Temporal value/);
  });
});

describe('asDateFieldView', () => {
  it('reads prototype getters off a Temporal.PlainDate (a spread would lose them)', () => {
    expect(asDateFieldView(Temporal.PlainDate.from('2026-08-04'))).toEqual({
      year: 2026, month: 8, day: 4, dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it('keeps the time fields of a PlainDateTime', () => {
    const dt = Temporal.PlainDateTime.from('2026-08-04T15:30:45.25');
    expect(asDateFieldView(dt)).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
      millisecond: 250, dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it('keeps every field of a ZonedDateTime (fixed UTC, no clock dependence)', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:30:45.25+00:00[UTC]');
    expect(asDateFieldView(zdt)).toEqual({
      year: 2026, month: 8, day: 4, hour: 15, minute: 30, second: 45,
      millisecond: 250, dayOfWeek: 2, calendarId: 'iso8601',
    });
  });

  it('copies only the numeric fields of a plain bag (no extras, no defaults)', () => {
    expect(asDateFieldView({ year: 2026, month: 8, day: 4, hour: 15 })).toEqual({
      year: 2026, month: 8, day: 4, hour: 15,
    });
    // A non-string calendarId is dropped rather than copied.
    expect(asDateFieldView({ year: 2026, month: 8, day: 4, calendarId: 42 })).toEqual({
      year: 2026, month: 8, day: 4,
    });
    // A non-number year isn't copied, so the missing-field guard fires.
    expect(() => asDateFieldView({ year: '2026', month: 8, day: 4 })).toThrow(
      /missing year\/month\/day/
    );
  });

  it('throws for PlainTime (time fields but no year/month/day)', () => {
    expect(() => asDateFieldView(Temporal.PlainTime.from('15:30:45.25'))).toThrow(
      /missing year\/month\/day/
    );
  });

  it('throws for PlainMonthDay (day but no year/month)', () => {
    expect(() => asDateFieldView(Temporal.PlainMonthDay.from('08-04'))).toThrow(
      /missing year\/month\/day/
    );
  });

  it('throws for PlainYearMonth (year+month but no day)', () => {
    expect(() => asDateFieldView(Temporal.PlainYearMonth.from('2026-08'))).toThrow(
      /missing year\/month\/day/
    );
  });

  it('throws for a bag with year+day but no month', () => {
    expect(() => asDateFieldView({ year: 2026, day: 4 })).toThrow(/missing year\/month\/day/);
  });

  it('throws for non-object values', () => {
    for (const bad of [42, '2026-08-04', true, undefined, null]) {
      expect(() => asDateFieldView(bad)).toThrow(/expected a date-carrying Temporal value/);
    }
  });
});
