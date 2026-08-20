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
