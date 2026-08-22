// Locale registration and lookup (plan section F). Extends the
// existing registerLocaleVocab() surface in localeVocab.ts with
// registerLocale() / getLocale() / hasLocale() and a richer LocaleVocab
// that covers quarters, eras, ordinals, duration units, and relative-
// time language.
//
// The existing localeVocab.ts stays as the implementation for months/
// weekdays/day-periods (those are what tokens.ts's MMMM/MMM/EEEE/EEE/a
// tokens read). This module wraps it and adds the extended fields.

import { registerLocaleVocab, getLocaleVocab, type LocaleVocab as BaseLocaleVocab } from './localeVocab.js';
import { InvalidLocaleError } from './errors.js';

export interface ExtendedLocaleVocab extends BaseLocaleVocab {
  // Quarters: Q1..Q4 long form ("First quarter", etc.). Default falls
  // back to "Q1".."Q4" if not registered.
  quartersLong?: string[];
  quartersShort?: string[];
  // Eras: ["BC", "AD"] for gregory, etc. Default ["BC", "AD"].
  erasLong?: string[];
  erasShort?: string[];
  // Ordinal suffix rules: ["st", "nd", "rd", "th"] for English. Default
  // empty (the existing 'do' token has English-only ordinal logic baked
  // into tokens.ts; this field lets a custom locale override it).
  ordinals?: string[];
  // Duration unit names: long singular/plural for each unit. Used by
  // formatDuration's locale-aware path when Intl.NumberFormat isn't
  // desired (e.g. for a made-up locale Intl doesn't know about).
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
  // Relative-time language: words for "ago" / "in" / "now". Used by
  // formatRelative()'s locale-aware path when Intl.RelativeTimeFormat
  // isn't available or doesn't cover a registered locale.
  relativeTime?: {
    past: string;
    future: string;
    now: string;
  };
}

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
  // Validate the base vocab fields (months/weekdays/day-periods) via
  // the existing registerLocaleVocab — it has the strict-shape checks.
  registerLocaleVocab(locale, vocab);
  // Extended fields are optional; only validate the ones that are present.
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
  // Returns the extended vocab for a locale, OR undefined (falls back
  // to Intl). Combines the base vocab (from localeVocab.ts, which
  // includes Intl defaults) with any extended fields registered here.
  const key = canonicalKey(locale);
  const ext = extendedVocabs.get(key);
  if (ext) return ext;
  // Fall back to base vocab (Intl-derived) without extended fields.
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

// Re-export the base vocab types for callers that want them.
export type { LocaleVocab } from './localeVocab.js';
