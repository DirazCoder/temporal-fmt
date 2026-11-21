import { describe, expect, it } from 'vitest';
import { SUPPORTED_NUMBERING_SYSTEMS, convertDigits, convertDigitsToAscii, applyNumbering, applyParseNumbering } from '../../src/locale/numbering.js';
import { InvalidLocaleError } from '../../src/core/errors.js';

describe('convertDigits / convertDigitsToAscii', () => {
  it('latn to latn is identity', () => {
    expect(convertDigits('2026', 'latn')).toBe('2026');
  });

  it('converts latn to adlm and round-trips back to ascii', () => {
    const adlm = convertDigits('2026', 'adlm');
    expect(adlm).toBe('𞥒𞥐𞥒𞥖');
    expect(convertDigitsToAscii(adlm, 'adlm')).toBe('2026');
  });

  it('converts latn to ahom and round-trips back to ascii', () => {
    const ahom = convertDigits('2026', 'ahom');
    expect(ahom).toBe('𑜲𑜰𑜲𑜶');
    expect(convertDigitsToAscii(ahom, 'ahom')).toBe('2026');
  });

  it('converts latn to arab and round-trips back to ascii', () => {
    const arab = convertDigits('2026', 'arab');
    expect(arab).toBe('٢٠٢٦');
    expect(convertDigitsToAscii(arab, 'arab')).toBe('2026');
  });

  it('converts latn to arabext and round-trips back to ascii', () => {
    const arabext = convertDigits('2026', 'arabext');
    expect(arabext).toBe('۲۰۲۶');
    expect(convertDigitsToAscii(arabext, 'arabext')).toBe('2026');
  });

  it('converts latn to bali and round-trips back to ascii', () => {
    const bali = convertDigits('2026', 'bali');
    expect(bali).toBe('᭒᭐᭒᭖');
    expect(convertDigitsToAscii(bali, 'bali')).toBe('2026');
  });

  it('converts latn to beng and round-trips back to ascii', () => {
    const beng = convertDigits('2026', 'beng');
    expect(beng).toBe('২০২৬');
    expect(convertDigitsToAscii(beng, 'beng')).toBe('2026');
  });

  it('converts latn to bhks and round-trips back to ascii', () => {
    const bhks = convertDigits('2026', 'bhks');
    expect(bhks).toBe('𑱒𑱐𑱒𑱖');
    expect(convertDigitsToAscii(bhks, 'bhks')).toBe('2026');
  });

  it('converts latn to brah and round-trips back to ascii', () => {
    const brah = convertDigits('2026', 'brah');
    expect(brah).toBe('𑁨𑁦𑁨𑁬');
    expect(convertDigitsToAscii(brah, 'brah')).toBe('2026');
  });

  it('converts latn to cakm and round-trips back to ascii', () => {
    const cakm = convertDigits('2026', 'cakm');
    expect(cakm).toBe('𑄸𑄶𑄸𑄼');
    expect(convertDigitsToAscii(cakm, 'cakm')).toBe('2026');
  });

  it('converts latn to cham and round-trips back to ascii', () => {
    const cham = convertDigits('2026', 'cham');
    expect(cham).toBe('꩒꩐꩒꩖');
    expect(convertDigitsToAscii(cham, 'cham')).toBe('2026');
  });

  it('converts latn to deva and round-trips back to ascii', () => {
    const deva = convertDigits('2026', 'deva');
    expect(deva).toBe('२०२६');
    expect(convertDigitsToAscii(deva, 'deva')).toBe('2026');
  });

  it('converts latn to fullwide and round-trips back to ascii', () => {
    const fullwide = convertDigits('2026', 'fullwide');
    expect(fullwide).toBe('２０２６');
    expect(convertDigitsToAscii(fullwide, 'fullwide')).toBe('2026');
  });

  it('converts latn to gong and round-trips back to ascii', () => {
    const gong = convertDigits('2026', 'gong');
    expect(gong).toBe('𑶢𑶠𑶢𑶦');
    expect(convertDigitsToAscii(gong, 'gong')).toBe('2026');
  });

  it('converts latn to gonm and round-trips back to ascii', () => {
    const gonm = convertDigits('2026', 'gonm');
    expect(gonm).toBe('𑵒𑵐𑵒𑵖');
    expect(convertDigitsToAscii(gonm, 'gonm')).toBe('2026');
  });

  it('converts latn to gujr and round-trips back to ascii', () => {
    const gujr = convertDigits('2026', 'gujr');
    expect(gujr).toBe('૨૦૨૬');
    expect(convertDigitsToAscii(gujr, 'gujr')).toBe('2026');
  });

  it('converts latn to guru and round-trips back to ascii', () => {
    const guru = convertDigits('2026', 'guru');
    expect(guru).toBe('੨੦੨੬');
    expect(convertDigitsToAscii(guru, 'guru')).toBe('2026');
  });

  it('converts latn to hanidec and round-trips back to ascii', () => {
    const hanidec = convertDigits('2026', 'hanidec');
    expect(hanidec).toBe('二〇二六');
    expect(convertDigitsToAscii(hanidec, 'hanidec')).toBe('2026');
  });

  it('converts latn to hmng and round-trips back to ascii', () => {
    const hmng = convertDigits('2026', 'hmng');
    expect(hmng).toBe('𖭒𖭐𖭒𖭖');
    expect(convertDigitsToAscii(hmng, 'hmng')).toBe('2026');
  });

  it('converts latn to hmnp and round-trips back to ascii', () => {
    const hmnp = convertDigits('2026', 'hmnp');
    expect(hmnp).toBe('𞅂𞅀𞅂𞅆');
    expect(convertDigitsToAscii(hmnp, 'hmnp')).toBe('2026');
  });

  it('converts latn to java and round-trips back to ascii', () => {
    const java = convertDigits('2026', 'java');
    expect(java).toBe('꧒꧐꧒꧖');
    expect(convertDigitsToAscii(java, 'java')).toBe('2026');
  });

  it('converts latn to kali and round-trips back to ascii', () => {
    const kali = convertDigits('2026', 'kali');
    expect(kali).toBe('꤂꤀꤂꤆');
    expect(convertDigitsToAscii(kali, 'kali')).toBe('2026');
  });

  it('converts latn to khmr and round-trips back to ascii', () => {
    const khmr = convertDigits('2026', 'khmr');
    expect(khmr).toBe('២០២៦');
    expect(convertDigitsToAscii(khmr, 'khmr')).toBe('2026');
  });

  it('converts latn to knda and round-trips back to ascii', () => {
    const knda = convertDigits('2026', 'knda');
    expect(knda).toBe('೨೦೨೬');
    expect(convertDigitsToAscii(knda, 'knda')).toBe('2026');
  });

  it('converts latn to lana and round-trips back to ascii', () => {
    const lana = convertDigits('2026', 'lana');
    expect(lana).toBe('᪂᪀᪂᪆');
    expect(convertDigitsToAscii(lana, 'lana')).toBe('2026');
  });

  it('converts latn to lanatham and round-trips back to ascii', () => {
    const lanatham = convertDigits('2026', 'lanatham');
    expect(lanatham).toBe('᪒᪐᪒᪖');
    expect(convertDigitsToAscii(lanatham, 'lanatham')).toBe('2026');
  });

  it('converts latn to laoo and round-trips back to ascii', () => {
    const laoo = convertDigits('2026', 'laoo');
    expect(laoo).toBe('໒໐໒໖');
    expect(convertDigitsToAscii(laoo, 'laoo')).toBe('2026');
  });

  it('converts latn to lepc and round-trips back to ascii', () => {
    const lepc = convertDigits('2026', 'lepc');
    expect(lepc).toBe('᱂᱀᱂᱆');
    expect(convertDigitsToAscii(lepc, 'lepc')).toBe('2026');
  });

  it('converts latn to limb and round-trips back to ascii', () => {
    const limb = convertDigits('2026', 'limb');
    expect(limb).toBe('᥈᥆᥈᥌');
    expect(convertDigitsToAscii(limb, 'limb')).toBe('2026');
  });

  it('converts latn to mathbold and round-trips back to ascii', () => {
    const mathbold = convertDigits('2026', 'mathbold');
    expect(mathbold).toBe('𝟐𝟎𝟐𝟔');
    expect(convertDigitsToAscii(mathbold, 'mathbold')).toBe('2026');
  });

  it('converts latn to mathdbl and round-trips back to ascii', () => {
    const mathdbl = convertDigits('2026', 'mathdbl');
    expect(mathdbl).toBe('𝟚𝟘𝟚𝟞');
    expect(convertDigitsToAscii(mathdbl, 'mathdbl')).toBe('2026');
  });

  it('converts latn to mathmono and round-trips back to ascii', () => {
    const mathmono = convertDigits('2026', 'mathmono');
    expect(mathmono).toBe('𝟸𝟶𝟸𝟼');
    expect(convertDigitsToAscii(mathmono, 'mathmono')).toBe('2026');
  });

  it('converts latn to mathsanb and round-trips back to ascii', () => {
    const mathsanb = convertDigits('2026', 'mathsanb');
    expect(mathsanb).toBe('𝟮𝟬𝟮𝟲');
    expect(convertDigitsToAscii(mathsanb, 'mathsanb')).toBe('2026');
  });

  it('converts latn to mathsans and round-trips back to ascii', () => {
    const mathsans = convertDigits('2026', 'mathsans');
    expect(mathsans).toBe('𝟤𝟢𝟤𝟨');
    expect(convertDigitsToAscii(mathsans, 'mathsans')).toBe('2026');
  });

  it('converts latn to mlym and round-trips back to ascii', () => {
    const mlym = convertDigits('2026', 'mlym');
    expect(mlym).toBe('൨൦൨൬');
    expect(convertDigitsToAscii(mlym, 'mlym')).toBe('2026');
  });

  it('converts latn to modi and round-trips back to ascii', () => {
    const modi = convertDigits('2026', 'modi');
    expect(modi).toBe('𑙒𑙐𑙒𑙖');
    expect(convertDigitsToAscii(modi, 'modi')).toBe('2026');
  });

  it('converts latn to mong and round-trips back to ascii', () => {
    const mong = convertDigits('2026', 'mong');
    expect(mong).toBe('᠒᠐᠒᠖');
    expect(convertDigitsToAscii(mong, 'mong')).toBe('2026');
  });

  it('converts latn to mroo and round-trips back to ascii', () => {
    const mroo = convertDigits('2026', 'mroo');
    expect(mroo).toBe('𖩢𖩠𖩢𖩦');
    expect(convertDigitsToAscii(mroo, 'mroo')).toBe('2026');
  });

  it('converts latn to mtei and round-trips back to ascii', () => {
    const mtei = convertDigits('2026', 'mtei');
    expect(mtei).toBe('꯲꯰꯲꯶');
    expect(convertDigitsToAscii(mtei, 'mtei')).toBe('2026');
  });

  it('converts latn to mymr and round-trips back to ascii', () => {
    const mymr = convertDigits('2026', 'mymr');
    expect(mymr).toBe('၂၀၂၆');
    expect(convertDigitsToAscii(mymr, 'mymr')).toBe('2026');
  });

  it('converts latn to mymrshan and round-trips back to ascii', () => {
    const mymrshan = convertDigits('2026', 'mymrshan');
    expect(mymrshan).toBe('႒႐႒႖');
    expect(convertDigitsToAscii(mymrshan, 'mymrshan')).toBe('2026');
  });

  it('converts latn to mymrtlng and round-trips back to ascii', () => {
    const mymrtlng = convertDigits('2026', 'mymrtlng');
    expect(mymrtlng).toBe('꧲꧰꧲꧶');
    expect(convertDigitsToAscii(mymrtlng, 'mymrtlng')).toBe('2026');
  });

  it('converts latn to newa and round-trips back to ascii', () => {
    const newa = convertDigits('2026', 'newa');
    expect(newa).toBe('𑑒𑑐𑑒𑑖');
    expect(convertDigitsToAscii(newa, 'newa')).toBe('2026');
  });

  it('converts latn to nkoo and round-trips back to ascii', () => {
    const nkoo = convertDigits('2026', 'nkoo');
    expect(nkoo).toBe('߂߀߂߆');
    expect(convertDigitsToAscii(nkoo, 'nkoo')).toBe('2026');
  });

  it('converts latn to olck and round-trips back to ascii', () => {
    const olck = convertDigits('2026', 'olck');
    expect(olck).toBe('᱒᱐᱒᱖');
    expect(convertDigitsToAscii(olck, 'olck')).toBe('2026');
  });

  it('converts latn to orya and round-trips back to ascii', () => {
    const orya = convertDigits('2026', 'orya');
    expect(orya).toBe('୨୦୨୬');
    expect(convertDigitsToAscii(orya, 'orya')).toBe('2026');
  });

  it('converts latn to osma and round-trips back to ascii', () => {
    const osma = convertDigits('2026', 'osma');
    expect(osma).toBe('𐒢𐒠𐒢𐒦');
    expect(convertDigitsToAscii(osma, 'osma')).toBe('2026');
  });

  it('converts latn to rohg and round-trips back to ascii', () => {
    const rohg = convertDigits('2026', 'rohg');
    expect(rohg).toBe('𐴲𐴰𐴲𐴶');
    expect(convertDigitsToAscii(rohg, 'rohg')).toBe('2026');
  });

  it('converts latn to saur and round-trips back to ascii', () => {
    const saur = convertDigits('2026', 'saur');
    expect(saur).toBe('꣒꣐꣒꣖');
    expect(convertDigitsToAscii(saur, 'saur')).toBe('2026');
  });

  it('converts latn to shrd and round-trips back to ascii', () => {
    const shrd = convertDigits('2026', 'shrd');
    expect(shrd).toBe('𑇒𑇐𑇒𑇖');
    expect(convertDigitsToAscii(shrd, 'shrd')).toBe('2026');
  });

  it('converts latn to sind and round-trips back to ascii', () => {
    const sind = convertDigits('2026', 'sind');
    expect(sind).toBe('𑋲𑋰𑋲𑋶');
    expect(convertDigitsToAscii(sind, 'sind')).toBe('2026');
  });

  it('converts latn to sinh and round-trips back to ascii', () => {
    const sinh = convertDigits('2026', 'sinh');
    expect(sinh).toBe('෨෦෨෬');
    expect(convertDigitsToAscii(sinh, 'sinh')).toBe('2026');
  });

  it('converts latn to sora and round-trips back to ascii', () => {
    const sora = convertDigits('2026', 'sora');
    expect(sora).toBe('𑃲𑃰𑃲𑃶');
    expect(convertDigitsToAscii(sora, 'sora')).toBe('2026');
  });

  it('converts latn to sund and round-trips back to ascii', () => {
    const sund = convertDigits('2026', 'sund');
    expect(sund).toBe('᮲᮰᮲᮶');
    expect(convertDigitsToAscii(sund, 'sund')).toBe('2026');
  });

  it('converts latn to takr and round-trips back to ascii', () => {
    const takr = convertDigits('2026', 'takr');
    expect(takr).toBe('𑛂𑛀𑛂𑛆');
    expect(convertDigitsToAscii(takr, 'takr')).toBe('2026');
  });

  it('converts latn to talu and round-trips back to ascii', () => {
    const talu = convertDigits('2026', 'talu');
    expect(talu).toBe('᧒᧐᧒᧖');
    expect(convertDigitsToAscii(talu, 'talu')).toBe('2026');
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

  it('converts latn to thai and round-trips back to ascii', () => {
    const thai = convertDigits('2026', 'thai');
    expect(thai).toBe('๒๐๒๖');
    expect(convertDigitsToAscii(thai, 'thai')).toBe('2026');
  });

  it('converts latn to tirh and round-trips back to ascii', () => {
    const tirh = convertDigits('2026', 'tirh');
    expect(tirh).toBe('𑓒𑓐𑓒𑓖');
    expect(convertDigitsToAscii(tirh, 'tirh')).toBe('2026');
  });

  it('converts latn to tibt and round-trips back to ascii', () => {
    const tibt = convertDigits('2026', 'tibt');
    expect(tibt).toBe('༢༠༢༦');
    expect(convertDigitsToAscii(tibt, 'tibt')).toBe('2026');
  });

  it('converts latn to vaii and round-trips back to ascii', () => {
    const vaii = convertDigits('2026', 'vaii');
    expect(vaii).toBe('꘢꘠꘢꘦');
    expect(convertDigitsToAscii(vaii, 'vaii')).toBe('2026');
  });

  it('converts latn to wara and round-trips back to ascii', () => {
    const wara = convertDigits('2026', 'wara');
    expect(wara).toBe('𑣢𑣠𑣢𑣦');
    expect(convertDigitsToAscii(wara, 'wara')).toBe('2026');
  });

  it('converts latn to wcho and round-trips back to ascii', () => {
    const wcho = convertDigits('2026', 'wcho');
    expect(wcho).toBe('𞋲𞋰𞋲𞋶');
    expect(convertDigitsToAscii(wcho, 'wcho')).toBe('2026');
  });

  it('throws on an unsupported numbering system', () => {
    expect(() => convertDigits('1', 'madeup')).toThrow(/not supported/);
  });

  it('passes non-digit characters through untouched in both directions', () => {
    // line 167-168: the else branch of convertDigits' digit test
    expect(convertDigits('2026-01-15 12:30', 'arab')).toBe('٢٠٢٦-٠١-١٥ ١٢:٣٠');
    // binary-expr line 194: reverse[ch] ?? ch — the '-', ' ' and ':' aren't in
    // the reverse map, so the ?? fallback fires on the way back to ASCII
    expect(convertDigitsToAscii('٢٠٢٦-٠١-١٥ ١٢:٣٠', 'arab')).toBe('2026-01-15 12:30');
  });

  it('leaves a digit-free string unchanged in either direction', () => {
    expect(convertDigits('no digits here!', 'thai')).toBe('no digits here!');
    expect(convertDigitsToAscii('no digits here!', 'thai')).toBe('no digits here!');
  });

  it('converts every ASCII digit 0-9, plus decimals and minus signs', () => {
    expect(convertDigits('0123456789', 'deva')).toBe('०१२३४५६७८९');
    // '-' and '.' aren't digits, so they pass through around the converted ones
    expect(convertDigits('-3.14', 'beng')).toBe('-৩.১৪');
    expect(convertDigitsToAscii('-৩.১৪', 'beng')).toBe('-3.14');
  });

  it('throws on an unsupported numbering system in convertDigitsToAscii too', () => {
    // line 185-186: the parse-side twin of convertDigits' supported-set guard
    expect(() => convertDigitsToAscii('1', 'madeup')).toThrow(InvalidLocaleError);
    expect(() => convertDigitsToAscii('1', 'madeup')).toThrow(/not supported/);
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
    // Tangsa digits aren't in the supported set — auto degrades to latn
    // rather than throwing.
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'en-US-u-nu-tnsa' })).toBe('2026');
  });

  it('"auto" resolves on the parse side too', () => {
    expect(applyParseNumbering(convertDigits('2026', 'arab'), { parseNumberingSystem: 'auto', locale: 'ar-EG' })).toBe('2026');
    expect(applyParseNumbering('2026', { parseNumberingSystem: 'auto' })).toBe('2026');
  });

  it('an undefined system on the parse side stays latn (direct-call safety net)', () => {
    // resolveRequestedSystem's undefined branch, reached from a direct
    // applyParseNumbering call that isn't pre-guarded by parse()
    expect(applyParseNumbering('2026', {})).toBe('2026');
  });

  it("throws a typed error when 'auto' is asked to resolve from a malformed locale", () => {
    // line 100: resolveAutoNumberingSystem wraps Intl.NumberFormat's
    // RangeError in a typed InvalidLocaleError
    expect(() => applyNumbering('2026', { numberingSystem: 'auto', locale: 'not_a_locale!!' })).toThrow(
      InvalidLocaleError,
    );
    expect(() => applyParseNumbering('2026', { parseNumberingSystem: 'auto', locale: 'not_a_locale!!' })).toThrow(
      InvalidLocaleError,
    );
  });

  it('caches per-locale auto resolutions', () => {
    // line 95: the second resolution for ar-SA is a cache hit
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'ar-SA' })).toBe('٢٠٢٦');
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'ar-SA' })).toBe('٢٠٢٦');
  });

  it('evicts the oldest auto-resolution entry once 500 locales are cached', () => {
    // lines 103-106: bounded autoNumberingCache. Push past 500 distinct
    // locales; every resolution must still be correct afterwards (evicted
    // entries just get re-derived).
    for (let i = 0; i < 505; i++) {
      expect(applyNumbering('2026', { numberingSystem: 'auto', locale: `en-x-n${i}` })).toBe('2026');
    }
    // 'ar-EG' was cached by earlier tests in this file and is therefore among
    // the oldest entries — it got evicted, so this re-resolves from scratch.
    expect(applyNumbering('2026', { numberingSystem: 'auto', locale: 'ar-EG' })).toBe('٢٠٢٦');
  });
});
