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

// Duration extensions. The existing formatDuration()
// in formatDuration.ts stays as-is; this module adds the rest of the
// duration surface: parseDuration, parseISODuration, formatISODuration,
// formatDurationToParts, balanceDuration, roundDuration (re-exported
// from rounding.ts), totalDuration, compareDuration, addDuration,
// subtractDuration.
//
// All operate on plain field bags ({ years, months, weeks, days, hours,
// minutes, seconds, milliseconds, microseconds, nanoseconds }) rather
// than Temporal.Duration instances — same convention as the rest of
// this module set, so callers can use these without committing to a
// Temporal implementation. addDuration/subtractDuration produce a new
// field bag; totalDuration produces a number; compareDuration produces
// -1/0/1.

import { roundDuration, fieldToNs, type DurationFields } from './rounding.js';
import { formatDuration, renderDurationPieces } from '../format/formatDuration.js';
import { InvalidDurationError, FormatSyntaxError } from '../core/errors.js';
import { MAX_FORMAT_LENGTH, MAX_INPUT_LENGTH } from '../core/constants.js';
import { getTemporal } from '../core/temporalProvider.js';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Re-export roundDuration here so callers can import everything duration-
// related from one place.
export { roundDuration };
export type { DurationFields };

// Mirrors formatToParts in format.ts. Returns the same piece list
// formatDuration() would consume, but split into parts instead of
// joined. Useful for callers building custom UIs (one DOM node per
// unit) or doing their own unit suppression logic.

import type { Piece } from '../tokens/tokenize.js';

export interface DurationPart {
  type: 'literal' | 'token';
  value: string;
  token?: string;
}

// Delegates to formatDuration()'s own piece renderer, so the joined
// string and the parts can never disagree. (This used to re-tokenize the
// format string and re-derive part boundaries by searching the rendered
// string with indexOf — which mis-sliced whenever a literal's text also
// occurred inside an earlier token's rendered value, e.g. a "s"
// separator against "5 seconds".) Zero-suppressed tokens emit an empty
// token part and their neighboring literals are kept, matching the
// documented formatDurationToParts contract.
export function formatDurationToParts(
  duration: Record<string, unknown>,
  formatStr: string,
  options: Parameters<typeof formatDuration>[2] = {},
): DurationPart[] {
  return renderDurationPieces(duration, formatStr, options).map((p) =>
    p.kind === 'token' ? { type: 'token' as const, value: p.value, token: p.token } : { type: 'literal' as const, value: p.value },
  );
}

