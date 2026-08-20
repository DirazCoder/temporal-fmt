// Date arithmetic helpers (plan section M). Pure functions returning
// field bags, same convention as calendarUtils.ts/comparison.ts — no
// Temporal namespace needed. Callers can pass the result back into a
// Temporal constructor to get a typed value, or chain operations
// without committing to a Temporal implementation.

import { asDateFieldView, daysInMonth, type DateFieldView } from './calendarUtils.js';

export type AddUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';

interface DateTimeFieldView extends DateFieldView {
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

function asDateTime(value: unknown): DateTimeFieldView {
  return asDateFieldView(value) as DateTimeFieldView;
}

// Adds the requested amount to the value's specified unit. Returns a
// new field bag; the input is not mutated. Handles month/year overflow
// by clamping to the last valid day of the target month (Feb 29 + 1
// year on a non-leap year → Feb 28) — Temporal's `constrain` overflow
// mode, which is the closest match to "do the obvious thing" callers
// expect from arithmetic.
export function add(value: unknown, amount: number, unit: AddUnit): DateTimeFieldView {
  const v = asDateTime(value);
  let result: DateTimeFieldView = { ...v };
  switch (unit) {
    case 'years': {
      result.year = (result.year ?? 0) + amount;
      // Clamp day-of-month to the new month's length.
      const maxDay = daysInMonth({ year: result.year!, month: result.month! });
      if (result.day! > maxDay) result.day = maxDay;
      break;
    }
    case 'months': {
      // Total months = year*12 + month + amount, then split back.
      const total = (result.year ?? 0) * 12 + (result.month ?? 1) - 1 + amount;
      result.year = Math.floor(total / 12);
      result.month = (total % 12) + 1;
      if (result.month < 1) { result.month += 12; result.year -= 1; }
      // Negative modulo handling: when total < 0, the mod goes negative.
      // Re-normalize.
      if (result.month > 12) { result.month -= 12; result.year += 1; }
      const maxDay = daysInMonth({ year: result.year!, month: result.month! });
      if (result.day! > maxDay) result.day = maxDay;
      break;
    }
    case 'weeks':
      result = shiftDays(result, amount * 7);
      break;
    case 'days':
      result = shiftDays(result, amount);
      break;
    case 'hours':
      result = shiftTime(result, amount * 3_600_000);
      break;
    case 'minutes':
      result = shiftTime(result, amount * 60_000);
      break;
    case 'seconds':
      result = shiftTime(result, amount * 1_000);
      break;
    case 'milliseconds':
      result = shiftTime(result, amount);
      break;
  }
  return result;
}

function shiftDays(v: DateTimeFieldView, days: number): DateTimeFieldView {
  // Convert Y/M/D to a day count, add, convert back. Using the same
  // algorithm as comparison.ts's sameWeek helper — proleptic Gregorian
  // day count via Howard Hinnant's era-based formula.
  const y = v.year!, m = v.month!, d = v.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const totalDays = era * 146097 + doe - 719468 + days;

  // Invert: totalDays → Y/M/D. Same source (Howard Hinnant's days_from_civil).
  const z = totalDays + 719468;
  const era2 = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe2 = z - era2 * 146097;
  const yoe2 = Math.floor((doe2 - Math.floor(doe2 / 1460) + Math.floor(doe2 / 36524) - Math.floor(doe2 / 146096)) / 365);
  const y2out = yoe2 + era2 * 400;
  const doy2 = doe2 - (365 * yoe2 + Math.floor(yoe2 / 4) - Math.floor(yoe2 / 100));
  const mp = Math.floor((5 * doy2 + 2) / 153);
  const d2 = doy2 - Math.floor((153 * mp + 2) / 5) + 1;
  const m2out = mp < 10 ? mp + 3 : mp - 9;
  const yOut = m2out <= 2 ? y2out + 1 : y2out;

  const result: DateTimeFieldView = { ...v, year: yOut, month: m2out, day: d2 };
  return result;
}

function shiftTime(v: DateTimeFieldView, msDelta: number): DateTimeFieldView {
  // Convert all time fields to ms, add, then split back. Day overflow
  // propagates to shiftDays; sub-second precision is preserved (caller
  // asking for hours/minutes/seconds/milliseconds gets ms-resolution
  // arithmetic, which is the limit of these helpers — nanoseconds
  // aren't supported here, only via Temporal.Duration's own add).
  const MS_PER_DAY = 86_400_000;
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_MINUTE = 60_000;
  const MS_PER_SECOND = 1_000;

  const totalMs = (v.hour ?? 0) * MS_PER_HOUR
    + (v.minute ?? 0) * MS_PER_MINUTE
    + (v.second ?? 0) * MS_PER_SECOND
    + (v.millisecond ?? 0)
    + msDelta;

  // Split into day-overflow + within-day ms.
  const dayOverflow = Math.floor(totalMs / MS_PER_DAY);
  let withinDay = totalMs % MS_PER_DAY;
  if (withinDay < 0) { withinDay += MS_PER_DAY; }

  const hour = Math.floor(withinDay / MS_PER_HOUR);
  const minute = Math.floor((withinDay % MS_PER_HOUR) / MS_PER_MINUTE);
  const second = Math.floor((withinDay % MS_PER_MINUTE) / MS_PER_SECOND);
  const millisecond = withinDay % MS_PER_SECOND;

  const result: DateTimeFieldView = { ...v, hour, minute, second, millisecond };
  if (dayOverflow !== 0) {
    return shiftDays(result, dayOverflow);
  }
  return result;
}

export function subtract(value: unknown, amount: number, unit: AddUnit): DateTimeFieldView {
  return add(value, -amount, unit);
}

// Per-unit convenience wrappers — matches the plan's listing of
// addYears / addMonths / ... / subtractNanoseconds. Nanosecond variants
// aren't provided here because these helpers operate on field bags, and
// the millisecond/microsecond/nanosecond split isn't preserved through
// arithmetic at sub-millisecond precision the way Temporal.Duration's
// own add preserves it. For ns-precision arithmetic, use Temporal.Duration
// directly.
export const addYears = (v: unknown, n: number) => add(v, n, 'years');
export const addMonths = (v: unknown, n: number) => add(v, n, 'months');
export const addWeeks = (v: unknown, n: number) => add(v, n, 'weeks');
export const addDays = (v: unknown, n: number) => add(v, n, 'days');
export const addHours = (v: unknown, n: number) => add(v, n, 'hours');
export const addMinutes = (v: unknown, n: number) => add(v, n, 'minutes');
export const addSeconds = (v: unknown, n: number) => add(v, n, 'seconds');
export const addMilliseconds = (v: unknown, n: number) => add(v, n, 'milliseconds');

export const subtractYears = (v: unknown, n: number) => subtract(v, n, 'years');
export const subtractMonths = (v: unknown, n: number) => subtract(v, n, 'months');
export const subtractWeeks = (v: unknown, n: number) => subtract(v, n, 'weeks');
export const subtractDays = (v: unknown, n: number) => subtract(v, n, 'days');
export const subtractHours = (v: unknown, n: number) => subtract(v, n, 'hours');
export const subtractMinutes = (v: unknown, n: number) => subtract(v, n, 'minutes');
export const subtractSeconds = (v: unknown, n: number) => subtract(v, n, 'seconds');
export const subtractMilliseconds = (v: unknown, n: number) => subtract(v, n, 'milliseconds');

// difference(): returns the count of `unit` boundaries between two values.
// Pure-integer math, no Temporal.Duration involved. For sub-day
// precision the result is an integer count of the requested unit (not
// a Duration field bag) — matches the most common caller expectation
// ("how many days between these two dates?").
export type DiffUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';

export function difference(a: unknown, b: unknown, unit: DiffUnit): number {
  const av = asDateTime(a);
  const bv = asDateTime(b);

  // For day-granular units (years/months/weeks/days), compute via
  // calendar arithmetic on the date fields. For sub-day units, compute
  // via total-ms and divide.
  if (unit === 'years') {
    return bv.year! - av.year!;
  }
  if (unit === 'months') {
    return (bv.year! * 12 + bv.month! - 1) - (av.year! * 12 + av.month! - 1);
  }
  if (unit === 'weeks' || unit === 'days') {
    const aDays = toDayCount(av);
    const bDays = toDayCount(bv);
    const days = bDays - aDays;
    return unit === 'weeks' ? Math.trunc(days / 7) : days;
  }

  // Sub-day units: total-ms math.
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_MINUTE = 60_000;
  const MS_PER_SECOND = 1_000;
  const aMs = toTotalMs(av);
  const bMs = toTotalMs(bv);
  const diffMs = bMs - aMs;
  switch (unit) {
    case 'hours': return Math.trunc(diffMs / MS_PER_HOUR);
    case 'minutes': return Math.trunc(diffMs / MS_PER_MINUTE);
    case 'seconds': return Math.trunc(diffMs / MS_PER_SECOND);
    case 'milliseconds': return diffMs;
  }
}

function toDayCount(v: DateTimeFieldView): number {
  const y = v.year!, m = v.month!, d = v.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function toTotalMs(v: DateTimeFieldView): number {
  const MS_PER_DAY = 86_400_000;
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_MINUTE = 60_000;
  const MS_PER_SECOND = 1_000;
  return toDayCount(v) * MS_PER_DAY
    + (v.hour ?? 0) * MS_PER_HOUR
    + (v.minute ?? 0) * MS_PER_MINUTE
    + (v.second ?? 0) * MS_PER_SECOND
    + (v.millisecond ?? 0);
}

// Per-unit difference wrappers — same convenience pattern as the add*
// wrappers above.
export const differenceInYears = (a: unknown, b: unknown) => difference(a, b, 'years');
export const differenceInMonths = (a: unknown, b: unknown) => difference(a, b, 'months');
export const differenceInWeeks = (a: unknown, b: unknown) => difference(a, b, 'weeks');
export const differenceInDays = (a: unknown, b: unknown) => difference(a, b, 'days');
export const differenceInHours = (a: unknown, b: unknown) => difference(a, b, 'hours');
export const differenceInMinutes = (a: unknown, b: unknown) => difference(a, b, 'minutes');
export const differenceInSeconds = (a: unknown, b: unknown) => difference(a, b, 'seconds');
export const differenceInMilliseconds = (a: unknown, b: unknown) => difference(a, b, 'milliseconds');
