// Business calendar. Customizable weekend definitions, holiday set,
// observed holidays, working hours, optional half days. The holiday
// check is delegated to a holiday calendar (holidays.ts) so this
// module stays focused on weekday-vs-weekend logic.

import { add } from './arithmetic.js';
import type { HolidayCalendar } from './holidays.js';

export interface BusinessCalendarOptions {
  // Default [6, 7] (Sat/Sun). ISO weekdays 1-7.
  weekend?: number[];
  // Holiday calendar to consult. Optional — if absent, only weekend
  // logic applies.
  holidays?: HolidayCalendar;
  // Working hours per weekday. 1=Mon..7=Sun. Default: 8 hours for
  // weekdays, 0 for weekend. Used by addBusinessDays() to compute
  // partial-day arithmetic.
  workingHours?: Record<number, number>;
  // Half days: weekdays where working hours are reduced. Default empty.
  halfDays?: number[];
}

export interface BusinessCalendar {
  weekend: Set<number>;
  holidays?: HolidayCalendar;
  workingHours: Record<number, number>;
  halfDays: Set<number>;
}

export function createBusinessCalendar(options: BusinessCalendarOptions = {}): BusinessCalendar {
  const weekend = new Set(options.weekend ?? [6, 7]);
  const workingHours = options.workingHours ?? {};
  for (let i = 1; i <= 7; i++) {
    if (workingHours[i] === undefined) {
      workingHours[i] = weekend.has(i) ? 0 : 8;
    }
  }
  return {
    weekend,
    holidays: options.holidays,
    workingHours,
    halfDays: new Set(options.halfDays ?? []),
  };
}

export function isBusinessDay(cal: BusinessCalendar, value: unknown): boolean {
  const v = value as { dayOfWeek?: number; year?: number; month?: number; day?: number };
  // add() in arithmetic.ts doesn't update dayOfWeek (it returns a field
  // bag with whatever dayOfWeek the input had). Compute it from year/month/day
  // whenever those are present — more reliable than trusting the cached
  // dayOfWeek value.
  let dow = v.dayOfWeek;
  if (typeof v.year === 'number' && typeof v.month === 'number' && typeof v.day === 'number') {
    const d = new Date(Date.UTC(v.year, v.month - 1, v.day));
    const jsDow = d.getUTCDay(); // 0=Sun..6=Sat
    dow = jsDow === 0 ? 7 : jsDow; // 1=Mon..7=Sun
  }
  if (typeof dow !== 'number') {
    throw new Error('temporal-fmt: isBusinessDay() needs a value with dayOfWeek (or year/month/day to compute it).');
  }
  if (cal.weekend.has(dow)) return false;
  if (cal.holidays && cal.holidays.isHoliday(value)) return false;
  return true;
}

export function nextBusinessDay(cal: BusinessCalendar, value: unknown): unknown {
  let candidate = add(value, 1, 'days');
  // Loop until we find a business day. Capped at 7 iterations since a
  // week is the natural upper bound for a Sat/Sun + holiday combo.
  for (let i = 0; i < 14; i++) {
    if (isBusinessDay(cal, candidate)) return candidate;
    candidate = add(candidate, 1, 'days');
  }
  throw new Error('temporal-fmt: nextBusinessDay() gave up after 14 days — likely a misconfigured calendar (e.g. all days are weekends or holidays).');
}

export function previousBusinessDay(cal: BusinessCalendar, value: unknown): unknown {
  let candidate = add(value, -1, 'days');
  for (let i = 0; i < 14; i++) {
    if (isBusinessDay(cal, candidate)) return candidate;
    candidate = add(candidate, -1, 'days');
  }
  throw new Error('temporal-fmt: previousBusinessDay() gave up after 14 days — likely a misconfigured calendar.');
}

const MAX_BUSINESS_DAY_TRAVERSAL = 100_000;

function assertBusinessDayCount(days: number): void {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError(
      `temporal-fmt: business-day count must be a finite safe integer (got ${days}).`,
    );
  }
}

function compareDateFields(a: unknown, b: unknown): number {
  const av = a as { year: number; month: number; day: number };
  const bv = b as { year: number; month: number; day: number };
  const ay = av.year * 10000 + av.month * 100 + av.day;
  const by = bv.year * 10000 + bv.month * 100 + bv.day;
  return ay - by;
}

export function addBusinessDays(cal: BusinessCalendar, value: unknown, days: number): unknown {
  assertBusinessDayCount(days);
  if (days === 0) return value;
  const sign = days > 0 ? 1 : -1;
  const absDays = Math.abs(days);
  if (absDays > MAX_BUSINESS_DAY_TRAVERSAL) {
    throw new RangeError(
      `temporal-fmt: addBusinessDays() exceeded the ${MAX_BUSINESS_DAY_TRAVERSAL}-day limit.`,
    );
  }
  let candidate = value;
  for (let i = 0; i < absDays; i++) {
    candidate = sign > 0 ? nextBusinessDay(cal, candidate) : previousBusinessDay(cal, candidate);
  }
  return candidate;
}

export function subtractBusinessDays(cal: BusinessCalendar, value: unknown, days: number): unknown {
  assertBusinessDayCount(days);
  return addBusinessDays(cal, value, -days);
}

export function differenceInBusinessDays(cal: BusinessCalendar, a: unknown, b: unknown): number {
  const rawDirection = compareDateFields(b, a);
  if (rawDirection === 0) return 0;

  const direction = rawDirection > 0 ? 1 : -1;
  let candidate = a;
  let count = 0;
  let traversedDays = 0;

  while (compareDateFields(candidate, b) !== 0) {
    candidate = add(candidate, direction, 'days');
    traversedDays++;
    if (traversedDays > MAX_BUSINESS_DAY_TRAVERSAL) {
      throw new RangeError(
        `temporal-fmt: differenceInBusinessDays() exceeded the ${MAX_BUSINESS_DAY_TRAVERSAL}-day traversal limit.`,
      );
    }
    if (isBusinessDay(cal, candidate)) count += direction;
  }

  return count;
}
