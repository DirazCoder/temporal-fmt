import type { Piece } from './tokenize.js';
import { tokenFragment } from './pattern.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CapturingPattern {
  regex: RegExp;
  groups: Array<{ name: string; token: string }>; // token pieces, in order
}

/**
 * Same walk as buildPatternSource() in pattern.ts, but each token piece
 * gets its own named capture group (positionally named so the same token,
 * e.g. "yyyy", could in theory appear twice) so a caller can pull the
 * matched substring for each token back out after a successful match.
 */
export function buildCapturingPattern(pieces: Piece[], locale: string): CapturingPattern {
  const groups: Array<{ name: string; token: string }> = [];
  let source = '';
  let i = 0;

  for (const piece of pieces) {
    if (piece.kind === 'literal') {
      source += escapeRegExp(piece.value);
      continue;
    }
    const name = `g${i++}`;
    groups.push({ name, token: piece.value });
    source += `(?<${name}>${tokenFragment(piece.value, locale)})`;
  }

  return { regex: new RegExp(`^(?:${source})$`, 'u'), groups };
}
