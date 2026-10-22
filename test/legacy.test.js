import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileFormat,
  compileParser,
  format,
  formatToParts,
  matchesFormat,
  parse,
  parseToParts,
  safeParse,
  tryParse,
} from '../dist/legacy.js';
import { setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('legacy format retains plain Error identity and message', () => {
  assert.throws(
    () => format(Temporal.PlainDate.from('2026-08-04'), 'HH'),
    (error) => error.constructor === Error && error.name === 'Error' && /requires "hour"/.test(error.message),
  );
});

test('legacy parse retains plain Error identity and message', () => {
  assert.throws(
    () => parse('yyyy-MM-dd', 'not-a-date'),
    (error) => error.constructor === Error && error.name === 'Error' && /no valid pattern matches/.test(error.message),
  );
});

test('legacy safeParse returns a plain Error on failure', () => {
  const result = safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.constructor, Error);
    assert.equal(result.error.name, 'Error');
  }
});

test('legacy parsing helpers preserve their prior success and failure shapes', () => {
  assert.equal(safeParse('yyyy-MM-dd', '2026-08-04').ok, true);
  assert.equal(tryParse('yyyy-MM-dd', 'not-a-date'), undefined);
  assert.equal(parseToParts('yyyy-MM-dd', '2026-08-04').length, 3);
  assert.equal(formatToParts(Temporal.PlainDate.from('2026-08-04'), 'yyyy-MM-dd').length, 5);
});

test('compiled legacy APIs retain plain Error behavior', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const compiledFormat = compileFormat('HH');
  assert.throws(
    () => compiledFormat.format(date),
    (error) => error.constructor === Error && error.name === 'Error',
  );
  assert.equal(compileFormat('yyyy').formatToParts(date).length, 1);

  const compiledParser = compileParser('yyyy-MM-dd');
  assert.throws(
    () => compiledParser.parse('not-a-date'),
    (error) => error.constructor === Error && error.name === 'Error',
  );
  assert.equal(compiledParser.safeParse('not-a-date').ok, false);
  assert.equal(compiledParser.tryParse('not-a-date'), undefined);
  assert.equal(compiledParser.parseToParts('2026-08-04').length, 3);
});

test('legacy wrappers preserve errors that were not part of the typed hierarchy', () => {
  const expected = new TypeError('getters may throw their own errors');
  const temporalLike = new Proxy({}, { get() { throw expected; } });
  assert.throws(
    () => format(temporalLike, 'yyyy'),
    (error) => error === expected,
  );
});

test('legacy matchesFormat checks the complete formatted shape', () => {
  assert.equal(matchesFormat('yyyy-MM-dd HH:mm', '2026-08-04 15:45'), true);
  assert.equal(matchesFormat('yyyy-MM', '2026-08-04T15:45:30'), false);
  assert.equal(matchesFormat('yyyy-MM-dd', '2026-13-40'), false);
  assert.equal(matchesFormat("'at' h:mm", 'at 3:45'), true);
});

test('legacy matchesFormat uses locale vocabulary', () => {
  assert.equal(matchesFormat('MMMM', 'août', { locale: 'fr-FR' }), true);
  assert.equal(matchesFormat('MMMM', 'August', { locale: 'fr-FR' }), false);
});

test('legacy matchesFormat accepts only valid splits for adjacent numeric tokens', () => {
  assert.equal(matchesFormat('Hm', '123'), true);
  assert.equal(matchesFormat('Hm', '999'), false);
});

test('legacy matchesFormat retains plain Error failures', () => {
  assert.throws(
    () => matchesFormat('MMMMM', 'August'),
    (error) => error.constructor === Error && error.name === 'Error',
  );
  assert.throws(
    () => matchesFormat('yyyy'.repeat(251), '2026'),
    (error) => error.constructor === Error && /exceeds maximum length/.test(error.message),
  );
});

test('legacy matchesFormat bounds its compiled-pattern cache', () => {
  for (let i = 0; i < 501; i += 1) {
    matchesFormat(`'literal ${i}'`, `literal ${i}`);
  }
  assert.equal(matchesFormat("'literal 0'", 'literal 0'), true);
});
