import { describe, expect, it } from 'vitest';
import { translateDayjsFormatString, translateDateFnsFormatString } from '../src/codemod.js';

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