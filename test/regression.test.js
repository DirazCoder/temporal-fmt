import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Confirms parse()/format() error messages and output stay stable across
// changes elsewhere in the codebase — if one of these needs to change,
// that's a behavior change, not just a refactor.

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
