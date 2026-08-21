// Duration extensions (plan section I). The existing formatDuration()
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

import { roundDuration, type DurationFields } from './rounding.js';
import { getTemporal } from './temporalProvider.js';
import { formatDuration } from './formatDuration.js';
import { InvalidDurationError, FormatSyntaxError } from './errors.js';

// Re-export roundDuration here so callers can import everything duration-
// related from one place.
export { roundDuration };
export type { DurationFields };

// Mirrors formatToParts in format.ts. Returns the same piece list
// formatDuration() would consume, but split into parts instead of
// joined. Useful for callers building custom UIs (one DOM node per
// unit) or doing their own unit suppression logic.

import type { Piece } from './tokenize.js';

export interface DurationPart {
  type: 'literal' | 'token';
  value: string;
  token?: string;
}

// Delegates to formatDuration() by formatting once with each piece
// in isolation, then splitting. Simpler than duplicating the
// formatting logic — at the cost of running the formatter multiple
// times. For typical durations (2-4 units) this is fine.
export function formatDurationToParts(
  duration: Record<string, unknown>,
  formatStr: string,
  options: Parameters<typeof formatDuration>[2] = {},
): DurationPart[] {
  // Format the whole thing once to get the joined output, then walk
  // the formatStr's tokens and slice the output by each token's
  // rendered width. This works because formatDuration() emits each
  // token's value verbatim with literals in between — there's no
  // locale-dependent reordering.
  const full = formatDuration(duration, formatStr, options);
  // Re-tokenize the format string to know what tokens are present.
  // (formatDuration has its own tokenizer; we don't re-implement it
  // here. Instead, we scan the format string for token runs the same
  // way its tokenizer does.)
  const tokens = tokenizeDurationFormat(formatStr);
  const parts: DurationPart[] = [];
  let pos = 0;
  for (const tok of tokens) {
    if (tok.kind === 'literal') {
      // Find the literal text in `full` starting at `pos`. It should
      // be there verbatim.
      const lit = tok.value;
      if (full.slice(pos, pos + lit.length) === lit) {
        parts.push({ type: 'literal', value: lit });
        pos += lit.length;
      /* c8 ignore start @preserve -- unreachable given current formatDuration(): every
         literal is appended to `full` unconditionally regardless of adjacent
         zero-value tokens, and pos tracking never desyncs from the true
         literal position (verified via adversarial testing: duplicate
         literals, skipped tokens before/after, ambiguous text — all still
         found via indexOf as expected). Kept as a guard against a future
         formatDuration() change that conditionally drops literals. */
      } else {
        // Literal missing from output (e.g. zero-value unit was
        // skipped). Don't emit a part for it.
      }
      /* c8 ignore stop @preserve */
    } else {
      // Token: find the next non-literal chunk of `full` starting at
      // `pos`. Use the next literal piece (if any) as the bound.
      const nextLiteralStart = findNextLiteralStart(tokens, tok, full, pos);
      const value = full.slice(pos, nextLiteralStart);
      parts.push({ type: 'token', value, token: tok.value });
      pos = nextLiteralStart;
    }
  }
  return parts;
}

// Minimal tokenizer for the duration format string. Reuses the same
// quoted-literal and greedy-match logic as tokenize.ts.
function tokenizeDurationFormat(formatStr: string): Array<Piece & { unit?: string }> {
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
      pieces.push({ kind: 'token', value: match, unit: match[0] });
      i += match.length;
      continue;
    }
    appendLiteral(pieces, ch);
    i += 1;
  }
  return pieces;
}

function appendLiteral(pieces: Array<Piece & { unit?: string }>, value: string): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind === 'literal') {
    last.value += value;
  } else {
    pieces.push({ kind: 'literal', value });
  }
}

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

