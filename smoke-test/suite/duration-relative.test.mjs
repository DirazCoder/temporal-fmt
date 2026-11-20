import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  formatDistance,
  formatDuration,
  formatISODuration,
  formatRelative,
  parseDuration,
  parseISODuration,
  parseRelative,
  setTemporal,
} from 'temporal-fmt';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('duration formatting and parsing interoperate with ISO durations', () => {
  assert.equal(formatDuration({ hours: 2 }, 'hh'), '2h');
  assert.equal(parseDuration('2h', 'hh').hours, 2);

  const fields = parseISODuration('P1Y2M3DT4H');
  assert.equal(fields.years, 1);
  assert.equal(fields.months, 2);
  assert.equal(fields.days, 3);
  assert.equal(fields.hours, 4);
  assert.equal(formatISODuration(fields), 'P1Y2M3DT4H');
});

test('relative formatters and parser work with Temporal dates', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const tomorrow = today.add({ days: 1 });
  assert.equal(formatDistance(tomorrow, today), 'tomorrow');
  assert.equal(typeof formatRelative(tomorrow, today), 'string');
  assert.equal(parseRelative('in 3 days', today).toString(), '2026-08-07');
});
