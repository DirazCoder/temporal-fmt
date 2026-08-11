import { describe, expect, it } from 'vitest';
import { pad, DEFAULT_LOCALE } from '../src/tokens.js';

// node --test only ever sees pad() indirectly, through format() output
// on the dist build. These call it directly, so a broken sign or
// padding case shows up as a pad() failure, not a wrong date string
// three layers up.
describe('pad', () => {
  it('left-pads positive numbers with zeros to the given length', () => {
    expect(pad(5, 2)).toBe('05');
    expect(pad(45, 2)).toBe('45');
  });

  it('does not truncate when the number already exceeds the target length', () => {
    expect(pad(12345, 2)).toBe('12345');
  });

  it('keeps the sign outside the padded digits for negative numbers', () => {
    // len applies to the digit string itself, not the total output —
    // the sign is prepended after padding, so it adds to the width
    // rather than eating into it
    expect(pad(-45, 4)).toBe('-0045');
    expect(pad(-5, 2)).toBe('-05');
  });

  it('pads zero as a plain positive value, no sign', () => {
    expect(pad(0, 3)).toBe('000');
  });

  it('handles length 0 as a no-op pad', () => {
    expect(pad(7, 0)).toBe('7');
  });
});

describe('DEFAULT_LOCALE', () => {
  it('is en-US', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
  });
});