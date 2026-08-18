import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { dayOfYear, isGregorianLeapYear } from './isoWeek.js';

// Reads date fields off a Temporal value in the same minimal-shape style
// as the rest of the library (TemporalLike) — no Temporal factory needed.
// Works for PlainDate, PlainDateTime, and ZonedDateTime (since they all
// expose year/month/day). PlainTime has no date fields; formatDistance()
// between two PlainTime values isn't really meaningful and isn't
// supported — it'll throw below when the field read fails.
interface DateFieldView {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

function readFields(value: unknown, label: string): DateFieldView {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      `temporal-fmt: formatDistance expects Temporal values, got ${label} = ${String(value)}.`
    );
  }
  const obj = value as Record<string, unknown>;
  // Either year/month/day (a real date) or none of them (a PlainTime);
  // anything in between would be a malformed Temporal-like.
  const hasYear = typeof obj.year === 'number';
  const hasMonth = typeof obj.month === 'number';
  const hasDay = typeof obj.day === 'number';
  if (hasYear !== hasMonth || hasMonth !== hasDay) {
    throw new Error(
      `temporal-fmt: formatDistance got a ${label} with a partial date (some of year/month/day missing). ` +
      `Pass a full Temporal.PlainDate / PlainDateTime / ZonedDateTime.`
    );
  }
  return {
    year: hasYear ? (obj.year as number) : undefined,
    month: hasMonth ? (obj.month as number) : undefined,
    day: hasDay ? (obj.day as number) : undefined,
    hour: typeof obj.hour === 'number' ? (obj.hour as number) : undefined,
    minute: typeof obj.minute === 'number' ? (obj.minute as number) : undefined,
    second: typeof obj.second === 'number' ? (obj.second as number) : undefined,
    millisecond: typeof obj.millisecond === 'number' ? (obj.millisecond as number) : undefined,
  };
}

// Reference epoch for ms-since computation. Jan 1, 2000 UTC is the same
// anchor isoWeek.ts uses for day-of-week arithmetic; reusing it keeps the
// reasoning localized to one well-known reference date.
const REFERENCE_YEAR = 2000;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function daysSinceReference(year: number, month: number, day: number): number {
  let days = 0;
  if (year >= REFERENCE_YEAR) {
    for (let y = REFERENCE_YEAR; y < year; y++) {
      days += isGregorianLeapYear(y) ? 366 : 365;
    }
  } else {
    for (let y = year; y < REFERENCE_YEAR; y++) {
      days -= isGregorianLeapYear(y) ? 366 : 365;
    }
  }
  days += dayOfYear(year, month, day) - 1;
  return days;
}

function toEpochMs(fields: DateFieldView): number {
  // A PlainDate has no time fields — treat as midnight. A PlainDateTime
  // has them all. Comparing two PlainDates is a day-resolution diff;
  // comparing two PlainDateTimes is millisecond-resolution. Mixing the
  // two (one PlainDate, one PlainDateTime) is allowed and just means the
  // PlainDate side is treated as midnight, which is what most callers
  // would intuitively expect ("distance from this date to this moment").
  if (fields.year === undefined || fields.month === undefined || fields.day === undefined) {
    throw new Error(
      `temporal-fmt: formatDistance needs a Temporal value with year/month/day fields ` +
      `(PlainDate, PlainDateTime, or ZonedDateTime). A PlainTime or other shape ` +
      `has no anchor date to diff against.`
    );
  }
  const days = daysSinceReference(fields.year, fields.month, fields.day);
  const hour = fields.hour ?? 0;
  const minute = fields.minute ?? 0;
  const second = fields.second ?? 0;
  const millisecond = fields.millisecond ?? 0;
  return days * MS_PER_DAY + hour * MS_PER_HOUR + minute * MS_PER_MINUTE + second * MS_PER_SECOND + millisecond;
}

// Unit selection cutoffs. Mirrors the rough thresholds date-fns uses,
// trimmed to the units Intl.RelativeTimeFormat supports in every engine
// (it accepts 'second' through 'year'; 'quarter' and 'week' support
// varies, so we skip 'week' here — going days → months directly at the
// 30-day boundary is simpler and avoids the engine-support cliff).
//
//   |diff| < 60 s   → seconds  ("30 seconds ago")
//   |diff| < 60 min → minutes  ("12 minutes ago")
//   |diff| < 24 h   → hours    ("3 hours ago")
//   |diff| < 30 d   → days     ("5 days ago")
//   |diff| < 365 d  → months   ("2 months ago")
//   otherwise      → years    ("1 year ago")
//
// 30 days is an approximation of a month — a calendar month is 28-31
// days, so the boundary is inherently fuzzy. Same with 365 days for a
// year. Documented as approximations, not exact calendar arithmetic.
const UNIT_CUTOFFS: Array<{ maxMs: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { maxMs: MS_PER_MINUTE, unit: 'second' },
  { maxMs: MS_PER_HOUR, unit: 'minute' },
  { maxMs: MS_PER_DAY, unit: 'hour' },
  { maxMs: 30 * MS_PER_DAY, unit: 'day' },
  { maxMs: 365 * MS_PER_DAY, unit: 'month' },
];

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
const MAX_RTF_CACHE_SIZE = 100;

