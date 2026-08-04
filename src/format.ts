import { TOKENS, type TemporalLike } from './tokens.js';
import { tokenize } from './tokenize.js';

const HANDLER_BY_TOKEN = new Map(TOKENS.map(([tok, fn, field]) => [tok, { fn, field }]));

/**
 * Format a Temporal.PlainDate, PlainTime, PlainDateTime, or ZonedDateTime
 * using a date-fns-style token string.
 *
 * @example
 * format(Temporal.Now.plainDateISO(), 'yyyy-MM-dd')       // "2026-08-04"
 * format(zdt, "MMM d, yyyy 'at' h:mm a")                   // "Aug 4, 2026 at 3:45 PM"
 *
 * Throws if the format string uses a token the input type doesn't support
 * (e.g. 'HH' on a PlainDate, which has no time component) — this is
 * deliberate: silently printing "undefined" would be worse than failing loudly.
 */
export function format(temporal: TemporalLike, formatStr: string): string {
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

    result += handler.fn(temporal);
  }

  return result;
}
