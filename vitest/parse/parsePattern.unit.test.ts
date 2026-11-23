import { describe, expect, it } from 'vitest';
import { buildCapturingPattern } from '../../src/parse/parsePattern.js';
import { tokenize } from '../../src/tokens/tokenize.js';
import { FormatSyntaxError } from '../../src/core/errors.js';

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
      // Runs are emitted as ONE bounded digit group (ReDoS fix — see
      // buildCapturingPattern): the run record carries the regex group
      // name (groupName) plus the per-token names it resolves.
      expect(result.ambiguousRuns).toEqual([{ groupName: 'r2', groupNames: ['g0', 'g1'], tokens: ['M', 'd'] }]);
      expect(result.regex.source).toContain('\\d{2,4}');
    });

    it('is not date-specific — an unpadded hour/minute run is flagged the same way', () => {
      const result = buildCapturingPattern(tokenize('Hm'), 'en-US');
      expect(result.ambiguousRuns).toEqual([{ groupName: 'r2', groupNames: ['g0', 'g1'], tokens: ['H', 'm'] }]);
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
      expect(result.ambiguousRuns).toEqual([{ groupName: 'r3', groupNames: ['g1', 'g2'], tokens: ['M', 'd'] }]);
    });
  });

  describe('ReDoS ambiguity budget', () => {
    it('a 2+ token run followed by a digit-leading literal charges width-choice bits without rejecting the format', () => {
      // "Md" run + literal "1": the run keeps its bounded group, and the
      // boundary against the digit literal costs ceil(log2(3)) = 2 bits —
      // well under the 12-bit ceiling, so the build succeeds and records
      // the run.
      const result = buildCapturingPattern(tokenize('Md1'), 'en-US');
      expect(result.ambiguousRuns).toEqual([{ groupName: 'r2', groupNames: ['g0', 'g1'], tokens: ['M', 'd'] }]);
      expect(result.regex.source).toContain('\\d{2,4}');
      // and it still matches what it should: M=1, d=2, literal 1
      expect(result.regex.test('121')).toBe(true);
    });

    it('a 2+ token run followed by a digit-leading token charges bits too', () => {
      // "MdH" — all three are unpadded numeric tokens, so they all join
      // ONE run (H does not break it); the run group boundary against the
      // digit-consuming successor is the (R+1)-width-choice case
      // widthChoicesBits() exists for.
      const result = buildCapturingPattern(tokenize('MdH'), 'en-US');
      expect(result.ambiguousRuns).toEqual([
        { groupName: 'r3', groupNames: ['g0', 'g1', 'g2'], tokens: ['M', 'd', 'H'] },
      ]);
      expect(result.regex.source).toContain('\\d{3,6}');
      expect(result.regex.test('12111')).toBe(true); // M=1 d=2 H=111? no — bounded
    });

    it('rejects an unbounded-width token glued to a digit-consuming neighbor at build time', () => {
      // "y" swallows any number of digits; next to a digit literal
      // there's no finite ambiguity score, so the build refuses outright.
      expect(() => buildCapturingPattern(tokenize('y1'), 'en-US')).toThrowError(FormatSyntaxError);
      expect(() => buildCapturingPattern(tokenize('y1'), 'en-US')).toThrowError(/no fixed width/);
      // same refusal when the neighbor is a digit-leading token
      expect(() => buildCapturingPattern(tokenize('yM'), 'en-US')).toThrowError(/no fixed width/);
    });

    it('yyyy immediately before a digit-leading literal uses the exact 4-digit fragment, trading away 5+ digit years', () => {
      // documented trade-off: "-?\d{4}" (not the open-ended "-?\d{4,}")
      // whenever a digit literal follows, so the year can't steal digits
      // from the literal.
      const result = buildCapturingPattern(tokenize('yyyy1'), 'en-US');
      expect(result.regex.test('20261')).toBe(true);
      // 5-digit year glued to the digit literal is deliberately rejected
      expect(result.regex.test('123451')).toBe(false);
      // negative 4-digit years still work with the exact fragment
      // (minus + 4 digits + the literal "1")
      expect(result.regex.test('-12341')).toBe(true);
    });

    it('rejects formats whose accumulated ambiguity exceeds the 12-bit ceiling', () => {
      // each "M1" pair charges 1 bit (lone unpadded token + digit literal
      // successor); 13 pairs = 13 bits > 12 → FormatSyntaxError at build
      // time instead of exponential backtracking at match time.
      const attack = 'M1'.repeat(13);
      expect(() => buildCapturingPattern(tokenize(attack), 'en-US')).toThrowError(FormatSyntaxError);
      expect(() => buildCapturingPattern(tokenize(attack), 'en-US')).toThrowError(/ambiguity score 13/);
      // 12 pairs sit exactly at the ceiling and still build fine, and
      // the built pattern still matches all-ones input (M=1 for every M)
      const ok = buildCapturingPattern(tokenize('M1'.repeat(12)), 'en-US');
      expect(ok.regex.test('1'.repeat(24))).toBe(true);
    });
  });
});

// Fraction-second tokens (S..SSSSSSSSS) parse with variable-width
// fragments \d{1,N} — short fractions right-pad. Variable width next to
// another digit consumer must be charged against the ambiguity budget
// (the ReDoS guard), which is the branch these tests pin down.
describe('buildCapturingPattern: fraction tokens next to digit consumers', () => {
  it('charges the ambiguity budget for a fraction token adjacent to a digit-consuming token', () => {
    // 'ss' is digit-leading and directly precedes 'SSS', so emitting SSS
    // takes the charge branch. The pattern still builds and matches.
    const result = buildCapturingPattern(tokenize('ssSSS'), 'en-US');
    expect(result.groups).toEqual([
      { name: 'g0', token: 'ss' },
      { name: 'g1', token: 'SSS' },
    ]);
    const match = result.regex.exec('05123');
    expect(match?.groups).toBeTruthy();
    expect(match?.groups?.g0).toBe('05');
    expect(match?.groups?.g1).toBe('123');
    // a short fraction right-pads: '051' -> ss=05, SSS=1 (100ms)
    const short = result.regex.exec('051');
    expect(short?.groups?.g1).toBe('1');
  });

  it('still rejects adversarial repeated fraction+digit glue over the ambiguity budget', () => {
    // Enough glued variable-width pairs to blow past MAX_AMBIGUITY_BITS
    // must throw at build time, exactly like glued unpadded runs do.
    expect(() => buildCapturingPattern(tokenize('ssSSSSSSSS'.repeat(6)), 'en-US')).toThrow(FormatSyntaxError);
  });
});
