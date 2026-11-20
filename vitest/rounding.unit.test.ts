import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { floor, ceil, round, roundDuration, truncate, fieldToNs } from '../src/rounding.js';
import { InvalidDurationError } from '../src/errors.js';

setTemporal(Temporal);

const dt = Temporal.PlainDateTime.from('2026-08-04T15:47:00');

describe('floor / ceil / round', () => {
  it('floor drops to the start of the unit', () => {
    expect(floor(dt, 'hour')).toMatchObject({ hour: 15, minute: 0 });
  });

  it('ceil advances to the start of the next unit', () => {
    expect(ceil(dt, 'hour')).toMatchObject({ hour: 16, minute: 0 });
  });

  it('round picks the nearer boundary', () => {
    // 15:47 is closer to 16:00 than 15:00.
    expect(round(dt, { unit: 'hour' })).toMatchObject({ hour: 16, minute: 0 });
  });
});

describe('roundDuration', () => {
  it('rounds a duration field bag to the given unit', () => {
    const result = roundDuration({ hours: 2, minutes: 40 }, { unit: 'hours' });
    expect(result.hours).toBe(3);
  });
});

// ---- full unit/mode/increment surface below ---------------------------

describe('round: units, ties and modes', () => {
  it('rounds to the nearest day, crossing midnight at noon', () => {
    // 15:47 is past noon → next day
    expect(round(Temporal.PlainDateTime.from('2026-08-04T15:47:00'), { unit: 'day' }))
      .toMatchObject({ year: 2026, month: 8, day: 5, hour: 0, minute: 0, second: 0, millisecond: 0 });
    // 11:00 is before noon → same day
    expect(round(Temporal.PlainDateTime.from('2026-08-04T11:00:00'), { unit: 'day' }))
      .toMatchObject({ year: 2026, month: 8, day: 4, hour: 0 });
  });

  it('breaks exact noon ties upward (Math.round semantics)', () => {
    expect(round(Temporal.PlainDateTime.from('2026-08-04T12:00:00'), { unit: 'day' }))
      .toMatchObject({ year: 2026, month: 8, day: 5, hour: 0 });
  });

  it('rounds to the nearest minute on either side of the half', () => {
    expect(round(Temporal.PlainDateTime.from('2026-08-04T15:47:29'), { unit: 'minute' }))
      .toMatchObject({ hour: 15, minute: 47, second: 0 });
    // exact .5 tie rounds up
    expect(round(Temporal.PlainDateTime.from('2026-08-04T15:47:30'), { unit: 'minute' }))
      .toMatchObject({ hour: 15, minute: 48, second: 0 });
  });

  it('rounds sub-second input to the nearest second', () => {
    expect(round(Temporal.PlainDateTime.from('2026-08-04T15:47:30.500'), { unit: 'second' }))
      .toMatchObject({ hour: 15, minute: 47, second: 31, millisecond: 0 });
  });

  it('rounds milliseconds with an increment, rolling over into the second', () => {
    // 750ms on a 500ms grid → 1.5 steps → up → 1000ms
    expect(round(Temporal.PlainDateTime.from('2026-08-04T15:47:00.750'), { unit: 'millisecond', roundingIncrement: 500 }))
      .toMatchObject({ hour: 15, minute: 47, second: 1, millisecond: 0 });
  });

  it('applies every rounding mode explicitly', () => {
    const v = Temporal.PlainDateTime.from('2026-08-04T15:47:30.500');
    expect(round(v, { unit: 'second', mode: 'nearest' })).toMatchObject({ second: 31 });
    expect(round(v, { unit: 'second', mode: 'floor' })).toMatchObject({ second: 30 });
    expect(round(v, { unit: 'second', mode: 'ceil' })).toMatchObject({ second: 31 });
    expect(round(v, { unit: 'second', mode: 'trunc' })).toMatchObject({ second: 30 });
  });

  it('truncate differs from floor before the Unix epoch (signed ms)', () => {
    const pre = Temporal.PlainDateTime.from('1969-12-31T13:00:00');
    // -0.458 days: trunc → 0 (1970-01-01), floor → -1 (1969-12-31)
    expect(truncate(pre, 'day')).toMatchObject({ year: 1970, month: 1, day: 1, hour: 0 });
    expect(floor(pre, 'day')).toMatchObject({ year: 1969, month: 12, day: 31, hour: 0 });
    expect(ceil(pre, 'day')).toMatchObject({ year: 1970, month: 1, day: 1, hour: 0 });
    expect(round(pre, { unit: 'day' })).toMatchObject({ year: 1970, month: 1, day: 1, hour: 0 });
  });

  it('rounds pre-year-0 dates through the negative era branch', () => {
    // exact midnight → every mode is the identity; exercises z < 0 in fromMs
    const ancient = Temporal.PlainDate.from('-000100-06-15');
    const expected = { year: -100, month: 6, day: 15, hour: 0, minute: 0, second: 0, millisecond: 0 };
    expect(round(ancient, { unit: 'day' })).toMatchObject(expected);
    expect(floor(ancient, 'day')).toMatchObject(expected);
    expect(ceil(ancient, 'day')).toMatchObject(expected);
  });

  it('rounds January dates through the m <= 2 branch of the civil inverse', () => {
    const jan = Temporal.PlainDateTime.from('2026-01-15T10:30:00');
    // exact 10:30 tie on the hour grid → up
    expect(round(jan, { unit: 'hour' })).toMatchObject({ year: 2026, month: 1, day: 15, hour: 11, minute: 0 });
  });

  it('fills absent time fields via the ?? fallbacks for date-only input', () => {
    // PlainDate carries no hour/minute/second/millisecond → toMs defaults them
    expect(round(Temporal.PlainDate.from('2026-08-04'), { unit: 'day' }))
      .toMatchObject({ year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0, millisecond: 0 });
  });

  it('rounds a ZonedDateTime by its wall-clock fields', () => {
    expect(round(Temporal.ZonedDateTime.from('2026-08-04T15:47:00[UTC]'), { unit: 'hour' }))
      .toMatchObject({ hour: 16, minute: 0 });
  });

  it('honors integer and fractional rounding increments', () => {
    const v = Temporal.PlainDateTime.from('2026-08-04T15:47:00');
    expect(round(v, { unit: 'minute', roundingIncrement: 15, mode: 'floor' })).toMatchObject({ hour: 15, minute: 45 });
    expect(round(v, { unit: 'minute', roundingIncrement: 15, mode: 'ceil' })).toMatchObject({ hour: 16, minute: 0 });
    // 0.5s steps on a sub-second value
    const w = Temporal.PlainDateTime.from('2026-08-04T15:47:00.750');
    expect(round(w, { unit: 'second', roundingIncrement: 0.5 })).toMatchObject({ second: 1, millisecond: 0 });
    expect(round(w, { unit: 'second', roundingIncrement: 0.5, mode: 'floor' })).toMatchObject({ second: 0, millisecond: 500 });
    expect(round(w, { unit: 'second', roundingIncrement: 0.5, mode: 'trunc' })).toMatchObject({ second: 0, millisecond: 500 });
    expect(round(w, { unit: 'second', roundingIncrement: 0.5, mode: 'ceil' })).toMatchObject({ second: 1, millisecond: 0 });
  });

  it('throws on zero and negative rounding increments', () => {
    expect(() => round(dt, { unit: 'hour', roundingIncrement: 0 }))
      .toThrow('temporal-fmt: round() requires a positive roundingIncrement (got 0).');
    expect(() => round(dt, { unit: 'hour', roundingIncrement: -5 }))
      .toThrow('temporal-fmt: round() requires a positive roundingIncrement (got -5).');
  });

  it('truncate defaults its increment to 1', () => {
    // default-arg branch + 'trunc' switch case
    expect(truncate(dt, 'hour')).toMatchObject({ hour: 15, minute: 0, second: 0 });
    expect(truncate(dt, 'minute', 30)).toMatchObject({ hour: 15, minute: 30 });
  });
});

