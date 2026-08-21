import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { buildCapturingPattern, type CapturingPattern } from './parsePattern.js';
import { enumerateValidSplits, isValidTimeZone } from './pattern.js';
import { getLocaleVocab, canonicalCacheKey } from './localeVocab.js';
import { getTemporal } from './temporalProvider.js';
import { MAX_FORMAT_LENGTH, MAX_INPUT_LENGTH } from './constants.js';
import { TemporalFmtError, InvalidTimeZoneError, wrapUntypedError } from './errors.js';
import { applyParseNumbering, type NumberingParseOptions } from './numbering.js';

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
  microsecond?: number;
  nanosecond?: number;
  timeZoneId?: string;
  // Canonical `+HH:MM` form of any offset token (X/XX/XXX/x/xx/xxx)
  // captured in this pattern. Distinct from timeZoneId because the two
  // can coexist in the same pattern (e.g. "yyyy-MM-dd HH:mm zzz XXX") —
  // see the cross-check after construction for how a mismatch between
  // them is resolved.
  offsetString?: string;
  weekdayExpected?: number;
  weekdayRaw?: string;
  quarter?: number;
}

// Normalizes a captured offset-token string into the canonical `+HH:MM`
// shape Temporal.ZonedDateTime.from accepts as a `timeZone` value. Throws
// descriptive errors for out-of-range hours/minutes, since the regex
// shape (OFFSET_SHAPES in pattern.ts) is deliberately permissive — a
// post-match range check here gives the user a specific error ("offset
// hours 99 out of range, max 14") instead of "no valid pattern matches".
//
// Range bounds: -12:00 to +14:00, the standard IANA offset range
// (Baker/Howland at -12, Kiritimati at +14). +14:01 / -12:01 etc. are
// rejected explicitly even though the per-piece bounds (hours ≤ 14,
// minutes ≤ 59) alone wouldn't catch them.
function parseOffsetString(raw: string, token: string): string {
  if (raw === 'Z') {
    /* c8 ignore start @preserve -- unreachable: lowercase tokens' regex
       (OFFSET_SHAPES in pattern.ts) has no "Z" alternative at all, so
       raw === 'Z' can only ever be reached when token is one of the
       uppercase variants (X/XX/XXX). A lowercase token can't even
       capture "Z" as `raw` in the first place. */
    if (token === 'x' || token === 'xx' || token === 'xxx') {
      throw new Error(
        `temporal-fmt: offset token "${token}" doesn't accept "Z" — only the uppercase variants (X/XX/XXX) emit "Z" for UTC. ` +
        `Use "+00:00", "+0000", or "+00" depending on the variant's width.`
      );
    }
    /* c8 ignore stop @preserve */
    return '+00:00';
  }

  const sign = raw[0];
  /* c8 ignore start @preserve -- unreachable: raw is a regex-captured
     group from an offset token, and every OFFSET_SHAPES pattern
     (pattern.ts) is anchored to either "Z" or a leading [+-]. raw's
     first character can never be anything else by the time it reaches
     this function. */
  if (sign !== '+' && sign !== '-') {
    throw new Error(`temporal-fmt: offset "${raw}" for token "${token}" doesn't start with "+", "-", or "Z".`);
  }
  /* c8 ignore stop @preserve */
  const body = raw.slice(1);
  let hoursStr: string;
  let minutesStr: string;
  if (body.length === 2) {
    /* c8 ignore start @preserve -- unreachable: each offset token's own
       regex shape in OFFSET_SHAPES (pattern.ts) already gates which
       body shapes it can capture. Only X and x ever match a 2-digit
       body — XX/xx/XXX/xxx's regexes can't produce one — so this
       mismatch can never actually fire through parse(). */
    // +HH — only X/x emit this shape; XX/xx/XXX/xxx always carry minutes.
    if (token !== 'X' && token !== 'x') {
      throw new Error(
        `temporal-fmt: offset token "${token}" can't match "${raw}" — it requires minutes, but "${raw}" has none.`
      );
    }
    /* c8 ignore stop @preserve */
    hoursStr = body;
    minutesStr = '00';
  } else if (body.length === 4) {
    /* c8 ignore start @preserve -- unreachable, same reason as the
       2-digit case above: XXX/xxx's regex requires a colon, so it can
       never capture a 4-digit no-colon body in the first place. */
    // +HHMM — X/x (when minutes are non-zero) or XX/xx.
    if (token === 'XXX' || token === 'xxx') {
      throw new Error(
        `temporal-fmt: offset token "${token}" can't match "${raw}" — it requires a colon between hours and minutes (e.g. "${sign}${body.slice(0, 2)}:${body.slice(2)}").`
      );
    }
    /* c8 ignore stop @preserve */
    hoursStr = body.slice(0, 2);
    minutesStr = body.slice(2, 4);
  } else if (body.length === 5 && body[2] === ':') {
    /* c8 ignore start @preserve -- unreachable, same reason again: only
       XXX/xxx's regex can produce a colon-shaped body; X/x/XX/xx never
       capture one. */
    // +HH:MM — XXX/xxx only.
    if (token !== 'XXX' && token !== 'xxx') {
      throw new Error(
        `temporal-fmt: offset token "${token}" can't match "${raw}" — it doesn't use a colon (use "${sign}${body.slice(0, 2)}${body.slice(3)}" instead).`
      );
    }
    /* c8 ignore stop @preserve */
    hoursStr = body.slice(0, 2);
    minutesStr = body.slice(3, 5);
  /* c8 ignore start @preserve -- unreachable: every offset token's
     regex only ever produces a body of length 2, length 4, or length 5
     with a colon at index 2 (see OFFSET_SHAPES in pattern.ts) — no
     shape falls outside those three cases, so this else arm can't be
     taken through parse(). Kept as an exhaustiveness fallback so
     hoursStr/minutesStr are assigned on every path TypeScript can see. */
  } else {
    throw new Error(`temporal-fmt: offset "${raw}" doesn't match the shape token "${token}" accepts.`);
  }
  /* c8 ignore stop @preserve */

  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  // Per-piece range checks catch most malformed input.
  if (hours > 14) {
    throw new Error(
      `temporal-fmt: offset hours ${hours} in "${raw}" out of range (max 14 — Kiritimati, Line Islands is +14:00).`
    );
  }
  if (minutes > 59) {
    throw new Error(`temporal-fmt: offset minutes ${minutes} in "${raw}" out of range (max 59).`);
  }
  // Boundary: +14:01..+14:59 and -12:01..-12:59 are out of range even
  // though each piece alone is in bounds — the overall offset exceeds
  // the IANA-supported range.
  if (sign === '+' && hours === 14 && minutes !== 0) {
    throw new Error(
      `temporal-fmt: offset "${raw}" exceeds the maximum supported UTC offset of +14:00.`
    );
  }
  if (sign === '-' && hours === 12 && minutes !== 0) {
    throw new Error(
      `temporal-fmt: offset "${raw}" exceeds the maximum supported negative UTC offset of -12:00.`
    );
  }
  return `${sign}${hoursStr}:${minutesStr}`;
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
    case 'S': case 'SS': case 'SSS': case 'SSSS': case 'SSSSS':
    case 'SSSSSS': case 'SSSSSSS': case 'SSSSSSSS': case 'SSSSSSSSS': {
      // The captured digits are the leading N digits of a nanosecond-of-second
      // value, not the whole thing — "5" under SSSSSSSSS means 500000000ns
      // (half a second), not 5ns. Right-padding to 9 digits before splitting
      // is what makes that work; left-padding (or just Number(raw)) would
      // read "5" as 5ns instead.
      const nanoOfSecond = Number(raw.padEnd(9, '0'));
      assignField(fields, 'millisecond', Math.floor(nanoOfSecond / 1_000_000));
      assignField(fields, 'microsecond', Math.floor(nanoOfSecond / 1_000) % 1_000);
      assignField(fields, 'nanosecond', nanoOfSecond % 1_000);
      break;
    }
    case 'a': {
      // Matches case-insensitively (see pattern.ts's foldCase), so the
      // lookup here has to fold too, or "pm" would pass the regex and
      // then fail this indexOf against the exact-case vocab.
      const periodIndex = vocab.dayPeriod.findIndex((p) => p.toLowerCase() === raw.toLowerCase());
      /* c8 ignore start @preserve -- unreachable: the 'a' token's regex
         fragment (pattern.ts's alternation() over vocab.dayPeriod) can
         only ever capture a case-insensitive match of one of
         vocab.dayPeriod's own entries. Both the regex and this lookup
         derive their vocab from the same `locale` via getLocaleVocab(),
         so periodIndex can't come back negative through parse(). */
      if (periodIndex < 0) throw new Error(`temporal-fmt: unknown day period "${raw}" for locale "${locale}".`);
      /* c8 ignore stop @preserve */
      assignField(fields, 'dayPeriodRaw', raw);
      assignField(fields, 'isPM', periodIndex === 1);
      break;
    }
    case 'zzz':
      assignField(fields, 'timeZoneId', raw);
      break;
    case 'X': case 'XX': case 'XXX':
    case 'x': case 'xx': case 'xxx':
      assignField(fields, 'offsetString', parseOffsetString(raw, token));
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
      if (fields.dayPeriodRaw.toLowerCase() !== expected?.toLowerCase()) {
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
export function parse(formatStr: string, input: string, options: NumberingParseOptions = {}): unknown | undefined {
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

  // Transliterate non-ASCII numerals to ASCII before any matching happens,
  // when the caller opts in via parseNumberingSystem. Every regex this
  // module builds expects 0-9; this is the one place that assumption
  // could otherwise be violated by locale-native input digits.
  if (options.parseNumberingSystem) {
    input = applyParseNumbering(input, options);
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
  // Zone ids can't be enumerated in the regex itself (there are ~400 of
  // them and they change over time as IANA updates the tz database), so
  // the regex only captures the zzz group's shape and this loop checks
  // each captured zzz group against the actual zone list here. Unlike a
  // regex-shape mismatch, this failure has a specific cause worth
  // naming: the shape matched but the zone id itself isn't recognized.
  for (const { name, token } of pattern.groups) {
    if (token === 'zzz' && !isValidTimeZone(match.groups![name]!)) {
      throw new InvalidTimeZoneError({
        input, format: formatStr, actual: match.groups![name],
        reason: 'not a recognized IANA time zone identifier',
      });
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
  const { month, day, minute, second, millisecond, microsecond, nanosecond, timeZoneId, offsetString, weekdayExpected, weekdayRaw, quarter } = fields;

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

  // Mirror zzz's full-date-and-time requirement: an offset alone is
  // meaningless without a wall-clock instant to anchor it to. Throws the
  // same kind of "needs full date and time" error zzz throws — separate
  // message so a caller reading it can tell which token type they
  // forgot to pair with a full date+time.
  if (offsetString !== undefined && !(hasFullDate && hasTime)) {
    throw new Error(
      `temporal-fmt: format string "${formatStr}" has an offset token (X/XX/XXX/x/xx/xxx) but needs a full date and time ` +
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
  const timeFields = {
    hour: hour ?? 0,
    minute: minute ?? 0,
    second: second ?? 0,
    millisecond: millisecond ?? 0,
    microsecond: microsecond ?? 0,
    nanosecond: nanosecond ?? 0,
  };
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
      // offset: 'prefer' never throws on a mismatch — it just falls back to
      // the zone's real offset at this instant, silently overriding
      // whatever the offset token said. That's also what resolves a
      // repeated wall-clock time (DST fall-back): without an explicit
      // offset, Temporal defaults to the first occurrence, so passing the
      // token's offset here is what lets a second-occurrence input resolve
      // to the second occurrence instead of always falling back to the
      // first. Either way, "prefer" can't be used to detect disagreement —
      // that's checked explicitly below, once we have a real ZonedDateTime
      // to compare against, instead of relying on the wording of whatever
      // error Temporal's active implementation happens to throw (that
      // wording isn't part of the spec and differs between the native
      // Temporal global and userland polyfills).
      const zoneOptions: Temporal.ZonedDateTimeFromOptions = { overflow: 'reject', offset: 'prefer' };
      result = temporal.ZonedDateTime.from(
        {
          year: year!, month: month!, day: day!, ...timeFields, ...calendarField,
          timeZone: timeZoneId,
          ...(offsetString !== undefined ? { offset: offsetString } : {}),
        },
        zoneOptions
      );
      if (offsetString !== undefined) {
        // 'prefer' silently rewrites the wall-clock time itself when the
        // input falls in a DST gap (the time never occurred, so there's
        // no instant to prefer toward) — it doesn't just pick a
        // different offset for the same clock time, the way it does for
        // an overlap. Checking offsetString alone can't tell "gap,
        // silently moved" apart from "overlap, correctly resolved,"
        // since both can produce an actualOffset that differs from what
        // was parsed. Comparing the wall-clock fields catches the gap
        // case: they can only drift from the parsed input if Temporal
        // moved the clock time to escape the gap.
        //
        // Only checked when an offset token was given: with no offset
        // token to disagree with, a gap shifting forward is the
        // documented, wanted behavior (there's nothing to reject against).
        const zdt = result as Temporal.ZonedDateTime;
        const wallClockShifted =
          zdt.hour !== timeFields.hour ||
          zdt.minute !== timeFields.minute ||
          zdt.second !== timeFields.second;
        if (wallClockShifted) {
          throw new Error(
            `"${timeZoneId}" has no such wall-clock time on this date — it falls in a DST gap, ` +
            `not an ambiguous or valid instant.`
          );
        }
        const actualOffset = zdt.offset;
        if (actualOffset !== offsetString) {
          throw new Error(
            `has both a "zzz" zone (${timeZoneId}) and an offset token (${offsetString}), ` +
            `but the zone's actual offset at this date/time is ${actualOffset}, not ${offsetString}.`
          );
        }
      }
    } else if (offsetString !== undefined) {
      // Pattern had an offset token but no zzz. Use the offset string
      // directly as the timeZone — Temporal accepts a fixed-offset
      // string and produces a ZonedDateTime whose timeZoneId is the
      // offset string itself (e.g. "+09:00"). Same shape zzz produces
      // when it parses a fixed offset, just reached via a different
      // token.
      result = temporal.ZonedDateTime.from({ year: year!, month: month!, day: day!, ...timeFields, ...calendarField, timeZone: offsetString }, reject);
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

// safeParse: returns a discriminated union instead of throwing. The
// happy path returns `{ ok: true, value }` with the Temporal instance
// (typed as `unknown` since this package has no ambient Temporal types).
// The error path returns `{ ok: false, error }` where `error` is a
// `TemporalFmtError` subclass when the failure is one the typed-error
// surface in errors.ts knows how to classify (most of them), or a
// wrapped plain `Error` (still inside a TemporalFmtError shell) when
// the throw site hasn't been migrated yet. Callers needing the original
// thrown object for backward compatibility should use parse() directly.
export type SafeParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: TemporalFmtError };

export function safeParse(formatStr: string, input: string, options: NumberingParseOptions = {}): SafeParseResult {
  try {
    return { ok: true, value: parse(formatStr, input, options) };
  } catch (err) {
    // Pass through typed errors unchanged — preserves the structured
    // fields (code/token/position/etc.) the existing typed-error
    // surface already populated.
    if (err instanceof TemporalFmtError) {
      return { ok: false, error: err };
    }
    return { ok: false, error: wrapUntypedError(err as Error, { input, format: formatStr }) };
  }
}

// tryParse: best-effort variant. Returns the parsed value or undefined.
// Suppresses diagnostics entirely — when callers need the reason for
// a failure, they should use safeParse(). Intentionally loose on the
// return type (unknown) since this package has no ambient Temporal
// types to return a real one against.
export function tryParse(formatStr: string, input: string, options: NumberingParseOptions = {}): unknown | undefined {
  try {
    return parse(formatStr, input, options);
  } catch {
    return undefined;
  }
}

// parseToParts: returns the matched groups with token labels, before
// any Temporal construction. Useful for callers that want to inspect
// what each token captured (e.g. to build a non-Temporal result, or to
// cross-check fields themselves) without committing to the inferred
// Temporal type parse() would build.
//
// Throws the same errors parse() throws for early validation (unknown
// token, unterminated quote, no-match, ambiguity in strict mode) since
// those failures happen before any group assignment. Construction-time
// errors (Feb 30, weekday mismatch, etc.) do not happen here —
// parseToParts doesn't construct anything, so it can't fail at that step.
export interface ParsedPart {
  token: string;
  raw: string;
  // Field name (year/month/day/...) this token would assign if handed
  // to parse()'s applyGroup loop. undefined for tokens that don't map
  // to a single field (none today, but kept here so future additions
  // don't have to widen the type).
  field?: string;
  // Position of `raw` in `input`, 0-indexed. Lets a caller highlight
  // the matched span in an editor/CLI.
  position: number;
}

export function parseToParts(formatStr: string, input: string, options: NumberingParseOptions = {}): ParsedPart[] {
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

  // Same numeral transliteration parse() does — see the comment there.
  if (options.parseNumberingSystem) {
    input = applyParseNumbering(input, options);
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  const pattern = getPattern(formatStr, locale);
  const match = pattern.regex.exec(input);
  if (!match) {
    throw new Error(`temporal-fmt: no valid pattern matches the format string and input shape`);
  }
  if (pattern.groups.length === 0) {
    throw new Error(`temporal-fmt: format string "${formatStr}" has no tokens — nothing to parse into a value.`);
  }
  // Same zzz shape-validation parse() does — kept here for parity, so
  // a caller using parseToParts sees the same InvalidTimeZoneError for
  // a bogus zone id, not a silently-accepted bogus zone.
  for (const { name, token } of pattern.groups) {
    if (token === 'zzz' && !isValidTimeZone(match.groups![name]!)) {
      throw new InvalidTimeZoneError({
        input, format: formatStr, actual: match.groups![name],
        reason: 'not a recognized IANA time zone identifier',
      });
    }
  }

  // Lenient-split handling: same as parse(). Strict mode throws on
  // ambiguity, lenient picks one split via the documented heuristic.
  // parseToParts mirrors this so callers switching between parse()
  // and parseToParts on the same input get consistent results.
  const runPicks: Array<{ groupNames: string[]; values: number[] }> = [];
  for (const run of pattern.ambiguousRuns) {
    const runDigits = run.groupNames.map((name) => match.groups![name]!).join('');
    const splits = enumerateValidSplits(runDigits, run.tokens);
    if (splits.length > 1) {
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
  const lenientValues = new Map<string, string>();
  for (const { groupNames, values } of runPicks) {
    groupNames.forEach((name, i) => lenientValues.set(name, String(values[i])));
  }

  const parts: ParsedPart[] = [];
  // match.indices.groups (provided by the regex 'd' flag) gives the
  // [start, end] of each named group in the input. Used here so positions
  // are accurate even when literals separate tokens — summing raw
  // lengths alone wouldn't account for the literal characters between
  // groups. Falls back to the cumulative-raw-length heuristic on engines
  // without 'd' support (none we target, but the fallback keeps the
  // code robust if the flag is ever removed).
  const indices = (match as RegExpMatchArray & { indices?: { groups?: Record<string, [number, number]> } }).indices;
  const groupIndices = indices?.groups;
  let consumed = 0;
  for (const { name, token } of pattern.groups) {
    const raw = lenientValues.get(name) ?? match.groups![name]!;
    // When a lenient-mode override is in play, the regex's recorded
    // indices point at the run's overall span, not the individual
    // token's slice within it — fall back to cumulative-raw-length for
    // the overridden values so positions stay monotonic but may not be
    // exact for tokens inside a lenient-resolved run. Documented as a
    // known limitation; the alternative (re-running the regex with the
    // chosen split baked in) would mean a second match pass for a
    // corner case the lenient mode caller explicitly opted into.
    const fromIndices = !lenientValues.has(name) && groupIndices?.[name];
    /* c8 ignore next */
    const position = fromIndices ? fromIndices[0] : (match.index ?? 0) + consumed;
    parts.push({ token, raw, position });
    consumed += raw.length;
  }
  return parts;
}

// compileParser: pre-compiles a format string into an object whose
// parse()/safeParse()/parseToParts() methods skip the per-call
// pattern-cache lookup. The patternCache in this module means a plain
// parse(fmt, input) call already pays only a Map lookup after the first
// call, so compileParser is mostly an ergonomics affordance — useful
// for callers who want to hold the compiled parser explicitly (e.g. to
// inspect the pattern via the .pattern property).
export interface CompiledParser {
  parse(input: string, options?: NumberingParseOptions): unknown;
  safeParse(input: string, options?: NumberingParseOptions): SafeParseResult;
  tryParse(input: string, options?: NumberingParseOptions): unknown | undefined;
  parseToParts(input: string, options?: NumberingParseOptions): ParsedPart[];
  readonly formatStr: string;
  readonly pattern: CapturingPattern;
}

export function compileParser(formatStr: string, options: NumberingParseOptions = {}): CompiledParser {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }
  // Pre-compile against the default locale; per-call locales will
  // re-resolve via getPattern() if they differ. Most callers use one
  // locale consistently, so pre-compiling against the default keeps
  // the fast path fast.
  const locale = options.locale ?? DEFAULT_LOCALE;
  const pattern = getPattern(formatStr, locale);
  return {
    formatStr,
    pattern,
    parse(input: string, opts: NumberingParseOptions = {}) {
      return parse(formatStr, input, { locale, ...opts });
    },
    safeParse(input: string, opts: NumberingParseOptions = {}) {
      return safeParse(formatStr, input, { locale, ...opts });
    },
    tryParse(input: string, opts: NumberingParseOptions = {}) {
      return tryParse(formatStr, input, { locale, ...opts });
    },
    parseToParts(input: string, opts: NumberingParseOptions = {}) {
      return parseToParts(formatStr, input, { locale, ...opts });
    },
  };
}