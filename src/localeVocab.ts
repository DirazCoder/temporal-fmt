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

function partValue(formatter: Intl.DateTimeFormat, date: Date, type: Intl.DateTimeFormatPartTypes): string {
  const part = formatter.formatToParts(date).find((p) => p.type === type);
  if (!part) {
    throw new Error(`temporal-fmt: locale produced no "${type}" part while building match vocabulary.`);
  }
  return part.value;
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

  const dayPeriodFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const am = partValue(dayPeriodFmt, new Date(Date.UTC(2020, 0, 1, 1)), 'dayPeriod');
  const pm = partValue(dayPeriodFmt, new Date(Date.UTC(2020, 0, 1, 13)), 'dayPeriod');
  const dayPeriod = [...new Set([am, pm])];

  const vocab: LocaleVocab = { monthLong, monthShort, weekdayLong, weekdayShort, dayPeriod };
  vocabCache.set(locale, vocab);
  return vocab;
}
