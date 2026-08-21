import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import {
  resolveZoned,
  getTimeZone,
  getOffset,
  getOffsetNanoseconds,
  isDST,
  getNextTransition,
  getTransitions,
  possibleInstantsFor,
} from '../src/timezone.js';

setTemporal(Temporal);

describe('resolveZoned', () => {
  it('constructs a ZonedDateTime, defaulting missing time fields to 0', () => {
    const r = resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC');
    expect(getOffset(r)).toBe('+00:00');
  });
});

describe('getTimeZone / getOffset / getOffsetNanoseconds', () => {
  it('reads the zone id, offset string, and offset nanoseconds', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
    expect(getTimeZone(zdt)).toBe('UTC');
    expect(getOffset(zdt)).toBe('+00:00');
    expect(getOffsetNanoseconds(zdt)).toBe(0);
  });

  it('throws on a non-ZonedDateTime value', () => {
    expect(() => getTimeZone(42)).toThrow(/expected a ZonedDateTime/);
  });
});

describe('isDST', () => {
  it('is true in summer and false in winter for a DST-observing zone', () => {
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-04T12:00[America/New_York]'))).toBe(true);
    expect(isDST(Temporal.ZonedDateTime.from('2026-01-04T12:00[America/New_York]'))).toBe(false);
  });
});

describe('getNextTransition / getTransitions', () => {
  it('UTC never transitions, so the search is exhausted and returns undefined', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
    expect(getNextTransition(zdt)).toBeUndefined();
  });

  it('finds the real spring-forward date in a DST-observing zone', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
    const next = getNextTransition(zdt) as Temporal.ZonedDateTime;
    expect(next.toString().slice(0, 10)).toBe('2026-03-09');
  });

  it('trims transitions that fall after the end boundary', () => {
    const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
    const end = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
    const transitions = getTransitions(start, end);
    expect(transitions).toHaveLength(1);
  });
});

describe('possibleInstantsFor', () => {
  it('returns 1 instant for a normal time, 0 for a spring-forward gap, 2 for a fall-back overlap', () => {
    expect(possibleInstantsFor({ year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(1);
    expect(possibleInstantsFor({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(0);
    expect(possibleInstantsFor({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(2);
  });
});
