// Name lists for the locale-aware tokens (MMMM, MMM, EEEE, EEE, a). Each
// list is small and fixed (12 months, 7 weekdays, 2 day periods), so we
// generate the real Intl strings for a locale once and cache them.

import { InvalidLocaleError } from './errors.js';

export interface LocaleVocab {
  monthLong: string[]; // index 0 = January
  monthShort: string[];
  weekdayLong: string[]; // index 0 = Monday, per Temporal's dayOfWeek numbering
  weekdayShort: string[];
  dayPeriod: string[]; // typically [AM-ish, PM-ish], deduped
}

// Custom vocabs registered by callers for locales Intl doesn't cover well
// (e.g. a 13-month Hebrew leap year, where Intl's 12-month vocabulary
// silently loses a whole month). Keyed by canonical cache key so the
// same locale string spelling variants fold together — same convention
// as the Intl-derived vocab cache above.
const customVocabs = new Map<string, LocaleVocab>();
const MAX_CUSTOM_VOCABS = 500;
const MAX_LOCALE_TAG_LENGTH = 256;
const MAX_VOCAB_ENTRY_LENGTH = 256;

function assertValidVocab(vocab: Partial<LocaleVocab>, locale: string): void {
  // Strict shape validation at registration time, not lazily on first
  // use — the README's promise is that a malformed registration throws
  // descriptively here, rather than failing later inside format()/parse()
  // with a confusing "no month part" or wrong-month error the caller
  // can't trace back to the bad registration.
  const required: Array<{ key: keyof LocaleVocab; length: number; label: string }> = [
    { key: 'monthLong', length: 12, label: 'long month names' },
    { key: 'monthShort', length: 12, label: 'short month names' },
    { key: 'weekdayLong', length: 7, label: 'long weekday names' },
    { key: 'weekdayShort', length: 7, label: 'short weekday names' },
    { key: 'dayPeriod', length: 2, label: 'day period markers (AM/PM-equivalent)' },
  ];

  for (const { key, length, label } of required) {
    const value = vocab[key];
    if (value === undefined) {
      throw new Error(
        `temporal-fmt: registerLocaleVocab for locale "${locale}" is missing required field "${key}" (${label}).`
      );
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `temporal-fmt: registerLocaleVocab for locale "${locale}": "${key}" must be an array, got ${typeof value}.`
      );
    }
    if (value.length !== length) {
      throw new Error(
        `temporal-fmt: registerLocaleVocab for locale "${locale}": "${key}" must have exactly ${length} entries (got ${value.length}) — ${label}.`
      );
    }
    value.forEach((entry, i) => {
      if (typeof entry !== 'string' || entry.length === 0) {
        throw new Error(
          `temporal-fmt: registerLocaleVocab for locale "${locale}": "${key}[${i}]" must be a non-empty string, got ${String(entry)}.`
        );
      }
      if (entry.length > MAX_VOCAB_ENTRY_LENGTH) {
        throw new RangeError(
          `temporal-fmt: registerLocaleVocab for locale "${locale}": "${key}[${i}]" is too long (maximum ${MAX_VOCAB_ENTRY_LENGTH} characters).`
        );
      }
    });
  }

  // Reuse the same collision check the Intl-derived path uses — a
  // duplicate month name is just as ambiguous when supplied by a caller
  // as when produced by Intl.
  assertNoCollision(vocab.monthLong!, 'MMMM month', locale);
  assertNoCollision(vocab.monthShort!, 'MMM month', locale);
  assertNoCollision(vocab.weekdayLong!, 'EEEE weekday', locale);
  assertNoCollision(vocab.weekdayShort!, 'EEE weekday', locale);

  // dayPeriod entries must differ from each other, or parse()'s
  // isPM check (raw === vocab.dayPeriod[1]) can never return true and
  // every 12-hour parse silently resolves to AM. The Intl-derived path
  // dedupes a same-AM/PM collision to length 1, but a caller passing
  // both entries identical is a real bug to surface — not something to
  // dedupe around.
  if (vocab.dayPeriod![0] === vocab.dayPeriod![1]) {
    throw new Error(
      `temporal-fmt: registerLocaleVocab for locale "${locale}": dayPeriod entries must differ ` +
      `(both are "${vocab.dayPeriod![0]}"); otherwise parse() can't tell AM from PM.`
    );
  }
}

/**
 * Supply a custom month/weekday/day-period vocabulary for a locale key,
 * overriding the Intl-derived vocab this library would otherwise build
 * for that key. Useful for locales Intl doesn't cover well — the README's
 * known-limitations section calls out the Hebrew leap-month gap as a
 * specific case this addresses.
 *
 * Throws descriptively on malformed input (wrong array lengths, empty
 * strings, duplicate entries, missing fields) rather than failing later
 * during format/parse.
 *
 * Registered vocab takes precedence over the Intl-derived vocab for that
 * locale key, including for already-cached entries — registering
 * invalidates the prior cache entry for that locale so the next call
 * picks up the new vocab.
 *
 * @example
 * registerLocaleVocab('en-u-ca-hebrew-leap', {
 *   monthLong: ['Nisan','Iyar','Sivan','Tammuz','Av','Elul','Tishrei','Marcheshvan','Kislev','Tevet','Shevat','Adar I','Adar II'],
 *   monthShort: ['Nis','Iyy','Siv','Tam','Av','Elu','Tish','Chesh','Kis','Tev','Shv','Ad1','Ad2'],
 *   weekdayLong: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
 *   weekdayShort: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
 *   dayPeriod: ['AM','PM'],
 * });
 */
