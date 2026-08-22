// Day.js / date-fns format-string translation (plan section AD, CLI
// `translate` subcommand). This used to shell out to a separate
// `temporal-fmt-codemod` package; as of 0.9 the mapping tables already
// live in ideData.ts for the IDE tooling, so translation is folded in
// here instead of depending on an external, unpublished package.
//
// Scope: format *strings* only (`"YYYY-MM-DD"` -> `"yyyy-MM-dd"`), not
// an AST codemod that rewrites call sites. A tool that rewrites
// `dayjs(x).format(fmt)` call expressions across a codebase is a
// separate, much bigger project than this library takes on.

import { DAYJS_TO_TEMPORAL_FMT, DATE_FNS_TO_TEMPORAL_FMT, type TokenConversionHint } from './ideData.js';

interface SourcePiece {
  kind: 'token' | 'literal';
  value: string;
}

// Day.js and date-fns both escape literal text by wrapping it in
// square brackets (`[MM]` stays literal "MM"), unlike temporal-fmt's
// single-quote escaping. Splitting on that first keeps the token scan
// below from matching inside an escaped span.
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

// Splits a "token" span (the non-bracketed parts of the source string)
// into runs of identical letters and everything else, greedy-longest
// against the known token table first — same overall approach as
// tokenize.ts, but here we're scanning the *source* library's
// vocabulary rather than temporal-fmt's own.
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
      // Re-escape for temporal-fmt's quote syntax; a literal quote
      // character inside the escaped span needs doubling.
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
        // Unrecognized letters can't pass through unescaped — temporal-fmt
        // would read them as its own tokens. Quote the whole run.
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
