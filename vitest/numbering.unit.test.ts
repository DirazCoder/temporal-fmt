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

  it('"auto" resolves the locale\'s native system on the format side', () => {
    // ar-EG's default numbering system is arab — 'auto' must transliterate
    // with exactly what the locale itself uses, i.e. the same output an
    // explicit 'arab' produces.
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'ar-EG' })).toBe(convertDigits('2026', 'arab'));
  });

  it('"auto" with no locale (or a latn one) stays ASCII', () => {
    expect(applyNumbering('2026', { numberingSystem: 'auto' })).toBe('2026');
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'en-US' })).toBe('2026');
  });

  it('"auto" falls back to latn for locales whose native system is unsupported', () => {
    // Thai digits aren't in the supported set — auto degrades to latn
    // rather than throwing.
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'th-TH-u-nu-thai' })).toBe('2026');
  });

  it('"auto" resolves on the parse side too', () => {
    expect(applyParseNumbering(convertDigits('2026', 'arab'), { parseNumberingSystem: 'auto', locale: 'ar-EG' })).toBe('2026');
    expect(applyParseNumbering('2026', { parseNumberingSystem: 'auto' })).toBe('2026');
  });
});
