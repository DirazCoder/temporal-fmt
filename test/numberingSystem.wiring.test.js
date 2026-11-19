import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, formatToParts, parse, safeParse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// numbering.ts's applyNumbering()/applyParseNumbering() existed as
// standalone helpers but were never called from format()/parse() —
// numberingSystem/parseNumberingSystem options were accepted in the
// type signatures and silently did nothing at runtime. This file
// covers the wiring, not the digit-conversion math itself (that's
// convertDigits()'s own concern, exercised indirectly here through
// the public format()/parse() surface).
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');

test('format(): no numberingSystem option produces plain ASCII digits (unchanged default)', () => {
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('format(): numberingSystem "arab" converts output digits to Arabic-Indic', () => {
  const result = format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' });
  // Arabic-Indic digits for 2026-08-04.
  assert.equal(result, '٢٠٢٦-٠٨-٠٤');
});

test('format(): numberingSystem "adlm" converts output digits to Adlam', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'adlm' });
  assert.equal(result, '𞥒𞥐𞥒𞥖');
});

test('format(): numberingSystem "ahom" converts output digits to Ahom', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'ahom' });
  assert.equal(result, '𑜲𑜰𑜲𑜶');
});

test('format(): numberingSystem "arabext" converts output digits to Extended Arabic-Indic', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'arabext' });
  assert.equal(result, '۲۰۲۶');
});

test('format(): numberingSystem "bali" converts output digits to Balinese', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'bali' });
  assert.equal(result, '᭒᭐᭒᭖');
});

test('format(): numberingSystem "beng" converts output digits to Bengali', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'beng' });
  assert.equal(result, '২০২৬');
});

test('format(): numberingSystem "bhks" converts output digits to Bhaiksuki', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'bhks' });
  assert.equal(result, '𑱒𑱐𑱒𑱖');
});

test('format(): numberingSystem "brah" converts output digits to Brahmi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'brah' });
  assert.equal(result, '𑁨𑁦𑁨𑁬');
});

test('format(): numberingSystem "cakm" converts output digits to Chakma', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'cakm' });
  assert.equal(result, '𑄸𑄶𑄸𑄼');
});

test('format(): numberingSystem "cham" converts output digits to Cham', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'cham' });
  assert.equal(result, '꩒꩐꩒꩖');
});

test('format(): numberingSystem "deva" converts output digits to Devanagari', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'deva' });
  assert.equal(result, '२०२६');
});

test('format(): numberingSystem "fullwide" converts output digits to Full-width', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'fullwide' });
  assert.equal(result, '２０２６');
});

test('format(): numberingSystem "gong" converts output digits to Gunjala Gondi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'gong' });
  assert.equal(result, '𑶢𑶠𑶢𑶦');
});

test('format(): numberingSystem "gonm" converts output digits to Masaram Gondi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'gonm' });
  assert.equal(result, '𑵒𑵐𑵒𑵖');
});

test('format(): numberingSystem "gujr" converts output digits to Gujarati', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'gujr' });
  assert.equal(result, '૨૦૨૬');
});

test('format(): numberingSystem "guru" converts output digits to Gurmukhi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'guru' });
  assert.equal(result, '੨੦੨੬');
});

test('format(): numberingSystem "hanidec" converts output digits to Chinese decimal', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'hanidec' });
  assert.equal(result, '二〇二六');
});

test('format(): numberingSystem "hmng" converts output digits to Pahawh Hmong', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'hmng' });
  assert.equal(result, '𖭒𖭐𖭒𖭖');
});

test('format(): numberingSystem "hmnp" converts output digits to Nyiakeng Puachue Hmong', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'hmnp' });
  assert.equal(result, '𞅂𞅀𞅂𞅆');
});

test('format(): numberingSystem "java" converts output digits to Javanese', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'java' });
  assert.equal(result, '꧒꧐꧒꧖');
});

test('format(): numberingSystem "kali" converts output digits to Kayah Li', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'kali' });
  assert.equal(result, '꤂꤀꤂꤆');
});

