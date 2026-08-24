// translates Day.js / date-fns format strings — this is what backs the
// CLI's `translate` subcommand. the mapping tables were already sitting
// in ideData.ts (built for the IDE tooling), so this just builds the
// actual string translator on top instead of pulling in anything else.
//
// heads up: this only handles format *strings* ("YYYY-MM-DD" -> "yyyy-MM-dd"),
// not an actual AST codemod that goes and rewrites call sites in your code.
// that's a bigger separate thing — check temporal-fmt-codemod if that's
// what you actually need

import { DAYJS_TO_TEMPORAL_FMT, DATE_FNS_TO_TEMPORAL_FMT, type TokenConversionHint } from './ideData.js';

interface SourcePiece {
  kind: 'token' | 'literal';
  value: string;
}

// Day.js and date-fns escape literal text with square brackets — [MM]
// stays as literal "MM" — not single quotes like temporal-fmt does.
// splitting on brackets first keeps the token scan below from accidentally
// matching stuff inside an escaped span
function splitOnBrackets(source: string): SourcePiece[] {
  const pieces: SourcePiece[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] === '[') {
      const end = source.indexOf(']', i + 1);
      if (end === -1) {
        pieces.push({ kind: 'token', value: source.slice(i) });
        break;
      }
      pieces.push({ kind: 'literal', value: source.slice(i + 1, end) });
      i = end + 1;
    } else {
      let j = i;
      while (j < source.length && source[j] !== '[') j += 1;
      pieces.push({ kind: 'token', value: source.slice(i, j) });
      i = j;
    }
  }
  return pieces;
}

// splits a non-bracketed span into runs, matching greedy-longest against
// the known token table — basically the same idea as tokenize.ts, just
// scanning the SOURCE library's tokens here instead of temporal-fmt's own
function splitIntoRuns(span: string, sortedFrom: string[]): SourcePiece[] {
  const pieces: SourcePiece[] = [];
  let i = 0;
  while (i < span.length) {
    const match = sortedFrom.find((tok) => span.startsWith(tok, i));
    if (match) {
      pieces.push({ kind: 'token', value: match });
      i += match.length;
      continue;
    }
    const last = pieces[pieces.length - 1];
    if (last && last.kind === 'literal') {
      last.value += span[i];
    } else {
      pieces.push({ kind: 'literal', value: span[i] });
    }
    i += 1;
  }
  return pieces;
}

function translate(source: string, table: TokenConversionHint[], sourceLibLabel: string): string {
  const byFrom = new Map(table.map((hint) => [hint.from, hint.to]));
  const sortedFrom = [...byFrom.keys()].sort((a, b) => b.length - a.length);

  const bracketPieces = splitOnBrackets(source);
  let out = '';
  for (const piece of bracketPieces) {
    if (piece.kind === 'literal') {
      // re-escape for temporal-fmt's quote syntax — any literal quote
      // char inside the escaped bit needs doubling up
      out += `'${piece.value.replace(/'/g, "''")}'`;
      continue;
    }
    for (const run of splitIntoRuns(piece.value, sortedFrom)) {
      if (run.kind === 'token') {
        const mapped = byFrom.get(run.value);
        if (mapped === undefined || mapped === null) {
          throw new Error(
            `temporal-fmt: "${run.value}" has no ${sourceLibLabel} -> temporal-fmt mapping ` +
            `(in format string "${source}"). Write the equivalent temporal-fmt token in by hand, ` +
            `or wrap it in brackets if it was meant as literal text.`
          );
        }
        out += mapped;
      } else if (/[a-zA-Z]/.test(run.value)) {
        // can't just let unrecognized letters through as-is — temporal-fmt
        // would read them as its own tokens by accident. gotta quote the run
        out += `'${run.value.replace(/'/g, "''")}'`;
      } else {
        out += run.value;
      }
    }
  }
  return out;
}

/**
 * Translates a Day.js format string to the equivalent temporal-fmt
 * token string.
 *
 * ```js
 * translateDayjsFormatString('YYYY-MM-DD HH:mm:ss'); // "yyyy-MM-dd HH:mm:ss"
 * translateDayjsFormatString('[Q]Q YYYY');            // "'Q'Q yyyy" (bracketed text stays literal)
 * ```
 *
 * Throws if the format string uses a Day.js token with no temporal-fmt
 * equivalent (`Do`, `Mo`, `Qo`, `k`, `kk`, `X`, `x`, the localized
 * `L`-family tokens) — these need to be rewritten by hand, since
 * there's no single temporal-fmt token that means the same thing.
 *
 * Note: `Do`/`Mo`/`Qo`/`k`/`kk`/`X`/`x` only have meaning in Day.js
 * once the `AdvancedFormat` (and, for `X`/`x`, base) plugins are
 * loaded — without them Day.js silently glues the parts together or
 * passes the letters through unrendered instead of erroring. This
 * function assumes the plugin is loaded, since that's the common case
 * for anyone who put these tokens in a format string on purpose.
 */
export function translateDayjsFormatString(formatStr: string): string {
  return translate(formatStr, DAYJS_TO_TEMPORAL_FMT, 'Day.js');
}

/**
 * Translates a date-fns format string to the equivalent temporal-fmt
 * token string. date-fns already uses Unicode-style tokens close to
 * temporal-fmt's own, so most strings pass through with only a case
 * change on the weekday tokens; the notable divergences are date-fns's
 * `D`/`DD` (day-of-year, matches temporal-fmt already) versus its `d`/
 * `dd` (day-of-month, also matches already) and the locale-dependent
 * `P`/`p` composite tokens, which have no single temporal-fmt token
 * and throw.
 */
export function translateDateFnsFormatString(formatStr: string): string {
  return translate(formatStr, DATE_FNS_TO_TEMPORAL_FMT, 'date-fns');
}
