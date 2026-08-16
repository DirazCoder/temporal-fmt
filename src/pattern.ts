import { getLocaleVocab } from './localeVocab.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(values: string[]): string {
  return `(?:${values.map(escapeRegExp).join('|')})`;
}

// Every real IANA zone id is letters/digits/'_'/'+'/'-' segments joined by
// '/' (e.g. "America/Argentina/Buenos_Aires", "Etc/GMT+12"); UTC and
// fixed-offset strings are the only other shapes zzz accepts. Matching that
// *shape* here — instead of alternating every zone name inline — keeps the
// compiled regex small regardless of how many zzz tokens appear in a
// format string. Without this, a format string could repeat "zzz" up to
// the MAX_FORMAT_LENGTH limit and force the regex engine to compile and
// match a pattern with the entire zone list duplicated at every
// occurrence — MAX_FORMAT_LENGTH caps the *source* length, not the size of
// what it expands into, so that cap alone didn't bound the actual cost.
// The captured text is checked against the real zone set in
// isValidTimeZone() after the overall pattern matches, so this is a
// matching-cost change, not a validation-strictness change: a bogus zone
// id still fails "no valid pattern matches", just via the post-match
// check now instead of the regex alternation itself.
const TIME_ZONE_SHAPE = '(?:UTC|[+-]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?|[A-Za-z_]+(?:[+-]\\d{1,2})?(?:\\/[A-Za-z0-9_+-]+)*)';

function getTimeZoneFragment(): string {
  return TIME_ZONE_SHAPE;
}

let validZoneSet: Set<string> | undefined;

// Real zone ids plus the couple of aliases zzz has always accepted even
// though Intl.supportedValuesOf('timeZone') doesn't list them (UTC isn't
// itself an IANA zone name, it's the identity offset). Falls back to
// undefined when Intl.supportedValuesOf isn't available — see
// isValidTimeZone below for what that means for validation.
function getValidZoneSet(): Set<string> | undefined {
  if (validZoneSet) {
    return validZoneSet;
  }
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf !== 'function') {
    return undefined;
  }
  validZoneSet = new Set(supportedValuesOf('timeZone'));
  validZoneSet.add('UTC');
  return validZoneSet;
}

const FIXED_OFFSET_RE = /^[+-]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;

// Called post-match on whatever the bounded TIME_ZONE_SHAPE captured, since
// that shape is deliberately looser than "a real zone id" (it has to be, to
// stay a fixed-size regex fragment — see the comment above). A fixed offset
// is valid by construction; a real IANA name is checked against the actual
// list when one is available. Without Intl.supportedValuesOf, there's no
// list to check against — same as the old shape-only fallback this branch
// already had for that environment — so any non-offset shape match passes.
export function isValidTimeZone(raw: string): boolean {
  if (FIXED_OFFSET_RE.test(raw)) {
    return true;
  }
  const zones = getValidZoneSet();
  return zones ? zones.has(raw) : true;
}

// mirrors the ranges pad() in tokens.ts actually produces — keep in sync
// if those ever change
//
// Unpadded alternatives (M, H, h, m, s) list the longer branch first
// (e.g. '1[0-2]|[1-9]', not '[1-9]|1[0-2]'). This matters only when two
// unpadded tokens are glued with no separator: with short-first ordering,
// a regex engine takes the first successful overall match, and won't
// backtrack into a token's second alternative unless its first choice
// makes the *rest* of the pattern fail outright. If the short reading also
// happens to leave a valid match for the next token, the engine stops
// there — silently, deterministically, and with no relation to which
// reading a human intended. E.g. "Md" against "121": short-first order
// resolves it as month=1/day=21 (M grabs '1', d gets '21', which is a
// valid day) instead of month=12/day=1. Longer-first ordering fixes this
// by making the greedy match try to consume as many digits as possible
// before ever handing digits to the next token, which is the reading
// that matches how format() itself produces glued output in the first
// place (format() always emits the token's natural width, so decoding
// should prefer the same). Found via the token×token combinatorial glue
// matrix in combinatorial.test.js — see that file for the full case list.
const NUMERIC_FRAGMENTS: Record<string, string> = {
  yyyy: '\\d{4}',
  yy: '\\d{2}',
  MM: '(?:0[1-9]|1[0-2])',
  M: '(?:1[0-2]|[1-9])',
  dd: '(?:0[1-9]|[12]\\d|3[01])',
  d: '(?:[12]\\d|3[01]|[1-9])',
  HH: '(?:[01]\\d|2[0-3])',
  H: '(?:1\\d|2[0-3]|[0-9])',
  hh: '(?:0[1-9]|1[0-2])',
  h: '(?:1[0-2]|[1-9])',
  mm: '(?:[0-5]\\d)',
  m: '(?:[1-5]\\d|[0-9])',
  ss: '(?:[0-5]\\d)',
  s: '(?:[1-5]\\d|[0-9])',
  SSS: '\\d{3}',
};

