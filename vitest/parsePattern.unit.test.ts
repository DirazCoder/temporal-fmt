import { describe, expect, it } from 'vitest';
import { buildCapturingPattern } from '../src/parsePattern.js';
import { tokenize } from '../src/tokenize.js';

// parse.test.js and combinatorial.test.js only exercise this indirectly,
// by parsing format strings end to end through parse(). These go straight
// at buildCapturingPattern so a failure names the actual broken piece
// (wrong group order, a run that didn't break, an unescaped literal)
// instead of surfacing as "parse('...') returned the wrong date".
describe('buildCapturingPattern', () => {
  it('builds one named group per token piece, in declaration order', () => {
    const result = buildCapturingPattern(tokenize('yyyy-MM-dd'), 'en-US');
    expect(result.groups).toEqual([
      { name: 'g0', token: 'yyyy' },
      { name: 'g1', token: 'MM' },
      { name: 'g2', token: 'dd' },
    ]);
  });

  it('names groups positionally, not by token identity, so a repeated token gets distinct names', () => {
    // "M" appears twice; both need their own group rather than colliding
    const result = buildCapturingPattern(tokenize("M'/'M"), 'en-US');
    expect(result.groups.map((g) => g.name)).toEqual(['g0', 'g1']);
  });

  it('escapes regex-special characters in literals', () => {
    // '.' and '*' are regex metacharacters; unescaped they'd match any
    // character / zero-or-more, not the literal characters themselves
    const result = buildCapturingPattern(tokenize("'a.b*c'"), 'en-US');
    expect(result.regex.source).toBe('^(?:a\\.b\\*c)$');
    expect(result.groups).toEqual([]);
  });

  it('anchors the regex to a full match with the unicode + indices flags set', () => {
    const result = buildCapturingPattern(tokenize('yyyy'), 'en-US');
    expect(result.regex.source.startsWith('^(?:')).toBe(true);
    expect(result.regex.source.endsWith(')$')).toBe(true);
    // 'u' (unicode) was the original flag; 'd' (indices) was added in
    // Phase 1 so parseToParts() can report each token's exact position
    // in the input via match.indices.groups. Backward-compatible —
    // existing consumers of the match result see no behavioral change,
    // only an additional `indices` property.
    // V8 normalizes regex flag order alphabetically when constructing,
    // so 'ud' comes back as 'du'. Both flags are present — that's what
    // the test is really asserting.
    expect(result.regex.flags).toBe('du');
  });

  describe('ambiguousRuns', () => {
    it('flags two adjacent unpadded numeric tokens with no separator', () => {
      // M and d are both unpadded (1-2 digits, no leading zero) — "12"
      // could split as M=1,d=2 or M=12,d=missing, so this needs the
      // split-ambiguity check at match time
      const result = buildCapturingPattern(tokenize('Md'), 'en-US');
      expect(result.ambiguousRuns).toEqual([{ groupNames: ['g0', 'g1'], tokens: ['M', 'd'] }]);
    });

    it('is not date-specific — an unpadded hour/minute run is flagged the same way', () => {
      const result = buildCapturingPattern(tokenize('Hm'), 'en-US');
      expect(result.ambiguousRuns).toEqual([{ groupNames: ['g0', 'g1'], tokens: ['H', 'm'] }]);
    });

    it('a literal separator breaks the run, even a single character', () => {
      const result = buildCapturingPattern(tokenize('M/d'), 'en-US');
      expect(result.ambiguousRuns).toEqual([]);
    });

    it('a padded token breaks the run instead of joining it, even between two unpadded tokens', () => {
      // H and s are both unpadded and both run-eligible; without the
      // break, they'd wrongly chain into a single ambiguous run straight
      // through "mm" even though mm itself never joins the run. Can't
      // test this within one field (M/d/etc.) since the tokenizer always
      // coalesces adjacent same-letter runs into MM/MMM/dd before this
      // function ever sees them — hour/minute/second is the minimal case
      // that actually has an unpadded-padded-unpadded sandwich.
      const result = buildCapturingPattern(tokenize('Hmms'), 'en-US');
      expect(result.ambiguousRuns).toEqual([]);
    });

    it('a locale-vocabulary token (not a numeric fragment at all) is untouched by run tracking', () => {
      const result = buildCapturingPattern(tokenize('MMMM d'), 'en-US');
      expect(result.ambiguousRuns).toEqual([]);
    });

    it('a lone unpadded token surrounded by separators is not a run of one', () => {
      const result = buildCapturingPattern(tokenize('Mah'), 'en-US');
      expect(result.ambiguousRuns).toEqual([]);
    });

    it('a run that ends the pattern is still flushed and flagged', () => {
      // no trailing literal after "d" — this only passes if the final
      // flushRun() after the loop actually runs
      const result = buildCapturingPattern(tokenize('yyyy-Md'), 'en-US');
      expect(result.ambiguousRuns).toEqual([{ groupNames: ['g1', 'g2'], tokens: ['M', 'd'] }]);
    });
  });
});