export function registerLocaleVocab(locale: string, vocab: Partial<LocaleVocab>): void {
  if (typeof locale !== 'string' || locale.length === 0) {
    throw new Error(`temporal-fmt: registerLocaleVocab requires a non-empty locale string, got ${String(locale)}.`);
  }
  if (locale.length > MAX_LOCALE_TAG_LENGTH) {
    throw new RangeError(`temporal-fmt: registerLocaleVocab locale is too long (maximum ${MAX_LOCALE_TAG_LENGTH} characters).`);
  }
  assertValidVocab(vocab, locale);

  const cacheKey = canonicalCacheKey(locale);
  if (!customVocabs.has(cacheKey) && customVocabs.size >= MAX_CUSTOM_VOCABS) {
    throw new RangeError(`temporal-fmt: registerLocaleVocab reached the ${MAX_CUSTOM_VOCABS}-locale limit.`);
  }
  customVocabs.set(cacheKey, {
    monthLong: [...vocab.monthLong!],
    monthShort: [...vocab.monthShort!],
    weekdayLong: [...vocab.weekdayLong!],
    weekdayShort: [...vocab.weekdayShort!],
    dayPeriod: [...vocab.dayPeriod!],
  });
  // Invalidate the Intl-derived cache entry so any prior format/parse
  // result cached for this locale is rebuilt against the new vocab. Not
  // strictly necessary (getLocaleVocab checks customVocabs first), but
  // cheap and keeps the two caches from drifting out of sync.
  vocabCache.delete(cacheKey);
}

// Every locale-keyed cache in this library (this one, formatterCache in
// tokens.ts, patternCache/calendarCache in parse.ts) used to key on the
// exact locale string a caller passed in. Intl treats spelling variants of
// the same locale as equivalent ('en-US' / 'en-us' / 'en_US' all resolve
// the same way), but a plain string-keyed Map doesn't — so callers mixing
// spellings for what's really one locale would silently fragment across
// separate cache entries instead of sharing one, making the bounded
// eviction limits (MAX_*_CACHE_SIZE) less effective than they look. This
// doesn't change any cache's *correctness* (each entry is still built from
// -- and valid for -- whatever locale string produced it), only how many
// distinct entries equivalent spellings end up costing. Falls back to the
// original string on a malformed/unrecognized tag rather than throwing —
// cache-key normalization shouldn't be where a bad locale first surfaces
// as an error; whatever actually calls `new Intl.DateTimeFormat(locale)`
// downstream is the right place for that.
export function canonicalCacheKey(locale: string): string {
  try {
    // Intl.Locale requires BCP-47 hyphens and rejects underscore-separated
    // tags like 'en_US' outright (RangeError), rather than normalizing
    // them — so without this replace, that spelling would just fall
    // through to the catch below and never fold with 'en-US'.
    return new Intl.Locale(locale.replace(/_/g, '-')).toString().toLowerCase();
  } catch {
    return locale;
  }
}

const vocabCache = new Map<string, LocaleVocab>();
const MAX_VOCAB_CACHE_SIZE = 500;

// Some locales (ja-JP) split a field across two parts — month "8" plus a
// counter suffix "月" as a separate sibling "literal" — while format()'s
// tokens go through toLocaleString(), which concatenates everything into
// "8月". Reading only the type-tagged part used to drop that suffix, so
// this locale's vocab never matched what format() actually produced.
// Only merges *adjacent* literals, not the whole string, since the
// dayPeriod/weekday formatters below carry an extra hour part that a
// join-everything approach would wrongly absorb.
function partValue(formatter: Intl.DateTimeFormat, date: Date, type: Intl.DateTimeFormatPartTypes): string {
  const parts = formatter.formatToParts(date);
  const index = parts.findIndex((p) => p.type === type);
  /* c8 ignore start @preserve -- defensive guard against a real but
     unreproducible failure mode: an Intl implementation that omits the
     requested part type entirely for some locale. Checked every locale
     with unusual dayPeriod/weekday/month rendering available in this
     runtime's ICU data (ja-JP, zh-CN, th-TH, he-IL, ar-SA, ko-KR, fa-IR)
     against the exact formatter options getLocaleVocab uses (notably
     hour12: true for the dayPeriod formatter, which is what makes every
     locale here actually emit a dayPeriod part — omitting it is what
     produced a false "gap" during investigation). None omit their part
     on this runtime. A different ICU version or a non-Node Intl
     implementation could plausibly behave differently, so this stays a
     real check rather than an assertion. */
  /* c8 ignore start @preserve */
  if (index === -1) {
    throw new InvalidLocaleError({
      message: `temporal-fmt: locale produced no "${type}" part while building match vocabulary.`,
    });
  }
  /* c8 ignore stop @preserve */
  let value = parts[index]!.value;
  const prev = parts[index - 1];
  const next = parts[index + 1];
  // skip whitespace literals (the separator before "AM") — only a
  // no-space suffix like ja-JP's "月" should get folded in
  if (prev?.type === 'literal' && !/\s/.test(prev.value)) value = prev.value + value;
  if (next?.type === 'literal' && !/\s/.test(next.value)) value = value + next.value;
  return value;
}

