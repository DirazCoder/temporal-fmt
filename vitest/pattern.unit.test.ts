import { describe, expect, it } from 'vitest';
import { enumerateValidSplits, UNPADDED_NUMERIC_RANGES, UNPADDED_NUMERIC_TOKENS } from '../src/pattern.js';

// The existing suite only hits this indirectly, by parsing "Md" / "dM"
// strings end to end. These go straight at the split enumeration so a
// failure names the actual broken case instead of surfacing three
// layers up as "parse('...') returned the wrong date".
describe('enumerateValidSplits', () => {
  it('returns a single split for an unambiguous run', () => {
    // "Md" against "9" — one token, one digit, only one way to split it
    expect(enumerateValidSplits('9', ['M'])).toEqual([[9]]);
  });

  it('finds every valid split when a 2-digit month/day run is genuinely ambiguous', () => {
    // "112" against ['M', 'd']: M=1,d=12 (both valid) or M=11,d=2 (both valid)
    const splits = enumerateValidSplits('112', ['M', 'd']);
    expect(splits).toEqual(
      expect.arrayContaining([
        [1, 12],
        [11, 2],
      ]),
    );
    expect(splits).toHaveLength(2);
  });

  it('rejects splits where a piece falls outside its token range', () => {
    // "13" against ['M']: no single M reading of "13" is valid (max 12),
    // and there's only one token so there's no alternate split to fall to
    expect(enumerateValidSplits('13', ['M'])).toEqual([]);
  });

  it('handles a 3-token glued run recursively, not just pairs', () => {
    // "123" against ['H','m','s'] — one digit each is the only reading
    // where every piece stays in range
    const splits = enumerateValidSplits('123', ['H', 'm', 's']);
    expect(splits).toEqual(expect.arrayContaining([[1, 2, 3]]));
  });

  it('returns empty for zero tokens with leftover digits', () => {
    expect(enumerateValidSplits('5', [])).toEqual([]);
  });

  it('returns a single empty split for zero tokens and zero digits', () => {
    expect(enumerateValidSplits('', [])).toEqual([[]]);
  });
});

describe('UNPADDED_NUMERIC_TOKENS / UNPADDED_NUMERIC_RANGES', () => {
  it('every unpadded token has a matching range entry', () => {
    for (const token of UNPADDED_NUMERIC_TOKENS) {
      expect(UNPADDED_NUMERIC_RANGES[token]).toBeDefined();
    }
  });

  it('range entries cover 1-digit and 2-digit widths with no gap or overlap', () => {
    for (const [token, ranges] of Object.entries(UNPADDED_NUMERIC_RANGES)) {
      const oneDigit = ranges.find((r) => r.digits === 1);
      const twoDigit = ranges.find((r) => r.digits === 2);
      expect(oneDigit, `${token} missing 1-digit range`).toBeDefined();
      expect(twoDigit, `${token} missing 2-digit range`).toBeDefined();
      // the two ranges should be adjacent, not overlapping and not gapped
      expect(twoDigit!.min).toBe(oneDigit!.max + 1);
    }
  });
});