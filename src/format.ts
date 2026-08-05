import { TOKENS, DEFAULT_LOCALE, type TemporalLike, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

const HANDLER_BY_TOKEN = new Map(TOKENS.map(([tok, fn, field]) => [tok, { fn, field }]));

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
 * Numeric fields always render in ASCII digits regardless of locale.
 * Named fields (MMMM, EEEE, a) are fully localized via Intl, including
 * non-Gregorian calendars if the Temporal object carries one.
 *
 * Throws if the format string uses a token the input type doesn't support
 * (e.g. 'HH' on a PlainDate) rather than silently printing "undefined".
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
    if (!handler) {
      // shouldn't happen — tokenize() only emits tokens from TOKENS
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
