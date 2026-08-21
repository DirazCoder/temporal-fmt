import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { compare, isBefore, isBetween, isSameQuarter, min, max, clamp } from '../src/comparison.js';

setTemporal(Temporal);

const early = Temporal.PlainDate.from('2026-08-04');
const late = Temporal.PlainDate.from('2026-08-10');

describe('compare / isBefore', () => {
  it('orders two PlainDates', () => {
    expect(compare(early, late)).toBe(-1);
    expect(compare(late, early)).toBe(1);
    expect(compare(early, early)).toBe(0);
    expect(isBefore(early, late)).toBe(true);
  });
});

describe('min / max / clamp', () => {
  it('picks the earlier/later of a list', () => {
    expect(min([late, early]).toString()).toBe(early.toString());
    expect(max([late, early]).toString()).toBe(late.toString());
  });

  it('clamps a value into range', () => {
    const before = Temporal.PlainDate.from('2026-01-01');
    expect(clamp(before, early, late).toString()).toBe(early.toString());
  });
});

describe('isBetween / isSameQuarter', () => {
  it('checks range membership and same-quarter grouping', () => {
    const mid = Temporal.PlainDate.from('2026-08-06');
    expect(isBetween(mid, early, late)).toBe(true);
    // early and late are both Q3 2026.
    expect(isSameQuarter(early, late)).toBe(true);
  });
});
