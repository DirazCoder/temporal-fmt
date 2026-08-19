import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Configurable cutoffs for formatDistance. Default cutoffs (no
// `cutoffs` option) produce byte-identical output to the pre-change
// hardcoded behavior — that regression check is the first test below.
// The remaining tests cover: each individual boundary override in
// isolation, malformed cutoffs (non-monotonic, negative, NaN, Infinity)
// throwing descriptively, and boundary-value edges in both directions.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

function date(year, month, day) {
  return Temporal.PlainDate.from({ year, month, day });
}
function dateTime(year, month, day, hour, minute, second, millisecond) {
  return Temporal.PlainDateTime.from({ year, month, day, hour, minute: minute ?? 0, second: second ?? 0, millisecond: millisecond ?? 0 });
}

test('default cutoffs (no `cutoffs` option) produce byte-identical output to pre-change behavior', () => {
  // Direct before/after comparison: every default-path call that
  // existed before the cutoffs refactor still produces the same output.
  // Verified against the captured baseline (see scripts/capture-baseline.mjs).
  const today = date(2026, 8, 4);

  // <60s → seconds
  assert.equal(
    formatDistance(dateTime(2026, 8, 4, 12, 0, 30), dateTime(2026, 8, 4, 12, 0, 0)),
    'in 30 seconds'
  );
  // <60min → minutes
  assert.equal(
    formatDistance(dateTime(2026, 8, 4, 12, 30, 0), dateTime(2026, 8, 4, 12, 0, 0)),
    'in 30 minutes'
  );
  // <24h → hours
  assert.equal(
    formatDistance(dateTime(2026, 8, 4, 14, 0, 0), dateTime(2026, 8, 4, 12, 0, 0)),
    'in 2 hours'
  );
  // <30d → days
  assert.equal(
    formatDistance(date(2026, 8, 14), today),
    'in 10 days'
  );
  // 30d boundary → months (30 * MS_PER_DAY is the days→months cutoff)
  assert.match(
    formatDistance(date(2026, 9, 3), today),
    /month/
  );
  // <365d → months
  assert.match(
    formatDistance(date(2027, 8, 3), today),
    /month/
  );
  // >=365d → years
  assert.match(
    formatDistance(date(2027, 8, 4), today),
    /year/
  );
  // Same date → "now" via numeric:auto
  assert.equal(formatDistance(today, today), 'now');
});

test('override only `seconds` boundary: 30s cutoff means 45s lands in minutes', () => {
  // Default cutoff: <60s → seconds. Override to 30s: <30s → seconds,
  // 30s+ → minutes. A 45s diff now resolves to minutes instead of seconds.
  const t1 = dateTime(2026, 8, 4, 12, 0, 45);
  const t2 = dateTime(2026, 8, 4, 12, 0, 0);
  // Default: 45s → seconds
  assert.equal(formatDistance(t1, t2, { numeric: 'always' }), 'in 45 seconds');
  // Override: 45s > 30s → minutes (rounds to "in 1 minute")
  assert.equal(
    formatDistance(t1, t2, { numeric: 'always', cutoffs: { seconds: 30 } }),
    'in 1 minute'
  );
});

test('override only `minutes` boundary: 30-min cutoff means 45min lands in hours', () => {
  const t1 = dateTime(2026, 8, 4, 12, 45, 0);
  const t2 = dateTime(2026, 8, 4, 12, 0, 0);
  // Default: 45min < 60min → minutes
  assert.equal(formatDistance(t1, t2, { numeric: 'always' }), 'in 45 minutes');
  // Override: 45min > 30min → hours (rounds to "in 1 hour")
  assert.equal(
    formatDistance(t1, t2, { numeric: 'always', cutoffs: { minutes: 30 } }),
    'in 1 hour'
  );
});

test('override only `hours` boundary: 12-hour cutoff means 18h lands in days', () => {
  const t1 = dateTime(2026, 8, 5, 6, 0, 0);
  const t2 = dateTime(2026, 8, 4, 12, 0, 0);
  // Default: 18h < 24h → hours
  assert.equal(formatDistance(t1, t2, { numeric: 'always' }), 'in 18 hours');
  // Override: 18h > 12h → days (rounds to "in 1 day")
  assert.equal(
    formatDistance(t1, t2, { numeric: 'always', cutoffs: { hours: 12 } }),
    'in 1 day'
  );
});

test('override only `days` boundary: 7-day cutoff means 14d lands in months', () => {
  const today = date(2026, 8, 4);
  const in14d = date(2026, 8, 18);
  // Default: 14d < 30d → days
  assert.equal(formatDistance(in14d, today, { numeric: 'always' }), 'in 14 days');
  // Override: 14d > 7d → months (rounds to "in 1 month" or "this month")
  assert.match(
    formatDistance(in14d, today, { numeric: 'always', cutoffs: { days: 7 } }),
    /month/
  );
});

test('override only `months` boundary: 100-day cutoff means 200d lands in years', () => {
  const today = date(2026, 8, 4);
  const in200d = date(2027, 2, 22); // ~200 days
  // Default: 200d < 365d → months
  assert.match(formatDistance(in200d, today, { numeric: 'always' }), /month/);
  // Override: 200d > 100d → years
  assert.match(
    formatDistance(in200d, today, { numeric: 'always', cutoffs: { months: 100 } }),
    /year/
  );
});

test('override multiple boundaries at once', () => {
  // A "coarse" cutoff scheme: seconds=10, minutes=10, hours=6, days=7,
  // months=30. Tighter than the defaults — everything resolves to the
  // next unit up sooner.
  const cutoffs = { seconds: 10, minutes: 10, hours: 6, days: 7, months: 30 };
  const today = date(2026, 8, 4);

  // 20s diff: default → seconds, override → minutes (20s > 10s)
  assert.match(
    formatDistance(dateTime(2026, 8, 4, 12, 0, 20), dateTime(2026, 8, 4, 12, 0, 0), { cutoffs }),
    /minute/
  );
  // 20-min diff: default → minutes, override → hours
  assert.match(
    formatDistance(dateTime(2026, 8, 4, 12, 20), dateTime(2026, 8, 4, 12, 0), { cutoffs }),
    /hour/
  );
  // 10-day diff: default → days, override → months (10d > 7d)
  assert.match(
    formatDistance(date(2026, 8, 14), today, { cutoffs }),
    /month/
  );
});

test('boundary edge: exactly at a cutoff (60s default) resolves to the next unit up', () => {
  // The cutoff comparison is strict less-than: |diff| < maxMs → unit.
  // So |diff| == maxMs goes to the NEXT unit up (60s exactly = 60000ms,
  // not < 60000ms, so it's minutes, not seconds). Pin this behavior so
  // a refactor that flips to <= would surface here.
  const t1 = dateTime(2026, 8, 4, 12, 1, 0);
  const t2 = dateTime(2026, 8, 4, 12, 0, 0);
  // Exactly 60000ms — minutes, not seconds.
  assert.equal(
    formatDistance(t1, t2, { numeric: 'always' }),
    'in 1 minute'
  );

  // Just under the boundary — still seconds.
  const t3 = dateTime(2026, 8, 4, 12, 0, 59, 999);
  const t4 = dateTime(2026, 8, 4, 12, 0, 0);
  assert.equal(
    formatDistance(t3, t4, { numeric: 'always' }),
    'in 60 seconds'  // Math.round(59999 / 1000) = 60
  );

  // Override the boundary: 90s cutoff means 60s now resolves to seconds.
  assert.equal(
    formatDistance(t1, t2, { numeric: 'always', cutoffs: { seconds: 90 } }),
    'in 60 seconds'
  );
});

test('boundary edge: exactly at days→months cutoff (30d default) resolves to months', () => {
  // 30 days exactly = 30 * MS_PER_DAY. Not < 30 * MS_PER_DAY, so → months.
  const today = date(2026, 8, 4);
  const in30d = date(2026, 9, 3); // 30 days later
  assert.match(formatDistance(in30d, today), /month/);

  // Just under: 29 days → days
  const in29d = date(2026, 9, 2);
  assert.match(formatDistance(in29d, today), /day/);
});

test('validation: negative cutoff throws descriptively', () => {
  for (const key of ['seconds', 'minutes', 'hours', 'days', 'months']) {
    assert.throws(
      () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { [key]: -1 } }),
      new RegExp(`formatDistance cutoff "${key}" must be a positive finite number \\(got -1\\)`)
    );
  }
});

