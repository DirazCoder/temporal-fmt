import { describe, expect, it } from 'vitest';
import { TOKENS } from '../src/tokens.js';
import { tokenFragment } from '../src/pattern.js';

// node --test in test/offset.test.js exercises the public API end-to-end
// against the dist build. These go straight at the internals so a
// regression in formatOffset / parseOffsetString / OFFSET_SHAPES surfaces
// at the level it actually lives at, not three layers up as a wrong date
// string in the node:test suite.

describe('TOKENS table: offset tokens are registered correctly', () => {
  // Find every offset variant in TOKENS and verify its registration tuple
  // matches what format.ts/format.ts expect. A future refactor that
  // accidentally changes the field name or handler signature would
  // otherwise only show up downstream.
  const offsetTokens = TOKENS.filter(([tok]) =>
    ['X', 'XX', 'XXX', 'x', 'xx', 'xxx'].includes(tok)
  );

  it('all six offset variants are registered', () => {
    expect(new Set(offsetTokens.map(([tok]) => tok))).toEqual(
      new Set(['X', 'XX', 'XXX', 'x', 'xx', 'xxx'])
    );
  });

  it('every offset token targets the "offset" field (so format() throws on non-ZonedDateTime)', () => {
    // The ZonedDateTime-only validation happens because format() checks
    // `temporal[handler.field] === undefined` — so the field name has to
    // be exactly 'offset' for PlainDate/PlainTime/PlainDateTime to throw
    // the "requires offset" error rather than silently producing
    // undefined.
    for (const [tok, , field] of offsetTokens) {
      expect(field, `${tok}'s field should be 'offset'`).toBe('offset');
    }
  });

  it('every offset token has a function handler (not a string or other shape)', () => {
    for (const [tok, handler] of offsetTokens) {
      expect(typeof handler, `${tok}'s handler should be a function`).toBe('function');
    }
  });
});

