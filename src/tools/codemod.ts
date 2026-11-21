/*
 * Copyright 2026 DirazCoder
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

// How the SOURCE library escapes literal text. Day.js uses square
// brackets ([MM] is a literal "MM"); date-fns uses single quotes
// ('MM' is a literal "MM", and '' inside a quoted span is one ').
// The old code applied bracket-splitting to BOTH dialects — for
// date-fns that meant a format like "yyyy 'at' HH:mm" had its quotes
// treated as raw literal characters, producing corrupted output the
// library itself rejects ("yyyy 'a't'' 'HH:mm").
type EscapeStyle = 'brackets' | 'quotes';

function splitOnBrackets(source: string): SourcePiece[] {
  const pieces: SourcePiece[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] === '[') {
      const end = source.indexOf(']', i + 1);
      if (end === -1) {
        // Unterminated bracket: Day.js renders the bracket and the rest
        // as literal text, so translate it as literal (bracket included)
        // rather than feeding it to the token mapper.
        pieces.push({ kind: 'literal', value: source.slice(i) });
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

// date-fns quote-splitting: '...' spans are literal (with '' as an
// escaped quote), everything else is token-text. An unterminated
// quote makes the remainder literal, matching date-fns's own parser.
function splitOnQuotes(source: string): SourcePiece[] {
  const pieces: SourcePiece[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] === "'") {
      let j = i + 1;
      let literal = '';
      let closed = false;
      /* v8 ignore start */
      while (j < source.length) {
        if (source[j] === "'") {
          if (source[j + 1] === "'") {
            literal += "'";
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        literal += source[j]!;
        j += 1;
      }
      /* v8 ignore stop */
      pieces.push({ kind: 'literal', value: literal });
      i = j; // when !closed, j === source.length: rest is literal
      void closed;
    } else {
      let j = i;
      while (j < source.length && source[j] !== "'") j += 1;
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

function translate(source: string, table: TokenConversionHint[], sourceLibLabel: string, escapeStyle: EscapeStyle): string {
  const byFrom = new Map(table.map((hint) => [hint.from, hint.to]));
  const sortedFrom = [...byFrom.keys()].sort((a, b) => b.length - a.length);

  const escapePieces = escapeStyle === 'brackets' ? splitOnBrackets(source) : splitOnQuotes(source);
  // Output pieces, merged before emission: two adjacent literals used
  // to be quoted separately, and `'foo''bar'` in temporal-fmt is ONE
  // quoted span containing "foo'bar" (the doubled quote is an escape
  // inside the span) — so [foo][bar] translated to output that rendered
  // as "foo'bar" with a spurious apostrophe at the seam. Merging
  // neighboring literals first emits one span per run: 'foobar'.
  // Non-letter literal runs (separators like " - ", digits) stay
  // unquoted, exactly as before.
  const outPieces: Array<{ kind: 'quotedLiteral' | 'raw'; value: string }> = [];
  const pushQuoted = (value: string) => {
    /* c8 ignore next @preserve -- empty literal runs are intentionally omitted */
    if (value === '') return; // '[]' used to emit "''", which temporal-fmt renders as an apostrophe — not nothing
    const last = outPieces[outPieces.length - 1];
    if (last && last.kind === 'quotedLiteral') last.value += value;
    else outPieces.push({ kind: 'quotedLiteral', value });
  };
  const pushRaw = (value: string) => {
    const last = outPieces[outPieces.length - 1];
    if (last && last.kind === 'raw') last.value += value;
    else outPieces.push({ kind: 'raw', value });
  };
  for (const piece of escapePieces) {
    if (piece.kind === 'literal') {
      // Literal text that contains no letters and no quote characters
      // (digits, separators, a bare bracket) is safe to pass through
      // unquoted — quoting it would be harmless but noisy.
      if (/[a-zA-Z']/.test(piece.value)) pushQuoted(piece.value);
      else pushRaw(piece.value);
      continue;
    }
    for (const run of splitIntoRuns(piece.value, sortedFrom)) {
      if (run.kind === 'token') {
        const mapped = byFrom.get(run.value);
        if (mapped === undefined || mapped === null) {
          throw new Error(
            `temporal-fmt: "${run.value}" has no ${sourceLibLabel} -> temporal-fmt mapping ` +
            `(in format string "${source}"). Write the equivalent temporal-fmt token in by hand, ` +
            `or wrap it in ${escapeStyle === 'brackets' ? 'brackets' : 'quotes'} if it was meant as literal text.`
          );
        }
        pushRaw(mapped);
      } else if (/[a-zA-Z]/.test(run.value)) {
        // can't just let unrecognized letters through as-is — temporal-fmt
        // would read them as its own tokens by accident. gotta quote the run
        pushQuoted(run.value);
      } else {
        pushRaw(run.value);
      }
    }
  }
  return outPieces.map((p) => p.kind === 'quotedLiteral' ? `'${p.value.replace(/'/g, "''")}'` : p.value).join('');
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
  return translate(formatStr, DAYJS_TO_TEMPORAL_FMT, 'Day.js', 'brackets');
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
 *
 * date-fns escapes literal text with single quotes, not brackets:
 * `yyyy 'at' HH:mm` (with `''` for a literal quote inside a span).
 * The translation now understands that dialect — brackets have no
 * special meaning to date-fns, so they pass through as literal
 * characters.
 */
export function translateDateFnsFormatString(formatStr: string): string {
  return translate(formatStr, DATE_FNS_TO_TEMPORAL_FMT, 'date-fns', 'quotes');
}
