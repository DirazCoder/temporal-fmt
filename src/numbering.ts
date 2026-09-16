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

// numbering systems. latn (ASCII digits) is the default, but arab, deva,
// beng, etc are all options, configurable per format call.
//
// the tokens in this lib always spit out ASCII digits normally (check
// tokens.ts's pad() — just String(n), which is ASCII). this module bolts
// on the ability to convert that output to a locale's native digits via
// Intl.NumberFormat, since that's the standard way JS does digit
// transliteration anyway.
//
// parse side is stricter: parse() only accepts ASCII digits, matches how
// NUMERIC_FRAGMENTS is already built. parseNumberingSystem converts
// input digits to ASCII first — an explicit opt-in per call, never
// silently accepting any numeral system that shows up.
//
// both directions also accept 'auto': instead of requiring the caller to
// know the ICU numbering-system code for their locale, ask
// Intl.NumberFormat(locale).resolvedOptions().numberingSystem what the
// locale itself uses and transliterate with that.

import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { InvalidLocaleError } from './errors.js';
import { canonicalCacheKey, normalizeLocaleTag } from './localeVocab.js';

export type NumberingSystem = 'latn' | 'arab' | 'deva' | 'beng' | 'guru' | 'gujr' | 'orya' | 'tamldec' | 'telu' | 'knda' | 'mlym' | 'fullwide' | 'hanidec';

// What a caller may pass as numberingSystem / parseNumberingSystem: an
// explicit system name, or 'auto' to derive the system from the call's
// locale. The `(string & {})` keeps arbitrary strings compiling (the
// runtime still validates them against SUPPORTED_NUMBERING_SYSTEMS and
// throws on unknown names, unchanged) while editors still offer the
// known literals — 'latn', 'arab', ..., 'auto' — as completions.
export type NumberingSystemOption = NumberingSystem | 'auto' | (string & {});

// every NumberingSystem value we support. latn's the default and
// what the rest of this lib naturally produces
export const SUPPORTED_NUMBERING_SYSTEMS: ReadonlySet<string> = new Set([
  'latn', 'arab', 'deva', 'beng', 'guru', 'gujr', 'orya', 'tamldec',
  'telu', 'knda', 'mlym', 'fullwide', 'hanidec',
]);

const digitMapCache = new Map<string, Record<string, string>>();

// 'auto' resolutions, keyed by canonical locale tag (same key discipline
// as every other locale-keyed cache in this library — 'ar_EG' and 'ar-EG'
// fold together instead of costing two entries). Intl.NumberFormat
// construction isn't free and format() runs in loops (a table of dates, one
// row per record), so resolve each locale once. Bounded, evicting the
// oldest insertion, mirroring formatterCache in tokens.ts.
const autoNumberingCache = new Map<string, string>();
const MAX_AUTO_NUMBERING_CACHE = 500;

// Turns 'auto' into a concrete system by asking Intl what the locale
// itself defaults to (ar-EG -> arab, bn-BD -> beng, en-US -> latn). When
// the locale's native system isn't one this library can transliterate
// (thai, laoo, mymr, ... — anything outside SUPPORTED_NUMBERING_SYSTEMS),
// fall back to 'latn' rather than throwing: 'auto' means "use whatever
// this locale naturally uses, if you can", not "throw on locales with
// numerals this library doesn't cover". A malformed locale tag DOES
// throw — typed InvalidLocaleError, matching getFormatter() in tokens.ts —
// since asking to derive from a locale that doesn't exist is a caller bug,
// not a data condition to paper over.
function resolveAutoNumberingSystem(locale: string): string {
  const key = canonicalCacheKey(locale);
  const cached = autoNumberingCache.get(key);
  if (cached !== undefined) return cached;
  let resolved: string;
  try {
    resolved = new Intl.NumberFormat(normalizeLocaleTag(locale)).resolvedOptions().numberingSystem;
  } catch (err) {
    throw new InvalidLocaleError({ actual: locale, reason: (err as Error).message });
  }
  const system = SUPPORTED_NUMBERING_SYSTEMS.has(resolved) ? resolved : 'latn';
  if (autoNumberingCache.size >= MAX_AUTO_NUMBERING_CACHE) {
    // not real LRU, just evicts oldest insertion — fine for this key space
    const oldestKey = autoNumberingCache.keys().next().value;
    if (oldestKey !== undefined) autoNumberingCache.delete(oldestKey);
  }
  autoNumberingCache.set(key, system);
  return system;
}

// Shared front door for both option names. undefined stays 'latn' — the
// default is unchanged; 'auto' is an opt-in, not a new default. Anything
// else passes through untouched for convertDigits/convertDigitsToAscii
// to validate against the supported set (they throw on unknown names).
function resolveRequestedSystem(requested: string | undefined, locale: string | undefined): string {
  if (requested === undefined) return 'latn';
  if (requested === 'auto') return resolveAutoNumberingSystem(locale ?? DEFAULT_LOCALE);
  return requested;
}