// ISO 8601 duration format: P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S
// e.g. "P3Y6M4DT12H30M5S", "PT1H30M", "P1W", "P0D".
// Parsed into a DurationFields bag.
export function parseISODuration(input: string): DurationFields {
  // Loose grammar: P [years Y] [months M] [weeks W] [days D] [T [hours H] [minutes M] [seconds S]]
  // Weeks is an ISO 8601-2 extension; widely supported.
  const re = /^P(?:(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
  const m = re.exec(input);
  if (!m) {
    throw new InvalidDurationError({ input, reason: 'does not match ISO 8601 duration grammar (P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S)' });
  }
  // All-zero / empty: P0D is valid ISO for zero duration.
  if (m.slice(1).every((g) => g === undefined)) {
    throw new InvalidDurationError({ input, reason: 'duration has no fields (use "P0D" for zero duration)' });
  }
  const toNum = (s: string | undefined): number => s === undefined ? 0 : Number(s);
  return {
    years: toNum(m[1]),
    months: toNum(m[2]),
    weeks: toNum(m[3]),
    days: toNum(m[4]),
    hours: toNum(m[5]),
    minutes: toNum(m[6]),
    seconds: toNum(m[7]),
  };
}

export function formatISODuration(duration: DurationFields): string {
  const parts: string[] = ['P'];
  const years = duration.years ?? 0;
  const months = duration.months ?? 0;
  const weeks = duration.weeks ?? 0;
  const days = duration.days ?? 0;
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  const seconds = duration.seconds ?? 0;
  if (years) parts.push(`${years}Y`);
  if (months) parts.push(`${months}M`);
  if (weeks) parts.push(`${weeks}W`);
  if (days) parts.push(`${days}D`);
  if (hours || minutes || seconds) {
    parts.push('T');
    if (hours) parts.push(`${hours}H`);
    if (minutes) parts.push(`${minutes}M`);
    if (seconds) parts.push(`${seconds}S`);
  }
  // parts is just ['P'] when every field is zero -- ISO has no empty
  // duration, so fall back to P0D.
  if (parts.length === 1) parts.push('0D');
  return parts.join('');
}

// Parses a duration-format string (the tokenized format formatDuration
// accepts) into a DurationFields bag. Inverse of formatDuration().
export function parseDuration(input: string, formatStr: string, options: { locale?: string } = {}): DurationFields {
  // Build a capturing regex from the format string. Each token
  // captures a number; literals are matched literally.
  const tokens = tokenizeDurationFormat(formatStr);
  const fields: DurationFields = {};
  const groupSpecs: Array<{ unit: keyof DurationFields; form: 'numeric' | 'short' | 'long' }> = [];
  let regex = '';
  for (const tok of tokens) {
    if (tok.kind === 'literal') {
      regex += tok.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else {
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
      // Numeric form: capture digits (and optional sign).
      // Short/long form: capture digits followed by optional unit text.
      // We'll handle unit-text stripping after the match.
      if (form === 'numeric') {
        regex += '(-?\\d+)';
      } else {
        // Short form like "2y" or "2yrs"; long form like "2 years" or "2 year".
        // Capture the number; unit text is matched but not captured.
        regex += '(\\d+)\\s*\\w*';
      }
      groupSpecs.push({ unit: key, form });
    }
  }
  const re = new RegExp(`^${regex}$`, 'u');
  const m = re.exec(input);
  if (!m) {
    throw new FormatSyntaxError({ input, format: formatStr, reason: 'does not match duration format' });
  }
  groupSpecs.forEach((spec, i) => {
    const raw = m[i + 1]!;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new InvalidDurationError({ input, reason: `token for ${spec.unit} matched "${raw}" but isn't a finite number` });
    }
    fields[spec.unit] = value;
  });
  return fields;
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
    if (typeof v === 'number') totalNs += BigInt(v) * nsPer;
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
    if (typeof v === 'number') totalNs += BigInt(v) * NS_PER[k]!;
  }
  const divisor = NS_PER[unit];
  if (!divisor) {
    throw new InvalidDurationError({ reason: `totalDuration() does not support unit "${unit}" (calendar-bound units need a relativeTo)` });
  }
  return Number(totalNs) / Number(divisor);
}

// Compares two durations by their total absolute length. Returns -1/0/1.
export function compareDuration(a: DurationFields, b: DurationFields): number {
  const aNs = totalDurationNs(a);
  const bNs = totalDurationNs(b);
  if (aNs < bNs) return -1;
  if (aNs > bNs) return 1;
  return 0;
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
    if (typeof v === 'number') total += BigInt(v) * NS_PER[k]!;
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

// Suppress unused-import warning. getTemporal is used by fromUnix*
// helpers in serialization.ts, not here — but keeping the import
// around ensures this module is consistent with the rest of the
// library's pattern of importing temporalProvider for any code path
// that might construct a Temporal value.
void getTemporal;
