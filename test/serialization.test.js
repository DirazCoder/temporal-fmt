import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDuration,
  balanceDuration,
  compareDuration,
  format,
  formatHTTPDate,
  formatISO,
  formatISODuration,
  formatRFC2822,
  formatRFC3339,
  formatSQL,
  fromUnixMicroseconds,
  fromUnixMilliseconds,
  fromUnixNanoseconds,
  fromUnixSeconds,
  parseDuration,
  parseHTTPDate,
  parseISO,
  parseISODuration,
  parseRFC2822,
  parseRFC3339,
  parseSQL,
  round,
  setTemporal,
  subtractDuration,
  toUnixMicroseconds,
  toUnixMilliseconds,
  toUnixNanoseconds,
  toUnixSeconds,
  totalDuration,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// phase2-final.test.js covers the happy paths for most of these. This
// fills in the branches c8 flagged as uncovered: parseISO's time-only
// and garbage-input paths, formatISO's non-Temporal throw, RFC 3339's
// offset-zone and fractional-second grammar, RFC 2822's three dispatch
// shapes, HTTP-date's throws, and the epoch-conversion helpers'
// property-shape dispatch.

test('parseISO: parses a bare time (no date part) as PlainTime', () => {
  const r = parseISO('15:45:30');
  assert.equal(r.toString(), '15:45:30');
});

test('parseISO: numeric UTC offset (not Z) round-trips as ZonedDateTime', () => {
  // Regression test: parseISO used to only expand a bare "Z" suffix to
  // "+00:00[UTC]" before handing off to ZonedDateTime.from(), which
  // requires a bracketed zone. A real numeric offset like "+05:30"
  // matched the "needs zone handling" check but fell through
  // unchanged, so ZonedDateTime.from() threw on every offset string
  // that wasn't "Z". Fixed by appending the offset as its own bracket.
  const r = parseISO('2026-08-04T15:45:30+05:30');
  assert.equal(r.toString(), '2026-08-04T15:45:30+05:30[+05:30]');
});

test('parseISO: negative UTC offset round-trips as ZonedDateTime', () => {
  const r = parseISO('2026-08-04T15:45:30-08:00');
  assert.equal(r.toString(), '2026-08-04T15:45:30-08:00[-08:00]');
});

test('formatISO: throws on a value without toString()', () => {
  assert.throws(() => formatISO(null), /expects a Temporal value with toString/);
  // A plain number has toString() via its prototype, so it's not a
  // good "missing toString" example — Object.create(null) genuinely
  // has none.
  assert.throws(() => formatISO(Object.create(null)), /expects a Temporal value with toString/);
});

test('parseRFC3339: accepts a numeric offset zone', () => {
  const r = parseRFC3339('2026-08-04T15:45:30+05:30');
  assert.ok(r !== undefined);
});

test('parseRFC3339: accepts fractional seconds', () => {
  const r = parseRFC3339('2026-08-04T15:45:30.123Z');
  assert.match(r.toString(), /15:45:30\.123/);
});

test('formatRFC3339: formats an Instant', () => {
  // ZonedDateTime.toString() always appends a bracketed zone (e.g.
  // "[UTC]"), which the RFC 3339 regex rejects — so ZonedDateTime
  // never actually satisfies formatRFC3339 despite looking like a
  // natural fit. Instant.toString() has no bracket and matches
  // directly, so that's the real success path here.
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  assert.equal(formatRFC3339(inst), '2026-08-04T15:45:30Z');
});

test('formatRFC3339: throws when the value has no time component', () => {
  // A bare PlainDate's toString() is just "2026-08-04" — doesn't match
  // the RFC 3339 date-time shape, so the output-validation check fires.
  const d = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => formatRFC3339(d), /did not produce RFC 3339-compliant output/);
});

test('parseRFC2822: throws on garbage input', () => {
  assert.throws(() => parseRFC2822('not a valid date string'), /not a valid RFC 2822 date/);
});

test('formatRFC2822: throws when toInstant() returns something without a numeric epochMilliseconds', () => {
  assert.throws(() => formatRFC2822({ toInstant: () => ({}) }), /expects a value with epochMilliseconds/);
});

