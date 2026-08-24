import type { Piece } from './tokenize.js';
import { tokenFragment, UNPADDED_NUMERIC_TOKENS, DIGIT_LEADING_TOKENS, UNBOUNDED_WIDTH_TOKENS } from './pattern.js';
import { FormatSyntaxError } from './errors.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// this guards against catastrophic backtracking (ReDoS) in the generated regex.
//
// every ReDoS we've actually found in this lib has the same shape: two+
// variable-width digit-consuming regex fragments sitting next to each other
// with nothing to tell the engine where one ends and the next starts —
// either glued straight together ("MdMdMd...", "HmsHms...") or separated
// only by a literal that itself starts with a digit ("M1M1M1...",
// "yyyy1yyyy1..."). each fragment then has multiple ways to split up the
// digit run, and on a failing match the engine tries every combination —
// exponential in the number of fragments. measured this against the old
// code: "Md"×13 (26-char format, 40-char input) took about 2.7s; "yyyy1"×8
// (48-char format) took about 26s. both roughly ×3-14 worse per extra
// fragment, so it gets bad fast.
//
// three fixes, all at pattern-build time:
//
//  1. a run of 2+ glued unpadded-numeric tokens now becomes ONE bounded
//     digit group `(?<rN>\d{R,2R})` instead of R separate variable-width
//     fragments. the per-token split still gets resolved after the match,
//     via enumerateValidSplits() in pattern.ts — same machinery parse()
//     already used for detecting ambiguous glued runs, so behavior's
//     unchanged (unique split resolves, 2+ valid splits throws in strict
//     mode / gets heuristic-picked in lenient, 0 splits is a mismatch).
//     a lone \d{R,2R} group only backtracks R+1 times max — linear, not
//     exponential.
//
//  2. yyyy now uses the exact -?\d{4} fragment not just when the next
//     TOKEN is digit-leading (that rule already existed) but also when
//     the next LITERAL starts with a digit. an open-ended -?\d{4,} year
//     glued right up against a digit literal is basically the cheapest
//     possible exponential blowup (unbounded width choices per year), and
//     the exact form still matches everything the open form did in that
//     spot except 5+ digit years glued directly to an unquoted digit
//     literal — a genuinely pathological edge case we're fine trading away.
//
//  3. for whatever's left: every adjacency between a variable-width digit
//     consumer (lone unpadded token, or a glued-run group) and a
//     digit-consuming successor costs log2 of the consumer's width
//     choices, added to a running "ambiguity budget". go over
//     MAX_AMBIGUITY_BITS (12 — hard ceiling of 4096 backtrack paths) and
//     we just reject the format string at build time with a
//     FormatSyntaxError. normal format strings score 0-3. the
//     "M1M1M1..." attack pattern scores one bit per glued pair.
const MAX_AMBIGUITY_BITS = 12;

function widthChoicesBits(choices: number): number {
  return Math.ceil(Math.log2(Math.max(choices, 1)));
}

// does this piece's regex fragment start by eating a bare digit? (tokens
// that can match starting with 0-9, and literals whose first char is a
// digit.) used to spot the boundaries where a variable-width digit
// consumer before it could end up trading digits with whatever follows
function isDigitConsumingStart(piece: Piece | undefined): boolean {
  if (piece === undefined) return false;
  if (piece.kind === 'literal') return /^[0-9]/.test(piece.value);
  return DIGIT_LEADING_TOKENS.has(piece.value);
}

export interface CapturingPattern {
  regex: RegExp;
  groups: Array<{ name: string; token: string }>; // token pieces, in order
  // runs of 2+ adjacent unpadded-numeric tokens glued together with no
  // literal separator (e.g. "Md", "Hms"). each run gets captured by ONE
  // regex group named `groupName` spanning the whole digit run (R..2R
  // digits) — per-token values get pulled out later by
  // enumerateValidSplits() at match time. `groupNames` is the per-token
  // group names, which show up in `groups` for structure/position but
  // don't actually exist in the regex itself, so anyone consuming this
  // needs to read values from the split enumeration, not match.groups
  ambiguousRuns: Array<{ groupName: string; groupNames: string[]; tokens: string[] }>;
}

/**
 * Same walk as buildPatternSource() in pattern.ts, but each token piece
 * gets its own named capture group (positionally named so the same token,
 * e.g. "yyyy", could in theory appear twice) so a caller can pull the
 * matched substring for each token back out after a successful match.
 */
