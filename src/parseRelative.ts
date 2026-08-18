import { getTemporal } from './temporalProvider.js';
import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';

// parseRelative is a different subsystem from the token-based parse(): the
// input isn't a structurally-typed format string with greedy token matching,
// it's free English text. Treat it as its own module with its own grammar
// rather than bolting a natural-language layer onto the existing tokenizer.
//
// English only for this pass — the matching patterns are hand-written
// regular expressions keyed on English month names and weekday names.
// Documenting as English-only matches how the `do` ordinal token handles
// its scope (English-only suffix rules), and the rest of the library
// leaves locale-awareness to Intl. A future pass could add a localized
// month/weekday table here the same way localeVocab.ts does, but that's
// not what this round is for.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// Both full and short forms ("January" / "Jan") — match the same way the
// date format MMMM/MMM tokens cover both forms. The longer name is
// tried first in the alternation so "January" doesn't match as "Jan" +
// "uary" literal prefix.
const MONTH_ALIASES: Array<[string, number]> = MONTH_NAMES.flatMap((name, i) => [[name, i + 1], [name.slice(0, 3), i + 1]]);
const MONTH_PATTERN = MONTH_ALIASES.map(([name]) => name).join('|');
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_PATTERN = WEEKDAY_NAMES.join('|');

// Reference: ISO dayOfWeek. 1=Mon..7=Sun, matching Temporal's numbering.
function weekdayIndex(name: string): number {
  // case-insensitive lookup — the regex matches case-insensitively, so
  // a lowercase "tuesday" or uppercase "TUESDAY" can both reach here
  // while still resolving to the right ISO day-of-week index.
  const lower = name.toLowerCase();
  const matched = WEEKDAY_NAMES.find((w) => w.toLowerCase() === lower);
  return WEEKDAY_NAMES.indexOf(matched ?? name) + 1;
}
function monthIndex(name: string): number {
  // Match either the full name or the 3-letter abbreviation. The regex
  // above ordered longer-first so "January" wins over "Jan"; here we
  // just check both lists since the regex already returned a single
  // concrete string. Case-insensitive on top of that.
  const lower = name.toLowerCase();
  const fullIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === lower);
  if (fullIdx >= 0) return fullIdx + 1;
  const shortIdx = MONTH_NAMES.findIndex((m) => m.slice(0, 3).toLowerCase() === lower);
  return shortIdx + 1;
}

function extractDayOfWeek(referenceDate: { dayOfWeek?: number }): number {
  const dow = referenceDate.dayOfWeek;
  if (typeof dow !== 'number') {
    throw new Error(
      'temporal-fmt: parseRelative needs a reference date exposing dayOfWeek (a Temporal.PlainDate / PlainDateTime / ZonedDateTime).'
    );
  }
  return dow;
}

