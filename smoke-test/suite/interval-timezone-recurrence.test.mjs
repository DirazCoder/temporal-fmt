import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  formatRange,
  formatRRule,
  getOffset,
  interval,
  intervalContains,
  parseRRule,
  possibleInstantsFor,
  recurrence,
  resolveZoned,
  setTemporal,
  take,
} from 'temporal-fmt';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('interval helpers construct, query, and format ranges', () => {
  const start = Temporal.PlainDate.from('2026-08-04');
  const end = Temporal.PlainDate.from('2026-08-06');
  const range = interval(start, end);

  assert.equal(intervalContains(range, Temporal.PlainDate.from('2026-08-05')), true);
  assert.equal(formatRange(range, 'yyyy-MM-dd').includes('2026'), true);
});

test('recurrence rules parse, format, and generate occurrences', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = parseRRule('FREQ=DAILY;COUNT=3');
  assert.equal(formatRRule(rule), 'FREQ=DAILY;COUNT=3');
  assert.deepEqual(take(recurrence(start, rule), 3).map((date) =>
    `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`), [
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
  ]);
});

test('timezone helpers resolve and inspect a zoned date-time', () => {
  const zoned = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC');
  assert.equal(getOffset(zoned), '+00:00');
  assert.equal(possibleInstantsFor({
    year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0,
    millisecond: 0,
  }, 'UTC').length, 1);
});
