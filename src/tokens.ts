import { getTemporal, subscribeToTemporalChanges } from './temporalProvider.js';
import { canonicalCacheKey, getCustomVocab } from './localeVocab.js';
import { isoWeekYearAndWeek } from './isoWeek.js';

export function pad(n: number, len: number): string {
  // padStart pads the whole string, sign included, so pad(-45, 4) used to
  // come out "0-45" instead of "-045" — split the sign off first.
  const negative = n < 0;
  const digits = String(Math.abs(n)).padStart(len, '0');
  return negative ? '-' + digits : digits;
}

// Not every field exists on every Temporal type (PlainDate has no .hour,
// etc). Callers check for undefined before formatting a token.
export interface TemporalLike {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  timeZoneId?: string;
  dayOfWeek?: number; // 1=Mon, 7=Sun, per Temporal spec
  calendarId?: string;
  toInstant?: () => unknown;
  toLocaleString?: (locale: string, options: Intl.DateTimeFormatOptions) => string;
}

export interface FormatOptions {
  /** BCP 47 locale tag, e.g. 'en-US', 'fr-FR', 'ar-EG'. Defaults to 'en-US'. */
  locale?: string;
  /**
   * When set on parse(), opts into the lenient split heuristic for ambiguous
   * glued numeric runs (e.g. "121" against "Md"). Default (false) keeps
   * parse()'s strict behavior — throw on ambiguity rather than guess.
   * See README "Lenient parse mode" for the heuristic and why it's opt-in.
   */
  lenient?: boolean;
}

export const DEFAULT_LOCALE = 'en-US';

// Intl.DateTimeFormat is expensive to construct and format() can run in a
// loop (rendering a table of dates), so cache by (locale, options).
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const MAX_CACHE_SIZE = 500;

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify([canonicalCacheKey(locale), options]);
  let formatter = formatterCache.get(key);
  if (formatter) {
    return formatter;
  }
  if (formatterCache.size >= MAX_CACHE_SIZE) {
    // not real LRU, just evicts oldest insertion — fine for this key space
    const oldestKey = formatterCache.keys().next().value;
    if (oldestKey !== undefined) formatterCache.delete(oldestKey);
  }
  formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

// Passing a Temporal object straight into `new Intl.DateTimeFormat().formatToParts()`
// only works when the engine's Intl implementation has special-cased support for
// *native* Temporal instances (checked via internal slots and/or gated behind a V8 flag,
// not tied to a specific Node version).
//
// A Temporal polyfill's instances don't have those slots, so the engine falls back to ToNumber() -> .valueOf(),
// which the polyfill deliberately throws on ("Cannot use valueOf").
// Probed once and memoized and only from intlPart(), so it never
// runs unless a format string actually uses a locale-aware token.
let nativeSupport: boolean | undefined;
// Invalidate the memoized probe whenever setTemporal() swaps the active
// implementation — otherwise a probe result from "is native Temporal
// supported" could keep being used after the active implementation is
// no longer the one that was probed. See setTemporal() in
// temporalProvider.ts for the other half of this.
subscribeToTemporalChanges(() => { nativeSupport = undefined; });

function intlSupportsNativeTemporal(): boolean {
  if (nativeSupport === undefined) {
    nativeSupport = false;
      try {
        const temporal = getTemporal();
        new Intl.DateTimeFormat('en-US', { day: 'numeric' })
          .formatToParts(temporal.PlainDate.from({ year: 1970, month: 1, day: 1 }) as Date);
        nativeSupport = true;
      } catch {
        // native Temporal absent, or present but not recognized by Intl — fall back
      }
  }
  return nativeSupport;
}

