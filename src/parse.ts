import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { buildCapturingPattern, type CapturingPattern } from './parsePattern.js';
import { getLocaleVocab } from './localeVocab.js';
import { getTemporal } from './temporalGlobal.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

// format strings are short hand-written literals reused across many calls —
// cache the compiled capturing pattern per (formatStr, locale) pair instead
// of rebuilding it every call.
const patternCache = new Map<string, CapturingPattern>();
const MAX_CACHE_SIZE = 500;

function getPattern(formatStr: string, locale: string): CapturingPattern {
  const key = locale + ' ' + formatStr;
  let pattern = patternCache.get(key);
  if (pattern) {
    return pattern;
  }
  if (patternCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = patternCache.keys().next().value;
    if (oldestKey !== undefined) patternCache.delete(oldestKey);
  }
  pattern = buildCapturingPattern(tokenize(formatStr), locale);
  patternCache.set(key, pattern);
  return pattern;
}

// Intl.DateTimeFormat(locale).resolvedOptions().calendar reports the
// locale's default calendar so passing locale with a `-u-ca-` extension in the tag
// allows setting non-gregorian calendars. 'gregory' is treated as "no calendar" so
// the default locale ('en-US') keeps constructing plain ISO 8601
const calendarCache = new Map<string, string | undefined>();
const MAX_CALENDAR_CACHE_SIZE = 500;

function resolveCalendar(locale: string): string | undefined {
  if (calendarCache.has(locale)) {
    return calendarCache.get(locale);
  }
  if (calendarCache.size >= MAX_CALENDAR_CACHE_SIZE) {
    const oldestKey = calendarCache.keys().next().value;
    if (oldestKey !== undefined) calendarCache.delete(oldestKey);
  }
  const resolved = new Intl.DateTimeFormat(locale).resolvedOptions().calendar;
  const calendar = resolved === 'gregory' ? undefined : resolved;
  calendarCache.set(locale, calendar);
  return calendar;
}

interface Fields {
  year?: number;
  twoDigitYear?: number;
  month?: number;
  day?: number;
  hour?: number;
  hour12?: number;
  isPM?: boolean;
  minute?: number;
  second?: number;
  millisecond?: number;
  timeZoneId?: string;
  weekdayExpected?: number; // ISO dayOfWeek, 1=Mon, 7=Sun
  weekdayRaw?: string;
}

function applyGroup(fields: Fields, token: string, raw: string, locale: string): void {
  switch (token) {
    case 'yyyy': fields.year = parseInt(raw, 10); break;
    case 'yy': fields.twoDigitYear = parseInt(raw, 10); break;
    case 'MM': case 'M': fields.month = parseInt(raw, 10); break;
    case 'MMMM': fields.month = getLocaleVocab(locale).monthLong.indexOf(raw) + 1; break;
    case 'MMM': fields.month = getLocaleVocab(locale).monthShort.indexOf(raw) + 1; break;
    case 'dd': case 'd': fields.day = parseInt(raw, 10); break;
    case 'EEEE':
      fields.weekdayRaw = raw;
      fields.weekdayExpected = getLocaleVocab(locale).weekdayLong.indexOf(raw) + 1;
      break;
    case 'EEE':
      fields.weekdayRaw = raw;
      fields.weekdayExpected = getLocaleVocab(locale).weekdayShort.indexOf(raw) + 1;
      break;
    case 'HH': case 'H': fields.hour = parseInt(raw, 10); break;
    case 'hh': case 'h': fields.hour12 = parseInt(raw, 10); break;
    case 'mm': case 'm': fields.minute = parseInt(raw, 10); break;
    case 'ss': case 's': fields.second = parseInt(raw, 10); break;
    case 'SSS': fields.millisecond = parseInt(raw, 10); break;
    case 'a': fields.isPM = raw === getLocaleVocab(locale).dayPeriod[1]; break;
    case 'zzz': fields.timeZoneId = raw; break;
  }
}

// emulates strptime (POSIX) for 2-digit years so the result doesn't depend
// on the current clock: 00-68 -> 2000-2068, 69-99 -> 1900-1999
// https://www.man7.org/linux//man-pages/man3/strptime.3p.html
function resolveYear(fields: Fields): number | undefined {
  if (fields.year !== undefined) return fields.year;
  if (fields.twoDigitYear !== undefined) {
    return fields.twoDigitYear <= 68 ? 2000 + fields.twoDigitYear : 1900 + fields.twoDigitYear;
  }
  return undefined;
}

function resolveHour(fields: Fields, formatStr: string): number | undefined {
  if (fields.hour !== undefined && fields.hour12 !== undefined) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" mixes a 24-hour token ("HH"/"H") with a ` +
      `12-hour token ("hh"/"h"). Pick one or the other — parse() won't guess which is authoritative.`
    );
  }
  if (fields.hour !== undefined) return fields.hour;
  if (fields.hour12 !== undefined) {
    if (fields.isPM === undefined) {
      throw new Error(
        `temporal-fmt: format string "${formatStr}" uses a 12-hour token ("hh"/"h") without an "a" token, ` +
        `so parse() can't tell AM from PM.`
      );
    }
    return (fields.hour12 % 12) + (fields.isPM ? 12 : 0);
  }
  return undefined;
}

