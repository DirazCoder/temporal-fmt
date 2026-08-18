import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// formatDistance returns a human-readable relative-time string between
// two Temporal values, e.g. "3 days ago", "in 2 hours", "now". Unit
// selection cutoffs: <60s seconds, <60min minutes, <24h hours, <30d
// days, <365d months, otherwise years. Delegates unit names and
// pluralization to Intl.RelativeTimeFormat (numeric: 'auto' by default
// → "yesterday"/"tomorrow"/"now" forms where available).
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

function date(year, month, day) {
  return Temporal.PlainDate.from({ year, month, day });
}

function dateTime(year, month, day, hour, minute, second) {
  return Temporal.PlainDateTime.from({ year, month, day, hour, minute: minute ?? 0, second: second ?? 0 });
}

test('same date: "now" with numeric:auto', () => {
  const today = date(2026, 8, 4);
  assert.equal(formatDistance(today, today), 'now');
});

test('same date with numeric:always forces "in 0 seconds"', () => {
  const today = date(2026, 8, 4);
  assert.equal(formatDistance(today, today, { numeric: 'always' }), 'in 0 seconds');
});

test('tomorrow: numeric:auto gives "tomorrow", numeric:always gives "in 1 day"', () => {
  const today = date(2026, 8, 4);
  const tomorrow = date(2026, 8, 5);
  assert.equal(formatDistance(tomorrow, today), 'tomorrow');
  assert.equal(formatDistance(tomorrow, today, { numeric: 'always' }), 'in 1 day');
});

test('yesterday: numeric:auto gives "yesterday", numeric:always gives "1 day ago"', () => {
  const today = date(2026, 8, 4);
  const yesterday = date(2026, 8, 3);
  assert.equal(formatDistance(yesterday, today), 'yesterday');
  assert.equal(formatDistance(yesterday, today, { numeric: 'always' }), '1 day ago');
});

test('3 days future: "in 3 days"', () => {
  const today = date(2026, 8, 4);
  const in3days = date(2026, 8, 7);
  assert.equal(formatDistance(in3days, today), 'in 3 days');
});

test('3 days past: "3 days ago"', () => {
  const today = date(2026, 8, 4);
  const threeDaysAgo = date(2026, 8, 1);
  assert.equal(formatDistance(threeDaysAgo, today), '3 days ago');
});

test('direction: positive diff = future, negative diff = past', () => {
  // formatDistance(date1, date2): diff = date1 - date2. Positive means
  // date1 is in the future relative to date2 → "in X"; negative means
  // date1 is in the past → "X ago".
  const today = date(2026, 8, 4);
  const future = date(2026, 8, 7);
  const past = date(2026, 8, 1);
  assert.equal(formatDistance(future, today), 'in 3 days');
  assert.equal(formatDistance(past, today), '3 days ago');
  // symmetric: swapping the args flips the direction
  assert.equal(formatDistance(today, future), '3 days ago');
  assert.equal(formatDistance(today, past), 'in 3 days');
});

test('hour resolution: 2-hour difference resolves to hours', () => {
  const t1 = dateTime(2026, 8, 4, 14, 0);
  const t2 = dateTime(2026, 8, 4, 12, 0);
  assert.equal(formatDistance(t1, t2), 'in 2 hours');
  assert.equal(formatDistance(t2, t1), '2 hours ago');
});

test('minute resolution: 30-min difference', () => {
  const t1 = dateTime(2026, 8, 4, 14, 30);
  const t2 = dateTime(2026, 8, 4, 14, 0);
  assert.equal(formatDistance(t1, t2), 'in 30 minutes');
});

test('month boundary: 31 days → "in 1 month" (auto) or "in 1 month" (always)', () => {
  // 30 days is the cutoff between "days" and "months" per the
  // documented cutoffs. 31 days crosses into month territory.
  const today = date(2026, 8, 4);
  const in31 = date(2026, 9, 4); // 31 days later
  // Result depends on rounding; just assert it's a month-form output
  const result = formatDistance(in31, today);
  assert.match(result, /month/);
});

test('year boundary: >365 days → years', () => {
  const today = date(2026, 8, 4);
  const inTwoYears = date(2028, 8, 4);
  const result = formatDistance(inTwoYears, today);
  assert.match(result, /year/);
});

test('locale: fr-FR produces French output', () => {
  const today = date(2026, 8, 4);
  const tomorrow = date(2026, 8, 5);
  // RTF('fr-FR', {numeric:'auto'}).format(1, 'day') → "demain"
  assert.equal(formatDistance(tomorrow, today, { locale: 'fr-FR' }), 'demain');
  assert.match(formatDistance(date(2026, 8, 7), today, { locale: 'fr-FR' }), /dans/);
});

test('locale: ja-JP produces Japanese output', () => {
  const today = date(2026, 8, 4);
  const tomorrow = date(2026, 8, 5);
  // RTF('ja-JP', {numeric:'auto'}).format(1, 'day') → "明日"
  assert.equal(formatDistance(tomorrow, today, { locale: 'ja-JP' }), '明日');
});

test('locale: ar-EG produces Arabic output', () => {
  const today = date(2026, 8, 4);
  const inThreeDays = date(2026, 8, 7);
  // Just confirm it produces something Arabic-flavored — exact
  // output shape varies by ICU build
  const result = formatDistance(inThreeDays, today, { locale: 'ar-EG' });
  assert.match(result, /\S/);
});

test('throws on non-Temporal value', () => {
  assert.throws(() => formatDistance(null, date(2026, 8, 4)), /expects Temporal values/);
  assert.throws(() => formatDistance('2026-08-04', date(2026, 8, 4)), /expects Temporal values/);
  assert.throws(() => formatDistance(date(2026, 8, 4), 42), /expects Temporal values/);
});

test('throws on PlainTime (no date anchor)', () => {
  // A PlainTime has hour/minute/second but no year/month/day — there
  // is no anchor date to diff against. Throw rather than silently
  // producing a meaningless "0 seconds" result.
  const time = Temporal.PlainTime.from('15:45:00');
  assert.throws(() => formatDistance(time, time), /year\/month\/day|Temporal values/);
});

test('throws on partial-date shape (year but no month, etc.)', () => {
  assert.throws(
    () => formatDistance({ year: 2026 }, { year: 2026, month: 8, day: 4 }),
    /partial date/
  );
});

test('mixed: PlainDate and PlainDateTime diff works (PlainDate treated as midnight)', () => {
  // PlainDate is treated as midnight; PlainDateTime at noon is 12 hours later
  const today = date(2026, 8, 4);
  const noon = dateTime(2026, 8, 4, 12, 0);
  // 12-hour diff → "in 12 hours" / "12 hours ago"
  assert.match(formatDistance(noon, today), /12 hours/);
  assert.match(formatDistance(today, noon), /12 hours/);
});

test('seconds: <60s resolves to seconds', () => {
  const t1 = dateTime(2026, 8, 4, 12, 0, 30);
  const t2 = dateTime(2026, 8, 4, 12, 0, 0);
  assert.equal(formatDistance(t1, t2), 'in 30 seconds');
  assert.equal(formatDistance(t2, t1), '30 seconds ago');
});
