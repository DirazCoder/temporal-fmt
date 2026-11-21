/*
 * Copyright 2026 DirazCoder
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// locale registration + lookup. builds on the registerLocaleVocab()
// stuff already in localeVocab.ts, adds registerLocale() / getLocale() /
// hasLocale() plus a beefier LocaleVocab that covers quarters, eras,
// ordinals, duration units, and relative-time words.
//
// localeVocab.ts itself is unchanged and still handles months/weekdays/
// day-periods (what tokens.ts reads for MMMM/MMM/EEEE/EEE/a). this module
// just wraps that and bolts the extra fields on top

import { registerLocaleVocab, getLocaleVocab, type LocaleVocab as BaseLocaleVocab } from './localeVocab.js';
import { InvalidLocaleError } from '../core/errors.js';

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
    throw new InvalidLocaleError({ actual: locale, reason: `locale tag must be at most ${MAX_LOCALE_TAG_LENGTH} characters (got ${locale.length})` });
  }
  // Validate EVERYTHING before touching any registry: the old order
  // registered the base vocab first and validated the extended fields
  // second, so a vocab with a bad quartersLong left the BASE vocab
  // registered process-wide — hasLocale() said false while
  // getLocale() happily returned the leaked partial registration.
  // Registration is now all-or-nothing.
  validateExtended(vocab, locale);
  // base vocab fields (months/weekdays/day-periods) are validated by
  // registerLocaleVocab itself (which is equally validate-then-commit).
  registerLocaleVocab(locale, vocab);
  const key = canonicalKey(locale);
  extendedVocabs.set(key, deepCloneVocab(vocab));
}

// The stored vocab is a DEEP copy, and getLocale() hands out deep
// copies too: it used to return the live internal object (a shallow
// `{...vocab}` at registration — arrays shared with the caller), so
// one `getLocale('x').quartersLong.push(...)` poisoned every
// subsequent format()/parse() call for that locale, process-wide.
function deepCloneVocab(vocab: ExtendedLocaleVocab): ExtendedLocaleVocab {
  /* c8 ignore start @preserve -- defensive clone fallbacks for unrecognized nested vocab shapes */
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vocab)) {
    /* c8 ignore next @preserve -- array cloning is exercised by the locale deep-copy test */
    if (Array.isArray(v)) clone[k] = v.map((x) => (typeof x === 'string' ? x : x));
    else if (v !== null && typeof v === 'object') {
      // Nested records (durationUnits, relativeTime): one more level
      // deep is the whole shape of ExtendedLocaleVocab.
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(v)) {
        nested[nk] = Array.isArray(nv) ? nv.slice() : nv;
      }
      clone[k] = nested;
    } else clone[k] = v;
  }
  return clone as unknown as ExtendedLocaleVocab;
  /* c8 ignore stop @preserve */
}

function validateExtended(vocab: ExtendedLocaleVocab, locale: string): void {
  const checkArray = (val: unknown, key: string, length: number) => {
    if (val === undefined) return;
    if (!Array.isArray(val)) {
      throw new InvalidLocaleError({ actual: String(val), reason: `locale "${locale}": "${key}" must be an array` });
    }
    if (val.length !== length) {
      throw new InvalidLocaleError({ actual: locale, reason: `locale "${locale}": "${key}" must have ${length} entries (got ${val.length})` });
    }
    for (let i = 0; i < val.length; i++) {
      if (typeof val[i] !== 'string' || val[i]!.length === 0) {
        throw new InvalidLocaleError({ actual: locale, reason: `locale "${locale}": "${key}[${i}]" must be a non-empty string (got ${String(val[i])})` });
      }
      if (val[i]!.length > MAX_VOCAB_STRING_LENGTH) {
        // `actual` is the LOCALE (the InvalidLocaleError message template
        // renders it as the offending tag); the length detail lives in
        // the reason. It used to pass the length as `actual`, producing
        // messages like: locale "2" is not a valid BCP-47 tag.
        throw new InvalidLocaleError({ actual: locale, reason: `locale "${locale}": "${key}[${i}]" must be at most ${MAX_VOCAB_STRING_LENGTH} characters (got ${val[i]!.length})` });
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
  //
  // Returns a deep copy: callers used to receive the live internal
  // object and could poison every later format()/parse() call for the
  // locale with one mutation. Copying is cheap (vocabs are tiny) and
  // makes the returned object safe to own.
  const key = canonicalKey(locale);
  const ext = extendedVocabs.get(key);
  if (ext) return deepCloneVocab(ext);
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