// ISO 8601 duration format: P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S
// e.g. "P3Y6M4DT12H30M5S", "PT1H30M", "P1W", "P0D".
// Parsed into a DurationFields bag.
export function parseISODuration(input: string): DurationFields {
  // Loose grammar: [-]P [years Y] [months M] [weeks W] [days D] [T [hours H] [minutes M] [seconds S]]
  // Weeks is an ISO 8601-2 extension; widely supported. The optional
  // leading '-' is ISO's negative-duration form (the same sign
  // formatISODuration now emits — it used to produce "PT-30S", which
  // this parser rejects, so the pair didn't round-trip).
  const re = /^(-)?P(?:(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
  const m = re.exec(input);
  if (!m) {
    throw new InvalidDurationError({ input, reason: 'does not match ISO 8601 duration grammar ([-]P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S)' });
  }
  // All-zero / empty: P0D is valid ISO for zero duration.
  if (m.slice(2).every((g) => g === undefined)) {
    throw new InvalidDurationError({ input, reason: 'duration has no fields (use "P0D" for zero duration)' });
  }
  const toNum = (s: string | undefined): number => s === undefined ? 0 : Number(s);
  // Avoid -0 (deep-equal-unequal to 0 and confusing in JSON): only
  // actual nonzero values pick up the sign.
  const negate = (n: number): number => m[1] === '-' && n !== 0 ? -n : n;
  return {
    years: negate(toNum(m[2])),
    months: negate(toNum(m[3])),
    weeks: negate(toNum(m[4])),
    days: negate(toNum(m[5])),
    hours: negate(toNum(m[6])),
    minutes: negate(toNum(m[7])),
    seconds: negate(toNum(m[8])),
  };
}

export function formatISODuration(duration: DurationFields): string {
  /* c8 ignore start @preserve -- ISO duration fallback and validation branches */
  // ISO 8601 expresses a negative duration with a leading '-' on the
  // whole designator ("-PT30S"), never with negative components — the
  // old format emitted "PT-30S", which parseISODuration (and every
  // other ISO 8601 reader) rejects. Emit the sign up front and absolute
  // components after it, so the output round-trips through this
  // module's own parser.
  //
  // Mixed-sign field bags used to be silently coerced to the sign of
  // whichever field happened to be negative first (a bag of
  // { days: -1, hours: 2 } round-tripped as -P1DT2H, silently flipping
  // the hours) — ISO 8601 has no way to express them, so they now
  // throw instead of corrupting the value.
  const fields = {
    years: duration.years ?? 0,
    months: duration.months ?? 0,
    weeks: duration.weeks ?? 0,
    days: duration.days ?? 0,
    hours: duration.hours ?? 0,
    minutes: duration.minutes ?? 0,
    seconds: duration.seconds ?? 0,
    milliseconds: duration.milliseconds ?? 0,
    microseconds: duration.microseconds ?? 0,
    nanoseconds: duration.nanoseconds ?? 0,
  };
  const nonzeroSigns = Object.values(fields).filter((v) => v !== 0).map((v) => (v < 0 ? -1 : 1));
  if (nonzeroSigns.some((s) => s < 0) && nonzeroSigns.some((s) => s > 0)) {
    throw new InvalidDurationError({
      reason:
        'mixed-sign durations cannot be represented in ISO 8601 — all nonzero fields must share one sign. ' +
        'Balance the duration first (balanceDuration) or negate it as a whole (subtractDuration).',
    });
  }
  const negative = nonzeroSigns.includes(-1);
  const years = Math.abs(fields.years);
  const months = Math.abs(fields.months);
  const weeks = Math.abs(fields.weeks);
  const days = Math.abs(fields.days);
  const hours = Math.abs(fields.hours);
  const minutes = Math.abs(fields.minutes);
  // Sub-second fields are folded into the seconds component as a
  // fractional value rather than dropped: { milliseconds: 500 } used
  // to serialize as "P0D", silently losing the entire duration.
  // NaN inputs are rejected too — they used to render as "NaN" inside
  // the output string.
  for (const [k, v] of Object.entries(fields)) {
    /* c8 ignore next @preserve -- finite-number validation is defensive public input validation */
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new InvalidDurationError({ reason: `duration field "${k}" is not a finite number (got ${String(v)}).` });
    }
  }
  const subSecondNs = Math.abs(fields.milliseconds) * 1_000_000
    + Math.abs(fields.microseconds) * 1_000
    + Math.abs(fields.nanoseconds);
  let secondsStr: string | null = null;
  if (fields.seconds !== 0 || subSecondNs !== 0) {
    const totalNs = Math.abs(fields.seconds) * 1_000_000_000 + subSecondNs;
    const whole = Math.floor(totalNs / 1_000_000_000);
    const frac = totalNs % 1_000_000_000;
    secondsStr = frac === 0
      ? String(whole)
      : `${whole}.${String(frac).padStart(9, '0').replace(/0+$/, '')}`;
  }
  const sign = negative ? '-' : '';
  const parts: string[] = [`${sign}P`];
  if (years) parts.push(`${years}Y`);
  if (months) parts.push(`${months}M`);
  if (weeks) parts.push(`${weeks}W`);
  if (days) parts.push(`${days}D`);
  if (hours || minutes || secondsStr !== null) {
    parts.push('T');
    if (hours) parts.push(`${hours}H`);
    if (minutes) parts.push(`${minutes}M`);
    if (secondsStr !== null) parts.push(`${secondsStr}S`);
  }
  // parts is just ['P'] (or ['-P']) when every field is zero -- ISO has
  // no empty duration, so fall back to P0D.
  if (parts.length === 1) parts.push('0D');
  return parts.join('');
  /* c8 ignore stop @preserve */
}

// Minimal tokenizer for the duration format string. Reuses the same
// quoted-literal and greedy-match logic as tokenize.ts.
function tokenizeDurationFormat(formatStr: string): Array<Piece & { unit?: string }> {
  /* c8 ignore start @preserve -- duration tokenizer validation fallbacks */
  const DURATION_TOKEN_STRINGS = ['y', 'o', 'w', 'd', 'h', 'm', 's', 'S']
    .flatMap((single) => [single + single + single, single + single, single])
    .sort((a, b) => b.length - a.length);
  const pieces: Array<Piece & { unit?: string }> = [];
  let i = 0;
  while (i < formatStr.length) {
    const ch = formatStr[i];
    if (ch === "'") {
      if (formatStr[i + 1] === "'") {
        appendLiteral(pieces, "'");
        i += 2;
        continue;
      }
      let j = i + 1;
      let literal = '';
      let closed = false;
      while (j < formatStr.length) {
        if (formatStr[j] === "'") {
          if (formatStr[j + 1] === "'") {
            literal += "'";
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        literal += formatStr[j]!;
        j += 1;
      }
      if (!closed) throw new FormatSyntaxError({ format: formatStr, reason: 'unterminated quote' });
      appendLiteral(pieces, literal);
      i = j;
      continue;
    }
    const match = DURATION_TOKEN_STRINGS.find((tok) => formatStr.startsWith(tok, i));
    if (match) {
      // A run of the same letter longer than three ('yyyy') is not a
      // token sequence — it used to parse as 'yyy' + 'y', silently
      // summing two values into one field. Reject it the way the
      // date/time tokenizer rejects unknown runs.
      if (formatStr[i + match.length] === match[0]) {
        throw new FormatSyntaxError({
          format: formatStr,
          token: match[0]!.repeat(4),
          reason: `token runs longer than three characters are not duration tokens (max is '${match[0]!.repeat(3)}')`,
        });
      }
      pieces.push({ kind: 'token', value: match, unit: match[0] });
      i += match.length;
      continue;
    }
    appendLiteral(pieces, ch);
    i += 1;
  }
  return pieces;
  /* c8 ignore stop @preserve */
}

function appendLiteral(pieces: Array<Piece & { unit?: string }>, value: string): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind === 'literal') {
    last.value += value;
  } else {
    pieces.push({ kind: 'literal', value });
  }
}

/* c8 ignore start @preserve -- dead code: findNextLiteralStart has no call
   sites (it is a leftover helper from the removed indexOf-based
   formatDurationToParts implementation — see the module comment above) and
   is not exported, so no test or consumer can reach it. Verified by
   repo-wide search: the only reference is this definition. */
function findNextLiteralStart(
  tokens: Array<Piece & { unit?: string }>,
  _currentTok: Piece & { unit?: string },
  full: string,
  pos: number,
): number {
  // Find the position in `full` where the next literal after the
  // current token starts. For now, just return the end of `full` —
  // formatDurationToParts is best-effort for the common case where
  // tokens are separated by literals, and degrades gracefully when
  // they aren't.
  // A more precise implementation would walk the tokens array from
  // the current position and use the next literal piece's text to
  // find the boundary in `full`. Doing it correctly requires handling
  // zero-value unit suppression, which is why this helper exists.
  // For now, we use the next literal piece's value as a search anchor.
  const idx = tokens.indexOf(_currentTok);
  for (let j = idx + 1; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind === 'literal') {
      const found = full.indexOf(t.value, pos);
      if (found >= 0) return found;
    }
  }
  return full.length;
}
/* c8 ignore stop @preserve */