test('format(): numberingSystem "khmr" converts output digits to Khmer', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'khmr' });
  assert.equal(result, '២០២៦');
});

test('format(): numberingSystem "knda" converts output digits to Kannada', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'knda' });
  assert.equal(result, '೨೦೨೬');
});

test('format(): numberingSystem "lana" converts output digits to Tai Tham Hora', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'lana' });
  assert.equal(result, '᪂᪀᪂᪆');
});

test('format(): numberingSystem "lanatham" converts output digits to Tai Tham Tham', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'lanatham' });
  assert.equal(result, '᪒᪐᪒᪖');
});

test('format(): numberingSystem "laoo" converts output digits to Lao', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'laoo' });
  assert.equal(result, '໒໐໒໖');
});

test('format(): numberingSystem "lepc" converts output digits to Lepcha', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'lepc' });
  assert.equal(result, '᱂᱀᱂᱆');
});

test('format(): numberingSystem "limb" converts output digits to Limbu', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'limb' });
  assert.equal(result, '᥈᥆᥈᥌');
});

test('format(): numberingSystem "mathbold" converts output digits to Mathematical Bold', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mathbold' });
  assert.equal(result, '𝟐𝟎𝟐𝟔');
});

test('format(): numberingSystem "mathdbl" converts output digits to Mathematical Double-Struck', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mathdbl' });
  assert.equal(result, '𝟚𝟘𝟚𝟞');
});

test('format(): numberingSystem "mathmono" converts output digits to Mathematical Monospace', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mathmono' });
  assert.equal(result, '𝟸𝟶𝟸𝟼');
});

test('format(): numberingSystem "mathsanb" converts output digits to Mathematical Sans-Serif Bold', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mathsanb' });
  assert.equal(result, '𝟮𝟬𝟮𝟲');
});

test('format(): numberingSystem "mathsans" converts output digits to Mathematical Sans-Serif', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mathsans' });
  assert.equal(result, '𝟤𝟢𝟤𝟨');
});

test('format(): numberingSystem "mlym" converts output digits to Malayalam', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mlym' });
  assert.equal(result, '൨൦൨൬');
});

test('format(): numberingSystem "modi" converts output digits to Modi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'modi' });
  assert.equal(result, '𑙒𑙐𑙒𑙖');
});

test('format(): numberingSystem "mong" converts output digits to Mongolian', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mong' });
  assert.equal(result, '᠒᠐᠒᠖');
});

test('format(): numberingSystem "mroo" converts output digits to Mro', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mroo' });
  assert.equal(result, '𖩢𖩠𖩢𖩦');
});

test('format(): numberingSystem "mtei" converts output digits to Meetei Mayek', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mtei' });
  assert.equal(result, '꯲꯰꯲꯶');
});

test('format(): numberingSystem "mymr" converts output digits to Myanmar', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mymr' });
  assert.equal(result, '၂၀၂၆');
});

test('format(): numberingSystem "mymrshan" converts output digits to Myanmar Shan', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mymrshan' });
  assert.equal(result, '႒႐႒႖');
});

test('format(): numberingSystem "mymrtlng" converts output digits to Myanmar Tai Laing', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'mymrtlng' });
  assert.equal(result, '꧲꧰꧲꧶');
});

test('format(): numberingSystem "newa" converts output digits to Newa', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'newa' });
  assert.equal(result, '𑑒𑑐𑑒𑑖');
});

test('format(): numberingSystem "nkoo" converts output digits to N\'Ko', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'nkoo' });
  assert.equal(result, '߂߀߂߆');
});

test('format(): numberingSystem "olck" converts output digits to Ol Chiki', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'olck' });
  assert.equal(result, '᱒᱐᱒᱖');
});

test('format(): numberingSystem "orya" converts output digits to Odia', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'orya' });
  assert.equal(result, '୨୦୨୬');
});