interface TemporalFieldBag {
  year?: number;
  month?: number;
  day?: number;
  dayOfWeek?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

function readYear(reference: TemporalFieldBag): number {
  if (typeof reference.year !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing year.');
  }
  return reference.year;
}
function readMonth(reference: TemporalFieldBag): number {
  if (typeof reference.month !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing month.');
  }
  return reference.month;
}
function readDay(reference: TemporalFieldBag): number {
  if (typeof reference.day !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing day.');
  }
  return reference.day;
}

export interface ParseRelativeOptions extends FormatOptions {}

/**
 * Resolve common English relative-date phrases against a reference date,
 * returning a Temporal.PlainDate. Supported phrases (English only):
 *
 * - weekday refs: "next Tuesday", "last Friday", "this Monday"
 * - day offsets: "today", "tomorrow", "yesterday"
 * - unit offsets: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago"
 * - month-day without year: "March 5th" (resolved to next occurrence)
 *
 * For ambiguous "next Tuesday"-on-a-Tuesday — i.e. today is the named
 * weekday — "next Tuesday" means 7 days from now (strictly future), not
 * today. See README "parseRelative" for the documented behavior of each
 * ambiguous case.
 *
 * Returns a Temporal.PlainDate for every supported phrase. (Time-of-day
 * extensions like "next Tuesday at 3pm" aren't supported in this pass —
 * the return type is always PlainDate.)
 *
 * Throws a descriptive error for any phrase it doesn't recognize, rather
 * than guessing.
 */
export function parseRelative(
  input: string,
  referenceDate: unknown,
  options: ParseRelativeOptions = {},
): unknown {
  // locale option is accepted for API consistency with FormatOptions,
  // but parseRelative is English-only this pass — the value is unused.
  void options.locale;
  const reference = referenceDate as TemporalFieldBag;
  const temporal = getTemporal();

  const trimmed = (input ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new Error('temporal-fmt: parseRelative got an empty input string.');
  }
  const lower = trimmed.toLowerCase();

  // "today" / "tomorrow" / "yesterday" — checked first since they're
  // the most common and the most rigidly-shaped.
  if (lower === 'today') {
    return buildPlainDate(temporal, readYear(reference), readMonth(reference), readDay(reference));
  }
  if (lower === 'tomorrow') {
    return addDays(temporal, reference, 1);
  }
  if (lower === 'yesterday') {
    return addDays(temporal, reference, -1);
  }

  // weekday references: "next/last/this Tuesday"
  // Capture the relative word and the weekday name separately, then
  // resolve via the +7 / -7 logic below.
  const weekdayMatch = trimmed.match(
    new RegExp(`^(next|last|this)\\s+(${WEEKDAY_PATTERN})$`, 'i'),
  );
  if (weekdayMatch) {
    const rel = weekdayMatch[1]!.toLowerCase() as 'next' | 'last' | 'this';
    const weekdayName = weekdayMatch[2]!;
    const refDow = extractDayOfWeek(reference);
    const targetDow = weekdayIndex(weekdayName);
    const offset = weekdayOffset(rel, refDow, targetDow);
    return addDays(temporal, reference, offset);
  }

  // unit offsets: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago"
  // Two shapes share this branch — leading "in" (future) or trailing
  // "ago" (past). Both lead with <number> <unit>.
  const unitMatch = trimmed.match(
    /^(in\s+)?(\d+)\s+(day|week|month|year)s?(?:\s+ago)?$/i,
  );
  if (unitMatch) {
    const inPrefix = unitMatch[1];
    const count = unitMatch[2]!;
    const unitName = unitMatch[3]!.toLowerCase() as 'day' | 'week' | 'month' | 'year';
    // Disambiguate future vs past: "in N units" is always future; "N
    // units ago" is always past. The regex also accepts a bare "N
    // units" without either — treat that as a sign error and throw,
    // since neither direction is implied and guessing is exactly what
    // this library refuses to do.
    const hasIn = !!inPrefix;
    const hasAgo = /\bago\b/i.test(trimmed);
    if (!hasIn && !hasAgo) {
      throw new Error(
        `temporal-fmt: parseRelative can't tell whether "${trimmed}" is past or future — ` +
        `use "in ${count} ${unitName}s" or "${count} ${unitName}s ago".`
      );
    }
    const sign = hasIn ? 1 : -1;
    return addUnits(temporal, reference, sign * Number(count), unitName);
  }

  // month-day without year, e.g. "March 5th", "March 5", "March 5, 2026" (year is ignored if present)
  // The ordinal suffix is decorative — strip it. The day-of-month is a
  // 1- or 2-digit number.
  const monthDayMatch = trimmed.match(
    new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?$`, 'i'),
  );
  if (monthDayMatch) {
    const monthName = monthDayMatch[1]!;
    const dayStr = monthDayMatch[2]!;
    const month = monthIndex(monthName);
    const day = Number(dayStr);
    return resolveToNextOccurrence(temporal, reference, month, day);
  }

  throw new Error(
    `temporal-fmt: parseRelative doesn't recognize "${trimmed}". ` +
    `Supported: weekday refs ("next Tuesday"), day offsets ("today"/"tomorrow"/"yesterday"), ` +
    `unit offsets ("in 3 days", "2 weeks ago"), and month-day ("March 5th").`
  );
}

// "next X" — strictly future next occurrence. Said on a Tuesday:
// "next Tuesday" = 7 days from now, not today. Rationale: "this
// Tuesday" handles the same-week case, so "next Tuesday" staying
// strictly-future gives the two phrases distinct, non-overlapping
// meanings. Documented in README "parseRelative".
//
// "last X" — strictly past most recent occurrence. Symmetric to "next".
//
// "this X" — the X of the current ISO week (Mon..Sun). Can land on
// today, past, or future depending on where in the week today falls.
function weekdayOffset(rel: 'next' | 'last' | 'this', refDow: number, targetDow: number): number {
  // refDow and targetDow are both 1..7 (ISO Mon=1..Sun=7).
  if (rel === 'next') {
    let diff = targetDow - refDow;
    if (diff <= 0) diff += 7; // 0 (today) → 7, negative → wrap forward
    return diff; // 1..7
  }
  if (rel === 'last') {
    let diff = targetDow - refDow;
    if (diff >= 0) diff -= 7; // 0 (today) → -7, positive → wrap backward
    return diff; // -7..-1
  }
  // rel === 'this' — X of the current week. Can be today, past, or future.
  return targetDow - refDow; // -6..+6
}

function buildPlainDate(temporal: { PlainDate: { from: (fields: Record<string, number>, options?: { overflow?: 'constrain' | 'reject' }) => unknown } }, year: number, month: number, day: number): unknown {
  return temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
}

function addDays(
  temporal: { PlainDate: { from: (fields: Record<string, number>) => unknown } },
  reference: TemporalFieldBag,
  days: number,
): unknown {
  // Build the reference as a real PlainDate so we can use Temporal's
  // own add() for date arithmetic — calendar-correct (handles month
  // boundaries, leap years, etc.) so we don't have to reimplement it.
  const refDate = temporal.PlainDate.from({
    year: readYear(reference),
    month: readMonth(reference),
    day: readDay(reference),
  }) as { add: (duration: Record<string, number>) => unknown };
  return refDate.add({ days });
}

function addUnits(
  temporal: { PlainDate: { from: (fields: Record<string, number>) => unknown } },
  reference: TemporalFieldBag,
  count: number,
  unit: 'day' | 'week' | 'month' | 'year',
): unknown {
  const refDate = temporal.PlainDate.from({
    year: readYear(reference),
    month: readMonth(reference),
    day: readDay(reference),
  }) as { add: (duration: Record<string, number>) => unknown };
  const duration: Record<string, number> = {};
  if (unit === 'day') duration.days = count;
  if (unit === 'week') duration.weeks = count;
  if (unit === 'month') duration.months = count;
  if (unit === 'year') duration.years = count;
  return refDate.add(duration);
}

// "March 5th" without a year → resolve to the next occurrence of that
// month/day. If today is that date, return today. Otherwise, if it's
// already past this year, return next year's occurrence.
//
// "Next occurrence" semantics: future-leaning. Documented in README
// as the chosen behavior. The alternative ("nearest in time, past or
// future") would mean "March 5th" said on March 6 returns yesterday —
// counterintuitive for the typical "next birthday"/"next deadline"
// use case this kind of phrase tends to drive.
function resolveToNextOccurrence(
  temporal: {
    PlainDate: {
      from: (fields: Record<string, number>, options?: { overflow?: 'constrain' | 'reject' }) => unknown;
      compare?: (one: unknown, two: unknown) => number;
    };
  },
  reference: TemporalFieldBag,
  month: number,
  day: number,
): unknown {
  const refYear = readYear(reference);
  const refDate = temporal.PlainDate.from({
    year: refYear,
    month: readMonth(reference),
    day: readDay(reference),
  });
  // try this year first; if Feb 29 in a non-leap year, Temporal will
  // throw via overflow: 'reject' — fall through to next year.
  try {
    const thisYear = temporal.PlainDate.from({ year: refYear, month, day }, { overflow: 'reject' });
    // PlainDate.compare is a static method on the namespace, not an
    // instance method — that's why it's called off temporal.PlainDate
    // here rather than off thisYear. Returns -1 / 0 / 1.
    if (!temporal.PlainDate.compare) {
      throw new Error('temporal-fmt: parseRelative needs Temporal.PlainDate.compare to resolve month-day phrases; the active implementation does not expose it.');
    }
    if (temporal.PlainDate.compare(thisYear, refDate) >= 0) {
      // today or in the future → use this year's occurrence
      return thisYear;
    }
    // already past this year → next year's occurrence
    return temporal.PlainDate.from({ year: refYear + 1, month, day }, { overflow: 'reject' });
  } catch (err) {
    // Feb 29 in a non-leap year, or similar. Try next year — if the
    // caller asked for "Feb 29" said in a non-leap year, next year may
    // also not be leap, in which case the inner from() will throw and
    // surface a clear error rather than silently landing on Feb 28.
    try {
      return temporal.PlainDate.from({ year: refYear + 1, month, day }, { overflow: 'reject' });
    } catch {
      throw new Error(
        `temporal-fmt: parseRelative can't resolve month ${month} day ${day} — ` +
        `it isn't a valid date in either ${refYear} or ${refYear + 1}. ` +
        `Original error: ${(err as Error).message}`
      );
    }
  }
}