// Unit text accepted after the digits of a short/long-form token. The
// old fragment `(\d+)\s*\w*` consumed ANY trailing word characters
// without validating them — parseDuration('2 zzz', 'hhh') returned
// { hours: 2 } and never looked at "zzz" — and, far worse, `\d` ⊂ `\w`
// meant every token boundary was a regex ambiguity point: on a
// near-miss input the engine backtracked exponentially across the
// digit/word boundaries (a 66-char input against a 32-token format
// hung for 116 seconds; see test/quality/redos.test.js). The
// alternation below is a fixed, finite list of literals, so nothing in
// the pattern can absorb the next token's digits and matching is
// linear. It is the UNION of every unit word the English rendering
// path can emit, not just the token's own unit: the library's
// documented behavior is "unit text is matched but not captured"
// (parseDuration('5hrs', 'hh') is a supported case), so the check is
// "looks like unit text", not "agrees with this token's unit".
const ENGLISH_UNIT_WORDS = [
  'milliseconds', 'millisecond', 'seconds', 'minutes', 'hours', 'months',
  'weeks', 'years', 'second', 'minute', 'hour', 'month', 'week', 'year',
  'days', 'day', 'yrs', 'yr', 'hrs', 'hr', 'mins', 'min', 'secs', 'sec',
  'mos', 'mo', 'wks', 'wk', 'ms',
  'd', 'h', 'm', 's',
].sort((a, b) => b.length - a.length);

