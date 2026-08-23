// Comparison helpers. Pure functions over the field
// shape, no Temporal namespace needed — same convention as
// calendarUtils.ts. All comparisons are field-based, not identity-based,
// so a polyfill PlainDate compares equal to a native PlainDate with the
// same year/month/day.

import { asDateFieldView, type DateFieldView } from './calendarUtils.js';

interface DateTimeFieldView extends DateFieldView {
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

function toComparableMs(view: DateTimeFieldView): number {
  // Exact proleptic-Gregorian day count (Howard Hinnant's days_from_civil,
  // same algorithm arithmetic.ts/interval.ts use) plus the time-of-day —
  // NOT an approximation. The previous implementation multiplied the
  // year offset by an average 365.2425 days/year, on the theory that the
  // error "is constant for any given year, so it cancels out in a diff".
  // That's only true when both dates fall in the same year: the year
  // term's error differs by up to ~0.76 days between adjacent years
  // (365.2425 vs 365/366 actual), which corrupts cross-year comparisons
  // near the boundary — e.g. isAfter(2025-01-01T00:00, 2024-12-31T18:12)
  // returned false (truth: ~5.8h after), and isEqual() returned true for
  // instants ~18h apart (2025-01-01T00:00 vs 2024-12-31T05:49:12).
  // Exact arithmetic has no such error term.
  const y = view.year!, m = view.month!, d = view.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;

  const MS_PER_HOUR = 3_600_000;
  const MS_PER_MINUTE = 60_000;
  const MS_PER_SECOND = 1_000;

  return days * 86_400_000
    + (view.hour ?? 0) * MS_PER_HOUR
    + (view.minute ?? 0) * MS_PER_MINUTE
    + (view.second ?? 0) * MS_PER_SECOND
    + (view.millisecond ?? 0);
}

function asDateTimeFieldView(value: unknown): DateTimeFieldView {
  const v = asDateFieldView(value);
  return v as DateTimeFieldView;
}

// Returns < 0 if a < b, 0 if a === b, > 0 if a > b. Same convention as
// Array.prototype.sort and Temporal.PlainDate.compare. Lets callers
// pass this directly as a comparator.
export function compare(a: unknown, b: unknown): number {
  const av = asDateTimeFieldView(a);
  const bv = asDateTimeFieldView(b);
  const am = toComparableMs(av);
  const bm = toComparableMs(bv);
  if (am < bm) return -1;
  if (am > bm) return 1;
  return 0;
}

export function isEqual(a: unknown, b: unknown): boolean {
  return compare(a, b) === 0;
}

export function isBefore(a: unknown, b: unknown): boolean {
  return compare(a, b) < 0;
}

export function isAfter(a: unknown, b: unknown): boolean {
  return compare(a, b) > 0;
}

export function min(values: unknown[]): unknown {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('temporal-fmt: min() requires a non-empty array of values.');
  }
  let best = values[0];
  for (let i = 1; i < values.length; i++) {
    if (compare(values[i], best) < 0) best = values[i];
  }
  return best;
}

export function max(values: unknown[]): unknown {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('temporal-fmt: max() requires a non-empty array of values.');
  }
  let best = values[0];
  for (let i = 1; i < values.length; i++) {
    if (compare(values[i], best) > 0) best = values[i];
  }
  return best;
}

export function clamp(value: unknown, lo: unknown, hi: unknown): unknown {
  if (compare(value, lo) < 0) return lo;
  if (compare(value, hi) > 0) return hi;
  return value;
}

export function isBetween(value: unknown, lo: unknown, hi: unknown): boolean {
  return compare(value, lo) >= 0 && compare(value, hi) <= 0;
}

// Semantic helpers — same-day/week/month/quarter/year tests. Useful for
// UI ("is this event today?") and for grouping/aggregation. All take a
// reference value to compare against; the "isToday" / "isTomorrow" /
// "isYesterday" variants compute the reference from the current system
// date themselves so callers don't have to.
function readYearMonthDay(value: unknown): { year: number; month: number; day: number } {
  const v = asDateFieldView(value);
  return { year: v.year!, month: v.month!, day: v.day! };
}

