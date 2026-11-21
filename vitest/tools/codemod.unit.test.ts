import { describe, expect, it } from 'vitest';
import { translateDayjsFormatString, translateDateFnsFormatString } from '../../src/tools/codemod.js';
import { DAYJS_TO_TEMPORAL_FMT, DATE_FNS_TO_TEMPORAL_FMT } from '../../src/tools/ideData.js';

describe('translateDayjsFormatString / translateDateFnsFormatString: table independence', () => {
  it('treats a token absent from the table as unrecognized literal text, not a mapping failure', () => {
    
    expect(translateDayjsFormatString('PPPP')).toBe("'PPPP'");
  });

  it('throws, not quotes, when the token exists in the table but has no mapping', () => {
    
    expect(() => translateDayjsFormatString('Do')).toThrow(/"Do" has no Day\.js -> temporal-fmt mapping/);
  });

  it('applies the same absent-vs-null distinction on the date-fns table', () => {
    
    expect(translateDateFnsFormatString('k')).toBe("'k'");
    expect(() => translateDateFnsFormatString('PPPP')).toThrow(/"PPPP" has no date-fns -> temporal-fmt mapping/);
  });
});

describe('translateDayjsFormatString: error message shape', () => {
  it('includes the full source string alongside the offending token', () => {
    expect(() => translateDayjsFormatString('YYYY-Do-MM')).toThrow(
      /in format string "YYYY-Do-MM"/
    );
  });
});

describe('translateDayjsFormatString / translateDateFnsFormatString: boundary inputs', () => {
  it('returns an empty string for empty input', () => {
    expect(translateDayjsFormatString('')).toBe('');
    expect(translateDateFnsFormatString('')).toBe('');
  });

  it('translates a string with no tokens at all, only bracketed literal text', () => {
    // Day.js escapes with brackets — the span becomes a quoted literal.
    expect(translateDayjsFormatString('[just text]')).toBe("'just text'");
    // date-fns brackets are literal characters — they do NOT escape the
    // span. date-fns itself scans "just text" for tokens (s = seconds,
    // x = offset), and the translation preserves exactly that: brackets
    // stay literal, 's'/'x' stay tokens, the rest is quoted literal.
    expect(translateDateFnsFormatString('[just text]')).toBe("'[ju's't te'x't]'");
    // Bracket contents with no token letters pass through untouched.
    expect(translateDateFnsFormatString('[2026]')).toBe('[2026]');
  });
});

describe('translateDayjsFormatString: full table sweep', () => {
  it('maps every mapped entry and throws for every null mapping', () => {
    for (const { from, to } of DAYJS_TO_TEMPORAL_FMT) {
      if (to === null) {
        expect(() => translateDayjsFormatString(from)).toThrow(
          `"${from}" has no Day.js -> temporal-fmt mapping`
        );
      } else {
        expect(translateDayjsFormatString(from)).toBe(to);
      }
    }
  });
});

describe('translateDateFnsFormatString: full table sweep', () => {
  it('maps every mapped entry and throws for every null mapping', () => {
    for (const { from, to } of DATE_FNS_TO_TEMPORAL_FMT) {
      if (to === null) {
        expect(() => translateDateFnsFormatString(from)).toThrow(
          `"${from}" has no date-fns -> temporal-fmt mapping`
        );
      } else {
        expect(translateDateFnsFormatString(from)).toBe(to);
      }
    }
  });
});

describe('translate: composite format strings', () => {
  it('translates full Day.js formats with mixed tokens and separators', () => {
    expect(translateDayjsFormatString('YYYY-MM-DD HH:mm:ss')).toBe('yyyy-MM-dd HH:mm:ss');
    expect(translateDayjsFormatString('MMM D, YYYY A')).toBe('MMM d, yyyy a');
    expect(translateDayjsFormatString('dddd [the] D [of] MMMM')).toBe("EEEE 'the' d 'of' MMMM");
  });

  it('matches source tokens greedy-longest first', () => {
    expect(translateDayjsFormatString('dddd')).toBe('EEEE');
    expect(translateDayjsFormatString('ddd')).toBe('EEE');
    expect(translateDateFnsFormatString('DDD')).toBe('DDD');
    expect(translateDateFnsFormatString('DD')).toBe('DD');
  });

  it('date-fns strings largely pass through unchanged', () => {
    expect(translateDateFnsFormatString('yyyy-MM-dd')).toBe('yyyy-MM-dd');
    expect(translateDateFnsFormatString('EEE, MMM d, yyyy')).toBe('EEE, MMM d, yyyy');
  });

  it('passes non-letter literal runs through without quoting', () => {
    // branch: the else arm of /[a-zA-Z]/.test(run.value)
    expect(translateDayjsFormatString('YYYY 123')).toBe('yyyy 123');
    expect(translateDateFnsFormatString('yyyy 12.30')).toBe('yyyy 12.30');
  });

  it('quotes unrecognized letter runs to keep them literal', () => {
    // branch: the then arm of /[a-zA-Z]/.test(run.value)
    expect(translateDayjsFormatString('Jj')).toBe("'Jj'");
    expect(translateDateFnsFormatString('Jj')).toBe("'Jj'");
  });
});

describe('translate: bracket edge cases', () => {
  it('treats an unterminated bracket span as literal text (bracket included)', () => {
    // Day.js renders an unterminated "[" plus the remainder as literal
    // text, so the whole tail is quoted — it used to be re-scanned for
    // tokens, splitting "oops" into a literal and a stray seconds token.
    expect(translateDayjsFormatString('YYYY [oops')).toBe("yyyy '[oops'");
    // digit-only tails contain no letters, so they pass through raw
    // (the non-quoting passthrough branch of the literal renderer)
    expect(translateDateFnsFormatString('yyyy [123')).toBe('yyyy [123');
  });

  it('passes a trailing bare bracket through when it holds no letters', () => {
    // branch: end === -1 with non-letter content falling to the raw passthrough
    expect(translateDayjsFormatString('DD [')).toBe('dd [');
  });

  it('re-escapes quote characters inside bracketed literals', () => {
    expect(translateDayjsFormatString("[it's]")).toBe("'it''s'");
    // date-fns: the apostrophe opens a quoted literal span (unterminated
    // here), so date-fns renders "[its]" — the translation is faithful:
    // brackets stay literal, the escaped "s]" stays literal, the
    // apostrophe itself is consumed as the escape marker.
    expect(translateDateFnsFormatString("[it's]")).toBe("'[its]'");
  });

  it('renders empty brackets as nothing, not an apostrophe', () => {
    // "''" in temporal-fmt is an ESCAPED QUOTE — it renders as one
    // apostrophe. An empty bracket span contributes no text at all.
    expect(translateDayjsFormatString('[]')).toBe('');
  });

  it('keeps bracketed text literal between tokens', () => {
    expect(translateDayjsFormatString('[a] D [b]')).toBe("'a' d 'b'");
  });
});