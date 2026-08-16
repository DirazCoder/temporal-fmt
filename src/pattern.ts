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
// *shape* here — instead of alternating all ~400 zone names inline — keeps
// the compiled regex small regardless of how many zzz tokens appear in a
// format string. The captured text still gets checked against the real
// zone set in isValidTimeZone() after the overall pattern matches, so this
// is strictly a matching-cost change, not a validation-strictness change:
// a bogus zone id fails "no valid pattern matches" exactly like it did when
// the zone list was inlined (see isValidTimeZone's caller in parse.ts).
const TIME_ZONE_SHAPE = '(?:UTC|[+-]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?|[A-Za-z_]+(?:[+-]\\d{1,2})?(?:\\/[A-Za-z0-9_+-]+)*)';

function getTimeZoneFragment(): string {
  return TIME_ZONE_SHAPE;
}

let validZoneSet: Set<string> | undefined;

// Real zone ids plus the couple of aliases zzz has always accepted even
// though Intl.supportedValuesOf('timeZone') doesn't list them (UTC isn't
// itself an IANA zone name, it's the identity offset).
function getValidZoneSet(): Set<string> {
  if (!validZoneSet) {
    validZoneSet = new Set(Intl.supportedValuesOf('timeZone'));
    validZoneSet.add('UTC');
  }
  return validZoneSet;
}

const FIXED_OFFSET_RE = /^[+-]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;

// Called post-match on whatever the bounded TIME_ZONE_SHAPE captured, since
// that shape is deliberately looser than "a real zone id" (it has to be, to
// stay a fixed-size regex fragment — see the comment above). A fixed offset
// is valid by construction; anything else has to be a real IANA name.
export function isValidTimeZone(raw: string): boolean {
  return FIXED_OFFSET_RE.test(raw) || getValidZoneSet().has(raw);
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

// pad()'s year formatter (tokens.ts) never truncates: it preserves the sign
// for BCE years and doesn't cap width past 9999, so a formatted "yyyy" can
// be longer than 4 digits or start with '-'. YYYY_EXTENDED accepts that;
// YYYY_EXACT is the plain 4-unsigned-digit case. Which one a given "yyyy"
// occurrence gets depends on what follows it — see buildCapturingPattern in
// parsePattern.ts. Two separate fragments instead of one `-?\d{4,}` because
// an open-ended-width year directly followed by another digit token (e.g.
// "yyyyMM") lets the year's own greediness silently eat digits meant for
// the next token — same class of bug as UNPADDED_NUMERIC_TOKENS below, but
// unbounded-width, so it can't reuse enumerateValidSplits' fixed-range
// splitting. Restricting to exactly 4 digits whenever something could
// follow closes that off entirely, at the cost of "yyyyMM" not being able
// to represent a 5-digit year — an already-rare case doubly rare in
// combination with a glued adjacent token.
const YYYY_EXACT = '-?\\d{4}';
const YYYY_EXTENDED = '-?\\d{4,}';

// True for any token whose matched text can start with a digit — i.e.
// every token here except the locale-named ones (MMMM/MMM/EEEE/EEE/a) and
// zzz (which can start with a digit only via a fixed offset like "+09:00",
// already handled by requiring a leading sign there). Used to decide
// whether a "yyyy" immediately before this token needs the exact-4-digit
// fragment instead of the open-ended one.
const DIGIT_LEADING_TOKENS = new Set([
  'yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'H', 'hh', 'h', 'mm', 'm', 'ss', 's', 'SSS',
]);

export function tokenFragment(token: string, locale: string, nextToken?: string): string {
  if (token === 'yyyy') {
    return nextToken !== undefined && DIGIT_LEADING_TOKENS.has(nextToken) ? YYYY_EXACT : YYYY_EXTENDED;
  }

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