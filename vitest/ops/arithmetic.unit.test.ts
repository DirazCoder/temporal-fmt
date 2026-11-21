import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  add,
  subtract,
  difference,
  addDays,
  addMonths,
  addYears,
  addWeeks,
  addHours,
  addMinutes,
  addSeconds,
  addMilliseconds,
  subtractDays,
  subtractYears,
  subtractMonths,
  subtractWeeks,
  subtractHours,
  subtractMinutes,
  subtractSeconds,
  subtractMilliseconds,
  differenceInYears,
  differenceInMonths,
  differenceInWeeks,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  differenceInMilliseconds,
} from '../../src/ops/arithmetic.js';

setTemporal(Temporal);

describe('addDays / subtractDays', () => {
  it('shifts a PlainDate by whole days', () => {
    const d = Temporal.PlainDate.from('2026-08-04');
    expect(addDays(d, 5)).toMatchObject({ year: 2026, month: 8, day: 9 });
    expect(subtractDays(d, 4)).toMatchObject({ year: 2026, month: 7, day: 31 });
  });
});

describe('addMonths', () => {
  it('clamps to the shorter month rather than overflowing (Jan 31 + 1mo -> Feb 28)', () => {
    const d = Temporal.PlainDate.from('2026-01-31');
    expect(addMonths(d, 1)).toMatchObject({ year: 2026, month: 2, day: 28 });
  });
});

/* ------------------------------------------------------------------
 * Coverage additions: every per-unit wrapper (the addX, subtractX and
 * differenceInX families), all switch cases of add(), end-of-month
 * clamping in both the years and months cases, leap-year Feb 29
 * arithmetic, negative deltas (including the floor-division month
 * borrow across year 0), the pre-year-0 inverse day-count branch, and
 * both day-overflow directions of shiftTime().
 * ------------------------------------------------------------------ */

const tue = Temporal.PlainDate.from('2026-08-04'); // Tuesday, dayOfWeek 2
const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.500');

describe('add / subtract years', () => {
  it('clamps leap-day Feb 29 to Feb 28 when the target year is not a leap year', () => {
    expect(addYears(Temporal.PlainDate.from('2024-02-29'), 1)).toMatchObject({ year: 2025, month: 2, day: 28 });
    expect(subtractYears(Temporal.PlainDate.from('2024-02-29'), 1)).toMatchObject({ year: 2023, month: 2, day: 28 });
  });

  it('shifts the year and recomputes dayOfWeek when no clamping is needed', () => {
    expect(addYears(tue, 1)).toMatchObject({ year: 2027, month: 8, day: 4, dayOfWeek: 3 }); // Wednesday
    expect(subtractYears(tue, 1)).toMatchObject({ year: 2025, month: 8, day: 4, dayOfWeek: 1 }); // Monday
  });

  it('keeps time-of-day fields when shifting a PlainDateTime', () => {
    expect(add(dt, 1, 'years')).toMatchObject({
      year: 2027, month: 8, day: 4, hour: 15, minute: 45, second: 30, millisecond: 500,
    });
  });
});

describe('add / subtract months', () => {
  it('does not clamp when the day exists in the target month', () => {
    expect(addMonths(tue, 1)).toMatchObject({ year: 2026, month: 9, day: 4, dayOfWeek: 5 }); // Friday
    expect(subtractMonths(tue, 13)).toMatchObject({ year: 2025, month: 7, day: 4 });
  });

  it('clamps month-end in the subtract direction too (Mar 31 - 1mo -> Feb 28)', () => {
    expect(subtractMonths(Temporal.PlainDate.from('2026-03-31'), 1)).toMatchObject({ year: 2026, month: 2, day: 28 });
  });

  it('borrows years with floor division for negative totals (year 1 -> year -1)', () => {
    // 13 months before 0001-01-15 is year -1 December 15, not year -2.
    expect(addMonths(Temporal.PlainDate.from('0001-01-15'), -13)).toMatchObject({ year: -1, month: 12, day: 15 });
  });
});