export function buildCapturingPattern(pieces: Piece[], locale: string): CapturingPattern {
  const groups: Array<{ name: string; token: string }> = [];
  const ambiguousRuns: Array<{ groupName: string; groupNames: string[]; tokens: string[] }> = [];
  let source = '';
  let i = 0;
  let ambiguityBits = 0;

  // tracks the current run of adjacent unpadded-numeric pieces (nothing's
  // broken it yet — no literal, no non-unpadded token). names get recorded
  // in order so a run of 2+ can collapse into one group while each token
  // still gets its own entry in `groups`
  let currentRun: { names: string[]; tokens: string[] } = { names: [], tokens: [] };

  const flushRun = (nextPiece: Piece | undefined) => {
    if (currentRun.tokens.length === 1) {
      // a lone unpadded token just gets its normal two-way fragment.
      // two width choices on their own aren't a problem; only charge an
      // ambiguity bit if the next thing can also eat a digit
      const name = currentRun.names[0]!;
      const token = currentRun.tokens[0]!;
      source += `(?<${name}>${tokenFragment(token, locale)})`;
      if (isDigitConsumingStart(nextPiece)) ambiguityBits += 1;
    } else if (currentRun.tokens.length >= 2) {
      // emit the whole accumulated run as ONE bounded digit group. R
      // unpadded tokens together accept somewhere between R and 2R digits
      // total, and anything outside that range can't match no matter how
      // you split it — so this single group covers exactly the same
      // territory the old per-token fragments did, just without the
      // combinatorial backtracking. worst case here is R+1 width choices,
      // which is linear
      const runName = `r${i++}`;
      const tokenCount = currentRun.tokens.length;
      source += `(?<${runName}>\\d{${tokenCount},${tokenCount * 2}})`;
      // note: no `groups` entry for the run group itself — `groups` only
      // lists per-token pieces (already pushed when we visited them), so
      // consumers like parseToParts still see exactly one entry per token,
      // same as before this run-group thing existed. the regex group
      // itself is only reachable through ambiguousRuns[].groupName
      ambiguousRuns.push({
        groupName: runName,
        groupNames: currentRun.names,
        tokens: currentRun.tokens,
      });
      // a run group next to a digit-consuming successor still keeps its
      // (R+1) width choices at that boundary, so charge the budget for it
      if (isDigitConsumingStart(nextPiece)) {
        ambiguityBits += widthChoicesBits(tokenCount + 1);
      }
    }
    currentRun = { names: [], tokens: [] };
  };

  for (const [idx, piece] of pieces.entries()) {
    if (piece.kind === 'literal') {
      flushRun(piece);
      source += escapeRegExp(piece.value);
      continue;
    }

    if (UNPADDED_NUMERIC_TOKENS.has(piece.value)) {
      // part of a (possible) glued run — hold off emitting the fragment
      // and let flushRun deal with it, so 2+ in a row collapse into one
      // bounded group instead of staying separate
      const name = `g${i++}`;
      groups.push({ name, token: piece.value });
      currentRun.names.push(name);
      currentRun.tokens.push(piece.value);
      continue;
    }

    flushRun(piece);
    const name = `g${i++}`;
    groups.push({ name, token: piece.value });
    const nextPiece = pieces[idx + 1];
    const nextToken = nextPiece?.kind === 'token' ? nextPiece.value : undefined;

    // "y" doesn't have a bounded fallback the way yyyy does (check
    // tokenFragment in pattern.ts) — it's unpadded by definition, so
    // there's no narrower fixed-width shape underneath it to fall back
    // to. "any number of digits" sitting right next to another digit
    // consumer has no finite ambiguity score we could charge against
    // MAX_AMBIGUITY_BITS, so we just refuse it outright at build time
    // instead of trying to estimate something
    if (UNBOUNDED_WIDTH_TOKENS.has(piece.value) && isDigitConsumingStart(nextPiece)) {
      throw new FormatSyntaxError({
        reason:
          `token "${piece.value}" has no fixed width — it can't be placed directly next to another ` +
          `digit-reading token or a literal that starts with a digit, since there's no way to tell ` +
          `where "${piece.value}" ends and the next field begins. Add a non-digit separator (e.g. "-" or " ") after it.`,
      });
    }

    // yyyy's fragment depends on what comes next: exact 4-digit form
    // whenever something digit-consuming follows (digit-leading token —
    // the original rule — OR a literal starting with a digit, added as
    // part of the ReDoS fix above). the open-ended form is only safe
    // when nothing digit-consuming can come right after it
    if (piece.value === 'yyyy' && nextToken === undefined && isDigitConsumingStart(nextPiece)) {
      source += `(?<${name}>${tokenFragment(piece.value, locale, 'M')})`;
    } else {
      source += `(?<${name}>${tokenFragment(piece.value, locale, nextToken)})`;
    }
  }
  flushRun(undefined);

  if (ambiguityBits > MAX_AMBIGUITY_BITS) {
    throw new FormatSyntaxError({
      reason:
        `format string has too many variable-width numeric tokens glued to digit-consuming neighbors ` +
        `(ambiguity score ${ambiguityBits} > ${MAX_AMBIGUITY_BITS}). ` +
        `This shape makes the regex engine backtrack exponentially on near-miss input. ` +
        `Add a non-digit separator between these tokens (e.g. "-" or " ") or use their padded forms (MM/dd/HH/mm/ss).`,
    });
  }

  // the 'd' flag turns on match.indices.groups, which parseToParts uses
  // to report where each token actually landed in the input. without it
  // we'd need a whole separate walk of the piece list against the input
  // to compute positions — duplicating logic the regex engine's already
  // doing for us. safe to add: 'd' only adds an `indices` property to
  // the result, doesn't change matching behavior at all
  return { regex: new RegExp(`^(?:${source})$`, 'ud'), groups, ambiguousRuns };
}