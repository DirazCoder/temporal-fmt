import { describe, expect, it } from 'vitest';
import { TemporalFmtError, FormatSyntaxError } from '../src/errors.js';

describe('TemporalFmtError', () => {
  it('carries structured fields and serializes via toJSON', () => {
    const err = new TemporalFmtError('custom message', {
      code: 'PARSE_MISMATCH',
      input: 'in',
      format: 'fmt',
      reason: 'why',
    });
    expect(err.message).toBe('custom message');
    expect(err.code).toBe('PARSE_MISMATCH');
    expect(typeof err.toJSON).toBe('function');
    expect(err.toJSON()).toMatchObject({ code: 'PARSE_MISMATCH', input: 'in' });
  });
});

describe('FormatSyntaxError', () => {
  it('builds a default message from the given fields', () => {
    const err = new FormatSyntaxError({ format: 'xx', reason: 'bad' });
    expect(err.code).toBe('FORMAT_SYNTAX_ERROR');
    expect(err.message).toContain('xx');
    expect(err.message).toContain('bad');
    expect(err).toBeInstanceOf(TemporalFmtError);
  });
});
