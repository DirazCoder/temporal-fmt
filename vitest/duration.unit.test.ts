import { describe, expect, it } from 'vitest';
import { formatISODuration, parseISODuration, balanceDuration, totalDuration, addDuration, compareDuration } from '../src/duration.js';

describe('formatISODuration / parseISODuration', () => {
  it('round-trips a field bag through the ISO 8601 duration grammar', () => {
    const iso = formatISODuration({ years: 1, days: 3 });
    expect(iso).toBe('P1Y3D');
    expect(parseISODuration(iso)).toMatchObject({ years: 1, days: 3 });
  });
});

describe('balanceDuration', () => {
  it('carries excess hours into days', () => {
    expect(balanceDuration({ hours: 25 })).toMatchObject({ days: 1, hours: 1 });
  });
});

describe('totalDuration', () => {
  it('sums fields into a single number in the requested unit', () => {
    expect(totalDuration({ hours: 2 }, 'minutes')).toBe(120);
  });

  it('throws for a calendar-bound target unit', () => {
    expect(() => totalDuration({ days: 1 }, 'years' as never)).toThrow();
  });
});

describe('addDuration / compareDuration', () => {
  it('adds field-by-field without balancing', () => {
    expect(addDuration({ hours: 1 }, { hours: 2, minutes: 30 })).toMatchObject({ hours: 3, minutes: 30 });
  });

  it('compares by total absolute length', () => {
    expect(compareDuration({ hours: 1 }, { minutes: 90 })).toBe(-1);
  });
});
