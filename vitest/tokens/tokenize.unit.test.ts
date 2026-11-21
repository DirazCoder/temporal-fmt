import { describe, expect, it } from 'vitest';
import { tokenize, tokenizeWithSpans } from '../../src/tokens/tokenize.js';
import { FormatSyntaxError, UnknownTokenError, TemporalFmtError } from '../../src/core/errors.js';

describe('tokenize', () => {
  it('splits a format string into token and literal pieces', () => {
    const pieces = tokenize("yyyy-MM-dd 'at' HH:mm");
    expect(pieces).toEqual([
      { kind: 'token', value: 'yyyy' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'MM' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'dd' },
      { kind: 'literal', value: ' at ' },
      { kind: 'token', value: 'HH' },
      { kind: 'literal', value: ':' },
      { kind: 'token', value: 'mm' },
    ]);
  });

  it('treats an unterminated quote as a syntax error', () => {
    expect(() => tokenize("yyyy 'unterminated")).toThrow();
  });
});

describe('tokenize: quoted literals', () => {
  it('returns no pieces for an empty format', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('a standalone doubled quote is a single literal quote', () => {
    // branch: format[i + 1] === "'" at the top of the quote path (lines 56-59)
    expect(tokenize("''")).toEqual([{ kind: 'literal', value: "'" }]);
    expect(tokenize("1''2")).toEqual([{ kind: 'literal', value: "1'2" }]);
  });

  it('a doubled quote inside a quoted span decodes to one quote', () => {
    // branch: format[j + 1] === "'" inside the span scan (lines 67-70)
    expect(tokenize("'a''b'")).toEqual([{ kind: 'literal', value: "a'b" }]);
  });

  it('a trailing doubled quote leaves the span unterminated', () => {
    expect(() => tokenize("'a''")).toThrowError(FormatSyntaxError);
  });

  it('keeps quoted token letters literal', () => {
    expect(tokenize("'yyyy'")).toEqual([{ kind: 'literal', value: 'yyyy' }]);
    expect(tokenize("'at'")).toEqual([{ kind: 'literal', value: 'at' }]);
  });

  it('merges runs of non-token characters into one literal piece', () => {
    expect(tokenize('9-9')).toEqual([{ kind: 'literal', value: '9-9' }]);
    expect(tokenize('[($%^*+?)]')).toEqual([{ kind: 'literal', value: '[($%^*+?)]' }]);
  });

  it('throws a typed FormatSyntaxError carrying the format for an unterminated quote', () => {
    let caught: unknown;
    try {
      tokenize("x 'oops");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FormatSyntaxError);
    expect(caught).toBeInstanceOf(TemporalFmtError);
    const err = caught as FormatSyntaxError;
    expect(err.code).toBe('FORMAT_SYNTAX_ERROR');
    expect(err.format).toBe("x 'oops");
    expect(err.message).toBe(`temporal-fmt: unterminated quote in format string "x 'oops"`);
  });
});

describe('tokenize: overlong token runs', () => {
  it('rejects a run one char past the longest known width', () => {
    // branch: format[i + match.length] === runChar (lines 101-117)
    let caught: unknown;
    try {
      tokenize('MMMMM');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnknownTokenError);
    expect(caught).toBeInstanceOf(TemporalFmtError);
    const err = caught as UnknownTokenError;
    expect(err.code).toBe('UNKNOWN_TOKEN');
    expect(err.token).toBe('MMMMM');
    expect(err.format).toBe('MMMMM');
    expect(err.message).toBe(
      `temporal-fmt: "MMMMM" in format string "MMMMM" isn't a recognized token — did you mean "MMMM"?`
    );
  });

  it('rejects overlong runs of other token families', () => {
    expect(() => tokenize('zzzzz')).toThrow(
      /"zzzzz" in format string "zzzzz" isn't a recognized token — did you mean "zzzz"\?/
    );
    expect(() => tokenize('ddddd')).toThrow(/did you mean "dd"\?/);
    expect(() => tokenize('yyyyy')).toThrow(/did you mean "yyyy"\?/);
  });
});

describe('tokenizeWithSpans', () => {
  it('reports exact source spans for tokens and literals', () => {
    expect(tokenizeWithSpans("yy-MM 'x'")).toEqual([
      { kind: 'token', value: 'yy', start: 0, end: 2 },
      { kind: 'literal', value: '-', start: 2, end: 3 },
      { kind: 'token', value: 'MM', start: 3, end: 5 },
      { kind: 'literal', value: ' x', start: 5, end: 9 },
    ]);
  });

  it('tracks merged literal spans across a doubled quote', () => {
    expect(tokenizeWithSpans("9''9 yyyy")).toEqual([
      { kind: 'literal', value: "9'9 ", start: 0, end: 5 },
      { kind: 'token', value: 'yyyy', start: 5, end: 9 },
    ]);
  });
});