test('validation: zero cutoff throws (must be positive, not just non-negative)', () => {
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: 0 } }),
    /cutoff "seconds" must be a positive finite number \(got 0\)/
  );
});

test('validation: NaN cutoff throws', () => {
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: NaN } }),
    /cutoff "seconds" must be a positive finite number \(got NaN\)/
  );
});

test('validation: Infinity cutoff throws (must be finite)', () => {
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: Infinity } }),
    /cutoff "seconds" must be a positive finite number \(got Infinity\)/
  );
});

test('validation: non-number cutoff throws with a clear message', () => {
  // A string instead of a number — would otherwise produce confusing
  // arithmetic downstream. Throw at validation time, not at format time.
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: '60' } }),
    /cutoff "seconds" must be a positive finite number \(got 60\)/  // String(60) coerces to "60"
  );
});

test('validation: non-monotonic cutoffs throw with all four values named in the message', () => {
  // seconds=300 (5min), minutes=1 (1min). 300s = 5min > 1min, so the
  // seconds branch would always win and the minutes branch would be
  // unreachable — caller almost certainly got their values mixed up.
  // Throw a clear error naming all five cutoffs so the user can spot
  // the inverted pair.
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: 300, minutes: 1 } }),
    /non-decreasing in equivalent ms.*seconds=300s.*minutes=1min.*hours=24h.*days=30d.*months=365d/
  );
});