test('format(): numberingSystem "osma" converts output digits to Osmanya', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'osma' });
  assert.equal(result, '𐒢𐒠𐒢𐒦');
});

test('format(): numberingSystem "rohg" converts output digits to Hanifi Rohingya', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'rohg' });
  assert.equal(result, '𐴲𐴰𐴲𐴶');
});

test('format(): numberingSystem "saur" converts output digits to Saurashtra', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'saur' });
  assert.equal(result, '꣒꣐꣒꣖');
});

test('format(): numberingSystem "shrd" converts output digits to Sharada', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'shrd' });
  assert.equal(result, '𑇒𑇐𑇒𑇖');
});

test('format(): numberingSystem "sind" converts output digits to Khudawadi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'sind' });
  assert.equal(result, '𑋲𑋰𑋲𑋶');
});

test('format(): numberingSystem "sinh" converts output digits to Sinhala Lith', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'sinh' });
  assert.equal(result, '෨෦෨෬');
});

test('format(): numberingSystem "sora" converts output digits to Sora Sompeng', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'sora' });
  assert.equal(result, '𑃲𑃰𑃲𑃶');
});

test('format(): numberingSystem "sund" converts output digits to Sundanese', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'sund' });
  assert.equal(result, '᮲᮰᮲᮶');
});

test('format(): numberingSystem "takr" converts output digits to Takri', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'takr' });
  assert.equal(result, '𑛂𑛀𑛂𑛆');
});

test('format(): numberingSystem "talu" converts output digits to New Tai Lue', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'talu' });
  assert.equal(result, '᧒᧐᧒᧖');
});

test('format(): numberingSystem "tamldec" converts output digits to Tamil decimal', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'tamldec' });
  assert.equal(result, '௨௦௨௬');
});

test('format(): numberingSystem "telu" converts output digits to Telugu', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'telu' });
  assert.equal(result, '౨౦౨౬');
});

test('format(): numberingSystem "thai" converts output digits to Thai', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'thai' });
  assert.equal(result, '๒๐๒๖');
});

test('format(): numberingSystem "tirh" converts output digits to Tirhuta', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'tirh' });
  assert.equal(result, '𑓒𑓐𑓒𑓖');
});

test('format(): numberingSystem "tibt" converts output digits to Tibetan', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'tibt' });
  assert.equal(result, '༢༠༢༦');
});

test('format(): numberingSystem "vaii" converts output digits to Vai', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'vaii' });
  assert.equal(result, '꘢꘠꘢꘦');
});

test('format(): numberingSystem "wara" converts output digits to Warang Citi', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'wara' });
  assert.equal(result, '𑣢𑣠𑣢𑣦');
});

test('format(): numberingSystem "wcho" converts output digits to Wancho', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'wcho' });
  assert.equal(result, '𞋲𞋰𞋲𞋶');
});

test('format(): "latn" numberingSystem is a no-op (explicit default)', () => {
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'latn' }), '2026-08-04');
});

test('format(): literal text and separators pass through untouched under a non-latn system', () => {
  const result = format(date, "yyyy 'in' MM 'in' dd", { numberingSystem: 'arab' });
  assert.equal(result, '٢٠٢٦ in ٠٨ in ٠٤');
});

test('formatToParts(): numbering applies per-part, not just to a joined string', () => {
  const parts = formatToParts(date, 'yyyy-MM-dd', { numberingSystem: 'arab' });
  const tokenParts = parts.filter((p) => p.type === 'token');
  assert.equal(tokenParts.length, 3);
  assert.equal(tokenParts[0].value, '٢٠٢٦');
  assert.equal(tokenParts[1].value, '٠٨');
  assert.equal(tokenParts[2].value, '٠٤');
  // Literal separators stay ASCII — they're not digits.
  const literalParts = parts.filter((p) => p.type === 'literal');
  assert.ok(literalParts.every((p) => p.value === '-'));
});