test('formatRFC2822: dispatches on toEpochMilliseconds()', () => {
  const s = formatRFC2822({ toEpochMilliseconds: () => 1700000000000 });
  assert.equal(s, 'Tue, 14 Nov 2023 22:13:20 +0000');
});

test('formatRFC2822: dispatches on a raw epochMilliseconds property', () => {
  const s = formatRFC2822({ epochMilliseconds: 1700000000000 });
  assert.equal(s, 'Tue, 14 Nov 2023 22:13:20 +0000');
});

test('formatRFC2822: dispatches on toInstant()', () => {
  // A real ZonedDateTime has its own epochMilliseconds property, which
  // wins over the toInstant() branch (checked second). To genuinely
  // exercise toInstant(), use a wrapper that only exposes that method.
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  const s = formatRFC2822({ toInstant: () => inst });
  assert.equal(s, 'Tue, 04 Aug 2026 15:45:30 +0000');
});

test('formatRFC2822: throws when nothing matches', () => {
  assert.throws(() => formatRFC2822({}), /expects a value with epochMilliseconds/);
  assert.throws(() => formatRFC2822(42), /expects a value with epochMilliseconds/);
});

test('parseHTTPDate: throws on garbage input', () => {
  assert.throws(() => parseHTTPDate('not a date at all'), /not a valid HTTP-date/);
});

test('formatHTTPDate: dispatches on toInstant() and on a raw epochMilliseconds property', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]');
  assert.equal(formatHTTPDate(zdt), 'Tue, 04 Aug 2026 15:45:30 GMT');
  assert.equal(formatHTTPDate({ epochMilliseconds: 1700000000000 }), 'Tue, 14 Nov 2023 22:13:20 GMT');
});

test('formatHTTPDate: throws when the value has neither shape', () => {
  assert.throws(() => formatHTTPDate({}), /expects an Instant or ZonedDateTime/);
  assert.throws(() => formatHTTPDate(42), /expects an Instant or ZonedDateTime/);
});

test('fromUnixMicroseconds/toUnixMicroseconds round-trip at microsecond precision', () => {
  // Regression test: fromUnixMicroseconds used to call
  // Instant.fromEpochMicroseconds, which doesn't exist in the Temporal
  // spec (only fromEpochMilliseconds and fromEpochNanoseconds do) — it
  // threw a TypeError on every call. Fixed by converting to
  // nanoseconds first.
  const inst = fromUnixMicroseconds(1700000000123456);
  assert.equal(toUnixMicroseconds(inst), 1700000000123456);
});

test('toUnixMicroseconds/toUnixNanoseconds preserve sub-millisecond precision on a real Instant', () => {
  // Regression test: getInstant() used to check epochMilliseconds
  // before epochNanoseconds. A real Instant has both, so it hit the ms
  // branch first and rebuilt epochNanoseconds by scaling milliseconds
  // back up — silently dropping any precision below 1ms. Reordered to
  // check epochNanoseconds first, since it's the more precise source
  // whenever it's present.
  const inst = fromUnixNanoseconds(1700000000123456789n);
  assert.equal(toUnixNanoseconds(inst), 1700000000123456789n);
  assert.equal(toUnixMicroseconds(inst), 1700000000123456);
});

test('toUnixMicroseconds: dispatches on a raw epochNanoseconds bigint property', () => {
  const r = toUnixMicroseconds({ epochNanoseconds: 1700000000123456000n });
  assert.equal(r, 1700000000123456);
});

test('toUnixSeconds/toUnixMilliseconds/toUnixMicroseconds/toUnixNanoseconds dispatch on toInstant() (ZonedDateTime)', () => {
  // Exercises getInstant()'s toInstant branch specifically — the other
  // tests above pass raw Instant-shaped objects with epochMilliseconds/
  // epochNanoseconds properties directly, never a value that only
  // exposes toInstant().
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30.123456789+00:00[UTC]');
  assert.equal(toUnixMilliseconds(zdt), 1785858330123);
  assert.equal(Math.round(toUnixSeconds(zdt) * 1000), 1785858330123);
  assert.equal(toUnixMicroseconds(zdt), 1785858330123456);
  assert.equal(toUnixNanoseconds(zdt), 1785858330123456789n);
});

