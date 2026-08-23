import type { Piece } from './tokenize.js';
import { tokenFragment, UNPADDED_NUMERIC_TOKENS, DIGIT_LEADING_TOKENS } from './pattern.js';
import { FormatSyntaxError } from './errors.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Guards against catastrophic-backtracking (ReDoS) patterns.
//
// Every confirmed ReDoS in this library shares one shape: two or more
// variable-width digit-consuming regex fragments placed so the engine
// can't tell where one ends and the next begins — either glued with no
// separator ("MdMdMd…", "HmsHms…") or separated only by a literal that
// itself starts with a digit ("M1M1M1…", "yyyy1yyyy1…"). Each fragment
// then has multiple ways to divide the digit run, and a failing match
// makes the engine explore every combination — exponential in the number
// of fragments. Measured against the pre-fix code: "Md"×13 (26-char
// format, 40-char input) ≈ 2.7 s; "yyyy1"×8 (48-char format) ≈ 26 s;
// both grow roughly ×3–14 per additional fragment.
//
// Three structural defenses, applied at pattern-build time:
//
//  1. A run of 2+ glued unpadded-numeric tokens is emitted as ONE
//     bounded digit group `(?<rN>\d{R,2R})` instead of R separate
//     variable-width fragments. The per-token split is resolved after
//     the match by enumerateValidSplits() (pattern.ts) — the exact
//     machinery parse() already used to detect ambiguous glued runs —
//     so the documented behavior (unique split resolves; 2+ valid
//     splits throws in strict mode / heuristic-picks in lenient; 0
//     splits is a mismatch) is preserved. A lone `\d{R,2R}` group
//     backtracks at most R+1 times, which is linear.
//
//  2. yyyy uses the exact `-?\d{4}` fragment not only when the next
//     *token* is digit-leading (existing rule) but also when the next
//     *literal* starts with a digit. An open-ended `-?\d{4,}` year
//     glued to a digit literal is the cheapest exponential engine
//     there is (unbounded width choices per year), and the exact form
//     matches everything the open-ended form matched in that position
//     except years with 5+ digits glued directly to an unquoted digit
//     literal — a pathological corner deliberately traded away.
//
//  3. An ambiguity budget for what's left: every adjacency between a
//     variable-width digit consumer (a lone unpadded token, or a glued
//     run group) and a digit-consuming successor (a digit-leading token
//     or a literal starting with a digit) costs log2 of the consumer's
//     width choices. A pattern whose total exceeds MAX_AMBIGUITY_BITS
//     (12 — a hard ceiling of 4096 backtrack paths) is rejected at
//     build time with a FormatSyntaxError. Realistic format strings
//     score 0–3; the "M1M1M1…" attack scores one bit per glued pair.
const MAX_AMBIGUITY_BITS = 12;

function widthChoicesBits(choices: number): number {
  return Math.ceil(Math.log2(Math.max(choices, 1)));
}

// Does this piece's regex fragment START by consuming a bare digit?
// (Tokens whose match can begin with 0-9, and literals whose first
// character is a digit.) Used to find the boundaries where a preceding
// variable-width digit consumer could trade digits with a successor.
function isDigitConsumingStart(piece: Piece | undefined): boolean {
  if (piece === undefined) return false;
  if (piece.kind === 'literal') return /^[0-9]/.test(piece.value);
  return DIGIT_LEADING_TOKENS.has(piece.value);
}

export interface CapturingPattern {
  regex: RegExp;
  groups: Array<{ name: string; token: string }>; // token pieces, in order
  // Runs of 2+ adjacent unpadded-numeric tokens with no literal separator
  // between them (e.g. "Md", "Hms"). Each run is captured by ONE regex
  // group named `groupName` spanning the run's whole digit run
  // (R..2·R digits); per-token values come from enumerateValidSplits()
  // at match time. `groupNames` lists the per-token group names — they
  // appear in `groups` for structure/positions but have no counterpart
  // in the regex itself, so consumers must read their values from the
  // split enumeration, not from match.groups.
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

  // Tracks the current run of adjacent unpadded-numeric token pieces (no
  // literal or non-unpadded token has broken it yet). Names are recorded
  // in declaration order so a run of 2+ can emit one group while its
  // member tokens still get individual entries in `groups`.
  let currentRun: { names: string[]; tokens: string[] } = { names: [], tokens: [] };

  const flushRun = (nextPiece: Piece | undefined) => {
    if (currentRun.tokens.length === 1) {
      // A lone unpadded token: emit its normal (two-way) fragment. Two
      // width choices are harmless on their own; if the next element
      // can consume a digit, charge one ambiguity bit for the boundary.
      const name = currentRun.names[0]!;
      const token = currentRun.tokens[0]!;
      source += `(?<${name}>${tokenFragment(token, locale)})`;
      if (isDigitConsumingStart(nextPiece)) ambiguityBits += 1;
    } else if (currentRun.tokens.length >= 2) {
      // Emit the accumulated run as ONE bounded digit group. R unpadded
      // tokens accept between R and 2R digits in total; anything outside
      // that span can't match regardless of how the digits split, so the
      // single group's acceptance region is exactly the union of the old
      // per-token fragments' regions. Backtracking into this group is
      // bounded at R+1 width choices — linear, not exponential.
      const runName = `r${i++}`;
      const tokenCount = currentRun.tokens.length;
      source += `(?<${runName}>\\d{${tokenCount},${tokenCount * 2}})`;
      // Note: no `groups` entry for the run group itself — `groups` lists
      // per-token pieces only (its members were already pushed when
      // visited), so consumers like parseToParts see exactly one entry
      // per token, same as before this run-group change. The regex group
      // is reached through ambiguousRuns[].groupName.
      ambiguousRuns.push({
        groupName: runName,
        groupNames: currentRun.names,
        tokens: currentRun.tokens,
      });
      // A run group adjacent to a digit-consuming successor keeps its
      // (R+1) width choices at that boundary — charge the budget.
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
      // Part of a (potential) glued run — defer fragment emission to
      // flushRun so a run of 2+ collapses into one bounded group.
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
    // yyyy picks its fragment based on what follows: the exact 4-digit
    // form whenever a digit-consuming element comes next (digit-leading
    // token — the pre-existing rule — OR a literal starting with a
    // digit, added by the ReDoS fix; see the guard block above). The
    // open-ended form is only safe when nothing digit-consuming can
    // follow it.
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

  // 'd' flag enables match.indices.groups — used by parseToParts to
  // report each token's actual position in the input. Without it,
  // computing per-group positions would require a separate walk of the
  // piece list against the input, duplicating logic the regex already
  // has. Backward-compatible: 'd' only adds an `indices` property to
  // the match result, no behavioral change to the match itself.
  return { regex: new RegExp(`^(?:${source})$`, 'ud'), groups, ambiguousRuns };
}
