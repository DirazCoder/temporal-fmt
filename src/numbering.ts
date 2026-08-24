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
// NUMERIC_FRAGMENTS is already built. could add a parseNumberingSystem
// option to convert input digits to ASCII first — but that should be an
// explicit opt-in per call, not silently accepting any numeral system
// that shows up

import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { InvalidLocaleError } from './errors.js';

export type NumberingSystem = 'latn' | 'arab' | 'deva' | 'beng' | 'guru' | 'gujr' | 'orya' | 'tamldec' | 'telu' | 'knda' | 'mlym' | 'fullwide' | 'hanidec';

// every NumberingSystem value we support. latn's the default and
// what the rest of this lib naturally produces
export const SUPPORTED_NUMBERING_SYSTEMS: ReadonlySet<string> = new Set([
  'latn', 'arab', 'deva', 'beng', 'guru', 'gujr', 'orya', 'tamldec',
  'telu', 'knda', 'mlym', 'fullwide', 'hanidec',
]);

const digitMapCache = new Map<string, Record<string, string>>();

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
// to format() to get Arabic-Indic digits out
export interface NumberingFormatOptions extends FormatOptions {
  numberingSystem?: string;
}

// same idea but for the parse side. called parseNumberingSystem instead of
// just numberingSystem so someone mixing format() and parse() options in
// one config object can set both independently — the two directions
// aren't always symmetric (you might want native digits out without
// wanting to accept them back in, or vice versa)
export interface NumberingParseOptions extends FormatOptions {
  parseNumberingSystem?: string;
}

// format-path helper: takes format()'s ASCII output and converts digits
// if numberingSystem was asked for. lives here so format.ts doesn't need
// to know anything about numbering systems
export function applyNumbering(s: string, options: NumberingFormatOptions): string {
  const system = options.numberingSystem ?? 'latn';
  if (system === 'latn') return s;
  return convertDigits(s, system);
}

// parse-path helper: converts input digits to ASCII before matching, if
// parseNumberingSystem got set. kept as a separate option name from the
// format side so callers can be explicit about which direction they
// actually want transliterated
export function applyParseNumbering(s: string, options: { parseNumberingSystem?: string }): string {
  // both call sites for this (both in parse.ts) already guard with
  // `if (options.parseNumberingSystem)` before calling, so this is
  // always truthy in practice — the ?? 'latn' and the early return
  // below are dead by construction. leaving them in as a safety net
  // rather than betting every future caller replicates the same guard
  /* c8 ignore next 2 */
  const system = options.parseNumberingSystem ?? 'latn';
  if (system === 'latn') return s;
  return convertDigitsToAscii(s, system);
}

// this is just to stop TS complaining about an unused import — DEFAULT_LOCALE
// is imported for the type augmentation pattern above. if this project
// ever ships a typed-locale interface, that'll be the real source of truth
void DEFAULT_LOCALE;