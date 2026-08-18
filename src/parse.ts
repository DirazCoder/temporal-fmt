import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { buildCapturingPattern, type CapturingPattern } from './parsePattern.js';
import { enumerateValidSplits, isValidTimeZone } from './pattern.js';
import { getLocaleVocab, canonicalCacheKey } from './localeVocab.js';
import { getTemporal } from './temporalProvider.js';
import { MAX_FORMAT_LENGTH, MAX_INPUT_LENGTH } from './constants.js';

// format strings are short hand-written literals reused across many calls —
// cache the compiled capturing pattern per (formatStr, locale) pair instead
// of rebuilding it every call.
const patternCache = new Map<string, CapturingPattern>();
const MAX_CACHE_SIZE = 500;

function getPattern(formatStr: string, locale: string): CapturingPattern {
  const key = JSON.stringify([canonicalCacheKey(locale), formatStr]);
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

// Requires an explicit `-u-ca-` extension (e.g. 'en-u-ca-hebrew') to apply
// a non-Gregorian calendar, per parse()'s own docstring. 'gregory' counts
// as "no calendar" so the default locale keeps constructing plain ISO 8601.
//
// Used to key off resolvedOptions().calendar instead — a locale's
// *default* calendar, whether the caller asked for one or not. That broke
// th-TH silently: its default is 'buddhist', so plain Gregorian-looking
// digits parsed 543 years off, while format() has no matching calendar
// step and just prints the object's own ISO fields either way.
const calendarCache = new Map<string, string | undefined>();
const MAX_CALENDAR_CACHE_SIZE = 500;

function resolveCalendar(locale: string): string | undefined {
  // computed up front (not just at cache-miss time) so the cache key is
  // the canonical form too — otherwise 'en-US' and 'en-us' would each get
  // their own entry for what's really the same locale (see
  // canonicalCacheKey's comment in localeVocab.ts for why that matters).
  // Left un-lowercased/un-canonicalized calls into new Intl.Locale() below
  // would still throw on a genuinely malformed tag either way; doing it
  // here just means that throw happens before touching the cache instead
  // of after, which is the more natural place for it.
  const canonicalLocale = new Intl.Locale(locale).toString().toLowerCase();
  if (calendarCache.has(canonicalLocale)) {
    return calendarCache.get(canonicalLocale);
  }
  if (calendarCache.size >= MAX_CALENDAR_CACHE_SIZE) {
    const oldestKey = calendarCache.keys().next().value;
    if (oldestKey !== undefined) calendarCache.delete(oldestKey);
  }
  let calendar: string | undefined;
  const parts = canonicalLocale.split('-');
  const extensionIndex = parts.indexOf('u');
  const calendarKeyIndex = extensionIndex === -1 ? -1 : parts.indexOf('ca', extensionIndex + 1);
  if (calendarKeyIndex !== -1 && calendarKeyIndex + 1 < parts.length) {
    const resolved = new Intl.DateTimeFormat(canonicalLocale).resolvedOptions().calendar;
    calendar = resolved === 'gregory' ? undefined : resolved;
  }
  calendarCache.set(canonicalLocale, calendar);
  return calendar;
}

interface Fields {
  year?: number;
  twoDigitYear?: number;
  month?: number;
  day?: number;
  hour?: number;
  hour12?: number;
  dayPeriodRaw?: string;
  isPM?: boolean;
  minute?: number;
  second?: number;
  millisecond?: number;
  timeZoneId?: string;
  weekdayExpected?: number;
  weekdayRaw?: string;
  quarter?: number;
}

function assignField<T>(fields: Fields, key: keyof Fields, value: T): void {
  (fields as Record<string, T | undefined>)[key] = value;
}

function applyGroup(fields: Fields, token: string, raw: string, locale: string, formatStr: string): void {
  const vocab = getLocaleVocab(locale);
  switch (token) {
    case 'yyyy':
      assignField(fields, 'year', Number(raw));
      break;
    case 'yy':
      assignField(fields, 'twoDigitYear', Number(raw));
      break;
    case 'MM': case 'M':
      assignField(fields, 'month', Number(raw));
      break;
    case 'MMMM':
      assignField(fields, 'month', vocab.monthLong.indexOf(raw) + 1);
      break;
    case 'MMM':
      assignField(fields, 'month', vocab.monthShort.indexOf(raw) + 1);
      break;
    case 'dd': case 'd':
      assignField(fields, 'day', Number(raw));
      break;
    case 'EEEE':
      assignField(fields, 'weekdayRaw', raw);
      assignField(fields, 'weekdayExpected', vocab.weekdayLong.indexOf(raw) + 1);
      break;
    case 'EEE':
      assignField(fields, 'weekdayRaw', raw);
      assignField(fields, 'weekdayExpected', vocab.weekdayShort.indexOf(raw) + 1);
      break;
    case 'HH': case 'H':
      assignField(fields, 'hour', Number(raw));
      break;
    case 'hh': case 'h':
      assignField(fields, 'hour12', Number(raw));
      break;
    case 'mm': case 'm':
      assignField(fields, 'minute', Number(raw));
      break;
    case 'ss': case 's':
      assignField(fields, 'second', Number(raw));
      break;
    case 'SSS':
      assignField(fields, 'millisecond', Number(raw));
      break;
    case 'a': {
      const periodIndex = vocab.dayPeriod.indexOf(raw);
      if (periodIndex < 0) throw new Error(`temporal-fmt: unknown day period "${raw}" for locale "${locale}".`);
      assignField(fields, 'dayPeriodRaw', raw);
      assignField(fields, 'isPM', periodIndex === 1);
      break;
    }
    case 'zzz':
      assignField(fields, 'timeZoneId', raw);
      break;
    case 'Q':
      assignField(fields, 'quarter', Number(raw));
      break;
    case 'QQQ':
      // strips the literal "Q" prefix the token itself formats; the suffix
      // digit is the quarter value 1-4
      assignField(fields, 'quarter', Number(raw.slice(1)));
      break;
  }
}

// The lenient split-selection heuristic for ambiguous glued numeric runs.
// See README "Lenient parse mode" — the strict default throws on these,
// lenient mode opts into picking one split instead.
function pickLenientSplit(splits: number[][], tokens: string[]): number[] {
  // Prefer the split where a "d" (day) token, if any, has a value of 12 or
  // less. Rationale: when a person writes a glued run like "121" for an
  // Md format string, the reading "Dec 1" (M=12, d=1) is what they
  // typically meant — if they meant "Jan 21" they would more often have
  // written it as "1/21" or "01/21" with a separator or padding, since the
  // 2-digit day is the more naturally-cohesive unit to keep glued. This
  // isn't a guarantee, which is exactly why lenient mode is opt-in — but
  // it's a reasonable default when the caller has asked us to guess.
  const dayIndex = tokens.indexOf('d');
  if (dayIndex !== -1) {
    const smallDaySplits = splits.filter((s) => s[dayIndex]! <= 12);
    if (smallDaySplits.length > 0) {
      return smallDaySplits[0]!;
    }
  }
  // Fallback to the first valid split when the day heuristic doesn't
  // narrow it down — deterministic, and "first" here means "whichever
  // enumerateValidSplits returned first", which is a depth-first
  // leftmost-shortest walk over the candidate splits.
  return splits[0]!;
}

// emulates strptime (POSIX) for 2-digit years so the result doesn't depend
// on the current clock: 00-68 -> 2000-2068, 69-99 -> 1900-1999
// https://www.man7.org/linux//man-pages/man3/strptime.3p.html
function resolveYear(fields: Fields): number | undefined {
  if (fields.year !== undefined && fields.twoDigitYear !== undefined) {
    throw new Error(
      'temporal-fmt: format string mixes "yyyy" and "yy" year representations.'
    );
  }
  if (fields.year !== undefined) return fields.year;
  if (fields.twoDigitYear !== undefined) {
    return fields.twoDigitYear <= 68 ? 2000 + fields.twoDigitYear : 1900 + fields.twoDigitYear;
  }
  return undefined;
}

function resolveHour(fields: Fields, formatStr: string, locale: string): number | undefined {
  if (fields.hour !== undefined && fields.hour12 !== undefined) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" mixes a 24-hour token ("HH"/"H") with a ` +
      `12-hour token ("hh"/"h").`
    );
  }
  if (fields.hour !== undefined) {
    if (fields.dayPeriodRaw !== undefined) {
      const vocab = getLocaleVocab(locale);
      const expected = fields.hour < 12 ? vocab.dayPeriod[0] : vocab.dayPeriod[1];
      if (fields.dayPeriodRaw !== expected) {
        throw new Error(
          `temporal-fmt: format string "${formatStr}" contains a day period that contradicts the 24-hour value.`
        );
      }
    }
    return fields.hour;
  }
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

  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error(
      `temporal-fmt: input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length}).`
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

  // The regex's zzz fragment only matches a bounded zone-id *shape* (see
  // TIME_ZONE_SHAPE in pattern.ts) rather than alternating every real IANA
  // name inline, so a shape match isn't proof of a real zone yet — check
  // each captured zzz group against the actual zone list here. Kept as the
  // same "no valid pattern matches" error the inline-alternation version
  // used to throw, since from the caller's perspective this is still the
  // regex rejecting the input, just checked in two steps instead of one.
  for (const { name, token } of pattern.groups) {
    if (token === 'zzz' && !isValidTimeZone(match.groups![name]!)) {
      throw new Error(`temporal-fmt: no valid pattern matches the format string and input shape`);
    }
  }

  // A run of 2+ adjacent unpadded-numeric tokens with no literal separator
  // (e.g. "Md", "dM", "Hms") can have more than one way to split the
  // digits it matched that's independently valid for every token in the
  // run — see the comment on NUMERIC_FRAGMENTS in pattern.ts for the
  // mechanism. The regex above only ever finds one such split (whichever
  // its alternation ordering happens to prefer); silently trusting that
  // one would mean parse() sometimes returns a value indistinguishable
  // from a different, equally valid value the same input could describe.
  // Rather than guess, check every ambiguous run explicitly. Strict mode
  // (the default) throws; lenient mode opts into picking one split via a
  // documented heuristic. The input itself is what's ambiguous, not a
  // fixable property of the pattern.
  // Collect any lenient-mode split overrides before the applyGroup loop,
  // so it can substitute the heuristic-chosen values for tokens in a
  // multiply-split run instead of trusting the regex's arbitrary split.
  const runPicks: Array<{ groupNames: string[]; values: number[] }> = [];
  for (const run of pattern.ambiguousRuns) {
    const runDigits = run.groupNames.map((name) => match.groups![name]!).join('');
    const splits = enumerateValidSplits(runDigits, run.tokens);
    if (splits.length > 1) {
      // Strict default — throw on ambiguity. The whole point of the
      // library's parse() is to refuse to guess when the same input has
      // more than one valid reading. Lenient mode (opt-in via
      // options.lenient) instead picks one split via a documented
      // heuristic — see pickLenientSplit() above and the README section
      // "Lenient parse mode" for why this is strictly additive and never
      // the default.
      if (!options.lenient) {
        throw new Error(
          `temporal-fmt: "${runDigits}" in format string "${formatStr}" is ambiguous — ` +
          `${splits.length} different ways to read tokens "${run.tokens.join('')}" (with no separator ` +
          `between them) are all individually valid (e.g. ${JSON.stringify(splits[0])} vs ${JSON.stringify(splits[1])}). ` +
          `parse() won't guess; add a separator between these tokens, or use their padded form ` +
          `(e.g. "MM" instead of "M") so each one has a fixed width. ` +
          `Pass { lenient: true } to opt into a documented heuristic that picks one.`
        );
      }
      runPicks.push({ groupNames: run.groupNames, values: pickLenientSplit(splits, run.tokens) });
    }
  }

  const fields: Fields = {};
  // Map group-name -> heuristic-picked value (as string) for groups that
  // belong to a lenient-resolved ambiguous run. The applyGroup loop reads
  // from here first, falling back to the regex's own captured value when
  // the group isn't part of a lenient-resolved run.
  const lenientValues = new Map<string, string>();
  for (const { groupNames, values } of runPicks) {
    groupNames.forEach((name, i) => lenientValues.set(name, String(values[i])));
  }
  for (const { name, token } of pattern.groups) {
    const raw = lenientValues.get(name) ?? match.groups![name]!;
    applyGroup(fields, token, raw, locale, formatStr);
  }

  const year = resolveYear(fields);
  const hour = resolveHour(fields, formatStr, locale);
  const { month, day, minute, second, millisecond, timeZoneId, weekdayExpected, weekdayRaw, quarter } = fields;

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

  // Q/QQQ is a derived field of the month: 1-3 -> Q1, 4-6 -> Q2, 7-9 -> Q3,
  // 10-12 -> Q4. If a format string carries a quarter token alongside
  // month/date tokens, parse() cross-checks the parsed quarter against the
  // month the same way EEEE cross-checks weekday against date — silently
  // accepting a mismatch would defeat the point of having a quarter token
  // at all, since you'd be telling parse() one thing and the date another.
  if (quarter !== undefined && month !== undefined) {
    const expectedQuarter = Math.ceil(month / 3);
    if (quarter !== expectedQuarter) {
      throw new Error(
        `temporal-fmt: format string "${formatStr}" contains a quarter token (Q/QQQ) whose value ` +
        `(Q${quarter}) disagrees with the parsed month's actual quarter — month ${month} is in ` +
        `Q${expectedQuarter}.`
      );
    }
  }

  return result;
}