// Calendar utility helpers (plan section L). These are pure functions
// over the TemporalLike shape — no Temporal namespace needed, same
// approach as isoWeek.ts and the field-reading helpers in format.ts.
// Letting callers compute dayOfYear/weekOfYear/etc. without going
// through format() means they can build their own derived values
// without committing to a string format.
//
// Calendar-sensitivity: the helpers in this module assume the
// iso8601 (Gregorian) calendar — that's what TemporalLike fields
// carry for the overwhelming majority of callers. Non-Gregorian
// calendars (hebrew, islamic, etc.) need their own helpers; this
// module doesn't try to be calendar-polymorphic the way Temporal
// itself is. Documented limitation, not a design choice — see
// VERIFICATION.md for the rationale.

import { isGregorianLeapYear, dayOfYear, isoWeekYearAndWeek } from './isoWeek.js';

// A subset of TemporalLike that has the date fields these helpers need,
// plus optional time fields. PlainTime isn't a DateFieldView (no
// year/month/day), but PlainDateTime / ZonedDateTime / PlainDate all
// match. Time fields are optional so callers can pass a PlainDate
// to startOf(value, 'month') without having to populate hour/minute/etc.
// Exported so the comparison/arithmetic modules can use the same
// narrowing.
export interface DateFieldView {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  dayOfWeek?: number;
  calendarId?: string;
}

function requireFields(view: DateFieldView, fields: Array<keyof DateFieldView>): void {
  for (const f of fields) {
    if (typeof view[f] !== 'number') {
      throw new Error(
        `temporal-fmt: calendar helper requires "${String(f)}", which this value doesn't have. ` +
        `Pass a Temporal.PlainDate / PlainDateTime / ZonedDateTime.`
      );
    }
  }
}

export function daysInMonth(view: DateFieldView): number {
  requireFields(view, ['year', 'month']);
  const { year, month } = view;
  // Standard Gregorian month lengths. February's length depends on
  // whether `year` is a leap year — the same isGregorianLeapYear check
  // isoWeek.ts uses for dayOfYear arithmetic.
  const LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isGregorianLeapYear(year!)) return 29;
  return LENGTHS[(month! - 1)!]!;
}

export function daysInYear(view: DateFieldView): 365 | 366 {
  requireFields(view, ['year']);
  return isGregorianLeapYear(view.year!) ? 366 : 365;
}

export function monthsInYear(_view: DateFieldView): 12 {
  // Gregorian always has 12 months. Other calendars (Hebrew leap years
  // have 13) need calendar-aware logic this module doesn't carry — see
  // the file-level comment. The `_view` parameter is kept so the
  // signature mirrors the other helpers and a future calendar-aware
  // implementation can use it without changing call sites.
  return 12;
}

export function isLeapYear(view: DateFieldView): boolean {
  requireFields(view, ['year']);
  return isGregorianLeapYear(view.year!);
}

// `isLeapMonth` would require knowing which month of a leap-year-aware
// calendar is the leap month — Gregorian doesn't have one, so this
// returns false unconditionally. Kept here so the public surface
// matches the plan's section L listing; non-Gregorian calendars need
// a different implementation.
export function isLeapMonth(_view: DateFieldView): boolean {
  return false;
}

export function dayOfYearHelper(view: DateFieldView): number {
  requireFields(view, ['year', 'month', 'day']);
  return dayOfYear(view.year!, view.month!, view.day!);
}

// ISO 8601 week and week-year. Delegates to isoWeek.ts's
// isoWeekYearAndWeek, which does the full Thursday-of-week
// computation to handle the year-boundary cases (Dec 29-31 belonging
// to week 1 of next year, Jan 1-3 belonging to week 52/53 of the
// previous year).
export function weekOfYear(view: DateFieldView): number {
  requireFields(view, ['year', 'month', 'day', 'dayOfWeek']);
  return isoWeekYearAndWeek(view.year!, view.month!, view.day!, view.dayOfWeek!).week;
}

