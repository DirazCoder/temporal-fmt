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
    expect(translateDayjsFormatString('[just text]')).toBe("'just text'");
    expect(translateDateFnsFormatString('[just text]')).toBe("'just text'");
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
  it('treats an unterminated bracket span as unbracketed source text, not an escaped literal', () => {
    // branch: end === -1 (lines 45-46). The rest of the string is pushed
    // as a TOKEN piece, so it goes back through the token scanner: dayjs
    // "s" is a seconds token, so only the non-token prefix "[oop" gets
    // quoted — the "s" still translates as a token.
    expect(translateDayjsFormatString('YYYY [oops')).toBe("yyyy '[oop's");
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
    expect(translateDateFnsFormatString("[it's]")).toBe("'it''s'");
  });

  it('renders empty brackets as an empty quoted literal', () => {
    expect(translateDayjsFormatString('[]')).toBe("''");
  });

  it('keeps bracketed text literal between tokens', () => {
    expect(translateDayjsFormatString('[a] D [b]')).toBe("'a' d 'b'");
  });
});