describe('add / subtract weeks', () => {
  it('shifts by seven-day multiples and preserves the weekday', () => {
    expect(addWeeks(tue, 2)).toMatchObject({ year: 2026, month: 8, day: 18, dayOfWeek: 2 });
    expect(subtractWeeks(tue, 1)).toMatchObject({ year: 2026, month: 7, day: 28, dayOfWeek: 2 });
  });
});

describe('add / subtract days (inverse day-count branches)', () => {
  it('round-trips pre-year-0 dates (negative era in civil_from_days)', () => {
    // Year-0 January/February dates exercise the z < 0 branch of the
    // inverse conversion, plus the Jan/Feb month-mapping paths.
    expect(addDays(Temporal.PlainDate.from('0000-01-01'), 1)).toMatchObject({ year: 0, month: 1, day: 2 });
    // Year 0 is a leap year (0 % 400 === 0).
    expect(subtractDays(Temporal.PlainDate.from('0000-03-01'), 1)).toMatchObject({ year: 0, month: 2, day: 29 });
  });

  it('add()/subtract() directly mirror the day wrappers', () => {
    expect(add(tue, 10, 'days')).toMatchObject({ year: 2026, month: 8, day: 14 });
    expect(subtract(tue, 3, 'days')).toMatchObject({ year: 2026, month: 8, day: 1 });
  });
});

describe('add / subtract hours (shiftTime day overflow)', () => {
  it('rolls a +25h shift into the next day', () => {
    expect(addHours(dt, 25)).toMatchObject({
      year: 2026, month: 8, day: 5, hour: 16, minute: 45, second: 30, millisecond: 500,
    });
  });

  it('treats a date-only value as midnight (?? 0 fallbacks, no day overflow)', () => {
    expect(addHours(tue, 5)).toMatchObject({ year: 2026, month: 8, day: 4, hour: 5, minute: 0, second: 0, millisecond: 0 });
  });

  it('normalizes negative within-day totals and negative day overflow', () => {
    expect(addHours(Temporal.PlainDateTime.from('2026-08-04T05:00:00'), -6)).toMatchObject({
      year: 2026, month: 8, day: 3, hour: 23, minute: 0, second: 0, millisecond: 0,
    });
    expect(subtractHours(dt, 20)).toMatchObject({
      year: 2026, month: 8, day: 3, hour: 19, minute: 45, second: 30, millisecond: 500,
    });
  });
});

describe('add / subtract minutes', () => {
  it('rolls across the hour and day boundaries in both directions', () => {
    expect(addMinutes(Temporal.PlainDateTime.from('2026-08-04T23:59:00'), 30)).toMatchObject({
      year: 2026, month: 8, day: 5, hour: 0, minute: 29,
    });
    expect(subtractMinutes(Temporal.PlainDateTime.from('2026-08-04T00:15:00'), 30)).toMatchObject({
      year: 2026, month: 8, day: 3, hour: 23, minute: 45,
    });
  });
});

describe('add / subtract seconds', () => {
  it('rolls across the minute and day boundaries in both directions', () => {
    expect(addSeconds(Temporal.PlainDateTime.from('2026-08-04T00:00:30'), -60)).toMatchObject({
      year: 2026, month: 8, day: 3, hour: 23, minute: 59, second: 30,
    });
    expect(subtractSeconds(Temporal.PlainDateTime.from('2026-08-04T10:00:00'), 1)).toMatchObject({
      hour: 9, minute: 59, second: 59,
    });
  });
});

describe('add / subtract milliseconds', () => {
  it('rolls sub-second precision across the second and day boundaries', () => {
    expect(addMilliseconds(Temporal.PlainDateTime.from('2026-08-04T23:59:59.999'), 1)).toMatchObject({
      year: 2026, month: 8, day: 5, hour: 0, minute: 0, second: 0, millisecond: 0,
    });
    expect(subtractMilliseconds(Temporal.PlainDateTime.from('2026-08-04T00:00:00'), 1)).toMatchObject({
      year: 2026, month: 8, day: 3, hour: 23, minute: 59, second: 59, millisecond: 999,
    });
    // No rollover at all: 500ms + 100ms stays within the same second.
    expect(addMilliseconds(dt, 100)).toMatchObject({
      year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30, millisecond: 600,
    });
  });
});