function todayYearMonthDay(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function dateEqualYearMonthDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isSameDay(value: unknown, reference: unknown): boolean {
  return dateEqualYearMonthDay(readYearMonthDay(value), readYearMonthDay(reference));
}

export function isToday(value: unknown): boolean {
  return dateEqualYearMonthDay(readYearMonthDay(value), todayYearMonthDay());
}

function tomorrowYearMonthDay(): { year: number; month: number; day: number } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function yesterdayYearMonthDay(): { year: number; month: number; day: number } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function isTomorrow(value: unknown): boolean {
  return dateEqualYearMonthDay(readYearMonthDay(value), tomorrowYearMonthDay());
}

export function isYesterday(value: unknown): boolean {
  return dateEqualYearMonthDay(readYearMonthDay(value), yesterdayYearMonthDay());
}

function sameWeek(yearA: number, monthA: number, dayA: number, yearB: number, monthB: number, dayB: number): boolean {
  // Same week iff the dates are within 7 days of each other AND the earlier
  // one's weekday is ≤ the later one's weekday (so we don't say "Sun and
  // the following Mon are in the same week" — ISO weeks run Mon-Sun).
  // Easier: compute ISO week numbers via isoWeekYearAndWeek, compare both
  // year and week. That handles the year-boundary case (Dec 31 vs Jan 1 of
  // the next year, which can be in the same ISO week).
  // Local import to avoid module-cycle: isoWeek.ts doesn't import from here.
  // Lazy require-style dynamic via inline static import at top would be
  // cleaner; this inline computation is fine for a pure helper.
  // ...actually let's just compute weekday offsets directly. Same-ISO-week
  // iff |d1 - d2| < 7 days AND the earlier date's ISO weekday ≤ the later
  // date's ISO weekday so they fall in the same Mon-Sun span.
  const DAYS_PER_400_YEARS = 146097;
  const daysSince = (y: number, m: number, d: number): number => {
    // Zeller's congruence variant — convert Y/M/D to a day count.
    // Using a simple algorithm here that's correct for proleptic Gregorian.
    const y2 = m <= 2 ? y - 1 : y;
    const era = (y2 >= 0 ? y2 : y2 - 399) / 400 | 0;
    const yoe = y2 - era * 400;
    const m2 = m > 2 ? m - 3 : m + 9;
    const doy = Math.floor((Math.floor(153 * m2 + 2) / 5) + d - 1);
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * DAYS_PER_400_YEARS + doe - 719468;
  };
  const a = daysSince(yearA, monthA, dayA);
  const b = daysSince(yearB, monthB, dayB);
  if (Math.abs(a - b) >= 7) return false;
  // Same week iff both dates round to the same Monday. Compute the
  // Monday-of-week for each: subtract (weekday - 1) days, where weekday
  // is 1=Mon..7=Sun. Use the standard Zeller formula for weekday.
  const weekdayOf = (y: number, m: number, d: number): number => {
    const days = daysSince(y, m, d);
    // 1970-01-01 was a Thursday (ISO 4). So weekday = ((days + 3) mod 7) + 1
    // mapped to Mon=1..Sun=7. Let's compute: Sun=0..Sat=6 via JS Date.
    const date = new Date(Date.UTC(y, m - 1, d));
    const jsDow = date.getUTCDay(); // 0=Sun..6=Sat
    return jsDow === 0 ? 7 : jsDow;
  };
  const wa = a - (weekdayOf(yearA, monthA, dayA) - 1);
  const wb = b - (weekdayOf(yearB, monthB, dayB) - 1);
  return wa === wb;
}

export function isSameWeek(value: unknown, reference: unknown): boolean {
  const a = readYearMonthDay(value);
  const b = readYearMonthDay(reference);
  return sameWeek(a.year, a.month, a.day, b.year, b.month, b.day);
}

export function isSameMonth(value: unknown, reference: unknown): boolean {
  const a = readYearMonthDay(value);
  const b = readYearMonthDay(reference);
  return a.year === b.year && a.month === b.month;
}

export function isSameQuarter(value: unknown, reference: unknown): boolean {
  const a = readYearMonthDay(value);
  const b = readYearMonthDay(reference);
  return a.year === b.year && Math.ceil(a.month / 3) === Math.ceil(b.month / 3);
}

export function isSameYear(value: unknown, reference: unknown): boolean {
  return readYearMonthDay(value).year === readYearMonthDay(reference).year;
}

// isWeekend / isWeekday depend on dayOfWeek — present on PlainDate,
// PlainDateTime, ZonedDateTime, but NOT on PlainTime. Callers passing
// PlainTime get a descriptive throw. Doesn't call asDateFieldView
// because that would reject PlainTime (no year/month/day) before
// reaching the dayOfWeek check — and the error we want here is the
// "no dayOfWeek field" one, not the "no date fields" one.
export function isWeekend(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`temporal-fmt: isWeekend() expected a Temporal value, got ${String(value)}.`);
  }
  const v = value as { dayOfWeek?: unknown };
  if (typeof v.dayOfWeek !== 'number') {
    throw new Error(
      `temporal-fmt: isWeekend() needs a value with a dayOfWeek field (PlainDate / PlainDateTime / ZonedDateTime).`
    );
  }
  // 6=Sat, 7=Sun in Temporal's Mon=1..Sun=7 numbering.
  return v.dayOfWeek === 6 || v.dayOfWeek === 7;
}

export function isWeekday(value: unknown): boolean {
  return !isWeekend(value);
}
