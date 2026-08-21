import { describe, expect, it } from 'vitest';
import { isValidFormat, listTokens, analyzeFormat } from '../src/analyze.js';

describe('isValidFormat', () => {
  it('accepts a well-formed token/literal mix', () => {
    expect(isValidFormat('yyyy-MM-dd')).toBe(true);
  });

  it('rejects an unterminated quoted literal', () => {
    expect(isValidFormat("yyyy 'unterminated")).toBe(false);
  });
});

describe('listTokens', () => {
  it('returns every registered token with its metadata attached', () => {
    const tokens = listTokens();
    expect(tokens.length).toBeGreaterThan(0);
    const yyyy = tokens.find((t) => t.name === 'yyyy');
    expect(yyyy?.metadata.formatCapable).toBe(true);
  });
});

describe('analyzeFormat', () => {
  it('reports required fields and compatible types for a format string', () => {
    const analysis = analyzeFormat('yyyy-MM');
    expect(analysis.requiredFields).toEqual(expect.arrayContaining(['year', 'month']));
    expect(analysis.compatibleTypes).toContain('PlainDate');
  });
});
