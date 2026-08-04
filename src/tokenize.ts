import { TOKENS } from './tokens.js';

export type Piece =
  | { kind: 'token'; value: string }
  | { kind: 'literal'; value: string };

// Sort once, longest-first, so the greedy scanner below never matches "M"
// when "MMMM" was actually there.
const SORTED_TOKEN_STRINGS = TOKENS.map(([tok]) => tok).sort((a, b) => b.length - a.length);

/**
 * Splits a format string like `"yyyy-MM-dd 'at' HH:mm"` into a sequence of
 * token and literal pieces. Text inside single quotes is always literal —
 * that's how you escape a token that would otherwise be parsed (e.g. a
 * literal "d" in "3rd" — write 'rd' in quotes so it isn't read as the day token).
 * A doubled quote ('') anywhere means a literal single quote character —
 * this works both inside an open quoted span (e.g. 'it''s' -> it's) and
 * as a standalone escape outside one (e.g. yyyy'' -> "2026'").
 */
export function tokenize(format: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;

  while (i < format.length) {
    const ch = format[i];

    if (ch === "'") {
      // Doubled quote is always a literal ' — check this before treating
      // the quote as an open-delimiter, or "''best''" gets misread as
      // "open quote, then bare text, then open quote" instead of two
      // separate escaped-apostrophe literals around plain text.
      if (format[i + 1] === "'") {
        appendLiteral(pieces, "'");
        i += 2;
        continue;
      }

      // Otherwise this opens a quoted literal span. Scan forward, treating
      // any '' we find *inside* the span as an escaped literal quote rather
      // than the closing delimiter.
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

    // Not a token, not a quote — pass the character through as-is. This is
    // what lets you write "yyyy-MM-dd" with bare hyphens instead of quoting them.
    appendLiteral(pieces, ch);
    i += 1;
  }

  return pieces;
}

// Merges onto the previous piece when it's also a literal, so a run of
// bare characters (e.g. "---" between tokens) becomes one piece instead
// of one allocation per character.
function appendLiteral(pieces: Piece[], value: string): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind === 'literal') {
    last.value += value;
  } else {
    pieces.push({ kind: 'literal', value });
  }
}