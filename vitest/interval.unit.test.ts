import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import {
  interval,
  contains,
  overlaps,
  intersects,
  isBefore,
  isAfter,
  intersection,
  union,
  difference,
  mergeIntervals,
  splitInterval,
  formatRange,
} from '../src/interval.js';

setTemporal(Temporal);

const d = (s: string) => Temporal.PlainDate.from(s);

describe('interval / contains', () => {
  it('constructs a closed interval by default and checks membership', () => {
    const iv = interval(d('2026-01-01'), d('2026-12-31'));
    expect(iv.bounds).toBe('closed');
    expect(contains(iv, d('2026-06-01'))).toBe(true);
    expect(contains(iv, d('2027-01-01'))).toBe(false);
  });
});

describe('overlaps / intersects', () => {
  it('reports overlap, including touching endpoints', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-06-30'), d('2026-12-31'));
    expect(overlaps(a, b)).toBe(true);
    expect(intersects(a, b)).toBe(true);
    const c = interval(d('2027-01-01'), d('2027-06-30'));
    expect(intersects(a, c)).toBe(false);
  });
});

describe('isBefore / isAfter', () => {
  it('orders two non-overlapping intervals', () => {
    const a = interval(d('2026-01-01'), d('2026-02-01'));
    const b = interval(d('2026-03-01'), d('2026-04-01'));
    expect(isBefore(a, b)).toBe(true);
    expect(isAfter(b, a)).toBe(true);
  });
});

describe('intersection / union', () => {
  it('intersection is open at an endpoint if either side is open there', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
    expect(intersection(a, b)?.bounds).toBe('open');
  });

  it('union requires both sides open at an endpoint to be open there', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
    expect(union(a, b)?.bounds).toBe('closed');
  });

  it('union of non-overlapping intervals is null', () => {
    const a = interval(d('2026-01-01'), d('2026-02-01'));
    const b = interval(d('2027-01-01'), d('2027-02-01'));
    expect(union(a, b)).toBeNull();
  });
});

describe('difference', () => {
  it('splits into two pieces when the cut is fully inside', () => {
    const a = interval(d('2026-01-01'), d('2026-12-31'));
    const b = interval(d('2026-04-01'), d('2026-06-01'));
    const result = difference(a, b);
    expect(result).toHaveLength(2);
    expect(result[0].start.toString()).toBe('2026-01-01');
    expect(result[1].end.toString()).toBe('2026-12-31');
  });

  it('returns [a] unchanged when there is no overlap', () => {
    const a = interval(d('2026-01-01'), d('2026-02-01'));
    const b = interval(d('2027-01-01'), d('2027-02-01'));
    expect(difference(a, b)).toEqual([a]);
  });
});

describe('mergeIntervals / splitInterval', () => {
  it('merges overlapping intervals into a disjoint list', () => {
    const a = interval(d('2026-01-01'), d('2026-02-28'));
    const b = interval(d('2026-02-15'), d('2026-04-30'));
    const c = interval(d('2026-06-01'), d('2026-08-31'));
    expect(mergeIntervals([a, b, c])).toHaveLength(2);
  });

  it('n=1 returns the original interval unchanged, and n<=0 throws', () => {
    const iv = interval(d('2026-01-01'), d('2026-12-31'));
    expect(splitInterval(iv, 1)).toEqual([iv]);
    expect(() => splitInterval(iv, 0)).toThrow(/requires n > 0/);
  });
});

describe('formatRange', () => {
  it('produces a non-empty formatted string', () => {
    const iv = interval(d('2026-01-01'), d('2026-01-05'));
    const s = formatRange(iv, 'yyyy-MM-dd');
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });
});