export function tokenFragment(token: string, locale: string): string {
  const numeric = NUMERIC_FRAGMENTS[token];
  if (numeric) {
    return numeric;
  }

  const vocab = getLocaleVocab(locale);
  switch (token) {
    case 'MMMM': return alternation(vocab.monthLong);
    case 'MMM': return alternation(vocab.monthShort);
    case 'EEEE': return alternation(vocab.weekdayLong);
    case 'EEE': return alternation(vocab.weekdayShort);
    case 'a': return alternation(vocab.dayPeriod);
    case 'zzz': return getTimeZoneFragment();
    default:
      throw new Error(`temporal-fmt: unknown token "${token}"`);
  }
}

// Tokens whose fragment is variable-width (1-2 digits, no leading zero).
// Two or more of these glued with no literal separator between them can
// have more than one digit-split that's independently valid against every
// fragment in the run — see the big comment on NUMERIC_FRAGMENTS above.
// Reordering alternation branches picks a winner for *some* of these
// cases, but can't make both directions of a pair (e.g. "Md" and "dM")
// agree, because the ambiguity is in the input string itself, not in how
// any one fragment is written. exported so parsePattern.ts can find runs
// of these that need split-counting at match time instead of a single
// fixed regex.
export const UNPADDED_NUMERIC_TOKENS = new Set(['M', 'd', 'H', 'h', 'm', 's']);

// Every accept width for a given unpadded numeric token, as plain min/max
// value + digit-length pairs — used to enumerate candidate splits of a
// digit run at match time. Mirrors NUMERIC_FRAGMENTS's semantics exactly
// (same accepted values), just as data instead of regex source, since
// enumerating splits against a compiled regex per-candidate would be
// slower and harder to reason about than checking numeric ranges directly.
export const UNPADDED_NUMERIC_RANGES: Record<string, Array<{ digits: 1 | 2; min: number; max: number }>> = {
  M: [{ digits: 1, min: 1, max: 9 }, { digits: 2, min: 10, max: 12 }],
  d: [{ digits: 1, min: 1, max: 9 }, { digits: 2, min: 10, max: 31 }],
  H: [{ digits: 1, min: 0, max: 9 }, { digits: 2, min: 10, max: 23 }],
  h: [{ digits: 1, min: 1, max: 9 }, { digits: 2, min: 10, max: 12 }],
  m: [{ digits: 1, min: 0, max: 9 }, { digits: 2, min: 10, max: 59 }],
  s: [{ digits: 1, min: 0, max: 9 }, { digits: 2, min: 10, max: 59 }],
};

/**
 * Given the literal digit string a run of N adjacent unpadded-numeric
 * tokens matched as a whole (e.g. "112" for a 2-token run), enumerates
 * valid splits where every piece is independently valid for its token. Length 0
 * means there is no valid interpretation. Length 1 means the reading is
 * unambiguous. The function stops after finding two valid splits because the
 * caller only needs to distinguish ambiguity from a unique interpretation.
 * The search is memoized by token index and input offset so repeated states do
 * not expand recursively more than once.
 */
export function enumerateValidSplits(digits: string, tokens: string[]): number[][] {
  const memo = new Map<string, number[][]>();

  function solve(tokenIndex: number, offset: number): number[][] {
    const key = `${tokenIndex}:${offset}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }

    if (tokenIndex === tokens.length) {
      const result = offset === digits.length ? [[]] : [];
      memo.set(key, result);
      return result;
    }

    const token = tokens[tokenIndex];
    const ranges = UNPADDED_NUMERIC_RANGES[token!];
    if (!ranges) {
      throw new Error(`temporal-fmt: internal error — "${token}" is not an unpadded numeric token`);
    }

    const results: number[][] = [];
    for (const { digits: width, min, max } of ranges) {
      if (offset + width > digits.length) continue;
      const piece = digits.slice(offset, offset + width);
      if (width === 2 && piece[0] === '0') continue;
      const value = Number(piece);
      if (value < min || value > max) continue;

      for (const restSplit of solve(tokenIndex + 1, offset + width)) {
        results.push([value, ...restSplit]);
        if (results.length === 2) break;
      }
      if (results.length === 2) break;
    }

    memo.set(key, results);
    return results;
  }

  return solve(0, 0);
}