describe('OFFSET_SHAPES via tokenFragment: each variant matches its own formatted output', () => {
  // The shape a token uses to parse has to accept the same text the
  // format side produces, or round-trips silently fail. Check every
  // variant against the literal its handler emits for both UTC and a
  // representative non-UTC offset — that's the contract that makes
  // format->parse round-trips work.
  //
  // Doesn't construct real Temporal values (these are unit tests of the
  // pattern machinery, not end-to-end behavior) — just feeds the regex
  // fragment a representative string and checks it matches with no
  // leftover characters.

  // Helper: take a token's regex fragment, anchor it, and check whether
  // a given string matches fully. Done by hand (rather than embedding in
  // a fake pattern) so the failure message names the broken fragment
  // directly.
  function matchesFully(fragment: string, input: string): boolean {
    return new RegExp(`^(?:${fragment})$`, 'u').test(input);
  }

  it('X accepts Z, +HH, and +HHMM but rejects +HH:MM', () => {
    const frag = tokenFragment('X', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+05')).toBe(true);
    expect(matchesFully(frag, '-05')).toBe(true);
    expect(matchesFully(frag, '+0530')).toBe(true);
    expect(matchesFully(frag, '-0530')).toBe(true);
    expect(matchesFully(frag, '+14')).toBe(true);
    expect(matchesFully(frag, '-12')).toBe(true);
    // X never carries a colon — that's XXX's job.
    expect(matchesFully(frag, '+05:00')).toBe(false);
  });

  it('XX accepts Z and +HHMM but rejects +HH and +HH:MM', () => {
    const frag = tokenFragment('XX', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+0500')).toBe(true);
    expect(matchesFully(frag, '-0500')).toBe(true);
    // XX always carries minutes, so +HH alone shouldn't match.
    expect(matchesFully(frag, '+05')).toBe(false);
    expect(matchesFully(frag, '+05:00')).toBe(false);
  });

  it('XXX accepts Z and +HH:MM but rejects +HHMM and +HH', () => {
    const frag = tokenFragment('XXX', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+05:00')).toBe(true);
    expect(matchesFully(frag, '-05:00')).toBe(true);
    expect(matchesFully(frag, '+05:45')).toBe(true);
    expect(matchesFully(frag, '+0500')).toBe(false);
    expect(matchesFully(frag, '+05')).toBe(false);
  });

  it('x accepts +HH and +HHMM but rejects Z', () => {
    const frag = tokenFragment('x', 'en-US');
    expect(matchesFully(frag, '+05')).toBe(true);
    expect(matchesFully(frag, '-05')).toBe(true);
    expect(matchesFully(frag, '+0530')).toBe(true);
    expect(matchesFully(frag, '-0530')).toBe(true);
    // x never emits Z — lowercase always produces a numeric offset.
    expect(matchesFully(frag, 'Z')).toBe(false);
  });

  it('xx accepts +HHMM but rejects Z and +HH', () => {
    const frag = tokenFragment('xx', 'en-US');
    expect(matchesFully(frag, '+0500')).toBe(true);
    expect(matchesFully(frag, '-0500')).toBe(true);
    expect(matchesFully(frag, 'Z')).toBe(false);
    expect(matchesFully(frag, '+05')).toBe(false);
  });

  it('xxx accepts +HH:MM but rejects Z and +HHMM', () => {
    const frag = tokenFragment('xxx', 'en-US');
    expect(matchesFully(frag, '+05:00')).toBe(true);
    expect(matchesFully(frag, '-05:00')).toBe(true);
    expect(matchesFully(frag, '+05:45')).toBe(true);
    expect(matchesFully(frag, 'Z')).toBe(false);
    expect(matchesFully(frag, '+0500')).toBe(false);
  });

  it('X prefers the longer +HHMM match over +HH when both are prefixes', () => {
    // The optional (?:\d{2})? group is greedy by default — for input
    // "+0530", the engine should consume all 4 digits, not stop at "+05"
    // and leave "30" dangling. A regression to non-greedy matching here
    // would silently break half-hour and 45-minute offset round-trips.
    const frag = tokenFragment('X', 'en-US');
    const match = new RegExp(`^(?:${frag})`).exec('+0530');
    expect(match?.[0]).toBe('+0530');
  });
});

describe('tokenFragment: offset tokens not in DIGIT_LEADING_TOKENS', () => {
  // yyyy uses YYYY_EXACT (4-digit) instead of YYYY_EXTENDED (4+ digit) when
  // the next token is in DIGIT_LEADING_TOKENS, to avoid yyyy's greediness
  // silently eating the next token's digits. Offset tokens all start with
  // +/-/Z, never a digit — so yyyy shouldn't switch to YYYY_EXACT before
  // them. The check below is indirect (via the resulting fragment for a
  // hypothetical "yyyyX" pattern) but pins the contract: yyyy next to X
  // uses the open-ended fragment, not the 4-digit-only one.
  //
  // We don't import DIGIT_LEADING_TOKENS directly because it's not
  // exported — the behavior-tested approach below is also what catches
  // regressions to the comment in pattern.ts that documents this.
  it('yyyy followed by X uses YYYY_EXTENDED (4+ digits), not YYYY_EXACT', () => {
    // If yyyy switched to YYYY_EXACT here, the next-token check would have
    // to include 'X' in DIGIT_LEADING_TOKENS — but offset tokens start
    // with +/-/Z, not a digit, so the natural digit-boundary works without
    // the explicit fragment switch.
    const yyyyFrag = tokenFragment('yyyy', 'en-US', 'X');
    // YYYY_EXTENDED is `-?\\d{4,}` — open-ended width. YYYY_EXACT is
    // `-?\\d{4}` (exactly 4). The check below tests the 5-digit year case
    // — only YYYY_EXTENDED accepts it.
    expect(new RegExp(`^(?:${yyyyFrag})$`).test('12345')).toBe(true);
  });

  it('yyyy followed by XXX also uses YYYY_EXTENDED (all six offset variants behave the same)', () => {
    for (const tok of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx']) {
      const yyyyFrag = tokenFragment('yyyy', 'en-US', tok);
      expect(
        new RegExp(`^(?:${yyyyFrag})$`).test('12345'),
        `yyyy followed by ${tok} should accept 5-digit years (YYYY_EXTENDED)`
      ).toBe(true);
    }
  });
});
