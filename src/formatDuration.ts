import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

// A Temporal.Duration doesn't sit on a calendar — it has no year/month/day
// position the way a PlainDate does — so the date/time token set in
// tokens.ts doesn't apply. This is a separate token table for the same
// reason parseRelative() lives in its own module: a different surface
// deserves its own grammar, not a bolt-on to the existing one.
//
// Token design: each unit has three forms, in increasing verbosity.
//   `y`   — numeric value, no unit text ("2")
//   `yy`  — short unit suffix, plural-aware ("2y", or "1y" — see below)
//   `yyy` — full unit word, plural-aware ("2 years", "1 year")
// Same for months (`o`/`oo`/`ooo` — `o` not `M` because the duration's
// own field name in Temporal is "months" and the long-form output should
// read "month"/"months", but the *token* letter is arbitrary; `o` is
// chosen so it doesn't visually collide with `m` (minutes) or `M`
// (months in date format) when a reader skims both tables side by side).
//
// Plural-awareness: English distinguishes "1 year" from "2 years". The
// short form ("yr" vs "yrs") follows the same rule. When the value is
// exactly 1, the singular form is used; otherwise the plural. This
// matches Intl.NumberFormat's behavior for unit formatting and is what
// most callers expect.

type UnitKey = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';

interface UnitForms {
  // singular and plural suffixes for the long form (e.g. "year", "years")
  longSingular: string;
  longPlural: string;
  // singular and plural suffixes for the short form (e.g. "yr", "yrs")
  shortSingular: string;
  shortPlural: string;
  // the property on Temporal.Duration to read for this unit
  field: UnitKey;
}

const DURATION_UNITS: Record<string, UnitForms> = {
  y: { longSingular: 'year', longPlural: 'years', shortSingular: 'yr', shortPlural: 'yrs', field: 'years' },
  o: { longSingular: 'month', longPlural: 'months', shortSingular: 'mo', shortPlural: 'mos', field: 'months' },
  w: { longSingular: 'week', longPlural: 'weeks', shortSingular: 'wk', shortPlural: 'wks', field: 'weeks' },
  d: { longSingular: 'day', longPlural: 'days', shortSingular: 'd', shortPlural: 'd', field: 'days' },
  h: { longSingular: 'hour', longPlural: 'hours', shortSingular: 'h', shortPlural: 'h', field: 'hours' },
  m: { longSingular: 'minute', longPlural: 'minutes', shortSingular: 'm', shortPlural: 'm', field: 'minutes' },
  s: { longSingular: 'second', longPlural: 'seconds', shortSingular: 's', shortPlural: 's', field: 'seconds' },
  S: { longSingular: 'millisecond', longPlural: 'milliseconds', shortSingular: 'ms', shortPlural: 'ms', field: 'milliseconds' },
};

// Token strings this module recognizes, longest-first for the greedy
// tokenizer. tokenize() in tokenize.ts already does longest-first via
// SORTED_TOKEN_STRINGS, but it operates on the *date/time* TOKENS table —
// not this one. Rather than teach tokenize() about two tables, this
// module uses its own equivalent scan over DURATION_UNITS keys.
const DURATION_TOKEN_STRINGS = Object.keys(DURATION_UNITS)
  .flatMap((single) => [single + single + single, single + single, single])
  .sort((a, b) => b.length - a.length);

type Piece =
  | { kind: 'token'; value: string; unit: string; form: 'numeric' | 'short' | 'long' }
  | { kind: 'literal'; value: string };

