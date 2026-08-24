// locale registration + lookup. builds on the registerLocaleVocab()
// stuff already in localeVocab.ts, adds registerLocale() / getLocale() /
// hasLocale() plus a beefier LocaleVocab that covers quarters, eras,
// ordinals, duration units, and relative-time words.
//
// localeVocab.ts itself is unchanged and still handles months/weekdays/
// day-periods (what tokens.ts reads for MMMM/MMM/EEEE/EEE/a). this module
// just wraps that and bolts the extra fields on top

import { registerLocaleVocab, getLocaleVocab, type LocaleVocab as BaseLocaleVocab } from './localeVocab.js';
import { InvalidLocaleError } from './errors.js';

export interface ExtendedLocaleVocab extends BaseLocaleVocab {
  // Q1-Q4 long form ("First quarter" etc). falls back to "Q1".."Q4" if
  // nothing's registered
  quartersLong?: string[];
  quartersShort?: string[];
  // like ["BC", "AD"] for gregory. defaults to ["BC", "AD"]
  erasLong?: string[];
  erasShort?: string[];
  // suffixes like ["st", "nd", "rd", "th"] for English. empty by default —
  // the 'do' token already has English ordinal logic hardcoded in
  // tokens.ts, this just lets a custom locale override that
  ordinals?: string[];
  // long singular/plural names per unit. used by formatDuration's
  // locale-aware path for cases where Intl.NumberFormat won't cut it,
  // like a made-up locale Intl's never heard of
  durationUnits?: {
    years: [string, string];
    months: [string, string];
    weeks: [string, string];
    days: [string, string];
    hours: [string, string];
    minutes: [string, string];
    seconds: [string, string];
    milliseconds: [string, string];
  };
  // words for "ago" / "in" / "now". used by formatRelative()'s
  // locale-aware path when Intl.RelativeTimeFormat isn't around or
  // doesn't know about a locale someone registered
  relativeTime?: {
    past: string;
    future: string;
    now: string;
  };
}

// bounded indirectly — everything added here goes through registerLocale(),
// which calls registerLocaleVocab() first, and THAT registry already caps
// out at 500 new locales (MAX_CUSTOM_VOCABS, throws RangeError past it).
// so extendedVocabs can never actually exceed 500 keys, no need for a
// separate cap here (would just be dead code anyway)
const extendedVocabs = new Map<string, ExtendedLocaleVocab>();
const MAX_LOCALE_TAG_LENGTH = 256;
const MAX_VOCAB_STRING_LENGTH = 256;

function canonicalKey(locale: string): string {
  try {
    return new Intl.Locale(locale.replace(/_/g, '-')).toString().toLowerCase();
  } catch {
    return locale;
  }
}

export function registerLocale(locale: string, vocab: ExtendedLocaleVocab): void {
  if (typeof locale !== 'string' || locale.length === 0) {
    throw new InvalidLocaleError({ actual: String(locale), reason: 'locale string must be non-empty' });
  }
  if (locale.length > MAX_LOCALE_TAG_LENGTH) {
    throw new InvalidLocaleError({ actual: String(locale.length), reason: `locale tag must be at most ${MAX_LOCALE_TAG_LENGTH} characters` });
  }
  // base vocab fields (months/weekdays/day-periods) get validated by
  // registerLocaleVocab already, it's got the strict shape checks
  registerLocaleVocab(locale, vocab);
  // extended fields are all optional, only check the ones actually there
  validateExtended(vocab, locale);
  const key = canonicalKey(locale);
  extendedVocabs.set(key, { ...vocab });
}

function validateExtended(vocab: ExtendedLocaleVocab, locale: string): void {
  const checkArray = (val: unknown, key: string, length: number) => {
    if (val === undefined) return;
    if (!Array.isArray(val)) {
      throw new InvalidLocaleError({ actual: String(val), reason: `locale "${locale}": "${key}" must be an array` });
    }
    if (val.length !== length) {
      throw new InvalidLocaleError({ actual: String(val.length), reason: `locale "${locale}": "${key}" must have ${length} entries (got ${val.length})` });
    }
    for (let i = 0; i < val.length; i++) {
      if (typeof val[i] !== 'string' || val[i]!.length === 0) {
        throw new InvalidLocaleError({ actual: String(val[i]), reason: `locale "${locale}": "${key}[${i}]" must be a non-empty string` });
      }
      if (val[i]!.length > MAX_VOCAB_STRING_LENGTH) {
        throw new InvalidLocaleError({ actual: String(val[i]!.length), reason: `locale "${locale}": "${key}[${i}]" must be at most ${MAX_VOCAB_STRING_LENGTH} characters` });
      }
    }
  };
  checkArray(vocab.quartersLong, 'quartersLong', 4);
  checkArray(vocab.quartersShort, 'quartersShort', 4);
  checkArray(vocab.erasLong, 'erasLong', 2);
  checkArray(vocab.erasShort, 'erasShort', 2);
  checkArray(vocab.ordinals, 'ordinals', 4);
}

export function getLocale(locale: string): ExtendedLocaleVocab | undefined {
  // gives back the extended vocab for a locale, or undefined if there's
  // nothing (falls back to Intl at that point). combines the base vocab
  // (from localeVocab.ts, Intl-derived) with whatever extended fields
  // got registered here
  const key = canonicalKey(locale);
  const ext = extendedVocabs.get(key);
  if (ext) return ext;
  // nothing extended registered — just fall back to the base Intl vocab
  try {
    const base = getLocaleVocab(locale);
    return { ...base };
  } catch {
    return undefined;
  }
}

export function hasLocale(locale: string): boolean {
  const key = canonicalKey(locale);
  return extendedVocabs.has(key);
}

// re-exporting the base vocab types in case anyone wants them
export type { LocaleVocab } from './localeVocab.js';
