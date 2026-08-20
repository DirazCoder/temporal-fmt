import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDistanceToNow, formatDistance } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// formatDistanceToNow(date) === formatDistance(date, <system clock at call
// time>). Exists so a caller doesn't have to build the reference value
// themselves, mirroring the formatRelativeToNow()/formatRelative() pair
// that already existed in relativeTime.ts.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

// Mocks the system clock so we can assert exact strings instead of
// tolerant/fuzzy ones. Restores the real Date after each test.
function withMockedNow(fixedIso, fn) {
  const RealDate = global.Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(fixedIso);
      return new RealDate(...args);
    }
    static now() {
      return new RealDate(fixedIso).getTime();
    }
  }
  global.Date = MockDate;
  try {
    fn();
  } finally {
    global.Date = RealDate;
  }
}

test('formatDistanceToNow: "3 hours ago" for a PlainDateTime 3h before mocked now', () => {
  withMockedNow('2026-08-04T15:45:30.000', () => {
    const threeHoursAgo = Temporal.PlainDateTime.from('2026-08-04T12:45:30');
    assert.equal(formatDistanceToNow(threeHoursAgo), '3 hours ago');
  });
});

test('formatDistanceToNow: "in 3 hours" for a PlainDateTime 3h after mocked now', () => {
  withMockedNow('2026-08-04T15:45:30.000', () => {
    const in3Hours = Temporal.PlainDateTime.from('2026-08-04T18:45:30');
    assert.equal(formatDistanceToNow(in3Hours), 'in 3 hours');
  });
});

test('formatDistanceToNow: "now" when the value equals mocked now exactly', () => {
  withMockedNow('2026-08-04T15:45:30.000', () => {
    const rightNow = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
    assert.equal(formatDistanceToNow(rightNow), 'now');
  });
});

test('formatDistanceToNow: regression — sub-24h distance is NOT misread as "in 23 hours" due to a date-only reference', () => {
  // This is the specific bug this feature could have reintroduced by
  // copying formatRelativeToNow()'s date-only "now" (year/month/day with
  // no time fields, which formatDistance's ms-resolution diff would
  // treat as midnight). Asserting the correct hour-level answer here
  // catches that regression directly.
  withMockedNow('2026-08-04T23:00:00.000', () => {
    const anHourAgo = Temporal.PlainDateTime.from('2026-08-04T22:00:00');
    assert.equal(formatDistanceToNow(anHourAgo), '1 hour ago');
  });
});

test('formatDistanceToNow: minute-resolution distance is correct, not rounded to a day', () => {
  withMockedNow('2026-08-04T23:59:00.000', () => {
    const fifteenMinAgo = Temporal.PlainDateTime.from('2026-08-04T23:44:00');
    assert.equal(formatDistanceToNow(fifteenMinAgo), '15 minutes ago');
  });
});

test('formatDistanceToNow: accepts a PlainDate (treated as midnight, per formatDistance)', () => {
  withMockedNow('2026-08-10T00:00:00.000', () => {
    const fiveDaysAgo = Temporal.PlainDate.from('2026-08-05');
    assert.equal(formatDistanceToNow(fiveDaysAgo), '5 days ago');
  });
});

test('formatDistanceToNow: options (numeric, cutoffs, locale) pass through to formatDistance unchanged', () => {
  withMockedNow('2026-08-04T15:45:30.000', () => {
    const rightNow = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
    assert.equal(formatDistanceToNow(rightNow, { numeric: 'always' }), 'in 0 seconds');

    const in14Days = Temporal.PlainDateTime.from('2026-08-18T15:45:30');
    assert.equal(
      formatDistanceToNow(in14Days, { cutoffs: { days: 10 } }),
      formatDistance(in14Days, Temporal.PlainDateTime.from('2026-08-04T15:45:30'), { cutoffs: { days: 10 } }),
    );
  });
});

test('formatDistanceToNow: not memoized — reflects a fresh "now" on each call', () => {
  withMockedNow('2026-08-04T12:00:00.000', () => {
    const target = Temporal.PlainDateTime.from('2026-08-04T13:00:00');
    assert.equal(formatDistanceToNow(target), 'in 1 hour');
  });
  withMockedNow('2026-08-04T13:00:00.000', () => {
    const target = Temporal.PlainDateTime.from('2026-08-04T13:00:00');
    assert.equal(formatDistanceToNow(target), 'now');
  });
});

// Unmocked sanity check against the real system clock — not asserting an
// exact string (that would be flaky), just that it runs and returns a
// non-empty relative-time-shaped string for a value we know is in the past.
test('formatDistanceToNow: works against the real system clock (smoke test, not exact-string)', () => {
  const farPast = Temporal.PlainDateTime.from('2020-01-01T00:00:00');
  const result = formatDistanceToNow(farPast);
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
  assert.match(result, /ago$/); // 2020 is unambiguously in the past
});
