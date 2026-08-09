import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// pad() and the TOKENS handler table aren't exported — format.test.js
// covers the common cases (positive-year padding, hh/h at midnight/noon)
// through end-to-end format() calls. These fill in the arithmetic corners
// pad()'s sign-splitting and the % 12 || 12 wraparound have, one value
// at a time.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

test('pad() puts the sign before the padded digits, not after, for every negative-year width', () => {
  const date = Temporal.PlainDate.from({ year: -1, month: 1, day: 1 });
  assert.equal(format(date, 'yyyy'), '-0001');
});

test('pad() does not truncate a value already wider than the requested width', () => {
  const date = Temporal.PlainDate.from({ year: 12345, month: 1, day: 1 });
  assert.equal(format(date, 'yyyy'), '12345');
});

test('hh wraps hour 24-equivalent values correctly: 13 through 23 all map to 1-11 PM', () => {
  for (let hour = 13; hour <= 23; hour++) {
    const dt = Temporal.PlainDateTime.from({ year: 2026, month: 8, day: 4, hour, minute: 0 });
    const expected = String(hour - 12);
    assert.equal(format(dt, 'h'), expected, `hour ${hour} should render as h="${expected}"`);
  }
});

test('hh wraps every morning hour 1-11 unchanged, and 0 specifically to 12', () => {
  for (let hour = 1; hour <= 11; hour++) {
    const dt = Temporal.PlainDateTime.from({ year: 2026, month: 8, day: 4, hour, minute: 0 });
    assert.equal(format(dt, 'h'), String(hour));
  }
  const midnight = Temporal.PlainDateTime.from({ year: 2026, month: 8, day: 4, hour: 0, minute: 0 });
  assert.equal(format(midnight, 'h'), '12');
});

test('hh (padded) applies the same wraparound as h, then zero-pads the result', () => {
  const oneAM = Temporal.PlainDateTime.from('2026-08-04T01:00:00');
  const elevenPM = Temporal.PlainDateTime.from('2026-08-04T23:00:00');
  assert.equal(format(oneAM, 'hh'), '01');
  assert.equal(format(elevenPM, 'hh'), '11');
});

test('yy takes year % 100 with no sign concerns for any positive year, including exact centuries', () => {
  const y1900 = Temporal.PlainDate.from({ year: 1900, month: 1, day: 1 });
  const y2000 = Temporal.PlainDate.from({ year: 2000, month: 1, day: 1 });
  const y2100 = Temporal.PlainDate.from({ year: 2100, month: 1, day: 1 });
  assert.equal(format(y1900, 'yy'), '00');
  assert.equal(format(y2000, 'yy'), '00');
  assert.equal(format(y2100, 'yy'), '00');
});

test('M and MM agree on the numeric month value, differing only in padding', () => {
  const date = Temporal.PlainDate.from('2026-03-04');
  assert.equal(format(date, 'M'), '3');
  assert.equal(format(date, 'MM'), '03');
});

test('d and dd agree on the numeric day value, differing only in padding', () => {
  const date = Temporal.PlainDate.from('2026-08-07');
  assert.equal(format(date, 'd'), '7');
  assert.equal(format(date, 'dd'), '07');
});

test('every token in the handler table maps to exactly the field checked in format.test.js\'s "requires" errors — spot check the ones not already covered there', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => format(time, 'dd'), /requires "day"/);
  assert.throws(() => format(time, 'MM'), /requires "month"/);
});

test('SSS at the maximum value 999 pads to exactly 3 digits with no truncation or rounding', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.999');
  assert.equal(format(dt, 'SSS'), '999');
});
