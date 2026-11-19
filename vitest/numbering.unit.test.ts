import { describe, expect, it } from 'vitest';
import { SUPPORTED_NUMBERING_SYSTEMS, convertDigits, convertDigitsToAscii, applyNumbering, applyParseNumbering } from '../src/numbering.js';

describe('convertDigits / convertDigitsToAscii', () => {
  it('latn to latn is identity', () => {
    expect(convertDigits('2026', 'latn')).toBe('2026');
  });

  it('converts latn to arab and round-trips back to ascii', () => {
    const arab = convertDigits('2026', 'arab');
    expect(arab).toBe('٢٠٢٦');
    expect(convertDigitsToAscii(arab, 'arab')).toBe('2026');
  });

  it('converts latn to deva and round-trips back to ascii', () => {
    const deva = convertDigits('2026', 'deva');
    expect(deva).toBe('२०२६');
    expect(convertDigitsToAscii(deva, 'deva')).toBe('2026');
  });

  it('converts latn to beng and round-trips back to ascii', () => {
    const beng = convertDigits('2026', 'beng');
    expect(beng).toBe('২০২৬');
    expect(convertDigitsToAscii(beng, 'beng')).toBe('2026');
  });

  it('converts latn to guru and round-trips back to ascii', () => {
    const guru = convertDigits('2026', 'guru');
    expect(guru).toBe('੨੦੨੬');
    expect(convertDigitsToAscii(guru, 'guru')).toBe('2026');
  });

  it('converts latn to gujr and round-trips back to ascii', () => {
    const gujr = convertDigits('2026', 'gujr');
    expect(gujr).toBe('૨૦૨૬');
    expect(convertDigitsToAscii(gujr, 'gujr')).toBe('2026');
  });

  it('converts latn to orya and round-trips back to ascii', () => {
    const orya = convertDigits('2026', 'orya');
    expect(orya).toBe('୨୦୨୬');
    expect(convertDigitsToAscii(orya, 'orya')).toBe('2026');
  });

  it('converts latn to tamldec and round-trips back to ascii', () => {
    const tamldec = convertDigits('2026', 'tamldec');
    expect(tamldec).toBe('௨௦௨௬');
    expect(convertDigitsToAscii(tamldec, 'tamldec')).toBe('2026');
  });

  it('converts latn to telu and round-trips back to ascii', () => {
    const telu = convertDigits('2026', 'telu');
    expect(telu).toBe('౨౦౨౬');
    expect(convertDigitsToAscii(telu, 'telu')).toBe('2026');
  });

  it('converts latn to knda and round-trips back to ascii', () => {
    const knda = convertDigits('2026', 'knda');
    expect(knda).toBe('೨೦೨೬');
    expect(convertDigitsToAscii(knda, 'knda')).toBe('2026');
  });

  it('converts latn to mlym and round-trips back to ascii', () => {
    const mlym = convertDigits('2026', 'mlym');
    expect(mlym).toBe('൨൦൨൬');
    expect(convertDigitsToAscii(mlym, 'mlym')).toBe('2026');
  });

  it('converts latn to fullwide and round-trips back to ascii', () => {
    const fullwide = convertDigits('2026', 'fullwide');
    expect(fullwide).toBe('２０２６');
    expect(convertDigitsToAscii(fullwide, 'fullwide')).toBe('2026');
  });

  it('converts latn to hanidec and round-trips back to ascii', () => {
    const hanidec = convertDigits('2026', 'hanidec');
    expect(hanidec).toBe('二〇二六');
    expect(convertDigitsToAscii(hanidec, 'hanidec')).toBe('2026');
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