describe('recomputeDayOfWeek guard', () => {
  it('skips the dayOfWeek rewrite when the input carries no dayOfWeek field', () => {
    // A raw field bag (no dayOfWeek) passes asDateFieldView untouched, so
    // recomputeDayOfWeek() takes its early-return branch.
    const result = addDays({ year: 2026, month: 8, day: 4 }, 1);
    expect(result).toMatchObject({ year: 2026, month: 8, day: 5 });
    expect(result).not.toHaveProperty('dayOfWeek');
  });
});

describe('difference (calendar units)', () => {
  it('counts year and month boundaries, negative direction included', () => {
    expect(differenceInYears(Temporal.PlainDate.from('2024-05-01'), Temporal.PlainDate.from('2026-08-04'))).toBe(2);
    expect(differenceInYears(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2024-05-01'))).toBe(-2);
    expect(differenceInMonths(Temporal.PlainDate.from('2026-01-15'), Temporal.PlainDate.from('2026-08-04'))).toBe(7);
    expect(differenceInMonths(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-01-15'))).toBe(-7);
  });

  it('counts whole weeks (truncated) and exact days', () => {
    expect(differenceInWeeks(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-25'))).toBe(3);
    // 20 days apart truncates to 2 weeks, not 3.
    expect(differenceInWeeks(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-24'))).toBe(2);
    expect(differenceInWeeks(Temporal.PlainDate.from('2026-08-25'), Temporal.PlainDate.from('2026-08-04'))).toBe(-3);
    expect(differenceInDays(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-10'))).toBe(6);
    expect(differenceInDays(Temporal.PlainDate.from('2026-08-10'), Temporal.PlainDate.from('2026-08-04'))).toBe(-6);
    // Crosses February in a non-leap year: Jan 31 -> Mar 1 is 29 days.
    expect(differenceInDays(Temporal.PlainDate.from('2026-01-31'), Temporal.PlainDate.from('2026-03-01'))).toBe(29);
  });

  it('is callable directly for any unit', () => {
    expect(difference(tue, Temporal.PlainDate.from('2026-08-11'), 'weeks')).toBe(1);
    expect(difference(tue, Temporal.PlainDate.from('2026-08-10'), 'days')).toBe(6);
  });
});

describe('difference (sub-day units)', () => {
  it('truncates hours/minutes/seconds toward zero', () => {
    expect(differenceInHours(
      Temporal.PlainDateTime.from('2026-08-04T00:00:00'),
      Temporal.PlainDateTime.from('2026-08-05T06:30:00'),
    )).toBe(30); // 30.5h -> 30
    expect(differenceInHours(
      Temporal.PlainDateTime.from('2026-08-05T06:30:00'),
      Temporal.PlainDateTime.from('2026-08-04T00:00:00'),
    )).toBe(-30);
    expect(differenceInMinutes(
      Temporal.PlainDateTime.from('2026-08-04T00:00:00'),
      Temporal.PlainDateTime.from('2026-08-04T01:30:30'),
    )).toBe(90); // 90.5min -> 90
    expect(differenceInSeconds(
      Temporal.PlainDateTime.from('2026-08-04T00:00:00'),
      Temporal.PlainDateTime.from('2026-08-04T00:00:59.500'),
    )).toBe(59); // 59.5s -> 59
  });

  it('returns exact milliseconds', () => {
    expect(differenceInMilliseconds(
      Temporal.PlainDateTime.from('2026-08-04T00:00:00'),
      Temporal.PlainDateTime.from('2026-08-04T00:00:01.500'),
    )).toBe(1500);
  });

  it('treats date-only values as midnight (?? 0 fallbacks in toTotalMs)', () => {
    expect(differenceInHours(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-05'))).toBe(24);
    expect(differenceInMilliseconds(Temporal.PlainDate.from('2026-08-04'), Temporal.PlainDate.from('2026-08-04'))).toBe(0);
  });

  it('reads wall-clock fields off ZonedDateTime values', () => {
    const kolkata = Temporal.ZonedDateTime.from('2026-08-04T15:45:30+05:30[Asia/Kolkata]');
    expect(differenceInHours(kolkata, Temporal.PlainDateTime.from('2026-08-04T18:45:30'))).toBe(3);
  });
});
