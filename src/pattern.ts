import { getLocaleVocab } from './localeVocab.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(values: string[]): string {
  return `(?:${values.map(escapeRegExp).join('|')})`;
}

let timeZoneFragment: string | undefined;

function getTimeZoneFragment(): string {
  if (timeZoneFragment) {
    return timeZoneFragment;
  }

  const supportedZones = Intl.supportedValuesOf('timeZone');
  const escapedZones = supportedZones.map(escapeRegExp);
  const offsetPattern = '[+-]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?';
  timeZoneFragment = `(?:UTC|${offsetPattern}|${alternation(escapedZones)})`;
  return timeZoneFragment;
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
 * every way to split it into N pieces (one per token, each piece 1-2
 * digits per that token's own width rule) and returns every split where
 * every piece is independently valid for its token. Length 0 means the
 * run's regex match shouldn't have been possible in the first place
 * (shouldn't happen — the caller only invokes this after the whole
 * pattern already matched, meaning at least one split exists: the one the
 * regex actually took). Length 1 means the reading is unambiguous.
 * Length 2+ means true ambiguity — the caller should throw rather than
 * pick one.
 *
 * Recursive over token count rather than hardcoded to 2, so a 3+ token
 * unseparated run (e.g. "Hms") is covered by the same logic without a
 * special case — those are rarer in practice but not impossible, and a
 * partial fix that only covered pairs would leave the identical bug for
 * anyone writing a 3-token glued run.
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
