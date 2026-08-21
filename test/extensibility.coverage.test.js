import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormatter, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Covers the createFormatter API paths that phase2-final.test.js doesn't
// touch: formatToParts, quoted literals, error branches, defaultLocale,
// and compileFormat's own format/formatToParts closures (they duplicate
// the top-level logic rather than delegating, so they need their own
// tests to cover).

const date = Temporal.PlainDate.from('2026-08-04');

test('createFormatter: formatToParts returns token and literal parts', () => {
  const fmt = createFormatter();
  const parts = fmt.formatToParts(date, 'yyyy-MM');
  assert.deepEqual(parts, [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '08', token: 'MM' },
  ]);
});

test('createFormatter: formatToParts merges adjacent literal characters into one part', () => {
  const fmt = createFormatter();
  const parts = fmt.formatToParts(date, 'yyyy--MM');
  assert.deepEqual(parts, [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '--' },
    { type: 'token', value: '08', token: 'MM' },
  ]);
});

test('createFormatter: formatToParts with a custom token', () => {
  const fmt = createFormatter({
    tokens: [{ name: 'YYYYYY', handler: (t) => String(t.year).padStart(6, '0'), field: 'year' }],
  });
  const parts = fmt.formatToParts(date, 'YYYYYY');
  assert.deepEqual(parts, [{ type: 'token', value: '002026', token: 'YYYYYY' }]);
});

test('createFormatter: quoted literal passes text through unescaped', () => {
  const fmt = createFormatter();
  assert.equal(fmt.format(date, "yyyy 'year'"), '2026 year');
});

test('createFormatter: doubled single-quote inside a quoted literal escapes to one quote', () => {
  const fmt = createFormatter();
  assert.equal(fmt.format(date, "yyyy 'it''s'"), "2026 it's");
});

test('createFormatter: a doubled quote outside any literal also collapses to one quote', () => {
  const fmt = createFormatter();
  assert.equal(fmt.format(date, "''yyyy"), "'2026");
});

test('createFormatter: unterminated quote throws', () => {
  const fmt = createFormatter();
  assert.throws(() => fmt.format(date, "yyyy 'oops"), /unterminated quote/);
});

// Note: the "unknown token" throw in format()/formatToParts()/compileFormat()
// is dead code as written — customTokenize() only ever matches strings drawn
// from handlerByToken's own keys, so a match can never miss the map lookup.
// Anything that isn't a registered token name falls through to
// appendLiteral() instead, which is what these two tests confirm.
test('createFormatter: a string matching no token name is treated as a literal', () => {
  const fmt = createFormatter();
  assert.equal(fmt.format(date, '@@@'), '@@@');
});

test('createFormatter: formatToParts treats a non-token string as a literal part', () => {
  const fmt = createFormatter();
  assert.deepEqual(fmt.formatToParts(date, '@@@'), [{ type: 'literal', value: '@@@' }]);
});

test('createFormatter: token requiring a missing field throws', () => {
  const fmt = createFormatter();
  const time = Temporal.PlainTime.from('10:30:00');
  // PlainTime has no `year`, so a date-only token should fail.
  assert.throws(() => fmt.format(time, 'yyyy'), /requires "year"/);
});

test('createFormatter: formatToParts also throws when the field is missing', () => {
  const fmt = createFormatter();
  const time = Temporal.PlainTime.from('10:30:00');
  assert.throws(() => fmt.formatToParts(time, 'yyyy'), /requires "year"/);
});

test('createFormatter: format string over the max length throws', () => {
  const fmt = createFormatter();
  const tooLong = 'y'.repeat(1001);
  assert.throws(() => fmt.format(date, tooLong), /exceeds maximum length/);
});

test('createFormatter: formatToParts over the max length throws', () => {
  const fmt = createFormatter();
  const tooLong = 'y'.repeat(1001);
  assert.throws(() => fmt.formatToParts(date, tooLong), /exceeds maximum length/);
});

test('createFormatter: compileFormat over the max length throws', () => {
  const fmt = createFormatter();
  const tooLong = 'y'.repeat(1001);
  assert.throws(() => fmt.compileFormat(tooLong), /exceeds maximum length/);
});

test('createFormatter: defaultLocale option is used when a call omits locale', () => {
  const fmt = createFormatter({ defaultLocale: 'fr' });
  const withDefault = fmt.format(date, 'MMMM');
  const explicit = fmt.format(date, 'MMMM', { locale: 'fr' });
  assert.equal(withDefault, explicit);
});

test('createFormatter: per-call locale overrides defaultLocale', () => {
  const fmt = createFormatter({ defaultLocale: 'fr' });
  const enResult = fmt.format(date, 'MMMM', { locale: 'en-US' });
  assert.equal(enResult, 'August');
});

test('compileFormat: format() honors defaultLocale', () => {
  const fmt = createFormatter({ defaultLocale: 'fr' });
  const compiled = fmt.compileFormat('MMMM');
  assert.equal(compiled.format(date), fmt.format(date, 'MMMM', { locale: 'fr' }));
});

test('compileFormat: format() honors a per-call locale override', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('MMMM');
  assert.equal(compiled.format(date, { locale: 'en-US' }), 'August');
});

test('compileFormat: format() treats a non-token string as a literal', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('@@@');
  assert.equal(compiled.format(date), '@@@');
});

test('compileFormat: format() throws when the temporal value is missing the required field', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('yyyy');
  const time = Temporal.PlainTime.from('10:30:00');
  assert.throws(() => compiled.format(time), /requires "year"/);
});

test('compileFormat: formatToParts() returns token and literal parts', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('yyyy-MM');
  assert.deepEqual(compiled.formatToParts(date), [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '08', token: 'MM' },
  ]);
});

test('compileFormat: formatToParts() merges adjacent literal characters', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('yyyy--MM');
  assert.deepEqual(compiled.formatToParts(date), [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '--' },
    { type: 'token', value: '08', token: 'MM' },
  ]);
});

test('compileFormat: formatToParts() honors defaultLocale', () => {
  const fmt = createFormatter({ defaultLocale: 'fr' });
  const compiled = fmt.compileFormat('MMMM');
  assert.deepEqual(compiled.formatToParts(date), fmt.formatToParts(date, 'MMMM', { locale: 'fr' }));
});

test('compileFormat: formatToParts() treats a non-token string as a literal part', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('@@@');
  assert.deepEqual(compiled.formatToParts(date), [{ type: 'literal', value: '@@@' }]);
});

test('compileFormat: formatToParts() throws when the temporal value is missing the required field', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('yyyy');
  const time = Temporal.PlainTime.from('10:30:00');
  assert.throws(() => compiled.formatToParts(time), /requires "year"/);
});
