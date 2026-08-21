import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { isPlainDate, isZonedDateTime, isTemporal, assertPlainDate } from '../src/typeGuards.js';

setTemporal(Temporal);

describe('isPlainDate', () => {
  it('is true only for PlainDate', () => {
    expect(isPlainDate(Temporal.PlainDate.from('2026-08-04'))).toBe(true);
    expect(isPlainDate(Temporal.PlainTime.from('15:45:30'))).toBe(false);
    expect(isPlainDate({})).toBe(false);
    expect(isPlainDate(null)).toBe(false);
  });
});

describe('isZonedDateTime / isTemporal', () => {
  it('distinguishes zoned values from plain ones', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
    expect(isZonedDateTime(zdt)).toBe(true);
    expect(isTemporal(zdt)).toBe(true);
    expect(isTemporal(Temporal.PlainDate.from('2026-08-04'))).toBe(true);
    expect(isTemporal('not a temporal value')).toBe(false);
  });
});

describe('assertPlainDate', () => {
  it('throws a descriptive error for a non-PlainDate value', () => {
    expect(() => assertPlainDate({})).toThrow(/PlainDate/);
  });

  it('does not throw for a real PlainDate', () => {
    expect(() => assertPlainDate(Temporal.PlainDate.from('2026-08-04'))).not.toThrow();
  });
});
