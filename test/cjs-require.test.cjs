// .cjs, not .js — this package is "type": "module", so a plain .js file
// here would load as ESM and `require` wouldn't exist. Nothing else in
// the suite exercises dist/index.cjs under real CommonJS semantics; this
// is what would actually fail if the "require" export condition broke.
const test = require('node:test');
const assert = require('node:assert/strict');
const { format, parse, setTemporal } = require('../dist/index.cjs');
const { Temporal } = require('temporal-polyfill/full');

setTemporal(Temporal);

test('require()-ing dist/index.cjs exposes format, parse, and setTemporal as callable exports', () => {
  assert.equal(typeof format, 'function');
  assert.equal(typeof parse, 'function');
  assert.equal(typeof setTemporal, 'function');
});

test('format() works end-to-end through the CJS build', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('parse() works end-to-end through the CJS build', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('module.exports has no default-export wrapper — named destructuring is the real shape, not a transpiler artifact', () => {
  const mod = require('../dist/index.cjs');
  assert.equal(mod.default, undefined);
  // Mirrors src/index.ts's export list. Update both together when the
  // public API surface changes.
  assert.deepEqual(
    Object.keys(mod).sort(),
    ['format', 'formatDistance', 'formatDuration', 'parse', 'parseRelative', 'registerLocaleVocab', 'setTemporal'],
  );
});
