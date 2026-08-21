import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { floor, ceil, round, roundDuration } from '../src/rounding.js';

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
