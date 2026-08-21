import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { addDays, addMonths, subtractDays } from '../src/arithmetic.js';

setTemporal(Temporal);

describe('addDays / subtractDays', () => {
  it('shifts a PlainDate by whole days', () => {
    const d = Temporal.PlainDate.from('2026-08-04');
    expect(addDays(d, 5)).toMatchObject({ year: 2026, month: 8, day: 9 });
    expect(subtractDays(d, 4)).toMatchObject({ year: 2026, month: 7, day: 31 });
  });
});

describe('addMonths', () => {
  it('clamps to the shorter month rather than overflowing (Jan 31 + 1mo -> Feb 28)', () => {
    const d = Temporal.PlainDate.from('2026-01-31');
    expect(addMonths(d, 1)).toMatchObject({ year: 2026, month: 2, day: 28 });
  });
});
