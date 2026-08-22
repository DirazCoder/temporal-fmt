import { TOKENS } from './tokens.js';
import { FormatSyntaxError, UnknownTokenError } from './errors.js';

export type Piece =
  | { kind: 'token'; value: string }
  | { kind: 'literal'; value: string };

// longest-first so the greedy scan never matches "M" when "MMMM" was there
const SORTED_TOKEN_STRINGS = TOKENS.map(([tok]) => tok).sort((a, b) => b.length - a.length);

/**
 * Splits a format string like `"yyyy-MM-dd 'at' HH:mm"` into token/literal
 * pieces. Text in single quotes is always literal (e.g. write 'rd' in
 * "3rd" so it's not read as the day token). A doubled quote ('') means a
 * literal quote character, both inside a quoted span and standalone.
 */
export function tokenize(format: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;

  while (i < format.length) {
    const ch = format[i];

    if (ch === "'") {
      // check doubled-quote first or "''best''" parses wrong
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
        throw new FormatSyntaxError({
          format,
          message: `temporal-fmt: unterminated quote in format string "${format}"`,
        });
      }

      appendLiteral(pieces, literal);
      i = j;
      continue;
    }

    const match = SORTED_TOKEN_STRINGS.find((tok) => format.startsWith(tok, i));
    if (match) {
      // match is already the longest registered token starting at i, so
      // one more of its last character can't be a token of its own —
      // it'd fall through to whatever token or literal rule handles that
      // character next, silently splicing an unrelated field onto this
      // one (e.g. "zzzz" used to read as zzz + literal "z", "MMMMM" as
      // MMMM + the numeric-month token M). Treat the whole overlong run
      // as one unrecognized token instead.
      const runChar = match[match.length - 1];
      if (format[i + match.length] === runChar) {
        let end = i + match.length;
        while (format[end] === runChar) end += 1;
        // UnknownTokenError, not FormatSyntaxError: wrapUntypedError's
        // classifier already treats this exact message ("isn't a
        // recognized token") as UNKNOWN_TOKEN (see errors.test.js's
        // "overlong token run classifies as UnknownTokenError"), and a
        // direct throw here needs to agree with what safeParse's fallback
        // path would have classified it as.
        throw new UnknownTokenError({
          format,
          token: format.slice(i, end),
          message:
            `temporal-fmt: "${format.slice(i, end)}" in format string "${format}" isn't a recognized token — ` +
            `did you mean "${match}"?`,
        });
      }
      pieces.push({ kind: 'token', value: match });
      i += match.length;
      continue;
    }

    // not a token or quote — pass through as-is
    appendLiteral(pieces, ch);
    i += 1;
  }

  return pieces;
}

// merges into the previous piece if it's also a literal, so "---" is one
// piece instead of three
function appendLiteral(pieces: Piece[], value: string): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind === 'literal') {
    last.value += value;
  } else {
    pieces.push({ kind: 'literal', value });
  }
}