// Two entries rendering identically means parse()'s reverse lookup
// (indexOf) can never tell them apart. Weekday collisions already surface
// via parse()'s dayOfWeek cross-check, but with a confusing same-string
// error; months have no equivalent cross-check, so a collision there would
// otherwise resolve silently to the wrong month. Catching both here, once
// at build time, gives one clear error instead.
function assertNoCollision(names: string[], label: string, locale: string): void {
  const seen = new Map<string, number>();
  for (let i = 0; i < names.length; i++) {
    const prior = seen.get(names[i]!);
    if (prior !== undefined) {
      // Not migrated to a typed error: this function is shared between
      // getLocaleVocab's Intl-derived path (data-path error, would be a
      // good InvalidLocaleError candidate) and assertValidVocab's
      // registration-time check (out of scope for this pass — see the
      // localeVocab.ts registration-error follow-up). Splitting this into
      // two near-duplicate functions just to route error types
      // differently isn't worth it for one throw; revisit together with
      // the registration-error work instead.
      throw new Error(
        `temporal-fmt: locale "${locale}" renders ${label} index ${prior} and ${i} identically ` +
        `("${names[i]}"). parse() can't reliably tell these apart for this locale/token, so this ` +
        `combination isn't supported.`
      );
    }
    seen.set(names[i]!, i);
  }
}

// Exposed for tokens.ts: when a custom vocab is registered for this
// locale, format()'s locale-aware tokens (MMMM/MMM/EEEE/EEE/a) read
// straight from the registered array instead of going through
// Intl.DateTimeFormat. Without this override, format() would silently
// keep producing Intl's strings while parse() matched against the
// registered vocab — the two would round-trip-fail.
export function getCustomVocab(locale: string): LocaleVocab | undefined {
  const cacheKey = canonicalCacheKey(locale);
  return customVocabs.get(cacheKey);
}

export function getLocaleVocab(locale: string): LocaleVocab {
  const cacheKey = canonicalCacheKey(locale);
  // Registered vocabs take precedence over the Intl-derived one — this
  // is the override mechanism registerLocaleVocab() promises. Checking
  // here, before the Intl cache lookup, means a registration that
  // happens *after* the first Intl-derived vocab was built still takes
  // effect on the next call.
  const custom = customVocabs.get(cacheKey);
  if (custom) {
    return custom;
  }
  const cached = vocabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const monthLongFmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const monthShortFmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const monthLong: string[] = [];
  const monthShort: string[] = [];
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(2020, m, 1));
    monthLong.push(partValue(monthLongFmt, date, 'month'));
    monthShort.push(partValue(monthShortFmt, date, 'month'));
  }
  assertNoCollision(monthLong, 'MMMM month', locale);
  assertNoCollision(monthShort, 'MMM month', locale);

  const weekdayLongFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const weekdayShortFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const weekdayLong: string[] = [];
  const weekdayShort: string[] = [];
  // 2024-01-01 is a Monday (UTC) — walk 7 days from there for weekday names
  for (let d = 0; d < 7; d++) {
    const date = new Date(Date.UTC(2024, 0, 1 + d));
    weekdayLong.push(partValue(weekdayLongFmt, date, 'weekday'));
    weekdayShort.push(partValue(weekdayShortFmt, date, 'weekday'));
  }
  // redundant with parse()'s dayOfWeek cross-check, but gives a clearer error
  assertNoCollision(weekdayLong, 'EEEE weekday', locale);
  assertNoCollision(weekdayShort, 'EEE weekday', locale);

  const dayPeriodFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const am = partValue(dayPeriodFmt, new Date(Date.UTC(2020, 0, 1, 1)), 'dayPeriod');
  const pm = partValue(dayPeriodFmt, new Date(Date.UTC(2020, 0, 1, 13)), 'dayPeriod');
  const dayPeriod = [...new Set([am, pm])];

  const vocab: LocaleVocab = { monthLong, monthShort, weekdayLong, weekdayShort, dayPeriod };
  if (vocabCache.size >= MAX_VOCAB_CACHE_SIZE) {
    const oldestKey = vocabCache.keys().next().value;
    if (oldestKey !== undefined) vocabCache.delete(oldestKey);
  }
  vocabCache.set(cacheKey, vocab);
  return vocab;
}