function intlPart(
  temporal: TemporalLike,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes
): string {
  // Intl throws "Mismatching Calendars" if the formatter's calendar doesn't
  // match the object's own (e.g. en-US formatter defaults to gregory, but
  // a hebrew/islamic PlainDate needs its own calendar passed through).
  //
  // For iso8601 specifically, force 'gregory' rather than leaving calendar
  // unset: numeric fields (yyyy/dd, see tokens' pad()-based handlers) are
  // always pulled straight off the object's own ISO fields — so if the
  // *locale* carries a `-u-ca-*` extension (e.g. 'en-u-ca-hebrew') and this
  // step left calendar unset, the formatter would resolve its own default
  // calendar from the locale and format MMMM/EEEE in that calendar while
  // yyyy/dd stay ISO, producing a date that looks internally consistent
  // (a real Hebrew month name next to a real-looking day/year) but names a
  // completely different day than the object actually represents. Forcing
  // 'gregory' here keeps every field of an ISO object's output anchored to
  // the same (ISO/Gregorian) calendar — a locale's calendar extension only
  // takes effect when the object itself already carries a non-ISO calendar
  // (via `.withCalendar()`), matching what the README documents.
  //
  // 'gregory' specifically, not 'iso8601' — passing `calendar: 'iso8601'`
  // explicitly alongside a single-field options object makes
  // formatToParts() come back empty for some reason, but 'gregory' doesn't
  // have that problem and Temporal's iso8601 calendar is Gregorian-shaped
  // (proleptic Gregorian throughout, no Julian cutover) so the two agree
  // on every numeric field this library ever reads.
  const calendar = temporal?.calendarId;
  const formatterOptions: Intl.DateTimeFormatOptions = {
    ...options,
    calendar: calendar && calendar !== 'iso8601' ? calendar : 'gregory',
  };

  // Temporal.prototype.toLocaleString() is part of the Temporal spec itself:
  // polyfills implement the ICU formatting internally without needing the
  // engine to recognize the object, so it works without native Intl support.
  if (!intlSupportsNativeTemporal()) {
    return temporal.toLocaleString!(locale, formatterOptions);
  }

  // formatToParts() throws on ZonedDateTime directly (per spec), so convert
  // to Instant and pass the zone via `timeZone` instead. Don't convert to
  // PlainDateTime — that drops the zone, which breaks 'MMMM' + 'zzz' combos.
  const { toInstant, timeZoneId } = temporal;
  const isZoned = typeof toInstant === 'function' && typeof timeZoneId === 'string';
  // has to be called as temporal.toInstant() because destructuring it off breaks
  // the receiver and throws
  const intlSafeTemporal = isZoned ? temporal.toInstant!() : temporal;
  const nativeOptions: Intl.DateTimeFormatOptions = {
    ...formatterOptions,
    ...(isZoned ? { timeZone: timeZoneId } : {}),
  };

  const formatter = getFormatter(locale, nativeOptions);
  const parts = formatter.formatToParts(intlSafeTemporal as Date | number);
  const index = parts.findIndex((p) => p.type === partType);
  if (index === -1) {
    throw new Error(
      `temporal-fmt: locale "${locale}" produced no "${partType}" part for this token. ` +
      `This usually means the Temporal object is missing the field the token needs.`
    );
  }
  // some locales (ja-JP) split a field across two parts — e.g. month "8"
  // plus a counter suffix "月" as a separate sibling literal part. Merge in
  // an adjacent literal only if it has no whitespace, so a genuine suffix
  // gets folded in but an ordinary separator (the space before "AM") stays
  // a separator. Mirrors partValue() in localeVocab.ts, which builds the
  // vocab this token's output needs to match for parse() to round-trip.
  let value = parts[index]!.value;
  const prev = parts[index - 1];
  const next = parts[index + 1];
  if (prev?.type === 'literal' && !/\s/.test(prev.value)) value = prev.value + value;
  if (next?.type === 'literal' && !/\s/.test(next.value)) value = value + next.value;
  return value;
}

