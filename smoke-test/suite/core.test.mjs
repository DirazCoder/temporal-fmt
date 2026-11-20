import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  AmbiguousInputError,
  TemporalFmtError,
  analyzeFormat,
  compileFormat,
  compileParser,
  format,
  formatToParts,
  isPlainDate,
  matchesFormat,
  parse,
  parseToParts,
  safeParse,
  setTemporal,
  tokenizeFormat,
  tryParse,
} from 'temporal-fmt';
import {
  format as legacyFormat,
  parse as legacyParse,
} from 'temporal-fmt/legacy';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('formats, parses, and compiles through the published root and legacy exports', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(legacyFormat(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(String(parse('yyyy-MM-dd', '2026-08-04')), '2026-08-04');
  assert.equal(String(legacyParse('yyyy-MM-dd', '2026-08-04')), '2026-08-04');

  assert.equal(compileFormat('yyyy-MM-dd').format(date), '2026-08-04');
  assert.equal(String(compileParser('yyyy-MM-dd').parse('2026-08-04')), '2026-08-04');
  assert.equal(matchesFormat('yyyy-MM-dd', '2026-08-04'), true);
  assert.equal(isPlainDate(date), true);

  assert.deepEqual(formatToParts(date, 'yyyy-MM'), [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '-', },
    { type: 'token', value: '08', token: 'MM' },
  ]);
  assert.equal(parseToParts('yyyy-MM-dd', '2026-08-04').length, 3);
});

test('safe and try parsing preserve typed error and failure behavior', () => {
  const ok = safeParse('yyyy-MM-dd', '2026-08-04');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(String(ok.value), '2026-08-04');

  const bad = safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.error instanceof TemporalFmtError);
    assert.match(bad.error.message, /no valid pattern matches/);
  }

  const ambiguous = safeParse('Md', '121');
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.ok(ambiguous.error instanceof AmbiguousInputError);
  assert.equal(tryParse('yyyy-MM-dd', 'not-a-date'), undefined);
});

test('format analysis and tokenization are available from the package entry point', () => {
  const analysis = analyzeFormat('yyyy-MM-dd');
  assert.equal(analysis.parseable, true);
  assert.deepEqual(tokenizeFormat('yyyy-MM-dd').map((part) => part.value), ['yyyy', '-', 'MM', '-', 'dd']);
});