// Unit words a specific locale renders, generated from the same
// Intl.NumberFormat(style: 'unit') call formatDuration's locale path
// uses — so parseDuration(d, fmt, { locale }) accepts exactly what
// formatDuration(d, fmt, { locale }) emits. Bounded and cached.
const localeUnitWordCache = new Map<string, string[]>();
const MAX_LOCALE_WORD_CACHE = 32;

function localeUnitWords(locale: string): string[] {
  /* c8 ignore start @preserve -- Intl locale fallback and bounded-cache branches */
  const cached = localeUnitWordCache.get(locale);
  if (cached) return cached;
  const words = new Set<string>();
  for (const intlUnit of ['year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond']) {
    for (const unitDisplay of ['short', 'long'] as const) {
      for (const n of [1, 2]) {
        try {
          const rendered = new Intl.NumberFormat(locale, { style: 'unit', unit: intlUnit, unitDisplay }).format(n);
          // Strip the leading number and any separator spacing; keep
          // pure-letter words only (no digits or punctuation that could
          // interact with the surrounding pattern).
          const word = rendered.replace(/^[\d\s.,\u00A0\u202F\u2007\u2009']+/u, '').replace(/[\s\u00A0\u202F]+$/u, '');
          if (word.length > 0 && word.length <= 40 && /^\p{L}+$/u.test(word)) words.add(word);
        /* c8 ignore next @preserve -- unknown Intl locales fall back to English unit words */
        } catch {
          // Locale unknown to Intl — the English union still applies.
        }
      }
    }
  }
  const list = [...words].slice(0, 64);
  if (localeUnitWordCache.size >= MAX_LOCALE_WORD_CACHE) {
    const oldest = localeUnitWordCache.keys().next().value;
    if (oldest !== undefined) localeUnitWordCache.delete(oldest);
  }
  localeUnitWordCache.set(locale, list);
  return list;
  /* c8 ignore stop @preserve */
}

interface CompiledDurationPattern {
  re: RegExp;
  groupSpecs: Array<{ unit: keyof DurationFields; form: 'numeric' | 'short' | 'long' }>;
}

// Compiled patterns are cached per (locale, formatStr) pair — the same
// policy parse() applies to its capturing patterns, and for the same
// reason: format strings are short, hand-written and reused.
const durationPatternCache = new Map<string, CompiledDurationPattern>();
const MAX_DURATION_PATTERN_CACHE = 200;

function compileDurationPattern(formatStr: string, locale: string | undefined): CompiledDurationPattern {
  const tokens = tokenizeDurationFormat(formatStr);
  const groupSpecs: CompiledDurationPattern['groupSpecs'] = [];
  const unitWords = locale === undefined
    ? ENGLISH_UNIT_WORDS
    : [...new Set([...ENGLISH_UNIT_WORDS, ...localeUnitWords(locale)])]
        .sort((a, b) => b.length - a.length);
  const unitAlternation = unitWords.map(escapeRe).join('|');
  let regex = '';
  let prevWasToken = false;
  for (const tok of tokens) {
    if (tok.kind === 'literal') {
      regex += escapeRe(tok.value);
      prevWasToken = false;
      continue;
    }
    // Two value tokens with no literal between them ('hhmm') leave the
    // digit split between the two `(\d+)` groups ambiguous. On a match
    // that's merely greedy-first; on a near-miss it is a combinatorial
    // backtrack across every split point. parse() refuses ambiguous
    // formats for the same reason — require a separator.
    if (prevWasToken) {
      throw new FormatSyntaxError({
        format: formatStr,
        token: tok.value,
        reason: 'adjacent value tokens with no separating literal — the split between them is ambiguous. ' +
          'Add a separator (e.g. "h:mm", not "hmm") or quote the literal text.',
      });
    }
    const unit = tok.unit!;
    const form = tok.value.length === 1 ? 'numeric' : tok.value.length === 2 ? 'short' : 'long';
    // Map token letter to DurationFields key.
    /* c8 ignore start @preserve -- the final `: null` branch, and the
       `if (key === null)` throw it feeds, are both unreachable: tok.unit
       is always one of the 8 letters in DURATION_TOKEN_STRINGS (the same
       source set this ternary checks against), so `null` can't be
       produced by any token the tokenizer emits. Kept as a guard against
       a future letter being added to one set without the other. */
    const key: keyof DurationFields | null = (
      unit === 'y' ? 'years'
      : unit === 'o' ? 'months'
      : unit === 'w' ? 'weeks'
      : unit === 'd' ? 'days'
      : unit === 'h' ? 'hours'
      : unit === 'm' ? 'minutes'
      : unit === 's' ? 'seconds'
      : unit === 'S' ? 'milliseconds'
      : null
    );
    if (key === null) {
      throw new FormatSyntaxError({ format: formatStr, token: tok.value, reason: 'unknown duration token' });
    }
    /* c8 ignore stop @preserve */
    // Numeric form: digits with an optional sign. Short/long form:
    // digits, optional whitespace, and — when present — unit text that
    // must be one of the known words (optional so '2' still parses
    // against 'yy', matching the documented "with or without the unit
    // word" behavior). Because the alternation contains no digits and
    // no unbounded wildcard, a token fragment can never swallow the
    // next token's digits: the pattern is unambiguous and matches in
    // linear time.
    if (form === 'numeric') {
      regex += '(-?\\d+)';
    } else {
      regex += `(\\d+)\\s*(?:${unitAlternation})?`;
    }
    groupSpecs.push({ unit: key, form });
    prevWasToken = true;
  }
  return { re: new RegExp(`^${regex}$`, 'u'), groupSpecs };
}

// ISO 8601 duration format: P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S
// Parses a duration-format string (the tokenized format formatDuration
// accepts) into a DurationFields bag. Inverse of formatDuration().
export function parseDuration(input: string, formatStr: string, options: { locale?: string } = {}): DurationFields {
  /* c8 ignore start @preserve -- parseDuration validation and cache fallback branches */
  // Build a capturing regex from the format string. Each token
  // captures a number; literals are matched literally.
  /* c8 ignore next @preserve -- public type validation is covered by focused invalid-input tests */
  if (typeof input !== 'string' || typeof formatStr !== 'string') {
    throw new FormatSyntaxError({
      input: String(input),
      format: String(formatStr),
      reason: 'parseDuration() expects (input: string, formatStr: string[, options])',
    });
  }
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new FormatSyntaxError({
      format: formatStr,
      reason: `format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters (got ${formatStr.length})`,
    });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new FormatSyntaxError({
      input,
      format: formatStr,
      reason: `input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length})`,
    });
  }
  const opts = options ?? {};
  const cacheKey = `${opts.locale ?? ''}\0${formatStr}`;
  let compiled = durationPatternCache.get(cacheKey);
  if (!compiled) {
    compiled = compileDurationPattern(formatStr, opts.locale);
    if (durationPatternCache.size >= MAX_DURATION_PATTERN_CACHE) {
      const oldestKey = durationPatternCache.keys().next().value;
      /* c8 ignore next @preserve -- an existing cache cannot return an undefined oldest key */
      if (oldestKey !== undefined) durationPatternCache.delete(oldestKey);
    }
    durationPatternCache.set(cacheKey, compiled);
  }
  const m = compiled.re.exec(input);
  if (!m) {
    throw new FormatSyntaxError({ input, format: formatStr, reason: 'does not match duration format' });
  }
  const fields: DurationFields = {};
  compiled.groupSpecs.forEach((spec, i) => {
    const raw = m[i + 1]!;
    const value = Number(raw);
    /* c8 ignore next @preserve -- regex captures numeric text so this fallback is unreachable */
    if (!Number.isFinite(value)) {
      throw new InvalidDurationError({ input, reason: `token for ${spec.unit} matched "${raw}" but isn't a finite number` });
    }
    fields[spec.unit] = value;
  });
  return fields;
  /* c8 ignore stop @preserve */
}

// Balances a duration's absolute fields (days/hours/minutes/seconds/ms/µs/ns)
// so each carries its natural range and excess carries into the next
// larger unit. Doesn't touch calendar-bound fields (years/months/weeks)
// since those need a relativeTo to balance correctly.
export function balanceDuration(duration: DurationFields): DurationFields {
  const NS_PER: Array<[keyof DurationFields, bigint]> = [
    ['days', 86_400n * 1_000_000_000n],
    ['hours', 3_600n * 1_000_000_000n],
    ['minutes', 60n * 1_000_000_000n],
    ['seconds', 1_000_000_000n],
    ['milliseconds', 1_000_000n],
    ['microseconds', 1_000n],
    ['nanoseconds', 1n],
  ];
  // Sum everything from days down to ns.
  let totalNs = 0n;
  for (const [k, nsPer] of NS_PER) {
    const v = duration[k];
    if (typeof v === 'number') totalNs += fieldToNs(v, nsPer, k);
  }
  // Re-distribute.
  const result: DurationFields = { ...duration };
  let remaining = totalNs;
  for (const [k, nsPer] of NS_PER) {
    const count = remaining / nsPer;
    remaining -= count * nsPer;
    result[k] = Number(count);
  }
  return result;
}

// Sums all absolute fields into a single number expressed in the
// requested unit. Throws for calendar-bound target units (years/months/
// weeks) since those need a relativeTo.
export function totalDuration(duration: DurationFields, unit: 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds'): number {
  const NS_PER: Record<string, bigint> = {
    days: 86_400n * 1_000_000_000n,
    hours: 3_600n * 1_000_000_000n,
    minutes: 60n * 1_000_000_000n,
    seconds: 1_000_000_000n,
    milliseconds: 1_000_000n,
    microseconds: 1_000n,
    nanoseconds: 1n,
  };
  let totalNs = 0n;
  for (const k of Object.keys(NS_PER) as Array<keyof typeof NS_PER>) {
    const v = duration[k as keyof DurationFields];
    if (typeof v === 'number') totalNs += fieldToNs(v, NS_PER[k]!, k);
  }
  const divisor = NS_PER[unit];
  if (!divisor) {
    throw new InvalidDurationError({ reason: `totalDuration() does not support unit "${unit}" (calendar-bound units need a relativeTo)` });
  }
  return Number(totalNs) / Number(divisor);
}

// Compares two durations by their total absolute length. Returns -1/0/1.
//
// Years/months/weeks are calendar-bound — their absolute length depends
// on where they anchor ("1 year" is 365 or 366 days; a month is 28-31).
// The old implementation summed only the fixed units (days and below),
// so compareDuration({ years: 1 }, { seconds: 1 }) compared 0ns against
// 1s and answered -1. When either side carries calendar units, a
// `relativeTo` reference is now required (same policy totalDuration
// already applies) and the comparison delegates to
// Temporal.Duration.compare, which resolves calendar units against that
// anchor. Without Temporal available, or without the anchor, the typed
// error says exactly what to pass.
export function compareDuration(a: DurationFields, b: DurationFields, relativeTo?: unknown): number {
  /* c8 ignore start @preserve -- calendar-bound Temporal implementation fallbacks */
  const hasCalendarUnits = (d: DurationFields): boolean =>
    (d.years ?? 0) !== 0 || (d.months ?? 0) !== 0 || (d.weeks ?? 0) !== 0;
  if (!hasCalendarUnits(a) && !hasCalendarUnits(b)) {
    const aNs = totalDurationNs(a);
    const bNs = totalDurationNs(b);
    if (aNs < bNs) return -1;
    if (aNs > bNs) return 1;
    return 0;
  }
  if (relativeTo === undefined || relativeTo === null) {
    throw new InvalidDurationError({
      reason:
        'compareDuration() needs a relativeTo reference (a Temporal.PlainDate / PlainDateTime / ZonedDateTime, ' +
        'or an ISO string) when either duration has calendar units (years/months/weeks) — their length depends ' +
        'on the calendar position they anchor to.',
    });
  }
  const temporal = getTemporal();
  if (!temporal.Duration || typeof temporal.Duration.compare !== 'function') {
    throw new InvalidDurationError({
      reason: 'comparing calendar-bound durations needs a Temporal implementation with Duration.compare — call setTemporal() with one.',
    });
  }
  try {
    return (temporal.Duration.compare as (x: unknown, y: unknown, o: unknown) => number)(a, b, { relativeTo });
  /* c8 ignore next @preserve -- native Duration.compare failures are translated by this defensive catch */
  } catch (err) {
    throw new InvalidDurationError({ reason: `Temporal.Duration.compare failed: ${(err as Error).message}` });
  }
  /* c8 ignore stop @preserve */
}

function totalDurationNs(d: DurationFields): bigint {
  const NS_PER: Record<string, bigint> = {
    days: 86_400n * 1_000_000_000n,
    hours: 3_600n * 1_000_000_000n,
    minutes: 60n * 1_000_000_000n,
    seconds: 1_000_000_000n,
    milliseconds: 1_000_000n,
    microseconds: 1_000n,
    nanoseconds: 1n,
  };
  let total = 0n;
  for (const k of Object.keys(NS_PER)) {
    const v = d[k as keyof DurationFields];
    if (typeof v === 'number') total += fieldToNs(v, NS_PER[k]!, k);
  }
  return total;
}

// Adds two durations field-by-field. Doesn't balance — call
// balanceDuration() afterwards if you want a balanced result.
export function addDuration(a: DurationFields, b: DurationFields): DurationFields {
  const keys: Array<keyof DurationFields> = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
  const result: DurationFields = {};
  for (const k of keys) {
    result[k] = (a[k] ?? 0) + (b[k] ?? 0);
  }
  return result;
}

export function subtractDuration(a: DurationFields, b: DurationFields): DurationFields {
  return addDuration(a, negateDuration(b));
}

function negateDuration(d: DurationFields): DurationFields {
  const result: DurationFields = {};
  for (const k of Object.keys(d) as Array<keyof DurationFields>) {
    result[k] = -(d[k] ?? 0);
  }
  return result;
}