// Same greedy-match shape as tokenize() in tokenize.ts, but with this
// module's own token set. Quoted-literal handling is identical so the
// same documented escaping rules carry over: 'at' is a literal, '' is a
// literal quote.
function tokenizeDuration(format: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    if (ch === "'") {
      if (format[i + 1] === "'") {
        appendLiteral(pieces, "'");
        i += 2;
        continue;
      }
      let j = i + 1;
      let literal = '';
      let closed = false;
      while (j < format.length) {
        if (format[j] === "'") {
          if (format[j + 1] === "'") {
            literal += "'";
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        literal += format[j];
        j += 1;
      }
      if (!closed) {
        throw new Error(`temporal-fmt: unterminated quote in duration format string "${format}"`);
      }
      appendLiteral(pieces, literal);
      i = j;
      continue;
    }
    const match = DURATION_TOKEN_STRINGS.find((tok) => format.startsWith(tok, i));
    if (match) {
      // single letter = numeric, double = short, triple = long
      const unit = match[0]!;
      const form = match.length === 1 ? 'numeric' : match.length === 2 ? 'short' : 'long';
      pieces.push({ kind: 'token', value: match, unit, form });
      i += match.length;
      continue;
    }
    appendLiteral(pieces, ch);
    i += 1;
  }
  return pieces;
}

function appendLiteral(pieces: Piece[], value: string): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind === 'literal') {
    last.value += value;
  } else {
    pieces.push({ kind: 'literal', value });
  }
}

// Reads a unit value off the duration in a way that works for both real
// Temporal.Duration objects and field bags ({ hours: 2, minutes: 30 }).
// Temporal.Duration's fields are numbers, possibly negative for
// backwards durations; a field bag the caller passes might leave fields
// off entirely (undefined → treated as 0 for this unit).
function readUnit(duration: Record<string, unknown>, field: UnitKey): number {
  const value = duration[field];
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Temporal.Duration values are always numbers, but a hand-built field
  // bag could end up with a string here. Coerce; throw on garbage rather
  // than silently formatting NaN.
  const coerced = Number(value);
  if (!Number.isFinite(coerced)) {
    throw new Error(
      `temporal-fmt: duration field "${field}" is not a finite number (got ${String(value)}).`
    );
  }
  return coerced;
}

export interface DurationFormatOptions extends FormatOptions {
  /**
   * When true, units whose value is zero are still emitted in the output
   * (e.g. "0 hours, 30 minutes" instead of "30 minutes"). Default is
   * false: zero-value units are omitted, matching how date-fns's
   * formatDuration works and how most callers rendering a duration to
   * a human would want it.
   */
  showZeroValues?: boolean;
}

/**
 * Format a Temporal.Duration (or a plain field bag { years, months, ...
 * }) using a duration-specific token string. Token grammar is documented
 * in the README under "Duration formatting" — it does NOT reuse the
 * date/time token table, since a duration has no calendar position.
 *
 * Zero-value units are omitted by default; pass { showZeroValues: true }
 * to force them to appear.
 *
 * @example
 * formatDuration(Temporal.Duration.from({ years: 2, months: 1 }), 'yyy ooo')
 * // "2 years 1 month"
 * formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm')
 * // "2 hours 30 minutes"
 */
export function formatDuration(
  duration: Record<string, unknown>,
  formatStr: string,
  options: DurationFormatOptions = {},
): string {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: duration format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }

  // locale unused for the actual unit names — those are hardcoded English,
  // same limitation as the `do` ordinal token. Intl.DurationFormat exists
  // in some engines but is still maturing; for now, English-only is
  // explicit. Callers wanting locale-aware duration formatting should use
  // Intl.DurationFormat directly.
  void options.locale;

  const showZeroes = options.showZeroValues === true;
  const pieces = tokenizeDuration(formatStr);
  let result = '';

  for (const piece of pieces) {
    if (piece.kind === 'literal') {
      result += piece.value;
      continue;
    }

    const unit = DURATION_UNITS[piece.unit];
    if (!unit) {
      // shouldn't happen — tokenizeDuration only emits known units
      throw new Error(`temporal-fmt: unknown duration token "${piece.value}"`);
    }

    const value = readUnit(duration, unit.field);
    if (value === 0 && !showZeroes) {
      // Omit zero-value units entirely. The token's contribution to the
      // output is empty — but this can leave a dangling separator literal
      // (e.g. "2 hours, " with nothing after). Callers who want clean
      // output should structure their format string to not put a
      // separator after a unit that might be zero, or use showZeroValues.
      continue;
    }

    if (piece.form === 'numeric') {
      result += String(value);
    } else if (piece.form === 'short') {
      result += value + (value === 1 || value === -1 ? unit.shortSingular : unit.shortPlural);
    } else {
      // long form
      result += value + ' ' + (value === 1 || value === -1 ? unit.longSingular : unit.longPlural);
    }
  }

  return result;
}
