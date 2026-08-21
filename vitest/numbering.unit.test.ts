import { describe, expect, it } from 'vitest';
import { SUPPORTED_NUMBERING_SYSTEMS, convertDigits, convertDigitsToAscii, applyNumbering, applyParseNumbering } from '../src/numbering.js';

describe('convertDigits / convertDigitsToAscii', () => {
  it('latn to latn is identity, and arab round-trips back to ascii', () => {
    expect(convertDigits('2026', 'latn')).toBe('2026');
    const arab = convertDigits('2026', 'arab');
    expect(arab).not.toBe('2026');
    expect(convertDigitsToAscii(arab, 'arab')).toBe('2026');
  });

  it('throws on an unsupported numbering system', () => {
    expect(() => convertDigits('1', 'madeup')).toThrow(/not supported/);
  });
});

describe('SUPPORTED_NUMBERING_SYSTEMS', () => {
  it('includes the common systems', () => {
    expect(SUPPORTED_NUMBERING_SYSTEMS.has('latn')).toBe(true);
    expect(SUPPORTED_NUMBERING_SYSTEMS.has('arab')).toBe(true);
  });
});

describe('applyNumbering / applyParseNumbering', () => {
  it('applyNumbering is a no-op for latn and converts otherwise', () => {
    expect(applyNumbering('2026', {})).toBe('2026');
    expect(applyNumbering('2026', { numberingSystem: 'arab' })).toBe(convertDigits('2026', 'arab'));
  });

  it('applyParseNumbering converts a non-latn system back to ASCII', () => {
    const arab = convertDigits('2026', 'arab');
    expect(applyParseNumbering(arab, { parseNumberingSystem: 'arab' })).toBe('2026');
  });
});