test('toUnixMilliseconds/toUnixNanoseconds: dispatch on toInstant() returning a plain object with no epochNanoseconds', () => {
  // toInstant() doesn't have to return a real Temporal.Instant — the
  // guard checks for epochNanoseconds and falls back to deriving it
  // from epochMilliseconds when the returned object doesn't have it.
  const wrapper = { toInstant: () => ({ epochMilliseconds: 1700000000123 }) };
  assert.equal(toUnixMilliseconds(wrapper), 1700000000123);
  assert.equal(toUnixNanoseconds(wrapper), 1700000000123000000n);
});

test('toUnixMilliseconds/toUnixNanoseconds: dispatch on a raw epochMilliseconds property with no toInstant/epochNanoseconds', () => {
  const r = { epochMilliseconds: 1700000000123 };
  assert.equal(toUnixMilliseconds(r), 1700000000123);
  assert.equal(toUnixNanoseconds(r), 1700000000123000000n);
});

test('fromUnixSeconds: throws when the injected Temporal has no Instant', () => {
  // Instant is typed as optional on TemporalNamespace to support a
  // consumer injecting a stripped-down shim via setTemporal().
  // requireInstant() guards that case explicitly.
  const shim = {
    PlainDate: Temporal.PlainDate,
    PlainTime: Temporal.PlainTime,
    PlainDateTime: Temporal.PlainDateTime,
    ZonedDateTime: Temporal.ZonedDateTime,
  };
  setTemporal(shim);
  try {
    assert.throws(() => fromUnixSeconds(123), /Temporal\.Instant is not available/);
  } finally {
    // Restore the real Temporal so later tests in this file (and any
    // sharing this worker) aren't left with a broken global.
    setTemporal(Temporal);
  }
});

test('toUnixSeconds: throws when the value has none of toInstant/epochMilliseconds/epochNanoseconds', () => {
  assert.throws(() => toUnixSeconds({}), /expected an Instant or ZonedDateTime/);
  assert.throws(() => toUnixSeconds(42), /expected an Instant or ZonedDateTime/);
});

test('parseSQL: detects the ISO-T datetime format', () => {
  const r = parseSQL('2026-08-04T15:45:30');
  assert.match(r.toString(), /2026-08-04T15:45:30/);
});

test('parseSQL: throws on an unrecognized format', () => {
  assert.throws(() => parseSQL('garbage'), /not a recognized SQL date\/time format/);
});

// ============== Section U: serialization ==============
test('parseISO: parses a date', () => {
  const r = parseISO('2026-08-04');
  assert.equal(r.toString(), '2026-08-04');
});

test('parseISO: parses a date-time without zone', () => {
  const r = parseISO('2026-08-04T15:45:30');
  assert.equal(r.toString(), '2026-08-04T15:45:30');
});

test('parseISO: parses a date-time with Z', () => {
  const r = parseISO('2026-08-04T15:45:30Z');
  assert.match(r.toString(), /2026-08-04T15:45:30/);
});

test('parseISO: throws on garbage input', () => {
  assert.throws(() => parseISO('not-a-date'), /doesn't look like an ISO 8601/);
});

test('formatISO: round-trips through parseISO', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatted = formatISO(date);
  const reparsed = parseISO(formatted);
  assert.equal(reparsed.toString(), date.toString());
});

test('parseRFC3339: parses a valid RFC 3339 string', () => {
  const r = parseRFC3339('2026-08-04T15:45:30Z');
  assert.ok(r !== undefined);
});

test('parseRFC3339: throws on missing timezone', () => {
  // RFC 3339 requires a zone.
  assert.throws(() => parseRFC3339('2026-08-04T15:45:30'), /does not match RFC 3339/);
});

test('parseRFC2822: parses a valid RFC 2822 string', () => {
  const r = parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000');
  assert.ok(r !== undefined);
});

test('formatRFC2822: produces RFC 2822-shaped output', () => {
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  const s = formatRFC2822(inst);
  assert.match(s, /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}/);
});

test('parseHTTPDate: parses an IMF-fixdate', () => {
  const r = parseHTTPDate('Mon, 04 Aug 2026 15:45:30 GMT');
  assert.ok(r !== undefined);
});

