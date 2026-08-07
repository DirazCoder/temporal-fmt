export function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
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
  dayOfWeek?: number; // 1 (Mon) - 7 (Sun), per Temporal spec
  calendarId?: string;
  toInstant?: () => unknown;
  toLocaleString?: (locale: string, options: Intl.DateTimeFormatOptions) => string;
}

export interface FormatOptions {
  /** BCP 47 locale tag, e.g. 'en-US', 'fr-FR', 'ar-EG'. Defaults to 'en-US'. */
  locale?: string;
}

export const DEFAULT_LOCALE = 'en-US';

// Intl.DateTimeFormat is expensive to construct and format() can run in a
// loop (rendering a table of dates), so cache by (locale, options).
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const MAX_CACHE_SIZE = 500;

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
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
function intlSupportsNativeTemporal(): boolean {
  if (nativeSupport === undefined) {
    nativeSupport = false;
    const Temporal = (globalThis as { Temporal?: { PlainDate?: { from: (s: string) => unknown } } }).Temporal;
    if (Temporal?.PlainDate) {
      try {
        new Intl.DateTimeFormat('en-US', { day: 'numeric' }).formatToParts(Temporal.PlainDate.from('1970-01-01') as Date);
        nativeSupport = true;
      } catch {
        // native Temporal absent, or present but not recognized by Intl — fall back
      }
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
  // skip this for iso8601 specifically — passing `calendar: 'iso8601'`
  // explicitly alongside a single-field options object makes formatToParts()
  // come back empty for some reason.
  const calendar = temporal?.calendarId;
  const formatterOptions: Intl.DateTimeFormatOptions = {
    ...options,
    ...(calendar && calendar !== 'iso8601' ? { calendar } : {}),
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
  const part = parts.find((p) => p.type === partType);
  if (!part) {
    throw new Error(
      `temporal-fmt: locale "${locale}" produced no "${partType}" part for this token. ` +
      `This usually means the Temporal object is missing the field the token needs.`
    );
  }
  return part.value;
}


// Temporal.prototype.toLocaleString() can't isolate a single field the way formatToParts() can
// — asking for `hour` + `dayPeriod` together returns one joined string (e.g.
// "3 in the afternoon"), and asking for `dayPeriod` alone silently resolves
// against a different, non-hour-anchored set of periods (produces "in the
// afternoon"/"昼" instead of the "PM"/"午後" that pairing it with hour12
// actually renders).
// 
// On using this instead of temporal:
// Day period only depends on the hour, not on the calendar or the date, 
// so always route it through a plain UTC Date instead
// Intl.DateTimeFormat has always accepted Date objects, on every engine,
// independent of whether Temporal itself is native or polyfilled.
function dayPeriodPart(hour: number, locale: string): string {
  const date = new Date(Date.UTC(1970, 0, 1, hour));
  const formatter = getFormatter(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const part = formatter.formatToParts(date).find((p) => p.type === 'dayPeriod');
  if (!part) {
    throw new Error(`temporal-fmt: locale "${locale}" produced no "dayPeriod" part for token "a".`);
  }
  return part.value;
}

type TokenHandler = (t: TemporalLike, locale: string) => string;

// Longest-first — tokenizer is greedy, "yyyy" has to be tried before "yy".
//
// Numeric tokens always render in ASCII digits, never locale-native
// (Arabic-Indic, Devanagari, etc). Padding non-ASCII digit strings to a
// fixed width isn't the same operation as padding "3", and most consumers
// parsing these back out want plain digits anyway.
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
  ['MMMM', (t, locale) => intlPart(t, locale, { month: 'long' }, 'month'), 'month'],
  ['MMM', (t, locale) => intlPart(t, locale, { month: 'short' }, 'month'), 'month'],
  ['MM', (t) => pad(t.month!, 2), 'month'],
  ['M', (t) => String(t.month!), 'month'],
  ['dd', (t) => pad(t.day!, 2), 'day'],
  ['d', (t) => String(t.day!), 'day'],
  ['EEEE', (t, locale) => intlPart(t, locale, { weekday: 'long' }, 'weekday'), 'dayOfWeek'],
  ['EEE', (t, locale) => intlPart(t, locale, { weekday: 'short' }, 'weekday'), 'dayOfWeek'],
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
];
