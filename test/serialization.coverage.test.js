import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseISO, formatISO, parseRFC3339, formatRFC3339,
  parseRFC2822, formatRFC2822, parseHTTPDate, formatHTTPDate,
  fromUnixMicroseconds, fromUnixNanoseconds, fromUnixSeconds,
  toUnixSeconds, toUnixMilliseconds, toUnixMicroseconds, toUnixNanoseconds,
  parseSQL,
  setTemporal,
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