// Temporal.prototype.toLocaleString() can't isolate a single field the way
// formatToParts() can — asking for `hour` + `dayPeriod` together returns one
// joined string (e.g. "3 in the afternoon"), and `dayPeriod` alone resolves
// against a different, non-hour-anchored set of periods ("in the
// afternoon"/"昼" instead of "PM"/"午後"). Day period only depends on the
// hour anyway, so route it through a plain UTC Date and Intl.DateTimeFormat
// instead — that's worked the same on every engine regardless of whether
// Temporal itself is native or polyfilled.
function dayPeriodPart(hour: number, locale: string): string {
  // Custom vocab (when registered) takes precedence over Intl — same
  // contract as the other locale-aware tokens. Intl won't know about a
  // caller-supplied AM/PM string for a made-up locale key, so going
  // through Intl would produce something other than what the caller
  // registered.
  const custom = getCustomVocab(locale);
  if (custom) {
    return hour < 12 ? custom.dayPeriod[0]! : custom.dayPeriod[1]!;
  }
  const date = new Date(Date.UTC(1970, 0, 1, hour));
  const formatter = getFormatter(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const part = formatter.formatToParts(date).find((p) => p.type === 'dayPeriod');
  if (!part) {
    throw new Error(`temporal-fmt: locale "${locale}" produced no "dayPeriod" part for token "a".`);
  }
  return part.value;
}

// Resolves a locale-aware month/weekday name from the registered custom
// vocab when one exists for this locale, falling through to Intl otherwise.
// Without this, format() would silently keep producing Intl's strings while
// parse() matched against the registered vocab — the two would round-trip-fail
// against each other.
function localeAwareName(
  temporal: TemporalLike,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes,
  customArray: string[] | undefined,
  customIndex: number | undefined,
): string {
  if (customArray && customIndex !== undefined && customIndex >= 0 && customIndex < customArray.length) {
    return customArray[customIndex]!;
  }
  return intlPart(temporal, locale, options, partType);
}

type TokenHandler = (t: TemporalLike, locale: string) => string;

// Longest-first — tokenizer is greedy, "yyyy" has to be tried before "yy".
//
// Numeric tokens always render in ASCII digits, never locale-native
// (Arabic-Indic, Devanagari, etc). Padding non-ASCII digits isn't as simple
// as padding "3", and most consumers parsing these back out want plain
// digits anyway.
export const TOKENS: Array<[string, TokenHandler, keyof TemporalLike]> = [
  ['yyyy', (t) => pad(t.year!, 4), 'year'],
  ['yy', (t) => {
    // -45 % 100 === -45, so truncating negative years to 2 digits doesn't
    // work and Math.abs() would make 45 CE and 45 BCE render the same.
    if (t.year! < 0) {
      throw new Error(
        `temporal-fmt: token "yy" doesn't support negative years (got ${t.year}), ` +
        `since truncating to 2 digits would make it indistinguishable from a ` +
        `positive year. Use "yyyy" instead.`
      );
    }
    return pad(t.year! % 100, 2);
  }, 'year'],
  ['MMMM', (t, locale) => {
    const custom = getCustomVocab(locale);
    return localeAwareName(t, locale, { month: 'long' }, 'month', custom?.monthLong, t.month! - 1);
  }, 'month'],
  ['MMM', (t, locale) => {
    const custom = getCustomVocab(locale);
    return localeAwareName(t, locale, { month: 'short' }, 'month', custom?.monthShort, t.month! - 1);
  }, 'month'],
  ['MM', (t) => pad(t.month!, 2), 'month'],
  ['M', (t) => String(t.month!), 'month'],
  ['dd', (t) => pad(t.day!, 2), 'day'],
  ['d', (t) => String(t.day!), 'day'],
  ['EEEE', (t, locale) => {
    const custom = getCustomVocab(locale);
    return localeAwareName(t, locale, { weekday: 'long' }, 'weekday', custom?.weekdayLong, t.dayOfWeek! - 1);
  }, 'dayOfWeek'],
  ['EEE', (t, locale) => {
    const custom = getCustomVocab(locale);
    return localeAwareName(t, locale, { weekday: 'short' }, 'weekday', custom?.weekdayShort, t.dayOfWeek! - 1);
  }, 'dayOfWeek'],
  ['HH', (t) => pad(t.hour!, 2), 'hour'],
  ['H', (t) => String(t.hour!), 'hour'],
  ['hh', (t) => pad(t.hour! % 12 || 12, 2), 'hour'],
  ['h', (t) => String(t.hour! % 12 || 12), 'hour'],
  ['mm', (t) => pad(t.minute!, 2), 'minute'],
  ['m', (t) => String(t.minute!), 'minute'],
  ['ss', (t) => pad(t.second!, 2), 'second'],
  ['s', (t) => String(t.second!), 'second'],
  ['SSS', (t) => pad(t.millisecond!, 3), 'millisecond'],
  // dayPeriod text is locale-specific (AM/PM in en-US, م/ص in ar-EG) but
  // still needs .hour on the input to compute which period it is
  ['a', (t, locale) => dayPeriodPart(t.hour!, locale), 'hour'],
  ['zzz', (t) => t.timeZoneId!, 'timeZoneId'],

  // Ordinal day (1st, 2nd, 3rd, ... 21st). English suffix rules only —
  // locale-aware ordinals ("2." in de-DE, "2日" in ja-JP) are out of scope,
  // since the rest of this library routes locale-specific names through
  // Intl.DateTimeFormat, and Intl has no part type for ordinals. Format-only:
  // the suffix isn't structurally distinguishable from a literal in a parse
  // context (a "st"/"nd"/"rd"/"th" suffix isn't a digit and would collide
  // with any adjacent literal text), so there's no good way to read it back.
  ['do', (t) => {
    const day = t.day!;
    const lastDigit = day % 10;
    // 11, 12, 13 are the exception — they'd otherwise match the 1/2/3 rule
    // and produce "11st"/"12nd"/"13rd", which is wrong. They always take "th".
    const lastTwoDigits = day % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
      return day + 'th';
    }
    if (lastDigit === 1) return day + 'st';
    if (lastDigit === 2) return day + 'nd';
    if (lastDigit === 3) return day + 'rd';
    return day + 'th';
  }, 'day'],

  // Quarter computed from month: 1-3=Q1, 4-6=Q2, 7-9=Q3, 10-12=Q4.
  // `Q` is plain numeric, `QQQ` renders as "Q3" — same convention as
  // date-fns's `Q` and `QQQ` for parity with the most common prior art.
  // Both format and parse; parse() cross-checks Q/QQQ against the parsed
  // month in the same spirit as the EEEE-vs-date cross-check.
  ['Q', (t) => String(Math.ceil(t.month! / 3)), 'month'],
  ['QQQ', (t) => 'Q' + Math.ceil(t.month! / 3), 'month'],

  // ISO 8601 week and week-numbering year. Both are format-only — parsing
  // "ww"/"RRRR" back into a real date requires resolving an ISO week + a
  // weekday (or some other disambiguator) to a specific date, which is a
  // different parsing surface than the token-based parse() here. The
  // ISO-week year (RRRR) can differ from the calendar year at the boundary:
  // Dec 29-31 often belong to week 1 of the *next* year; Jan 1-3 often
  // belong to week 52/53 of the *previous* year. See isoWeekYearAndWeek().
  ['ww', (t) => {
    const { week } = isoWeekYearAndWeek(t.year!, t.month!, t.day!, t.dayOfWeek!);
    return pad(week, 2);
  }, 'dayOfWeek'],
  ['RRRR', (t) => {
    const { isoYear } = isoWeekYearAndWeek(t.year!, t.month!, t.day!, t.dayOfWeek!);
    return pad(isoYear, 4);
  }, 'dayOfWeek'],
];