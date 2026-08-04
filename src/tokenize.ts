import { TOKENS } from './tokens.js';

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
        throw new Error(`temporal-fmt: unterminated quote in format string "${format}"`);
      }

      appendLiteral(pieces, literal);
      i = j;
      continue;
    }

    const match = SORTED_TOKEN_STRINGS.find((tok) => format.startsWith(tok, i));
    if (match) {
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
