import { TOKENS, DEFAULT_LOCALE, type TemporalLike, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';

const HANDLER_BY_TOKEN = new Map(TOKENS.map(([tok, fn, field]) => [tok, { fn, field }]));

// Format strings are supposed to be short, hand-written literals like
// "yyyy-MM-dd" — there's no legitimate reason for one to be thousands of
// characters. Guards against an attacker (or a bug) feeding an enormous
// string through to tokenize()/format(), which would otherwise scale
// linearly with input length with no upper bound.
const MAX_FORMAT_LENGTH = 1000;

/**
 * Format a Temporal.PlainDate, PlainTime, PlainDateTime, or ZonedDateTime
 * using a date-fns-style token string.
 *
 * @example
 * format(Temporal.Now.plainDateISO(), 'yyyy-MM-dd')                // "2026-08-04"
 * format(zdt, "MMM d, yyyy 'at' h:mm a")                            // "Aug 4, 2026 at 3:45 PM"
 * format(zdt, 'MMMM d, yyyy', { locale: 'fr-FR' })                  // "août 4, 2026"
 * format(zdt, 'EEEE d MMMM', { locale: 'ar-EG' })                   // Arabic weekday/month names
 *
 * Numeric fields (yyyy, MM, dd, HH, mm, ss, SSS) always render in Western
 * (0-9) digits regardless of locale — this keeps output predictable for
 * anything parsing the result back out (logs, APIs, filenames). Named
 * fields (MMMM, EEEE, a) are fully localized via Intl.DateTimeFormat,
 * including non-Gregorian calendars if the Temporal object itself carries
 * one (e.g. a PlainDate constructed with a Hebrew or Islamic calendar).
 *
 * Throws if the format string uses a token the input type doesn't support
 * (e.g. 'HH' on a PlainDate, which has no time component) — this is
 * deliberate: silently printing "undefined" would be worse than failing loudly.
 */
export function format(temporal: TemporalLike, formatStr: string, options: FormatOptions = {}): string {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  const pieces = tokenize(formatStr);
  let result = '';

  for (const piece of pieces) {
    if (piece.kind === 'literal') {
      result += piece.value;
      continue;
    }

    const handler = HANDLER_BY_TOKEN.get(piece.value);
    // Shouldn't happen — tokenize() only emits tokens from TOKENS — but keep
    // TypeScript honest and fail loudly instead of silently.
    if (!handler) {
      throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
    }

    if (temporal[handler.field] === undefined) {
      throw new Error(
        `temporal-fmt: token "${piece.value}" requires "${handler.field}", ` +
        `which this Temporal object doesn't have. ` +
        `(e.g. PlainDate has no time fields, PlainTime has no date fields)`
      );
    }

    result += handler.fn(temporal, locale);
  }

  return result;
}