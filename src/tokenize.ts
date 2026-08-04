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
 * Two single quotes in a row ('') represent one literal quote character.
 */
export function tokenize(format: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;

  while (i < format.length) {
    const ch = format[i];

    if (ch === "'") {
      // Escaped quote: '' -> literal '
      if (format[i + 1] === "'") {
        pieces.push({ kind: 'literal', value: "'" });
        i += 2;
        continue;
      }
      // Scan to the closing quote, everything inside is literal text
      const end = format.indexOf("'", i + 1);
      if (end === -1) {
        throw new Error(`temporal-fmt: unterminated quote in format string "${format}"`);
      }
      pieces.push({ kind: 'literal', value: format.slice(i + 1, end) });
      i = end + 1;
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
    pieces.push({ kind: 'literal', value: ch });
    i += 1;
  }

  return pieces;
}