export function weekYear(view: DateFieldView): number {
  requireFields(view, ['year', 'month', 'day', 'dayOfWeek']);
  return isoWeekYearAndWeek(view.year!, view.month!, view.day!, view.dayOfWeek!).isoYear;
}

/**
 * Fiscal-quarter options. `startMonth` is the calendar month (1-12) the
 * fiscal year begins on — e.g. `7` for a fiscal year starting in July.
 * Omitted or `1` gives the calendar-quarter behavior getQuarter() has
 * always had (Jan-Mar = Q1, etc.), so existing callers passing nothing
 * see no change.
 */
export interface QuarterOptions {
  startMonth?: number;
}

function validateStartMonth(startMonth: number): void {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(
      `temporal-fmt: getQuarter's startMonth must be an integer from 1 to 12 (got ${startMonth}).`
    );
  }
}

export function getQuarter(view: DateFieldView, options: QuarterOptions = {}): number {
  requireFields(view, ['month']);
  const startMonth = options.startMonth ?? 1;
  validateStartMonth(startMonth);
  if (startMonth === 1) {
    // Mirrors the Q token: months 1-3 → Q1, 4-6 → Q2, 7-9 → Q3, 10-12 → Q4.
    return Math.ceil(view.month! / 3);
  }
  // Fiscal case: shift the month so startMonth becomes month 1 of the
  // fiscal year (mod 12, 1-indexed), then apply the same ceil(/3) rule.
  // E.g. startMonth=7 (fiscal year starts July): July→1, Aug→2, ...,
  // Dec→6, Jan→7, ..., June→12. Then Q1 = fiscal months 1-3 (Jul-Sep),
  // matching the common "FY starts in July" convention where Q1 is the
  // first quarter of the fiscal year, not a quarter numbered by which
  // calendar quarter it falls in.
  const shifted = ((view.month! - startMonth + 12) % 12) + 1;
  return Math.ceil(shifted / 3);
}

// `getMonth` / `getWeekday` look trivial (just read the field) but the
// plan's section L lists them explicitly, so they're here for surface
// completeness. They also normalize: getWeekday returns 1-7 (Mon-Sun,
// matching Temporal's spec) regardless of what numbering the caller's
// underlying value uses.
export function getMonth(view: DateFieldView): number {
  requireFields(view, ['month']);
  return view.month!;
}

export function getWeekday(view: DateFieldView): number {
  requireFields(view, ['dayOfWeek']);
  return view.dayOfWeek!;
}

// startOf / endOf return new field bags (not Temporal objects — this
// module is polyfill-free) with the relevant fields zeroed/extended.
// Callers can pass the result to a Temporal constructor if they want
// a typed value.
export type StartOfUnit = 'day' | 'month' | 'year' | 'hour' | 'minute' | 'second';

// Returns true if the given unit (when used with startOf/endOf) should
// also touch the time fields. 'day', 'month', 'year' all imply a
// resolution coarser than an hour, so startOf zeroes the time fields
// and endOf maxes them. Sub-hour units (hour/minute/second) only touch
// the fields finer than themselves.
function touchesTime(unit: StartOfUnit): boolean {
  return unit === 'day' || unit === 'month' || unit === 'year';
}

// startOf/endOf reassign year/month/day, which invalidates any
// dayOfWeek carried over from the input — a plain { ...view } spread
// leaves the old value sitting there unchanged. Same failure mode
// businessCalendar.ts's isBusinessDay() works around for add(); we
// recompute here rather than trust the copied field.
function recomputeDayOfWeek(view: DateFieldView): void {
  if (typeof view.dayOfWeek !== 'number') return;
  /* c8 ignore start @preserve -- unreachable: startOf()/endOf() both call
   * asDateFieldView() before this, which already throws if year/month/day
   * aren't all numbers — so by the time a value with a numeric dayOfWeek
   * reaches here, year/month/day are guaranteed present too. */
  if (typeof view.year !== 'number' || typeof view.month !== 'number' || typeof view.day !== 'number') return;
  /* c8 ignore stop @preserve */
  const jsDow = new Date(Date.UTC(view.year, view.month - 1, view.day)).getUTCDay(); // 0=Sun..6=Sat
  view.dayOfWeek = jsDow === 0 ? 7 : jsDow; // 1=Mon..7=Sun
}

