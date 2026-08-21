import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenize.js';

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
