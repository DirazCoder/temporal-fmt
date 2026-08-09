// Name lists for the locale-aware tokens (MMMM, MMM, EEEE, EEE, a). Each
// list is small and fixed (12 months, 7 weekdays, 2 day periods), so we
// generate the real Intl strings for a locale once and cache them.

export interface LocaleVocab {
  monthLong: string[]; // index 0 = January
  monthShort: string[];
  weekdayLong: string[]; // index 0 = Monday, per Temporal's dayOfWeek numbering
  weekdayShort: string[];
  dayPeriod: string[]; // typically [AM-ish, PM-ish], deduped
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
  if (index === -1) {
    throw new Error(`temporal-fmt: locale produced no "${type}" part while building match vocabulary.`);
  }
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
      throw new Error(
        `temporal-fmt: locale "${locale}" renders ${label} index ${prior} and ${i} identically ` +
        `("${names[i]}"). parse() can't reliably tell these apart for this locale/token, so this ` +
        `combination isn't supported.`
      );
    }
    seen.set(names[i]!, i);
  }
}

export function getLocaleVocab(locale: string): LocaleVocab {
  const cached = vocabCache.get(locale);
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
  vocabCache.set(locale, vocab);
  return vocab;
}