describe('fieldToNs', () => {
  it('converts integer fields exactly via BigInt', () => {
    expect(fieldToNs(2, 1000n, 'test')).toBe(2000n);
    expect(fieldToNs(-3, 60n, 'test')).toBe(-180n);
    expect(fieldToNs(0, 999n, 'test')).toBe(0n);
  });

  it('scales fractional fields that stay inside the safe-integer range', () => {
    expect(fieldToNs(1.5, 1000n, 'test')).toBe(1500n);
    expect(fieldToNs(-0.5, 3_600_000_000_000n, 'hours')).toBe(-1_800_000_000_000n);
  });

  it('throws InvalidDurationError when a fractional field cannot be represented exactly', () => {
    // 104.5 days in nanoseconds overshoots Number.MAX_SAFE_INTEGER
    expect(() => fieldToNs(104.5, 86_400_000_000_000n, 'days')).toThrow(InvalidDurationError);
    expect(() => fieldToNs(104.5, 86_400_000_000_000n, 'days'))
      .toThrow('field "days" (104.5) cannot be converted to nanoseconds exactly');
  });
});

describe('roundDuration: modes, signs and units', () => {
  it('rounds down below the half and breaks exact ties upward', () => {
    expect(roundDuration({ hours: 2, minutes: 10 }, { unit: 'hours' })).toMatchObject({ hours: 2, minutes: 0 });
    expect(roundDuration({ hours: 2, minutes: 30 }, { unit: 'hours' })).toMatchObject({ hours: 3, minutes: 0 });
  });

  it('rounds to zero when the value is under half a step', () => {
    expect(roundDuration({ minutes: 20 }, { unit: 'hours' })).toMatchObject({ hours: 0, minutes: 0 });
  });

  it('applies floor / ceil / trunc to positive values', () => {
    const bag = { hours: 2, minutes: 40 };
    expect(roundDuration(bag, { unit: 'hours', mode: 'floor' })).toMatchObject({ hours: 2, minutes: 0 });
    expect(roundDuration(bag, { unit: 'hours', mode: 'ceil' })).toMatchObject({ hours: 3, minutes: 0 });
    expect(roundDuration(bag, { unit: 'hours', mode: 'trunc' })).toMatchObject({ hours: 2, minutes: 0 });
    // exact multiples stay put under floor and ceil
    expect(roundDuration({ hours: 2 }, { unit: 'hours', mode: 'floor' })).toMatchObject({ hours: 2 });
    expect(roundDuration({ hours: 2 }, { unit: 'hours', mode: 'ceil' })).toMatchObject({ hours: 2 });
  });

  it('applies every mode to the signed total for negative durations', () => {
    const bag = { hours: -2, minutes: -40 }; // −2⅔ h
    expect(roundDuration(bag, { unit: 'hours' })).toMatchObject({ hours: -3, minutes: 0 });
    expect(roundDuration(bag, { unit: 'hours', mode: 'floor' })).toMatchObject({ hours: -3, minutes: 0 });
    expect(roundDuration(bag, { unit: 'hours', mode: 'ceil' })).toMatchObject({ hours: -2, minutes: 0 });
    expect(roundDuration(bag, { unit: 'hours', mode: 'trunc' })).toMatchObject({ hours: -2, minutes: 0 });
    // exact negative multiples: no remainder adjustment
    expect(roundDuration({ hours: -3 }, { unit: 'hours', mode: 'floor' })).toMatchObject({ hours: -3 });
    expect(roundDuration({ hours: -3 }, { unit: 'hours', mode: 'ceil' })).toMatchObject({ hours: -3 });
  });

  it('rounds and balances every absolute unit', () => {
    // days: 1.5-day tie rounds up to 2 days
    expect(roundDuration({ days: 1, hours: 12 }, { unit: 'days' })).toMatchObject({ days: 2, hours: 0 });
    // minutes: 80s rounds down to 1 minute
    expect(roundDuration({ seconds: 80 }, { unit: 'minutes' })).toMatchObject({ minutes: 1, seconds: 0 });
    // seconds: 90s balances to 1m30s at the target unit
    expect(roundDuration({ seconds: 90 }, { unit: 'seconds' })).toMatchObject({ minutes: 1, seconds: 30 });
    // seconds: 1.5s tie rounds up
    expect(roundDuration({ milliseconds: 1500 }, { unit: 'seconds' })).toMatchObject({ seconds: 2, milliseconds: 0 });
    // milliseconds: 1.5ms tie rounds up
    expect(roundDuration({ microseconds: 1500 }, { unit: 'milliseconds' })).toMatchObject({ milliseconds: 2, microseconds: 0 });
    // microseconds: 1.5µs tie rounds up
    expect(roundDuration({ nanoseconds: 1500 }, { unit: 'microseconds' })).toMatchObject({ microseconds: 2, nanoseconds: 0 });
    // nanoseconds: exact value balances into µs + ns
    expect(roundDuration({ nanoseconds: 1500 }, { unit: 'nanoseconds' })).toMatchObject({ microseconds: 1, nanoseconds: 500 });
  });

  it('balances a fractional day field exactly (P1.5D → 1d 12h)', () => {
    expect(roundDuration({ days: 1.5 }, { unit: 'hours' })).toMatchObject({ days: 1, hours: 12 });
  });

  it('preserves calendar-bound fields and re-derives the absolute ones', () => {
    const out = roundDuration({ years: 1, months: 2, weeks: 3, hours: 25 }, { unit: 'hours' });
    expect(out).toMatchObject({ years: 1, months: 2, weeks: 3, days: 1, hours: 1, minutes: 0 });
  });

  it('accepts real Temporal.Duration instances', () => {
    const out = roundDuration(Temporal.Duration.from('PT2H40M'), { unit: 'hours' });
    expect(out).toMatchObject({ hours: 3, minutes: 0, days: 0 });
  });

  it('honors integer rounding increments', () => {
    expect(roundDuration({ minutes: 35 }, { unit: 'minutes', roundingIncrement: 30 })).toMatchObject({ minutes: 30 });
    expect(roundDuration({ minutes: 50 }, { unit: 'minutes', roundingIncrement: 30 })).toMatchObject({ hours: 1, minutes: 0 });
    expect(roundDuration({ minutes: 20 }, { unit: 'minutes', roundingIncrement: 30, mode: 'floor' })).toMatchObject({ minutes: 0 });
    expect(roundDuration({ minutes: 20 }, { unit: 'minutes', roundingIncrement: 30, mode: 'ceil' })).toMatchObject({ minutes: 30 });
  });

  it('throws InvalidDurationError for invalid increments', () => {
    // integer-but-below-one: no fractional hint in the message
    expect(() => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: 0 })).toThrow(InvalidDurationError);
    expect(() => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: 0 }))
      .toThrow('temporal-fmt: roundDuration() requires a positive roundingIncrement (got 0)');
    expect(() => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: -2 }))
      .toThrow('temporal-fmt: roundDuration() requires a positive roundingIncrement (got -2)');
    // fractional increments get the dedicated hint
    expect(() => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: 2.5 }))
      .toThrow("temporal-fmt: roundDuration() requires a positive roundingIncrement (got 2.5) — fractional increments aren't supported here (use round() for those)");
    // non-number increments fail the typeof guard
    expect(() => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: '3' as unknown as number }))
      .toThrow(InvalidDurationError);
  });

  it('throws for calendar-bound units (needs relativeTo)', () => {
    for (const unit of ['years', 'months', 'weeks'] as const) {
      expect(() => roundDuration({ hours: 1 }, { unit })).toThrow(/requires a Temporal\.Duration with a relativeTo/);
      // plain Error, not the typed InvalidDurationError
      expect(() => roundDuration({ hours: 1 }, { unit })).not.toThrow(InvalidDurationError);
    }
  });
});
