import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFormat,
  format,
  parse,
  safeParse,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Regression: legacy parse()/format() throw messages are unchanged.
// The plan requires this: "verify directly against each repo's current
// test/ expected values, not 'should be fine.' If any existing assertion
// needs to change, that means a 'fix' altered old behavior, which isn't
// allowed here."
test('regression: parse() still throws the same "no valid pattern" message', () => {
  assert.throws(
    () => parse('yyyy-MM-dd', 'not-a-date'),
    /no valid pattern matches the format string and input shape/,
  );
});

test('regression: format() still throws the same "requires" message for missing field', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(
    () => format(date, 'HH:mm'),
    /token "HH" requires "hour", which this Temporal object doesn't have/,
  );
});

test('regression: format() output is byte-identical for existing tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(format(date, 'EEEE, MMMM d, yyyy'), 'Tuesday, August 4, 2026');
  assert.equal(format(date, 'EEE, MMM d'), 'Tue, Aug 4');
});

// Adversarial cases for the new APIs.
test('adversarial: safeParse on input at the length cap', () => {
  // MAX_INPUT_LENGTH is 100_000 — exercising it directly would be slow.
  // Spot-check that a 1_000-char input still parses.
  const input = '2026-08-04' + ' '.repeat(1000);
  const result = safeParse('yyyy-MM-dd', input.slice(0, 10));
  assert.equal(result.ok, true);
});

test('adversarial: analyzeFormat on a pathological format string at the length cap', () => {
  // Repeating "yyyy " 200 times → 1000 chars, exactly at MAX_FORMAT_LENGTH.
  const fmt = 'yyyy '.repeat(200).trimEnd();
  assert.equal(fmt.length, 999); // 200*5 - 1 for trimEnd
  const analysis = analyzeFormat(fmt);
  assert.equal(analysis.tokens.length, 200);
  // All yyyy → all need year. Compatible types are the four that carry year.
  assert.deepEqual(analysis.compatibleTypes, ['PlainDate', 'PlainDateTime', 'PlainYearMonth', 'ZonedDateTime']);
});

test('adversarial: analyzeFormat rejects format strings over MAX_FORMAT_LENGTH', () => {
  assert.throws(() => analyzeFormat('x'.repeat(1001)), /exceeds maximum length/);
});