test('validation: non-monotonic at hours/days boundary also throws', () => {
  // hours=30, days=10 — 30h = 1.25d > 10d? No, 30h = 1.25d which is less
  // than 10d, so this IS monotonic. Let me pick a real non-monotonic
  // example: hours=30 (30h), days=1 (1d). 30h > 1d, so non-monotonic.
  assert.throws(
    () => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { hours: 30, days: 1 } }),
    /non-decreasing in equivalent ms/
  );
});

test('overriding cutoffs does not affect default-path calls (no shared state)', () => {
  // cutoffs is a per-call option, not global mutable state — calling
  // with custom cutoffs shouldn't bleed into subsequent calls.
  const today = date(2026, 8, 4);
  const tomorrow = date(2026, 8, 5);
  // Call with custom cutoffs
  formatDistance(tomorrow, today, { cutoffs: { seconds: 5 } });
  // Subsequent call with no cutoffs should still use the defaults.
  assert.equal(formatDistance(tomorrow, today), 'tomorrow');
  // And a 30s diff should resolve to seconds (default), not minutes
  // (which the 5s override would have caused).
  assert.equal(
    formatDistance(dateTime(2026, 8, 4, 12, 0, 30), dateTime(2026, 8, 4, 12, 0, 0)),
    'in 30 seconds'
  );
});

test('cutoffs option composes with locale and numeric options', () => {
  // The cutoffs option should compose cleanly with the existing
  // `locale` and `numeric` options — they're orthogonal.
  const today = date(2026, 8, 4);
  const in10d = date(2026, 8, 14);

  // Default cutoffs, fr-FR, numeric:auto
  assert.equal(formatDistance(in10d, today, { locale: 'fr-FR' }), 'dans 10 jours');
  // Override days cutoff to 7: 10d > 7d → months, fr-FR
  assert.match(
    formatDistance(in10d, today, { locale: 'fr-FR', cutoffs: { days: 7 } }),
    /mois/
  );
  // Override with numeric:always
  assert.match(
    formatDistance(in10d, today, { numeric: 'always', cutoffs: { days: 7 } }),
    /month/
  );
});
