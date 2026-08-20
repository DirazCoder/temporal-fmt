import { TOKENS, DEFAULT_LOCALE, type TemporalLike, type FormatOptions } from './tokens.js';
import { tokenize, type Piece } from './tokenize.js';
import { MAX_FORMAT_LENGTH } from './constants.js';
import { applyNumbering, type NumberingFormatOptions } from './numbering.js';

const HANDLER_BY_TOKEN = new Map(TOKENS.map(([tok, fn, field]) => [tok, { fn, field }]));

// Pre-tokenized format strings, keyed by (formatStr) — locale doesn't
// change the tokenization step, only the per-token rendering, so the
// piece list is shared across locales. Same eviction shape as the
// other caches in this library.
const tokenizeCache = new Map<string, Piece[]>();
const MAX_TOKENIZE_CACHE_SIZE = 500;

function getPieces(formatStr: string): Piece[] {
  let pieces = tokenizeCache.get(formatStr);
  if (pieces) return pieces;
  if (tokenizeCache.size >= MAX_TOKENIZE_CACHE_SIZE) {
    const oldestKey = tokenizeCache.keys().next().value;
    if (oldestKey !== undefined) tokenizeCache.delete(oldestKey);
  }
  pieces = tokenize(formatStr);
  tokenizeCache.set(formatStr, pieces);
  return pieces;
}

/**
 * Format a Temporal.PlainDate, PlainTime, PlainDateTime, or ZonedDateTime
 * using a date-fns-style token string.
 *
 * @example
 * format(Temporal.Now.plainDateISO(), 'yyyy-MM-dd') // "2026-08-04"
 * format(zdt, "MMM d, yyyy 'at' h:mm a") // "Aug 4, 2026 at 3:45 PM"
 * format(zdt, 'MMMM d, yyyy', { locale: 'fr-FR' }) // "août 4, 2026"
 *
 * Throws on a token the input type doesn't support (e.g. 'HH' on a PlainDate).
 */
export function format(temporal: TemporalLike, formatStr: string, options: NumberingFormatOptions = {}): string {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  const pieces = getPieces(formatStr);
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

  // Numeral transliteration happens last and only on request — every
  // upstream token handler still emits plain ASCII digits, so this is
  // the single place output digits can diverge from that default.
  return applyNumbering(result, options);
}

// Shape mirrors Intl.DateTimeFormat.formatToParts: each entry is either
// a literal (carrying no token info) or a token piece (carrying the
// token string and the formatted value). Letting callers iterate parts
// means they can build custom output — strip a token, swap a separator,
// render each token to its own DOM node — without re-implementing the
// tokenizer or the field-check logic.
export interface FormattedPart {
  type: 'literal' | 'token';
  value: string;
  // Present when `type === 'token'`. Carries the token string (e.g. "yyyy")
  // so a caller can look up its metadata via tokenInfo() from analyze.ts.
  token?: string;
}

export function formatToParts(temporal: TemporalLike, formatStr: string, options: NumberingFormatOptions = {}): FormattedPart[] {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }
  const locale = options.locale ?? DEFAULT_LOCALE;
  const pieces = getPieces(formatStr);
  const result: FormattedPart[] = [];
  for (const piece of pieces) {
    if (piece.kind === 'literal') {
      // Collapse adjacent literals so formatToParts stays consistent with
      // how format() walks pieces — a multi-char literal "at " is one
      // entry, not one per character. Same merge logic as appendLiteral
      // in tokenize.ts.
      const last = result[result.length - 1];
      if (last && last.type === 'literal') {
        last.value += piece.value;
      } else {
        result.push({ type: 'literal', value: piece.value });
      }
      continue;
    }
    const handler = HANDLER_BY_TOKEN.get(piece.value);
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
    // Numeral transliteration applies per-token-part here, rather than
    // once at the end like format() does, so a caller styling individual
    // parts (e.g. one <span> per token) still gets correctly-transliterated
    // digits in each part instead of plain ASCII.
    result.push({ type: 'token', value: applyNumbering(handler.fn(temporal, locale), options), token: piece.value });
  }
  return result;
}

// Pre-compiles a format string into an object whose format()/formatToParts()
// methods skip the tokenization step on every call. The tokenizeCache in
// this module means a plain format(temporal, fmt) call already pays only
// a Map lookup for tokenization after the first call, so compileFormat()
// is mostly a typing/ergonomics affordance — useful for callers who want
// to hold onto a compiled form explicitly (e.g. to inspect the pieces
// via the .pieces property, or to pass the compiled object around
// instead of the string).
export interface CompiledFormat {
  format(temporal: TemporalLike, options?: NumberingFormatOptions): string;
  formatToParts(temporal: TemporalLike, options?: NumberingFormatOptions): FormattedPart[];
  readonly pieces: ReadonlyArray<Piece>;
  readonly formatStr: string;
}

export function compileFormat(formatStr: string): CompiledFormat {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }
  // Pre-tokenize once. Validation (unknown tokens, unterminated quotes)
  // happens here, not lazily on first format() call — surfaces a bad
  // format string at compile time rather than at first use, which is
  // the point of compiling up front.
  const pieces = getPieces(formatStr);
  return {
    formatStr,
    pieces,
    format(temporal: TemporalLike, options: NumberingFormatOptions = {}) {
      const locale = options.locale ?? DEFAULT_LOCALE;
      let result = '';
      for (const piece of pieces) {
        if (piece.kind === 'literal') {
          result += piece.value;
          continue;
        }
        const handler = HANDLER_BY_TOKEN.get(piece.value);
        if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
        if (temporal[handler.field] === undefined) {
          throw new Error(
            `temporal-fmt: token "${piece.value}" requires "${handler.field}", ` +
            `which this Temporal object doesn't have. ` +
            `(e.g. PlainDate has no time fields, PlainTime has no date fields)`
          );
        }
        result += handler.fn(temporal, locale);
      }
      return applyNumbering(result, options);
    },
    formatToParts(temporal: TemporalLike, options: NumberingFormatOptions = {}) {
      const locale = options.locale ?? DEFAULT_LOCALE;
      const out: FormattedPart[] = [];
      for (const piece of pieces) {
        if (piece.kind === 'literal') {
          const last = out[out.length - 1];
          if (last && last.type === 'literal') last.value += piece.value;
          else out.push({ type: 'literal', value: piece.value });
          continue;
        }
        const handler = HANDLER_BY_TOKEN.get(piece.value);
        if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
        if (temporal[handler.field] === undefined) {
          throw new Error(
            `temporal-fmt: token "${piece.value}" requires "${handler.field}", ` +
            `which this Temporal object doesn't have. ` +
            `(e.g. PlainDate has no time fields, PlainTime has no date fields)`
          );
        }
        out.push({ type: 'token', value: applyNumbering(handler.fn(temporal, locale), options), token: piece.value });
      }
      return out;
    },
  };
}

// Exported so analyze.ts can reuse the same tokenization cache rather
// than re-tokenizing when a caller asks for both a format() and an
// analyzeFormat() on the same string.
export function _getPieces(formatStr: string): Piece[] {
  return getPieces(formatStr);
}

// Exported for analyze.ts — same reason as above. The handler map is
// the source of truth for "what field does this token need" — analyze
// consumes it to compute requiredFields and compatibleTypes.
export function _handlerFor(token: string): { fn: (t: TemporalLike, locale: string) => string; field: keyof TemporalLike } | undefined {
  return HANDLER_BY_TOKEN.get(token);
}
