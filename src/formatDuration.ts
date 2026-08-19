import { type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { MAX_FORMAT_LENGTH } from './constants.js';
import { canonicalCacheKey } from './localeVocab.js';

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
// Locale-aware rendering: when a `locale` is passed, the short/long
// forms delegate to `Intl.NumberFormat` with `style: 'unit'`. That gives
// us pluralization, native unit names, and the locale's preferred
// spacing for free, matching the same "delegate to Intl" approach
// `formatDistance` already uses. Without a `locale`, the original
// English-only hardcoded table is used so existing default output stays
// byte-identical — this is an additive locale option, not a rewrite of
// the default rendering path.

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
  // Intl.NumberFormat unit identifier (used only on the locale-aware path).
  // Confirmed against the current Intl spec — including `millisecond`, which
  // is in fact supported by every engine we target (Node 20+, modern ICU).
  // The task brief flagged this as a possible gap; empirically it isn't.
  intlUnit: string;
}

const DURATION_UNITS: Record<string, UnitForms> = {
  y: { longSingular: 'year', longPlural: 'years', shortSingular: 'yr', shortPlural: 'yrs', field: 'years', intlUnit: 'year' },
  o: { longSingular: 'month', longPlural: 'months', shortSingular: 'mo', shortPlural: 'mos', field: 'months', intlUnit: 'month' },
  w: { longSingular: 'week', longPlural: 'weeks', shortSingular: 'wk', shortPlural: 'wks', field: 'weeks', intlUnit: 'week' },
  d: { longSingular: 'day', longPlural: 'days', shortSingular: 'd', shortPlural: 'd', field: 'days', intlUnit: 'day' },
  h: { longSingular: 'hour', longPlural: 'hours', shortSingular: 'h', shortPlural: 'h', field: 'hours', intlUnit: 'hour' },
  m: { longSingular: 'minute', longPlural: 'minutes', shortSingular: 'm', shortPlural: 'm', field: 'minutes', intlUnit: 'minute' },
  s: { longSingular: 'second', longPlural: 'seconds', shortSingular: 's', shortPlural: 's', field: 'seconds', intlUnit: 'second' },
  S: { longSingular: 'millisecond', longPlural: 'milliseconds', shortSingular: 'ms', shortPlural: 'ms', field: 'milliseconds', intlUnit: 'millisecond' },
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
// Temporal.Duration values are numbers, possibly negative for
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

// Intl.NumberFormat is expensive to construct, and a typical duration
// render walks 2-4 units — so a tight loop on the same (locale, unit,
// display) triple would otherwise rebuild the formatter for every token
// of every row. Cache by canonical-locale + unit + display, same
// eviction shape as the other locale-keyed caches in this library
// (formatterCache in tokens.ts, rtfCache in formatDistance.ts).
const unitFormatterCache = new Map<string, Intl.NumberFormat>();
const MAX_UNIT_FORMATTER_CACHE_SIZE = 200;

function getUnitFormatter(locale: string, intlUnit: string, unitDisplay: 'short' | 'long'): Intl.NumberFormat {
  const key = `${canonicalCacheKey(locale)}|${intlUnit}|${unitDisplay}`;
  const cached = unitFormatterCache.get(key);
  if (cached) return cached;
  if (unitFormatterCache.size >= MAX_UNIT_FORMATTER_CACHE_SIZE) {
    const oldestKey = unitFormatterCache.keys().next().value;
    if (oldestKey !== undefined) unitFormatterCache.delete(oldestKey);
  }
  const formatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: intlUnit,
    unitDisplay,
  });
  unitFormatterCache.set(key, formatter);
  return formatter;
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
 * Unit-name localization: without a `locale`, output is the original
 * English hardcoded singular/plural forms (byte-identical to previous
 * versions). With a `locale`, the short/long forms delegate to
 * `Intl.NumberFormat`'s `style: 'unit'` — same approach `formatDistance`
 * already uses for `Intl.RelativeTimeFormat`. Numeric-only tokens
 * (`y`, `o`, `w`, ...) are not affected by `locale`; they remain ASCII
 * digits, matching the rest of this library's "numbers stay Western"
 * convention.
 *
 * @example
 * formatDuration(Temporal.Duration.from({ years: 2, months: 1 }), 'yyy ooo')
 * // "2 years 1 month"
 * formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' })
 * // "2 heures 30 minutes"
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

  const showZeroes = options.showZeroValues === true;
  // Undefined locale → keep the original hardcoded English path so
  // existing default output is byte-identical. Any locale string passed
  // (including 'en-US') takes the Intl.NumberFormat path — so an
  // explicit `locale: 'en-US'` will produce Intl's spacing/word choices
  // rather than the hand-rolled English table. That's intentional: the
  // locale-aware path delegates to Intl, the default path doesn't.
  const locale = options.locale;
  const useIntl = locale !== undefined;

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
      continue;
    }

    if (useIntl) {
      // Intl.NumberFormat handles pluralization, native unit names, and
      // locale-appropriate spacing all in one call — no point replicating
      // that here. We pass the value as-is so negative durations
      // (`-1 hour`) round-trip the sign the way Intl expects.
      const unitDisplay = piece.form === 'short' ? 'short' : 'long';
      const formatter = getUnitFormatter(locale!, unit.intlUnit, unitDisplay);
      result += formatter.format(value);
      continue;
    }

    // Default-path English. Plural rule based on absolute value matches
    // what Intl does for unit style on en-US — only |value| === 1 is
    // singular, including for negatives like "-1 hour" (which is what
    // Intl produces for en-US too).
    if (piece.form === 'short') {
      result += value + (value === 1 || value === -1 ? unit.shortSingular : unit.shortPlural);
    } else {
      result += value + ' ' + (value === 1 || value === -1 ? unit.longSingular : unit.longPlural);
    }
  }

  return result;
}
