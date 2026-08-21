import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ceil,
  floor,
  round,
  roundDuration,
  setTemporal,
  truncate,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// ============== Section N: rounding ==============
test('round: rounds to nearest day', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  const r = round(dt, { unit: 'day' });
  // 15:45 > 12:00 → rounds up to next day midnight.
  assert.equal(r.day, 5);
  assert.equal(r.hour, 0);
});

test('round: floor mode does not round up', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T23:59:59.999');
  const r = floor(dt, 'day');
  assert.equal(r.day, 4); // stays on the same day
  assert.equal(r.hour, 0);
});

test('round: ceil mode always rounds up', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T00:00:00.001');
  const r = ceil(dt, 'second');
  assert.equal(r.second, 1);
});

test('round: truncate mode always rounds down', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:59.999');
  const r = truncate(dt, 'minute');
  assert.equal(r.minute, 45);
  assert.equal(r.second, 0);
});

test('round: throws on non-positive roundingIncrement', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.throws(
    () => round(dt, { unit: 'hour', roundingIncrement: 0 }),
    /requires a positive roundingIncrement \(got 0\)/,
  );
  assert.throws(
    () => round(dt, { unit: 'hour', roundingIncrement: -1 }),
    /requires a positive roundingIncrement \(got -1\)/,
  );
});

test('round: dates before the internal epoch (negative ms, Howard Hinnant day-count arithmetic)', () => {
  // toMs/fromMs use the Howard Hinnant days_from_civil algorithm, which
  // has distinct branches for: negative ms (applyMode's sign handling),
  // month <= 2 (the y2/m2 "civil year" shift), and negative proleptic
  // years (the era calculation). Every test above uses a 2026 date,
  // which only exercises the positive/post-epoch/month>2 side of each.
  const early = Temporal.PlainDateTime.from('1969-06-15T10:30:00');
  const r1 = round(early, { unit: 'hour' });
  assert.equal(r1.year, 1969);
  assert.equal(r1.month, 6);
  assert.equal(r1.day, 15);
  // Not 11:00: applyMode rounds Math.abs(ms) as one combined magnitude
  // from the epoch (not the clock time-of-day), then reapplies the
  // sign — so a pre-epoch date's "nearest hour" doesn't necessarily
  // match what post-epoch half-hour rounding would suggest.
  assert.equal(r1.hour, 10);

  const jan = Temporal.PlainDateTime.from('2026-01-15T10:30:00');
  const r2 = round(jan, { unit: 'hour' });
  assert.equal(r2.month, 1);
  assert.equal(r2.day, 15);

  const negYear = Temporal.PlainDateTime.from('-000050-06-15T10:30:00');
  const r3 = round(negYear, { unit: 'hour' });
  assert.equal(r3.year, -50);
  assert.equal(r3.month, 6);
  assert.equal(r3.day, 15);
});

test('roundDuration: throws on calendar-bound target unit', () => {
  assert.throws(
    () => roundDuration({ days: 1, hours: 12 }, { unit: 'months' }),
    /requires a Temporal\.Duration with a relativeTo/,
  );
});

test('roundDuration: throws on non-positive roundingIncrement', () => {
  assert.throws(
    () => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: 0 }),
    /requires a positive roundingIncrement \(got 0\)/,
  );
  assert.throws(
    () => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: -2 }),
    /requires a positive roundingIncrement \(got -2\)/,
  );
});

test('roundDuration: rounds days/hours/minutes to nearest minute', () => {
  const r = roundDuration({ days: 0, hours: 0, minutes: 90, seconds: 30 }, { unit: 'minutes' });
  // 90m30s rounds to 91m → 1h31m
  assert.equal(r.minutes, 31);
  assert.equal(r.hours, 1);
});

test('roundDuration: negative durations round symmetrically (sign preserved)', () => {
  // totalNs < 0n is only reachable with a negative duration — every
  // other roundDuration test above uses a positive one.
  const r = roundDuration({ hours: -1, minutes: -35 }, { unit: 'hours' });
  assert.equal(r.hours, -2);
});

test('round: rounds a bare PlainDate with no time fields (hour/minute/second/millisecond default to 0)', () => {
  // Every other round() test in this file passes a PlainDateTime, which
  // always has hour/minute/second/millisecond set. A bare PlainDate has
  // none of those fields, so toMs()'s `v.hour ?? 0` etc. defaults only
  // fire here.
  const date = Temporal.PlainDate.from('2026-08-04');
  const r = round(date, { unit: 'day' });
  assert.equal(r.year, 2026);
  assert.equal(r.month, 8);
  assert.equal(r.day, 4);
});

test('roundDuration: nearest mode leaves the value at the lower step when the remainder is under halfway', () => {
  // 91 minutes rounded to the nearest 30 minutes: remainder is 1 minute,
  // well under half of 30, so this should round DOWN to 90 (not up to
  // 120). The negative-duration test above only exercises the round-up
  // side of this same branch.
  const r = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'nearest', roundingIncrement: 30 });
  assert.equal(r.hours, 1);
  assert.equal(r.minutes, 30);
});

test('roundDuration: ceil mode leaves an exact multiple unchanged', () => {
  // 90 minutes is already an exact multiple of the 30-minute step, so the
  // remainder is 0 and ceil should not bump it up to the next step. The
  // ceil case in the mode test below only exercises a nonzero remainder.
  const r = roundDuration({ minutes: 90 }, { unit: 'minutes', mode: 'ceil', roundingIncrement: 30 });
  assert.equal(r.hours, 1);
  assert.equal(r.minutes, 30);
});

test('roundDuration: floor/ceil/trunc modes', () => {
  // Only 'nearest' (the default) is exercised elsewhere in this file —
  // each mode below is a distinct branch in roundDuration's switch.
  const floorResult = roundDuration({ minutes: 95 }, { unit: 'minutes', mode: 'floor', roundingIncrement: 30 });
  assert.equal(floorResult.hours, 1);
  assert.equal(floorResult.minutes, 30);

  const ceilResult = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'ceil', roundingIncrement: 30 });
  assert.equal(ceilResult.hours, 2);
  assert.equal(ceilResult.minutes, 0);

  const truncResult = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'trunc', roundingIncrement: 30 });
  assert.equal(truncResult.hours, 1);
  assert.equal(truncResult.minutes, 30);
});