/**
 * Parses `input` against `formatStr` and builds the real Temporal value it
 * describes: a `Temporal.PlainDate`, `PlainTime`, `PlainDateTime`, or
 * `ZonedDateTime` depending on which tokens are present.
 *
 * Returns `unknown` — this package has no ambient `Temporal` types to return
 * a real one against.
 *
 * `options.locale` picks the calendar the result is built in. Pass a locale
 * tag with a `-u-ca-` extension (e.g. `'en-u-ca-hebrew'`) to parse into a
 * non-Gregorian calendar.
 *
 * @throws if `input` doesn't match `formatStr`'s shape at all
 * @throws if it matches the shape but describes an impossible date (e.g. Feb
 * 30) or self-contradictory data (e.g. a weekday name that doesn't match the
 * actual date)
 *
 * @example
 * parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45') // Temporal.PlainDateTime
 * parse('yyyy-MM', '2026-08-04T15:45:30') // throws — shape doesn't match
 * parse('yyyy-MM-dd', '2026-02-30') // throws — not a real date
 */
export function parse(formatStr: string, input: string, options: FormatOptions = {}): unknown | undefined {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  const calendar = resolveCalendar(locale);
  const pattern = getPattern(formatStr, locale);
  const match = pattern.regex.exec(input);
  if (!match) {
    throw new Error(`temporal-fmt: no valid pattern matches the format string and input shape`);
  }

  if (pattern.groups.length === 0) {
    throw new Error(`temporal-fmt: format string "${formatStr}" has no tokens — nothing to parse into a value.`);
  }

  const fields: Fields = {};
  for (const { name, token } of pattern.groups) {
    applyGroup(fields, token, match.groups![name]!, locale);
  }

  const year = resolveYear(fields);
  const hour = resolveHour(fields, formatStr);
  const { month, day, minute, second, millisecond, timeZoneId, weekdayExpected, weekdayRaw } = fields;

  const hasAnyDatePart = year !== undefined || month !== undefined || day !== undefined;
  const hasFullDate = year !== undefined && month !== undefined && day !== undefined;
  if (hasAnyDatePart && !hasFullDate) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" has an incomplete date — ` +
      `year, month, and day tokens must all be present together.`
    );
  }

  const hasTime = hour !== undefined || minute !== undefined || second !== undefined || millisecond !== undefined;

  if (timeZoneId !== undefined && !(hasFullDate && hasTime)) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" has a "zzz" token but needs a full date and time ` +
      `to build a ZonedDateTime.`
    );
  }

  if (weekdayExpected !== undefined && !hasFullDate) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" has a weekday token ("EEEE"/"EEE") but needs ` +
      `a full date to validate it against.`
    );
  }

  if (!hasFullDate && !hasTime) {
    // shouldn't happen — every token maps to a date, time, zone, or
    // weekday field, and weekday-without-date already threw above
    throw new Error(`temporal-fmt: format string "${formatStr}" has no date or time tokens to parse.`);
  }

  const temporal = getTemporal();
  const timeFields = { hour: hour ?? 0, minute: minute ?? 0, second: second ?? 0, millisecond: millisecond ?? 0 };
  // omitted entirely for the default calendar (see resolveCalendar) so
  // construction stays plain ISO 8601 unless a caller's locale asks for
  // something else — Temporal calendars don't apply to time-only values.
  const calendarField = calendar ? { calendar } : {};

  // overflow: 'reject' — without it Temporal *clamps* out-of-range fields
  // (Feb 30 silently becomes Feb 28) instead of throwing, which would
  // contradict the "throws on genuinely invalid data" behavior parse() promises.
  const reject = { overflow: 'reject' as const };

  let result: unknown;
  try {
    if (timeZoneId !== undefined) {
      result = temporal.ZonedDateTime.from({ year: year!, month: month!, day: day!, ...timeFields, ...calendarField, timeZone: timeZoneId }, reject);
    } else if (hasFullDate && hasTime) {
      result = temporal.PlainDateTime.from({ year: year!, month: month!, day: day!, ...timeFields, ...calendarField }, reject);
    } else if (hasFullDate) {
      result = temporal.PlainDate.from({ year: year!, month: month!, day: day!, ...calendarField }, reject);
    } else {
      result = temporal.PlainTime.from(timeFields, reject);
    }
  } catch (err) {
    throw new Error(
      `temporal-fmt: "${input}" doesn't describe a valid date/time for format "${formatStr}": ` +
      `${(err as Error).message}`
    );
  }

  if (weekdayExpected !== undefined) {
    const actual = (result as { dayOfWeek: number }).dayOfWeek;
    if (actual !== weekdayExpected) {
      const vocab = getLocaleVocab(locale);
      throw new Error(
        `temporal-fmt: "${weekdayRaw}" doesn't match the actual weekday (${vocab.weekdayLong[actual - 1]}) ` +
        `for the parsed date.`
      );
    }
  }

  return result;
}
