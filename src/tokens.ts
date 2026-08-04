// Pad a number with leading zeros to `len` digits.
export function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

// Minimal duck-typed shape covering every field we might read off a Temporal
// object. Not every field exists on every type (PlainDate has no .hour, for
// example) — callers check for undefined before formatting a token.
//
// calendarId / toInstant are optional because a plain object satisfying
// this interface in a test won't have them, but real Temporal instances
// always do — intlPart() below relies on calendarId to keep Intl from
// rejecting non-Gregorian objects, and on toInstant to detect ZonedDateTime.
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
}

export interface FormatOptions {
  /** BCP 47 locale tag, e.g. 'en-US', 'fr-FR', 'ar-EG'. Defaults to 'en-US'. */
  locale?: string;
}

export const DEFAULT_LOCALE = 'en-US';

// Small cache so repeated format() calls with the same (locale, options)
// pair don't construct a fresh Intl.DateTimeFormat every time — these are
// somewhat expensive to instantiate and format() may run in a loop (e.g.
// rendering a table of dates).
const formatterCache = new Map<string, Intl.DateTimeFormat>();

// In practice the key space is small — a handful of option shapes (month,
// weekday, dayPeriod) crossed with however many distinct locales a caller
// uses — so this is defensive rather than fixing an observed leak. Caps
// memory for the pathological case of an app looping over many distinct
// locale strings.
const MAX_CACHE_SIZE = 500;

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let formatter = formatterCache.get(key);
  if (formatter) {
    return formatter;
  }
  if (formatterCache.size >= MAX_CACHE_SIZE) {
    // Map preserves insertion order, so this evicts the oldest entry —
    // not true LRU, but good enough to bound growth without extra
    // bookkeeping on every cache hit.
    const oldestKey = formatterCache.keys().next().value;
    if (oldestKey !== undefined) formatterCache.delete(oldestKey);
  }
  formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

// Reads a single named part (e.g. 'month', 'weekday', 'dayPeriod') out of
// Intl's formatToParts() output. We ask Intl for exactly one field at a
// time rather than building a full localized string and slicing it apart —
// slicing is what breaks under RTL scripts and locales with different
// field ordering (e.g. year-month-day vs day-month-year).
function intlPart(
  temporal: TemporalLike,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes
): string {
  // Intl.DateTimeFormat.formatToParts() always throws on Temporal.ZonedDateTime
  // specifically — deliberate per spec (see
  // Temporal.ZonedDateTime.prototype.toLocaleString docs), not a bug here.
  // Fix: convert to an Instant and pass the zone through the formatter's own
  // `timeZone` option. Converting to PlainDateTime instead would silently
  // drop the timezone info, which breaks combining e.g. 'MMMM' with 'zzz'.
  const { toInstant, timeZoneId } = temporal;
  const isZoned = typeof toInstant === 'function' && typeof timeZoneId === 'string';
  // Must call as temporal.toInstant(), not the destructured toInstant() —
  // it's a prototype method that reads internal slots off `this`, so
  // calling the bare reference throws "incompatible receiver undefined".
  const intlSafeTemporal = isZoned ? temporal.toInstant!() : temporal;

  // Intl.DateTimeFormat hard-errors ("Mismatching Calendars") if the
  // formatter's resolved calendar doesn't match the Temporal object's own
  // calendar — an 'en-US' formatter defaults to gregory, so feeding it a
  // hebrew- or islamic-calendar PlainDate throws unless the formatter is
  // told which calendar to use. We read the calendar off the object itself
  // rather than guessing from the locale, so whatever calendar the caller's
  // Temporal object carries just works — not only Gregorian.
  //
  // Deliberately NOT passed when calendarId is 'iso8601' (the default for
  // plain Temporal objects nobody explicitly gave a calendar to): passing
  // `calendar: 'iso8601'` explicitly to Intl, combined with a single-field
  // options object like `{ month: 'long' }`, makes formatToParts() return
  // an empty parts array instead of the month — a real quirk in how Intl
  // resolves 'iso8601' with partial options, verified against
  // temporal-polyfill/full. Omitting the option entirely sidesteps it and
  // Intl's own default already matches what an iso8601 object needs.
  const calendar = temporal?.calendarId;
  const formatterOptions: Intl.DateTimeFormatOptions = {
    ...options,
    ...(calendar && calendar !== 'iso8601' ? { calendar } : {}),
    ...(isZoned ? { timeZone: timeZoneId } : {}),
  };

  // Real Temporal instances (and the Instant from toInstant() above)
  // satisfy Intl at runtime; TS's lib types just don't model that.
  const formatter = getFormatter(locale, formatterOptions);
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

// Each token knows how to render itself from a TemporalLike + locale, and
// which field it depends on (used to validate the input actually has that
// field before we try to format it).
type TokenHandler = (t: TemporalLike, locale: string) => string;

// Longest tokens first — the tokenizer is greedy, so "yyyy" must be tried
// before "yy" or it'll never match.
//
// Numeric tokens (yyyy, MM, dd, HH, mm, ss, SSS) deliberately always render
// in Western (0-9) digits regardless of locale, even though Intl could give
// us locale-native digits (Arabic-Indic, Devanagari, etc. via
// numberingSystem). Conscious choice, not an oversight: mixing locale
// numeral systems into our pad()-based width logic is a real rabbit hole
// (padding "٣" to 2 digits isn't the same operation as padding "3"), and
// most consumers parsing these strings back out (logs, APIs, filenames)
// want predictable ASCII digits. Documented as a known limitation in the
// README rather than silently guessed at here.
export const TOKENS: Array<[string, TokenHandler, keyof TemporalLike]> = [
  ['yyyy', (t) => pad(t.year!, 4), 'year'],
  // Negative years break the fixed 2-digit width (-45 % 100 === -45), and
  // truncating with Math.abs() would make 45 CE and 45 BCE render the same
  // string. Throw instead — use yyyy if you need the sign to survive.
  ['yy', (t) => {
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
  // dayPeriod ('AM'/'PM' in en-US, 'م'/'ص' in ar-EG, etc.) is locale-specific
  // — some locales render it differently or don't split 12-hour at all. We
  // still require .hour on the input either way, since that's what Intl
  // needs to compute which period it is.
  ['a', (t, locale) => intlPart(t, locale, { hour: 'numeric', hour12: true }, 'dayPeriod'), 'hour'],
  ['zzz', (t) => t.timeZoneId!, 'timeZoneId'],
];