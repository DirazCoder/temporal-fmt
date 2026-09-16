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

test('format(): numberingSystem "deva" converts output digits to Devanagari', () => {
  const result = format(date, 'yyyy', { numberingSystem: 'deva' });
  assert.equal(result, '२०२६');
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

test('parse(): parseNumberingSystem "deva" accepts Devanagari digit input', () => {
  const result = parse('yyyy-MM-dd', '२०२६-०८-०४', { parseNumberingSystem: 'deva' });
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
  // th-TH-u-nu-thai explicitly opts the locale into Thai digits, which
  // this library doesn't transliterate — 'auto' must fall back to latn
  // rather than throw (falling back is the documented contract; only a
  // malformed locale tag throws).
  const result = format(date, 'yyyy', { numberingSystem: 'auto', locale: 'th-TH-u-nu-thai' });
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