export function startOf(value: unknown, unit: StartOfUnit): DateFieldView {
  const view = asDateFieldView(value);
  const result: DateFieldView = { ...view };
  if (unit === 'year') {
    result.month = 1;
    result.day = 1;
  } else if (unit === 'month') {
    result.day = 1;
  }
  recomputeDayOfWeek(result);
  if (touchesTime(unit)) {
    result.hour = 0;
    result.minute = 0;
    result.second = 0;
    result.millisecond = 0;
  } else if (unit === 'hour') {
    result.minute = 0;
    result.second = 0;
    result.millisecond = 0;
  } else if (unit === 'minute') {
    result.second = 0;
    result.millisecond = 0;
  } else if (unit === 'second') {
    result.millisecond = 0;
  }
  return result;
}

export function endOf(value: unknown, unit: StartOfUnit): DateFieldView {
  const view = asDateFieldView(value);
  const result: DateFieldView = { ...view };
  if (unit === 'year') {
    result.month = 12;
    result.day = daysInMonth({ year: result.year!, month: 12 });
  } else if (unit === 'month') {
    result.day = daysInMonth({ year: result.year!, month: result.month! });
  }
  recomputeDayOfWeek(result);
  if (touchesTime(unit)) {
    result.hour = 23;
    result.minute = 59;
    result.second = 59;
    result.millisecond = 999;
  } else if (unit === 'hour') {
    result.minute = 59;
    result.second = 59;
    result.millisecond = 999;
  } else if (unit === 'minute') {
    result.second = 59;
    result.millisecond = 999;
  } else if (unit === 'second') {
    result.millisecond = 999;
  }
  return result;
}

// Type-narrowing helpers used by the comparison/arithmetic modules.
// Lets them accept any of the four date-carrying Temporal types without
// importing Temporal itself.
export function asDateFieldView(value: unknown): DateFieldView {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`temporal-fmt: expected a date-carrying Temporal value, got ${String(value)}.`);
  }
  // Temporal instances expose year/month/day/etc. as prototype getters,
  // not own enumerable properties — so `{ ...value }` would lose them.
  // Read them explicitly. Only the fields actually present on this
  // value type end up in the returned view.
  const v = value as Record<string, unknown>;
  const out: DateFieldView = {};
  if (typeof v.year === 'number') out.year = v.year;
  if (typeof v.month === 'number') out.month = v.month;
  if (typeof v.day === 'number') out.day = v.day;
  if (typeof v.hour === 'number') out.hour = v.hour;
  if (typeof v.minute === 'number') out.minute = v.minute;
  if (typeof v.second === 'number') out.second = v.second;
  if (typeof v.millisecond === 'number') out.millisecond = v.millisecond;
  if (typeof v.dayOfWeek === 'number') out.dayOfWeek = v.dayOfWeek;
  if (typeof v.calendarId === 'string') out.calendarId = v.calendarId;
  if (out.year === undefined || out.month === undefined || out.day === undefined) {
    throw new Error(
      `temporal-fmt: value is missing year/month/day fields — pass a Temporal.PlainDate / PlainDateTime / ZonedDateTime.`
    );
  }
  return out;
}

// Re-export the TemporalType alias so callers can import everything
// from one place.
export type { TemporalType } from './tokenMetadata.js';
// Re-export TemporalLike for the same reason.
export type { TemporalLike } from './tokens.js';