test('formatHTTPDate: produces IMF-fixdate output', () => {
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  const s = formatHTTPDate(inst);
  assert.match(s, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
});

test('fromUnixSeconds / toUnixSeconds round-trip', () => {
  const inst = fromUnixSeconds(1700000000);
  assert.equal(Math.round(toUnixSeconds(inst)), 1700000000);
});

test('fromUnixMilliseconds / toUnixMilliseconds round-trip', () => {
  const inst = fromUnixMilliseconds(1700000000123);
  assert.equal(toUnixMilliseconds(inst), 1700000000123);
});

test('fromUnixNanoseconds / toUnixNanoseconds round-trip', () => {
  const ns = 1700000000_000_000_000n;
  const inst = fromUnixNanoseconds(ns);
  assert.equal(toUnixNanoseconds(inst), ns);
});

test('parseSQL: detects date format', () => {
  const r = parseSQL('2026-08-04');
  assert.equal(r.toString(), '2026-08-04');
});

test('parseSQL: detects datetime format', () => {
  const r = parseSQL('2026-08-04 15:45:30');
  assert.match(r.toString(), /2026-08-04T15:45:30/);
});

test('formatSQL: formats date as YYYY-MM-DD', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(formatSQL(date), '2026-08-04');
});

test('formatSQL: formats datetime as YYYY-MM-DD HH:MM:SS', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(formatSQL(dt), '2026-08-04 15:45:30');
});

// ============== Section I: duration ==============
test('parseISODuration: parses P[n]Y[n]M[n]D', () => {
  const d = parseISODuration('P3Y6M4D');
  assert.equal(d.years, 3);
  assert.equal(d.months, 6);
  assert.equal(d.days, 4);
});

test('parseISODuration: parses PT[n]H[n]M[n]S', () => {
  const d = parseISODuration('PT12H30M5S');
  assert.equal(d.hours, 12);
  assert.equal(d.minutes, 30);
  assert.equal(d.seconds, 5);
});

test('parseISODuration: throws on empty', () => {
  assert.throws(() => parseISODuration('P'), /duration has no fields/);
});

test('formatISODuration: round-trips through parseISODuration', () => {
  const d = { years: 3, months: 6, weeks: 0, days: 4, hours: 12, minutes: 30, seconds: 5 };
  const formatted = formatISODuration(d);
  const reparsed = parseISODuration(formatted);
  // weeks stays at 0 (parseISODuration initializes it to 0).
  assert.deepEqual(reparsed, d);
});

test('formatISODuration: zero duration → P0D', () => {
  assert.equal(formatISODuration({}), 'P0D');
});

test('parseDuration: parses tokenized format', () => {
  const d = parseDuration('2 years 30 minutes', 'yyy mmm');
  assert.equal(d.years, 2);
  assert.equal(d.minutes, 30);
});

test('balanceDuration: carries excess units up', () => {
  const balanced = balanceDuration({ hours: 25, minutes: 70 });
  // 25h70m = 1 day 2 hours 10 minutes (25h + 70m/60 = 25h + 1h10m = 26h10m = 1d2h10m)
  assert.equal(balanced.days, 1);
  assert.equal(balanced.hours, 2);
  assert.equal(balanced.minutes, 10);
});

test('totalDuration: sums absolute fields into target unit', () => {
  assert.equal(totalDuration({ days: 1, hours: 12 }, 'hours'), 36);
  assert.equal(totalDuration({ minutes: 60 }, 'hours'), 1);
});

test('compareDuration: returns -1/0/1 by total length', () => {
  assert.equal(compareDuration({ hours: 1 }, { hours: 2 }), -1);
  assert.equal(compareDuration({ hours: 2 }, { hours: 2 }), 0);
  assert.equal(compareDuration({ hours: 3 }, { hours: 2 }), 1);
});

test('addDuration: sums field-by-field', () => {
  const r = addDuration({ hours: 2, minutes: 30 }, { hours: 1, minutes: 15 });
  assert.equal(r.hours, 3);
  assert.equal(r.minutes, 45);
});

test('subtractDuration: subtracts field-by-field', () => {
  const r = subtractDuration({ hours: 3, minutes: 30 }, { hours: 1, minutes: 15 });
  assert.equal(r.hours, 2);
  assert.equal(r.minutes, 15);
});