// builds a digit-transliteration map per numbering system. renders 0-9
// through Intl.NumberFormat in the target system, then builds the lookup
// table from that. caching it since spinning up a formatter isn't free
// and we reuse the same map for every digit we convert
function getDigitMap(system: string): Record<string, string> {
  let map = digitMapCache.get(system);
  if (map) return map;
  /* c8 ignore start @preserve -- this branch is dead by construction, not
     just untested: both callers (convertDigits, convertDigitsToAscii)
     already bail out early on system === 'latn' before ever calling
     getDigitMap, so it never actually gets invoked with 'latn'. keeping
     it anyway as a defensive fallback rather than betting that stays
     true forever */
  if (system === 'latn') {
    map = {};
    for (let i = 0; i < 10; i++) map[String(i)] = String(i);
  } else {
    /* c8 ignore stop @preserve */
    const fmt = new Intl.NumberFormat('en-US-u-nu-' + system, { useGrouping: false });
    map = {};
    for (let i = 0; i < 10; i++) {
      map[String(i)] = fmt.format(i);
    }
  }
  digitMapCache.set(system, map);
  return map;
}

// swaps every ASCII digit in `s` for its equivalent in the target
// numbering system. anything that's not a digit passes through untouched
export function convertDigits(s: string, system: string): string {
  if (system === 'latn') return s;
  if (!SUPPORTED_NUMBERING_SYSTEMS.has(system)) {
    throw new InvalidLocaleError({ actual: system, reason: `numbering system "${system}" is not supported. Supported: ${[...SUPPORTED_NUMBERING_SYSTEMS].join(', ')}.` });
  }
  const map = getDigitMap(system);
  let result = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      // map[ch] is always populated for 0-9 — getDigitMap builds all ten
      // keys for every system we support, and ch is already range-checked
      // above. the ?? ch is really just there to satisfy TS about Record's
      // implicit undefined, not because this path is actually reachable
      /* c8 ignore next */
      result += map[ch] ?? ch;
    } else {
      result += ch;
    }
  }
  return result;
}

// inverse of convertDigits — takes non-ASCII digits back to ASCII. used
// by parse() when someone passes an explicit numberingSystem option.
// throws on anything unsupported
export function convertDigitsToAscii(s: string, system: string): string {
  // same dead-by-construction thing as the 'latn' guard above —
  // applyParseNumbering (the only caller) already returns early on
  // 'latn' before this ever gets called, so system's never actually
  // 'latn' here in practice. leaving the guard anyway in case someone
  // calls this directly someday without going through that guard
  /* c8 ignore next */
  if (system === 'latn') return s;
  if (!SUPPORTED_NUMBERING_SYSTEMS.has(system)) {
    throw new InvalidLocaleError({ actual: system, reason: `numbering system "${system}" is not supported.` });
  }
  const map = getDigitMap(system);
  // just flip the map around
  const reverse: Record<string, string> = {};
  for (const k of Object.keys(map)) reverse[map[k]!] = k;
  let result = '';
  for (const ch of s) {
    result += reverse[ch] ?? ch;
  }
  return result;
}

// FormatOptions plus a numberingSystem field. pass { numberingSystem: 'arab' }
// to format() to get Arabic-Indic digits out, or { numberingSystem: 'auto' }
// to use whichever numeral system the call's locale itself defaults to
// (ar-EG -> arab, bn-BD -> beng, en-US -> latn), resolved via
// Intl.NumberFormat(locale).resolvedOptions().numberingSystem with a
// 'latn' fallback for locales whose native system isn't supported here.
// Unset still means 'latn' — 'auto' is an opt-in, not a default change.
export interface NumberingFormatOptions extends FormatOptions {
  numberingSystem?: NumberingSystemOption;
}

// same idea but for the parse side. called parseNumberingSystem instead of
// just numberingSystem so someone mixing format() and parse() options in
// one config object can set both independently — the two directions
// aren't always symmetric (you might want native digits out without
// wanting to accept them back in, or vice versa). 'auto' works here too,
// resolving from the parse call's own locale the same way the format
// side does.
export interface NumberingParseOptions extends FormatOptions {
  parseNumberingSystem?: NumberingSystemOption;
}

// format-path helper: takes format()'s ASCII output and converts digits
// if numberingSystem was asked for. lives here so format.ts doesn't need
// to know anything about numbering systems
export function applyNumbering(s: string, options: NumberingFormatOptions): string {
  const system = resolveRequestedSystem(options.numberingSystem, options.locale);
  if (system === 'latn') return s;
  return convertDigits(s, system);
}

// parse-path helper: converts input digits to ASCII before matching, if
// parseNumberingSystem got set. kept as a separate option name from the
// format side so callers can be explicit about which direction they
// actually want transliterated
export function applyParseNumbering(s: string, options: { parseNumberingSystem?: string; locale?: string }): string {
  // both call sites for this (both in parse.ts) already guard with
  // `if (options.parseNumberingSystem)` before calling, so an undefined
  // parseNumberingSystem never actually reaches here from parse() itself —
  // the undefined handling inside resolveRequestedSystem is dead by
  // construction from that direction. leaving it in as a safety net
  // rather than betting every future caller replicates the same guard
  // (this is a public export; direct calls don't come pre-guarded).
  const system = resolveRequestedSystem(options.parseNumberingSystem, options.locale);
  if (system === 'latn') return s;
  return convertDigitsToAscii(s, system);
}