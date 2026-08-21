import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextTransition,
  getOffset,
  getOffsetNanoseconds,
  getPreviousTransition,
  getTimeZone,
  getTransitions,
  resolveZoned,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// ============== Section Q: timezone ==============
test('resolveZoned: constructs a ZonedDateTime', () => {
  const r = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30 }, 'UTC');
  assert.ok(r !== undefined);
});

test('resolveZoned: omitting hour/minute/second/etc. defaults them to 0', () => {
  const r = resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC');
  assert.equal(getOffset(r), '+00:00');
  const withParts = resolveZoned({ year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0 }, 'UTC');
  assert.equal(r.toString(), withParts.toString());
});

test('resolveZoned: options.offset is passed through when provided', () => {
  // options.offset controls how a conflicting/absent offset in the input
  // is resolved ('use'|'ignore'|'prefer'|'reject') — passing it explicitly
  // exercises the conditional spread that only includes `offset` in the
  // field bag when the caller set it, instead of always omitting it.
  const r = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC', { offset: 'reject' });
  assert.ok(r !== undefined);
  assert.equal(getOffset(r), '+00:00');
});

test('getTimeZone: returns the zone id', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getTimeZone(zdt), 'UTC');
});

test('getOffset: returns the offset string', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getOffset(zdt), '+00:00');
});

test('getOffsetNanoseconds: returns 0 for UTC', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getOffsetNanoseconds(zdt), 0);
});

test('getOffsetNanoseconds: parses a +HH:MM offset string when offsetNanoseconds is absent', () => {
  // A plain object shaped like { offset } but with no offsetNanoseconds
  // field forces the regex-parse fallback rather than the direct
  // numeric read.
  assert.equal(getOffsetNanoseconds({ offset: '+05:30' }), (5 * 3600 + 30 * 60) * 1_000_000_000);
  assert.equal(getOffsetNanoseconds({ offset: '-08:00' }), -8 * 3600 * 1_000_000_000);
});

test('getNextTransition: UTC never transitions, so this exhausts the 2-year search and returns undefined', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
  assert.equal(getNextTransition(zdt), undefined);
});

test('getPreviousTransition: same 2-year exhaustion, walking backward instead of forward', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
  assert.equal(getPreviousTransition(zdt), undefined);
});

test('getNextTransition: finds the real spring-forward date in America/New_York', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const next = getNextTransition(zdt);
  assert.ok(next !== undefined);
  assert.equal(next.toString().slice(0, 10), '2026-03-09');
});

test('getTransitions: throws when start is not a ZonedDateTime', () => {
  const end = Temporal.ZonedDateTime.from('2026-12-31T00:00[America/New_York]');
  assert.throws(() => getTransitions(42, end), /expected a ZonedDateTime for start/);
});

test('getTransitions: stops once a found transition would fall after the end boundary', () => {
  // Search a window that ends before the year's second transition
  // (fall-back, Nov 2) so the day > endV.day / month > endV.month
  // trim-and-break logic actually has to discard a candidate.
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const end = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
  const transitions = getTransitions(start, end);
  // Only the spring-forward (March) transition should be in range —
  // fall-back (November) is past `end` and must be trimmed.
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].toString().slice(0, 7), '2026-03');
});

test('getTransitions: also trims a transition landing later in the same month as the end boundary', () => {
  // Spring-forward 2026 is March 9. Ending the search on March 5 (same
  // month as the transition, but an earlier day) exercises the
  // same-month-later-day arm of the boundary check specifically, not
  // just the later-month arm the test above covers.
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const end = Temporal.ZonedDateTime.from('2026-03-05T00:00[America/New_York]');
  const transitions = getTransitions(start, end);
  assert.equal(transitions.length, 0);
});
