import type { Piece } from './tokenize.js';
import { tokenFragment, UNPADDED_NUMERIC_TOKENS } from './pattern.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CapturingPattern {
  regex: RegExp;
  groups: Array<{ name: string; token: string }>; // token pieces, in order
  // Runs of 2+ adjacent unpadded-numeric tokens with no literal separator
  // between them (e.g. "Md", "dM", "Hm") — these need a split-ambiguity
  // check at match time, since a single fixed regex can't distinguish
  // "the only valid split" from "one of several valid splits taken
  // arbitrarily". Empty for the overwhelmingly common case (no such runs).
  ambiguousRuns: Array<{ groupNames: string[]; tokens: string[] }>;
}

/**
 * Same walk as buildPatternSource() in pattern.ts, but each token piece
 * gets its own named capture group (positionally named so the same token,
 * e.g. "yyyy", could in theory appear twice) so a caller can pull the
 * matched substring for each token back out after a successful match.
 */
export function buildCapturingPattern(pieces: Piece[], locale: string): CapturingPattern {
  const groups: Array<{ name: string; token: string }> = [];
  const ambiguousRuns: Array<{ groupNames: string[]; tokens: string[] }> = [];
  let source = '';
  let i = 0;

  // tracks the group names/tokens of the current run of adjacent unpadded
  // numeric token pieces (no literal piece has broken it yet)
  let currentRun: { groupNames: string[]; tokens: string[] } = { groupNames: [], tokens: [] };
  const flushRun = () => {
    if (currentRun.tokens.length >= 2) {
      ambiguousRuns.push(currentRun);
    }
    currentRun = { groupNames: [], tokens: [] };
  };

  for (const [idx, piece] of pieces.entries()) {
    if (piece.kind === 'literal') {
      source += escapeRegExp(piece.value);
      flushRun(); // a literal (even a single character) breaks adjacency
      continue;
    }
    const name = `g${i++}`;
    groups.push({ name, token: piece.value });
    const nextPiece = pieces[idx + 1];
    const nextToken = nextPiece?.kind === 'token' ? nextPiece.value : undefined;
    source += `(?<${name}>${tokenFragment(piece.value, locale, nextToken)})`;

    if (UNPADDED_NUMERIC_TOKENS.has(piece.value)) {
      currentRun.groupNames.push(name);
      currentRun.tokens.push(piece.value);
    } else {
      flushRun(); // a non-unpadded-numeric token (padded, locale-aware, zzz) also breaks adjacency
    }
  }
  flushRun();

  return { regex: new RegExp(`^(?:${source})$`, 'u'), groups, ambiguousRuns };
}