test('format(): unsupported numbering system throws descriptively rather than silently passing through', () => {
  assert.throws(
    () => format(date, 'yyyy', { numberingSystem: 'bogus-system' }),
    /numbering system "bogus-system" is not supported/
  );
});

test('parse(): no parseNumberingSystem option requires ASCII digits (unchanged default)', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "arab" accepts Arabic-Indic digit input and returns the correct date', () => {
  const result = parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "adlm" accepts Adlam digit input', () => {
  const result = parse('yyyy-MM-dd', '𞥒𞥐𞥒𞥖-𞥐𞥘-𞥐𞥔', { parseNumberingSystem: 'adlm' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "ahom" accepts Ahom digit input', () => {
  const result = parse('yyyy-MM-dd', '𑜲𑜰𑜲𑜶-𑜰𑜸-𑜰𑜴', { parseNumberingSystem: 'ahom' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "arabext" accepts Extended Arabic-Indic digit input', () => {
  const result = parse('yyyy-MM-dd', '۲۰۲۶-۰۸-۰۴', { parseNumberingSystem: 'arabext' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "bali" accepts Balinese digit input', () => {
  const result = parse('yyyy-MM-dd', '᭒᭐᭒᭖-᭐᭘-᭐᭔', { parseNumberingSystem: 'bali' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "beng" accepts Bengali digit input', () => {
  const result = parse('yyyy-MM-dd', '২০২৬-০৮-০৪', { parseNumberingSystem: 'beng' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "bhks" accepts Bhaiksuki digit input', () => {
  const result = parse('yyyy-MM-dd', '𑱒𑱐𑱒𑱖-𑱐𑱘-𑱐𑱔', { parseNumberingSystem: 'bhks' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "brah" accepts Brahmi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑁨𑁦𑁨𑁬-𑁦𑁮-𑁦𑁪', { parseNumberingSystem: 'brah' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "cakm" accepts Chakma digit input', () => {
  const result = parse('yyyy-MM-dd', '𑄸𑄶𑄸𑄼-𑄶𑄾-𑄶𑄺', { parseNumberingSystem: 'cakm' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "cham" accepts Cham digit input', () => {
  const result = parse('yyyy-MM-dd', '꩒꩐꩒꩖-꩐꩘-꩐꩔', { parseNumberingSystem: 'cham' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "deva" accepts Devanagari digit input', () => {
  const result = parse('yyyy-MM-dd', '२०२६-०८-०४', { parseNumberingSystem: 'deva' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "fullwide" accepts Full-width digit input', () => {
  const result = parse('yyyy-MM-dd', '２０２６-０８-０４', { parseNumberingSystem: 'fullwide' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "gong" accepts Gunjala Gondi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑶢𑶠𑶢𑶦-𑶠𑶨-𑶠𑶤', { parseNumberingSystem: 'gong' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "gonm" accepts Masaram Gondi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑵒𑵐𑵒𑵖-𑵐𑵘-𑵐𑵔', { parseNumberingSystem: 'gonm' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "gujr" accepts Gujarati digit input', () => {
  const result = parse('yyyy-MM-dd', '૨૦૨૬-૦૮-૦૪', { parseNumberingSystem: 'gujr' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "guru" accepts Gurmukhi digit input', () => {
  const result = parse('yyyy-MM-dd', '੨੦੨੬-੦੮-੦੪', { parseNumberingSystem: 'guru' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "hanidec" accepts Chinese decimal digit input', () => {
  const result = parse('yyyy-MM-dd', '二〇二六-〇八-〇四', { parseNumberingSystem: 'hanidec' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "hmng" accepts Pahawh Hmong digit input', () => {
  const result = parse('yyyy-MM-dd', '𖭒𖭐𖭒𖭖-𖭐𖭘-𖭐𖭔', { parseNumberingSystem: 'hmng' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "hmnp" accepts Nyiakeng Puachue Hmong digit input', () => {
  const result = parse('yyyy-MM-dd', '𞅂𞅀𞅂𞅆-𞅀𞅈-𞅀𞅄', { parseNumberingSystem: 'hmnp' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "java" accepts Javanese digit input', () => {
  const result = parse('yyyy-MM-dd', '꧒꧐꧒꧖-꧐꧘-꧐꧔', { parseNumberingSystem: 'java' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "kali" accepts Kayah Li digit input', () => {
  const result = parse('yyyy-MM-dd', '꤂꤀꤂꤆-꤀꤈-꤀꤄', { parseNumberingSystem: 'kali' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "khmr" accepts Khmer digit input', () => {
  const result = parse('yyyy-MM-dd', '២០២៦-០៨-០៤', { parseNumberingSystem: 'khmr' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "knda" accepts Kannada digit input', () => {
  const result = parse('yyyy-MM-dd', '೨೦೨೬-೦೮-೦೪', { parseNumberingSystem: 'knda' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "lana" accepts Tai Tham Hora digit input', () => {
  const result = parse('yyyy-MM-dd', '᪂᪀᪂᪆-᪀᪈-᪀᪄', { parseNumberingSystem: 'lana' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "lanatham" accepts Tai Tham Tham digit input', () => {
  const result = parse('yyyy-MM-dd', '᪒᪐᪒᪖-᪐᪘-᪐᪔', { parseNumberingSystem: 'lanatham' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "laoo" accepts Lao digit input', () => {
  const result = parse('yyyy-MM-dd', '໒໐໒໖-໐໘-໐໔', { parseNumberingSystem: 'laoo' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "lepc" accepts Lepcha digit input', () => {
  const result = parse('yyyy-MM-dd', '᱂᱀᱂᱆-᱀᱈-᱀᱄', { parseNumberingSystem: 'lepc' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "limb" accepts Limbu digit input', () => {
  const result = parse('yyyy-MM-dd', '᥈᥆᥈᥌-᥆᥎-᥆᥊', { parseNumberingSystem: 'limb' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mathbold" accepts Mathematical Bold digit input', () => {
  const result = parse('yyyy-MM-dd', '𝟐𝟎𝟐𝟔-𝟎𝟖-𝟎𝟒', { parseNumberingSystem: 'mathbold' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mathdbl" accepts Mathematical Double-Struck digit input', () => {
  const result = parse('yyyy-MM-dd', '𝟚𝟘𝟚𝟞-𝟘𝟠-𝟘𝟜', { parseNumberingSystem: 'mathdbl' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mathmono" accepts Mathematical Monospace digit input', () => {
  const result = parse('yyyy-MM-dd', '𝟸𝟶𝟸𝟼-𝟶𝟾-𝟶𝟺', { parseNumberingSystem: 'mathmono' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mathsanb" accepts Mathematical Sans-Serif Bold digit input', () => {
  const result = parse('yyyy-MM-dd', '𝟮𝟬𝟮𝟲-𝟬𝟴-𝟬𝟰', { parseNumberingSystem: 'mathsanb' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mathsans" accepts Mathematical Sans-Serif digit input', () => {
  const result = parse('yyyy-MM-dd', '𝟤𝟢𝟤𝟨-𝟢𝟪-𝟢𝟦', { parseNumberingSystem: 'mathsans' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mlym" accepts Malayalam digit input', () => {
  const result = parse('yyyy-MM-dd', '൨൦൨൬-൦൮-൦൪', { parseNumberingSystem: 'mlym' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "modi" accepts Modi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑙒𑙐𑙒𑙖-𑙐𑙘-𑙐𑙔', { parseNumberingSystem: 'modi' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mong" accepts Mongolian digit input', () => {
  const result = parse('yyyy-MM-dd', '᠒᠐᠒᠖-᠐᠘-᠐᠔', { parseNumberingSystem: 'mong' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mroo" accepts Mro digit input', () => {
  const result = parse('yyyy-MM-dd', '𖩢𖩠𖩢𖩦-𖩠𖩨-𖩠𖩤', { parseNumberingSystem: 'mroo' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mtei" accepts Meetei Mayek digit input', () => {
  const result = parse('yyyy-MM-dd', '꯲꯰꯲꯶-꯰꯸-꯰꯴', { parseNumberingSystem: 'mtei' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mymr" accepts Myanmar digit input', () => {
  const result = parse('yyyy-MM-dd', '၂၀၂၆-၀၈-၀၄', { parseNumberingSystem: 'mymr' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mymrshan" accepts Myanmar Shan digit input', () => {
  const result = parse('yyyy-MM-dd', '႒႐႒႖-႐႘-႐႔', { parseNumberingSystem: 'mymrshan' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "mymrtlng" accepts Myanmar Tai Laing digit input', () => {
  const result = parse('yyyy-MM-dd', '꧲꧰꧲꧶-꧰꧸-꧰꧴', { parseNumberingSystem: 'mymrtlng' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "newa" accepts Newa digit input', () => {
  const result = parse('yyyy-MM-dd', '𑑒𑑐𑑒𑑖-𑑐𑑘-𑑐𑑔', { parseNumberingSystem: 'newa' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "nkoo" accepts N\'Ko digit input', () => {
  const result = parse('yyyy-MM-dd', '߂߀߂߆-߀߈-߀߄', { parseNumberingSystem: 'nkoo' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "olck" accepts Ol Chiki digit input', () => {
  const result = parse('yyyy-MM-dd', '᱒᱐᱒᱖-᱐᱘-᱐᱔', { parseNumberingSystem: 'olck' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "orya" accepts Odia digit input', () => {
  const result = parse('yyyy-MM-dd', '୨୦୨୬-୦୮-୦୪', { parseNumberingSystem: 'orya' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "osma" accepts Osmanya digit input', () => {
  const result = parse('yyyy-MM-dd', '𐒢𐒠𐒢𐒦-𐒠𐒨-𐒠𐒤', { parseNumberingSystem: 'osma' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "rohg" accepts Hanifi Rohingya digit input', () => {
  const result = parse('yyyy-MM-dd', '𐴲𐴰𐴲𐴶-𐴰𐴸-𐴰𐴴', { parseNumberingSystem: 'rohg' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "saur" accepts Saurashtra digit input', () => {
  const result = parse('yyyy-MM-dd', '꣒꣐꣒꣖-꣐꣘-꣐꣔', { parseNumberingSystem: 'saur' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "shrd" accepts Sharada digit input', () => {
  const result = parse('yyyy-MM-dd', '𑇒𑇐𑇒𑇖-𑇐𑇘-𑇐𑇔', { parseNumberingSystem: 'shrd' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "sind" accepts Khudawadi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑋲𑋰𑋲𑋶-𑋰𑋸-𑋰𑋴', { parseNumberingSystem: 'sind' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "sinh" accepts Sinhala Lith digit input', () => {
  const result = parse('yyyy-MM-dd', '෨෦෨෬-෦෮-෦෪', { parseNumberingSystem: 'sinh' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "sora" accepts Sora Sompeng digit input', () => {
  const result = parse('yyyy-MM-dd', '𑃲𑃰𑃲𑃶-𑃰𑃸-𑃰𑃴', { parseNumberingSystem: 'sora' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "sund" accepts Sundanese digit input', () => {
  const result = parse('yyyy-MM-dd', '᮲᮰᮲᮶-᮰᮸-᮰᮴', { parseNumberingSystem: 'sund' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "takr" accepts Takri digit input', () => {
  const result = parse('yyyy-MM-dd', '𑛂𑛀𑛂𑛆-𑛀𑛈-𑛀𑛄', { parseNumberingSystem: 'takr' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "talu" accepts New Tai Lue digit input', () => {
  const result = parse('yyyy-MM-dd', '᧒᧐᧒᧖-᧐᧘-᧐᧔', { parseNumberingSystem: 'talu' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "tamldec" accepts Tamil decimal digit input', () => {
  const result = parse('yyyy-MM-dd', '௨௦௨௬-௦௮-௦௪', { parseNumberingSystem: 'tamldec' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "telu" accepts Telugu digit input', () => {
  const result = parse('yyyy-MM-dd', '౨౦౨౬-౦౮-౦౪', { parseNumberingSystem: 'telu' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "thai" accepts Thai digit input', () => {
  const result = parse('yyyy-MM-dd', '๒๐๒๖-๐๘-๐๔', { parseNumberingSystem: 'thai' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "tirh" accepts Tirhuta digit input', () => {
  const result = parse('yyyy-MM-dd', '𑓒𑓐𑓒𑓖-𑓐𑓘-𑓐𑓔', { parseNumberingSystem: 'tirh' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "tibt" accepts Tibetan digit input', () => {
  const result = parse('yyyy-MM-dd', '༢༠༢༦-༠༨-༠༤', { parseNumberingSystem: 'tibt' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "vaii" accepts Vai digit input', () => {
  const result = parse('yyyy-MM-dd', '꘢꘠꘢꘦-꘠꘨-꘠꘤', { parseNumberingSystem: 'vaii' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "wara" accepts Warang Citi digit input', () => {
  const result = parse('yyyy-MM-dd', '𑣢𑣠𑣢𑣦-𑣠𑣨-𑣠𑣤', { parseNumberingSystem: 'wara' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "wcho" accepts Wancho digit input', () => {
  const result = parse('yyyy-MM-dd', '𞋲𞋰𞋲𞋶-𞋰𞋸-𞋰𞋴', { parseNumberingSystem: 'wcho' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): ASCII input still throws when parseNumberingSystem expects a different system and gets ASCII anyway', () => {
  // Converting ASCII digits "to ASCII" under convertDigitsToAscii is a
  // no-op per-character (reverse-map miss falls through unchanged), so
  // plain ASCII input under a non-latn parseNumberingSystem still
  // parses successfully — documenting that behavior explicitly rather
  // than assuming it throws.
  const result = parse('yyyy-MM-dd', '2026-08-04', { parseNumberingSystem: 'arab' });
  assert.equal(result.toString(), '2026-08-04');
});

test('safeParse(): parseNumberingSystem is honored the same way as parse()', () => {
  const result = safeParse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.toString(), '2026-08-04');
  }
});

test('round-trip: format with numberingSystem, then parse with matching parseNumberingSystem', () => {
  const formatted = format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' });
  const parsed = parse('yyyy-MM-dd', formatted, { parseNumberingSystem: 'arab' });
  assert.equal(parsed.toString(), '2026-08-04');
});

test('parse(): unsupported parseNumberingSystem throws descriptively', () => {
  assert.throws(
    () => parse('yyyy-MM-dd', '2026-08-04', { parseNumberingSystem: 'bogus-system' }),
    /numbering system "bogus-system" is not supported/
  );
});

test('format() and parse() options are independent: numberingSystem does not affect parse direction and vice versa', () => {
  // Formatting with numberingSystem set doesn't require parse to also
  // set anything, and setting parseNumberingSystem on parse doesn't
  // require format to have used numberingSystem — they're separate
  // opt-ins by design (see numbering.ts's NumberingParseOptions comment).
  const asciiFormatted = format(date, 'yyyy-MM-dd');
  assert.equal(parse('yyyy-MM-dd', asciiFormatted, { parseNumberingSystem: 'arab' }).toString(), '2026-08-04');
});

// --- 'auto' ---
// 'auto' asks Intl.NumberFormat(locale).resolvedOptions().numberingSystem
// what the call's locale itself uses, instead of requiring the caller to
// know the ICU numbering-system code. Unset (the default) still means
// 'latn' — 'auto' is an opt-in, not a default change.

test('format(): numberingSystem "auto" resolves the locale\'s native system (ar-EG -> arab)', () => {
  // ar-EG's default numbering system is arab on every ICU/CLDR build this
  // suite runs against — same stability class as the hardcoded month-name
  // assertions elsewhere in the suite (e.g. 'août' for fr-FR).
  const result = format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'ar-EG' });
  assert.equal(result, '٢٠٢٦-٠٨-٠٤');
});

test('format(): numberingSystem "auto" with a non-arabic locale stays ASCII (en-US -> latn)', () => {
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'en-US' }), '2026-08-04');
});

test('format(): numberingSystem "auto" with no locale defaults to en-US and stays ASCII', () => {
  // The default locale is 'en-US' (latn), and the default numberingSystem
  // is unchanged — 'auto' without a locale is not a way to sneak non-latn
  // digits in, it just resolves the default locale like an explicit
  // 'en-US' would.
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'auto' }), '2026-08-04');
});

test('format(): numberingSystem "auto" resolves bn-BD -> beng, not just arabic', () => {
  // Guards against an implementation that hardcodes arab as "the" native
  // system instead of genuinely consulting Intl per locale. Full date, to
  // match the README's bn-BD example verbatim.
  const result = format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'bn-BD' });
  assert.equal(result, '২০২৬-০৮-০৪');
});

test('format(): numberingSystem "auto" falls back to latn when the locale\'s native system is unsupported', () => {
  // zh-CN-u-nu-hans explicitly opts the locale into Simplified Chinese
  // numerals (an algorithmic system), which this library doesn't
  // transliterate — 'auto' must fall back to latn rather than throw
  // (falling back is the documented contract; only a malformed locale
  // tag throws).
  const result = format(date, 'yyyy', { numberingSystem: 'auto', locale: 'zh-CN-u-nu-hans' });
  assert.equal(result, '2026');
});

test('format(): numberingSystem "auto" normalizes underscore locale tags like every other locale path', () => {
  // 'ar_EG' is rejected by Intl constructors raw; the library normalizes
  // to 'ar-EG' everywhere else (see hardening.test.js) and the auto
  // resolution must not be the one path that forgot.
  const result = format(date, 'yyyy', { numberingSystem: 'auto', locale: 'ar_EG' });
  assert.equal(result, '٢٠٢٦');
});

test('format(): numberingSystem "auto" with a malformed locale throws the typed error, not a bare RangeError', () => {
  // 'yyyy' never touches Intl.DateTimeFormat, so without the auto
  // resolution this call would silently succeed — the malformed tag only
  // surfaces because 'auto' actually consults Intl for the locale.
  assert.throws(
    () => format(date, 'yyyy', { numberingSystem: 'auto', locale: 'not a locale!' }),
    /not a locale!/
  );
});

test('parse(): parseNumberingSystem "auto" accepts the locale\'s native digits', () => {
  const result = parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'auto', locale: 'ar-EG' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "auto" with a latn locale accepts ASCII input as-is', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04', { parseNumberingSystem: 'auto', locale: 'en-US' });
  assert.equal(result.toString(), '2026-08-04');
});

test('parse(): parseNumberingSystem "auto" with no locale defaults to en-US and accepts ASCII', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04', { parseNumberingSystem: 'auto' });
  assert.equal(result.toString(), '2026-08-04');
});

test('round-trip: auto on both directions with a native-digit locale', () => {
  const formatted = format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'ar-EG' });
  assert.equal(formatted, '٢٠٢٦-٠٨-٠٤');
  const parsed = parse('yyyy-MM-dd', formatted, { parseNumberingSystem: 'auto', locale: 'ar-EG' });
  assert.equal(parsed.toString(), '2026-08-04');
});

test('explicit systems still work unchanged alongside auto (no default drift)', () => {
  // The additive check: an explicit 'latn' in a locale whose native
  // system is arab must still win — 'auto' didn't change how explicit
  // values are handled, and unset is still latn.
  assert.equal(format(date, 'yyyy', { numberingSystem: 'latn', locale: 'ar-EG' }), '2026');
  assert.equal(format(date, 'yyyy', { locale: 'ar-EG' }), '2026');
});