function getRtf(locale: string, numeric: 'always' | 'auto'): Intl.RelativeTimeFormat {
  const key = `${canonicalLocaleKey(locale)}|${numeric}`;
  let rtf = rtfCache.get(key);
  if (rtf) return rtf;
  if (rtfCache.size >= MAX_RTF_CACHE_SIZE) {
    const oldestKey = rtfCache.keys().next().value;
    if (oldestKey !== undefined) rtfCache.delete(oldestKey);
  }
  rtf = new Intl.RelativeTimeFormat(locale, { numeric });
  rtfCache.set(key, rtf);
  return rtf;
}

function canonicalLocaleKey(locale: string): string {
  try {
    return new Intl.Locale(locale.replace(/_/g, '-')).toString().toLowerCase();
  } catch {
    return locale;
  }
}

export interface FormatDistanceOptions extends FormatOptions {
  /**
   * 'auto' (default) lets Intl.RelativeTimeFormat use natural forms like
   * "yesterday"/"tomorrow"/"now" when the rounded value lands on ±1 or 0.
   * 'always' forces the strict "1 day ago"/"in 1 day"/"in 0 seconds" form.
   */
  numeric?: 'always' | 'auto';
}

/**
 * Returns a human-readable relative-time string describing `date1`
 * relative to `date2`, e.g. "3 days ago", "in 2 hours", "now". Delegates
 * unit names and pluralization to `Intl.RelativeTimeFormat` so the
 * output localizes the same way the rest of the library's locale-aware
 * tokens do.
 *
 * Convention: the result describes `date1`'s position relative to
 * `date2`. `formatDistance(now, threeDaysAgo)` → `"3 days ago"` (the
 * past date is described relative to now). `formatDistance(now, twoHoursFromNow)`
 * → `"in 2 hours"`. This matches the natural-language reading "describe
 * the first date as if standing at the second one."
 *
 * Unit-selection cutoffs (seconds → minutes → hours → days → months →
 * years) and the rationale for each are documented in the README under
 * "formatDistance".
 *
 * @example
 * formatDistance(threeDaysAgo, today)              // "3 days ago"
 * formatDistance(twoHoursFromNow, today)          // "in 2 hours"
 * formatDistance(today, today)                      // "now"
 * formatDistance(futureDate, today, {locale:'fr-FR'}) // "dans 2 jours"
 */
export function formatDistance(
  date1: unknown,
  date2: unknown,
  options: FormatDistanceOptions = {},
): string {
  const fields1 = readFields(date1, 'date1');
  const fields2 = readFields(date2, 'date2');

  // diff > 0: date1 is later than date2 → "in X units" (date1 is in
  // the future relative to date2). diff < 0: date1 is earlier than
  // date2 → "X units ago". This convention puts date1 in the
  // "described" role and date2 in the "reference" role, matching
  // natural-language reading: `formatDistance(threeDaysAgo, today)`
  // = "describe threeDaysAgo as if standing at today" = "3 days ago".
  const diffMs = toEpochMs(fields1) - toEpochMs(fields2);
  const absMs = Math.abs(diffMs);

  let unit: Intl.RelativeTimeFormatUnit = 'year';
  for (const { maxMs, unit: candidateUnit } of UNIT_CUTOFFS) {
    if (absMs < maxMs) {
      unit = candidateUnit;
      break;
    }
  }

  const divisor = unitToMs(unit);
  const rounded = Math.round(diffMs / divisor);

  const numeric = options.numeric ?? 'auto';
  const locale = options.locale ?? DEFAULT_LOCALE;
  const rtf = getRtf(locale, numeric);
  return rtf.format(rounded, unit);
}

function unitToMs(unit: Intl.RelativeTimeFormatUnit): number {
  switch (unit) {
    case 'second': return MS_PER_SECOND;
    case 'minute': return MS_PER_MINUTE;
    case 'hour': return MS_PER_HOUR;
    case 'day': return MS_PER_DAY;
    case 'week': return 7 * MS_PER_DAY;
    case 'month': return 30 * MS_PER_DAY;
    case 'quarter': return 91 * MS_PER_DAY;
    case 'year': return 365 * MS_PER_DAY;
    default:
      // exhaustive switch with a defensive fallback — Intl's
      // RelativeTimeFormatUnit is a fixed set, but TS's narrowing can't
      // see through the unit array iteration above, so this branch
      // exists for the compiler rather than for runtime.
      throw new Error(`temporal-fmt: formatDistance hit unhandled unit "${String(unit)}".`);
  }
}
