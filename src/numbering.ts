// Numbering systems (plan section G). Default: latn (ASCII digits).
// Optional: arab, deva, beng, etc. Configurable on formatting.
//
// The library's existing tokens always render ASCII digits (see
// tokens.ts's pad() — uses String(n) which produces ASCII). This
// module adds the ability to convert the output to a locale's native
// digits via Intl.NumberFormat, which is the standard mechanism JS
// provides for digit transliteration.
//
// On the parse side: parse() only accepts ASCII digits, matching how
// the existing NUMERIC_FRAGMENTS regex is built. A parseNumberingSystem
// option could convert input digits to ASCII before matching — but
// that's a per-call opt-in, not silent acceptance, per the plan's
// "explicit semantics rather than silently accepting every numeral
// system" instruction.

import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { InvalidLocaleError } from './errors.js';

export type NumberingSystem = 'latn' | 'arab' | 'deva' | 'beng' | 'guru' | 'gujr' | 'orya' | 'tamldec' | 'telu' | 'knda' | 'mlym' | 'fullwide' | 'hanidec';

// All NumberingSystem values the plan calls out as supported. latn is
// the default and what the rest of the library produces natively.
export const SUPPORTED_NUMBERING_SYSTEMS: ReadonlySet<string> = new Set([
  'latn', 'arab', 'deva', 'beng', 'guru', 'gujr', 'orya', 'tamldec',
  'telu', 'knda', 'mlym', 'fullwide', 'hanidec',
]);

const digitMapCache = new Map<string, Record<string, string>>();

// Builds a per-numbering-system digit transliteration map. Uses
// Intl.NumberFormat to render 0-9 in the requested system, then
// builds the lookup table. Cached because constructing a formatter
// is expensive and we re-use the same map for every digit in the
// output.
function getDigitMap(system: string): Record<string, string> {
  let map = digitMapCache.get(system);
  if (map) return map;
  if (system === 'latn') {
    map = {};
    for (let i = 0; i < 10; i++) map[String(i)] = String(i);
  } else {
    const fmt = new Intl.NumberFormat('en-US-u-nu-' + system, { useGrouping: false });
    map = {};
    for (let i = 0; i < 10; i++) {
      map[String(i)] = fmt.format(i);
    }
  }
  digitMapCache.set(system, map);
  return map;
}

// Converts every ASCII digit in `s` to its equivalent in the requested
// numbering system. Non-digit characters pass through unchanged.
export function convertDigits(s: string, system: string): string {
  if (system === 'latn') return s;
  if (!SUPPORTED_NUMBERING_SYSTEMS.has(system)) {
    throw new InvalidLocaleError({ actual: system, reason: `numbering system "${system}" is not supported. Supported: ${[...SUPPORTED_NUMBERING_SYSTEMS].join(', ')}.` });
  }
  const map = getDigitMap(system);
  let result = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      result += map[ch] ?? ch;
    } else {
      result += ch;
    }
  }
  return result;
}

// Parses a string with non-ASCII digits back to ASCII. The inverse of
// convertDigits — used by parse() when an explicit `numberingSystem`
// option is passed. Throws on unsupported systems.
export function convertDigitsToAscii(s: string, system: string): string {
  if (system === 'latn') return s;
  if (!SUPPORTED_NUMBERING_SYSTEMS.has(system)) {
    throw new InvalidLocaleError({ actual: system, reason: `numbering system "${system}" is not supported.` });
  }
  const map = getDigitMap(system);
  // Build reverse map.
  const reverse: Record<string, string> = {};
  for (const k of Object.keys(map)) reverse[map[k]!] = k;
  let result = '';
  for (const ch of s) {
    result += reverse[ch] ?? ch;
  }
  return result;
}

// Augmented FormatOptions that includes the numberingSystem field.
// Callers pass { numberingSystem: 'arab' } to format() to get Arabic-
// Indic digits in the output.
export interface NumberingFormatOptions extends FormatOptions {
  numberingSystem?: string;
}

// Helper for the format path: takes the formatted ASCII output of
// format() and converts digits if a numberingSystem was requested.
// Kept here so format.ts doesn't need to know about numbering systems.
export function applyNumbering(s: string, options: NumberingFormatOptions): string {
  const system = options.numberingSystem ?? 'latn';
  if (system === 'latn') return s;
  return convertDigits(s, system);
}

// Helper for the parse path: converts input digits to ASCII before
// matching, when parseNumberingSystem is set. Distinct from the format
// path's option name (numberingSystem vs parseNumberingSystem) so a
// caller can be explicit about which direction they want transliterated.
export function applyParseNumbering(s: string, options: { parseNumberingSystem?: string }): string {
  const system = options.parseNumberingSystem ?? 'latn';
  if (system === 'latn') return s;
  return convertDigitsToAscii(s, system);
}

// Suppress unused-import warning. DEFAULT_LOCALE is imported for the
// type augmentation pattern above; if the project ever exports a
// typed-locale interface, it'll be the source of truth for the default.
void DEFAULT_LOCALE;
