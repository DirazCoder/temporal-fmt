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
  subtract,
  mergeIntervals,
  splitInterval,
  formatRange,
  formatRangeToParts,
} from '../src/interval.js';

setTemporal(Temporal);

const d = (s: string) => Temporal.PlainDate.from(s);
const dt = (s: string) => Temporal.PlainDateTime.from(s);

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
  it('intersection is open at an endpoint only if the interval OWNING that endpoint is open there', () => {
    // a = (Jan 1, Jun 30), b = [Apr 1, Dec 31]. Intersection = [Apr 1,
    // Jun 30): the START (Apr 1) is b's own closed start lying in a's
    // interior — included; the END (Jun 30) is a's own open end —
    // excluded. The old expectation 'open' came from the swapped
    // half-open label handling (open-at-start charged to any interval
    // declaring 'open' anywhere).
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
    expect(intersection(a, b)?.bounds).toBe('half-open-end');
  });

  it('union is open at an endpoint the OWNING interval leaves open, regardless of the other side', () => {
    // Union = (Jan 1, Dec 31]: the START is a's own open start (b never
    // reaches it, so b's closed-ness can't reopen it); the END is b's
    // own closed end — included.
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-04-01'), d('2026-12-31'), 'closed');
    expect(union(a, b)?.bounds).toBe('half-open-start');
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

// ---------------------------------------------------------------------------
// Task 2-c2 additions: bring src/interval.ts to 100% coverage.
// ---------------------------------------------------------------------------

describe('interval() validation branches', () => {
  it('throws when start is after end', () => {
    // line 46: cmp > 0 throw branch
    expect(() => interval(d('2026-06-01'), d('2026-01-01'))).toThrow(/interval start must be ≤ end/);
  });

  it('accepts zero-length intervals; bounds decide whether the point is contained', () => {
    // [x, x] = {x}, (x, x) = {} — exercises cmp === 0 through the constructor
    const closed = interval(d('2026-06-01'), d('2026-06-01'));
    const open = interval(d('2026-06-01'), d('2026-06-01'), 'open');
    expect(contains(closed, d('2026-06-01'))).toBe(true);
    expect(contains(open, d('2026-06-01'))).toBe(false);
  });
});

describe('contains: all four bounds', () => {
  const s = d('2026-01-01');
  const e = d('2026-12-31');
  const mid = d('2026-06-15');

  it('closed [s, e] includes both endpoints', () => {
    // startIncluded/endIncluded true arms
    const iv = interval(s, e, 'closed');
    expect(contains(iv, s)).toBe(true);
    expect(contains(iv, e)).toBe(true);
    expect(contains(iv, mid)).toBe(true);
    expect(contains(iv, d('2025-06-15'))).toBe(false);
    expect(contains(iv, d('2027-06-15'))).toBe(false);
  });

  it('open (s, e) excludes both endpoints but keeps the interior', () => {
    // startCmp > 0 / endCmp < 0 arms of the contains ternaries
    const iv = interval(s, e, 'open');
    expect(contains(iv, s)).toBe(false);
    expect(contains(iv, e)).toBe(false);
    expect(contains(iv, mid)).toBe(true);
  });

  it('half-open-start (s, e] excludes the start, includes the end', () => {
    const iv = interval(s, e, 'half-open-start');
    expect(contains(iv, s)).toBe(false);
    expect(contains(iv, e)).toBe(true);
    expect(contains(iv, mid)).toBe(true);
  });

  it('half-open-end [s, e) includes the start, excludes the end', () => {
    const iv = interval(s, e, 'half-open-end');
    expect(contains(iv, s)).toBe(true);
    expect(contains(iv, e)).toBe(false);
    expect(contains(iv, mid)).toBe(true);
  });
});

describe('intersects: single shared point depends on bounds', () => {
  it('a later-start interval still intersects (lo comes from a.start)', () => {
    // line 99 loCmp >= 0 arm
    const a = interval(d('2026-06-01'), d('2026-08-01'));
    const b = interval(d('2026-01-01'), d('2026-07-01'));
    expect(intersects(a, b)).toBe(true);
    expect(overlaps(a, b)).toBe(true);
  });

  it('touching endpoints: closed + closed share the point', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-06-30'), d('2026-12-31'));
    expect(intersects(a, b)).toBe(true);
  });

  it('touching endpoints: [s, e) + [e, x] share nothing', () => {
    // lo === hi but the first interval does not contain the shared point
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'half-open-end');
    const b = interval(d('2026-06-30'), d('2026-12-31'));
    expect(intersects(a, b)).toBe(false);
  });

  it('touching endpoints: [s, e] + (e, x] share nothing', () => {
    // lo === hi and the first contains it, the second does not
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-06-30'), d('2026-12-31'), 'half-open-start');
    expect(intersects(a, b)).toBe(false);
  });
});

describe('isBefore / isAfter edge cases', () => {
  it('touching intervals are neither before nor after each other', () => {
    // compare === 0: both strict comparisons return false
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-06-30'), d('2026-12-31'));
    expect(isBefore(a, b)).toBe(false); // a.end === b.start
    expect(isAfter(b, a)).toBe(false); // b.start === a.end
  });

  it('overlapping intervals are neither before nor after', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-03-01'), d('2026-12-31'));
    expect(isBefore(a, b)).toBe(false);
    expect(isAfter(a, b)).toBe(false);
  });
});

describe('intersection: endpoint ownership and conjunction cases', () => {
  it('returns null for disjoint intervals', () => {
    // line 124 early return
    const a = interval(d('2026-01-01'), d('2026-02-01'));
    const b = interval(d('2027-01-01'), d('2027-02-01'));
    expect(intersection(a, b)).toBeNull();
  });

  it('a owns both endpoints (later start, earlier end): closed ∩ closed', () => {
    // aStartLater / aEndEarlier both true
    const a = interval(d('2026-04-01'), d('2026-06-30'));
    const b = interval(d('2026-01-01'), d('2026-12-31'));
    const r = intersection(a, b)!;
    expect(r.start.toString()).toBe('2026-04-01');
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('closed');
  });

  it('a owns the start but keeps it exclusive (half-open-start)', () => {
    // aStartLater true with startIncluded(a) === false; b owns the end
    const a = interval(d('2026-04-01'), d('2026-12-31'), 'half-open-start');
    const b = interval(d('2026-01-01'), d('2026-06-30'));
    const r = intersection(a, b)!;
    expect(r.start.toString()).toBe('2026-04-01');
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('half-open-start');
  });

  it('b owns both endpoints and both are exclusive (open)', () => {
    // aEndEarlier false, compare(a.end, b.end) > 0 -> endIncluded(b.bounds)
    const a = interval(d('2026-01-01'), d('2026-12-31'));
    const b = interval(d('2026-04-01'), d('2026-06-30'), 'open');
    const r = intersection(a, b)!;
    expect(r.start.toString()).toBe('2026-04-01');
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('open');
  });

  it('equal starts, both closed: conjunction is true', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-01-01'), d('2026-03-31'));
    const r = intersection(a, b)!;
    expect(r.start.toString()).toBe('2026-01-01');
    expect(r.end.toString()).toBe('2026-03-31');
    expect(r.bounds).toBe('closed');
  });

  it('equal starts, a open: conjunction short-circuits to false', () => {
    // startIncluded(a) && startIncluded(b) with the left operand false
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-01-01'), d('2026-03-31'));
    const r = intersection(a, b)!;
    expect(r.bounds).toBe('half-open-start'); // b's closed end included
  });

  it('equal starts, a closed + b open: true && false', () => {
    // conjunction with the right operand false
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-01-01'), d('2026-03-31'), 'open');
    expect(intersection(a, b)!.bounds).toBe('open');
  });

  it('equal ends, b end exclusive: true && false', () => {
    // endIncluded(a) && endIncluded(b) with the right operand false
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-02-01'), d('2026-06-30'), 'half-open-end');
    const r = intersection(a, b)!;
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('half-open-end');
  });

  it('equal ends, both closed: conjunction is true', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-02-01'), d('2026-06-30'));
    expect(intersection(a, b)!.bounds).toBe('closed');
  });

  it('equal ends, both open: open result', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-02-01'), d('2026-06-30'), 'open');
    expect(intersection(a, b)!.bounds).toBe('open');
  });
});

describe('union: endpoint ownership and disjunction cases', () => {
  it('a extends further on both sides (b owns the start): closed', () => {
    // aStartEarlier false with b strictly earlier; aEndLater true
    const a = interval(d('2026-04-01'), d('2026-12-31'));
    const b = interval(d('2026-01-01'), d('2026-06-30'));
    const r = union(a, b)!;
    expect(r.start.toString()).toBe('2026-01-01');
    expect(r.end.toString()).toBe('2026-12-31');
    expect(r.bounds).toBe('closed');
  });

  it("a's exclusive end survives when a extends further (half-open-end)", () => {
    // aEndLater true with endIncluded(a) === false
    const a = interval(d('2026-04-01'), d('2026-12-31'), 'half-open-end');
    const b = interval(d('2026-01-01'), d('2026-06-30'));
    expect(union(a, b)!.bounds).toBe('half-open-end');
  });

  it('equal starts, both closed: disjunction is true', () => {
    // aStartEarlier false and b.start not earlier -> || branch
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-01-01'), d('2026-03-31'));
    const r = union(a, b)!;
    expect(r.start.toString()).toBe('2026-01-01');
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('closed');
  });

  it('equal starts, a open + b closed: OR takes the inclusive one', () => {
    // startIncluded(a) false, startIncluded(b) true
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-01-01'), d('2026-03-31'));
    expect(union(a, b)!.bounds).toBe('half-open-end'); // start from b, a's open end
  });

  it('equal starts, both open: fully open union', () => {
    // startIncluded(a) || startIncluded(b) both false
    const a = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const b = interval(d('2026-01-01'), d('2026-03-31'), 'open');
    expect(union(a, b)!.bounds).toBe('open');
  });

  it('equal ends, both closed: disjunction is true', () => {
    // aEndLater false and a.end not earlier -> || branch
    const a = interval(d('2026-02-01'), d('2026-06-30'));
    const b = interval(d('2026-01-01'), d('2026-06-30'));
    const r = union(a, b)!;
    expect(r.start.toString()).toBe('2026-01-01');
    expect(r.end.toString()).toBe('2026-06-30');
    expect(r.bounds).toBe('closed');
  });

  it("equal ends, a's exclusive end + b's closed end: OR includes it", () => {
    // endIncluded(a) false, endIncluded(b) true
    const a = interval(d('2026-02-01'), d('2026-06-30'), 'half-open-end');
    const b = interval(d('2026-01-01'), d('2026-06-30'));
    expect(union(a, b)!.bounds).toBe('closed');
  });

  it('equal ends, both ends exclusive: union stays open at the end', () => {
    // endIncluded(a) || endIncluded(b) both false
    const a = interval(d('2026-02-01'), d('2026-06-30'), 'half-open-end');
    const b = interval(d('2026-01-01'), d('2026-06-30'), 'open');
    const r = union(a, b)!;
    expect(r.bounds).toBe('open');
  });

  it('b extends further at the end and owns it (closed)', () => {
    // aEndLater false, compare(a.end, b.end) < 0 -> endIncluded(b.bounds)
    const a = interval(d('2026-01-01'), d('2026-03-31'));
    const b = interval(d('2026-02-01'), d('2026-12-31'));
    const r = union(a, b)!;
    expect(r.end.toString()).toBe('2026-12-31');
    expect(r.bounds).toBe('closed');
  });

  it("b extends further with an exclusive end (half-open-end)", () => {
    const a = interval(d('2026-01-01'), d('2026-03-31'));
    const b = interval(d('2026-02-01'), d('2026-12-31'), 'half-open-end');
    expect(union(a, b)!.bounds).toBe('half-open-end');
  });

  it("a's exclusive start survives when a starts earlier (half-open-start)", () => {
    // aStartEarlier true with startIncluded(a) === false
    const a = interval(d('2026-01-01'), d('2026-03-31'), 'half-open-start');
    const b = interval(d('2026-02-01'), d('2026-12-31'));
    expect(union(a, b)!.bounds).toBe('half-open-start');
  });
});

describe('difference: bounds of the surviving pieces', () => {
  it('a closed, b open: both cut edges stay with the remainder (closed pieces)', () => {
    // endInc / startInc true because the open b never owned its endpoints
    const a = interval(d('2026-01-01'), d('2026-03-31'));
    const b = interval(d('2026-02-01'), d('2026-02-28'), 'open');
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('closed');
    expect(r[1].bounds).toBe('closed');
    expect(r[0].end.toString()).toBe('2026-02-01');
    expect(r[1].start.toString()).toBe('2026-02-28');
  });

  it('a closed, b closed: cut edges go with the removed overlap', () => {
    const a = interval(d('2026-01-01'), d('2026-03-31'));
    const b = interval(d('2026-02-01'), d('2026-02-28'));
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('half-open-end');
    expect(r[1].bounds).toBe('half-open-start');
  });

  it('a half-open-start, b open: left piece keeps its start-exclusive shape', () => {
    // startIncluded(a) false with endInc true -> half-open-start
    const a = interval(d('2026-01-01'), d('2026-03-31'), 'half-open-start');
    const b = interval(d('2026-02-01'), d('2026-02-28'), 'open');
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('half-open-start');
    expect(r[1].bounds).toBe('closed');
  });

  it('a half-open-start, b closed: left piece is fully open', () => {
    // startIncluded(a) false with endInc false -> open
    const a = interval(d('2026-01-01'), d('2026-03-31'), 'half-open-start');
    const b = interval(d('2026-02-01'), d('2026-02-28'));
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('open');
    expect(r[1].bounds).toBe('half-open-start');
  });

  it('a half-open-end, b closed: right piece is fully open', () => {
    // startInc false with endIncluded(a) false -> open
    const a = interval(d('2026-01-01'), d('2026-03-31'), 'half-open-end');
    const b = interval(d('2026-02-01'), d('2026-02-28'));
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('half-open-end');
    expect(r[1].bounds).toBe('open');
  });

  it('a half-open-end, b open: right piece keeps its end inclusivity', () => {
    // startInc true with endIncluded(a) false -> half-open-end
    const a = interval(d('2026-01-01'), d('2026-03-31'), 'half-open-end');
    const b = interval(d('2026-02-01'), d('2026-02-28'), 'open');
    const r = difference(a, b);
    expect(r).toHaveLength(2);
    expect(r[0].bounds).toBe('closed');
    expect(r[1].bounds).toBe('half-open-end');
  });

  it('a contained in b: nothing survives', () => {
    // both piece branches skipped (a.start >= b.start, a.end <= b.end)
    const a = interval(d('2026-02-01'), d('2026-02-28'));
    const b = interval(d('2026-01-01'), d('2026-12-31'));
    expect(difference(a, b)).toEqual([]);
  });

  it('identical intervals: nothing survives', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    expect(difference(a, a)).toEqual([]);
  });

  it('b swallows the tail of a: only the left piece survives', () => {
    // no right piece (compare(a.end, b.end) > 0 is false) but a left one
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-03-31'), d('2026-12-31'));
    const r = difference(a, b);
    expect(r).toHaveLength(1);
    expect(r[0].end.toString()).toBe('2026-03-31');
    expect(r[0].bounds).toBe('half-open-end');
  });

  it('subtract is an alias of difference', () => {
    const a = interval(d('2026-01-01'), d('2026-06-30'));
    const b = interval(d('2026-03-31'), d('2026-12-31'));
    expect(subtract(a, b)).toEqual(difference(a, b));
  });
});

describe('mergeIntervals: bounds, touching and containment', () => {
  it('returns [] for an empty list', () => {
    // line 229 early return
    expect(mergeIntervals([])).toEqual([]);
  });

  it('a single interval is copied, not aliased', () => {
    const a = interval(d('2026-01-01'), d('2026-02-28'));
    const r = mergeIntervals([a]);
    expect(r).toHaveLength(1);
    expect(r[0]).not.toBe(a);
    expect(r[0]).toEqual(a);
  });

  it('sorts unsorted input and extends with closed bounds', () => {
    // sort comparator with a > b; endCmp > 0 extend, startInc/endInc both true
    const r = mergeIntervals([
      interval(d('2026-02-15'), d('2026-04-30')),
      interval(d('2026-01-01'), d('2026-02-28')),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].start.toString()).toBe('2026-01-01');
    expect(r[0].end.toString()).toBe('2026-04-30');
    expect(r[0].bounds).toBe('closed');
  });

  it('inputs are never mutated by a merge', () => {
    const a = interval(d('2026-01-01'), d('2026-02-28'));
    mergeIntervals([a, interval(d('2026-02-15'), d('2026-04-30'))]);
    expect(a.end.toString()).toBe('2026-02-28');
    expect(a.bounds).toBe('closed');
  });

  it("extends onto the current's exclusive end (half-open-end)", () => {
    // endCmp > 0, startIncluded(last) true, endIncluded(current) false
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-02-28')),
      interval(d('2026-02-15'), d('2026-04-30'), 'half-open-end'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].end.toString()).toBe('2026-04-30');
    expect(r[0].bounds).toBe('half-open-end');
  });

  it('extends from an open start (half-open-start)', () => {
    // endCmp > 0, startIncluded(last) false, endIncluded(current) true
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-02-28'), 'open'),
      interval(d('2026-02-15'), d('2026-04-30')),
    ]);
    expect(r[0].bounds).toBe('half-open-start');
  });

  it('extends from an open start to an open end (open)', () => {
    // endCmp > 0, startIncluded(last) false, endIncluded(current) false
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-02-28'), 'open'),
      interval(d('2026-02-15'), d('2026-04-30'), 'open'),
    ]);
    expect(r[0].bounds).toBe('open');
  });

  it('equal ends, both closed: end inclusivity ORs to closed', () => {
    // endCmp === 0, startIncluded(last) true, endIncluded(last) true
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-06-30')),
      interval(d('2026-02-01'), d('2026-06-30')),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].end.toString()).toBe('2026-06-30');
    expect(r[0].bounds).toBe('closed');
  });

  it('equal ends, both ends exclusive: half-open-end', () => {
    // endCmp === 0, endIncluded(last) || endIncluded(current) both false
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-06-30'), 'half-open-end'),
      interval(d('2026-02-01'), d('2026-06-30'), 'half-open-end'),
    ]);
    expect(r[0].bounds).toBe('half-open-end');
  });

  it('equal ends, open last + closed current end: half-open-start', () => {
    // endCmp === 0, startIncluded(last) false, false || true
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-06-30'), 'open'),
      interval(d('2026-02-01'), d('2026-06-30')),
    ]);
    expect(r[0].bounds).toBe('half-open-start');
  });

  it('equal ends, half-open-start last owns its inclusive end: half-open-start', () => {
    // endCmp === 0, startIncluded(last) false, true || … short-circuits
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-06-30'), 'half-open-start'),
      interval(d('2026-02-01'), d('2026-06-30')),
    ]);
    expect(r[0].bounds).toBe('half-open-start');
  });

  it('equal ends, both ends exclusive on the else side: open', () => {
    // endCmp === 0, startIncluded(last) false, false || false
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-06-30'), 'open'),
      interval(d('2026-02-01'), d('2026-06-30'), 'half-open-end'),
    ]);
    expect(r[0].bounds).toBe('open');
  });

  it('a contained interval merges without changing the survivor', () => {
    // endCmp < 0: neither extend nor equal-end branch runs
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-12-31')),
      interval(d('2026-02-01'), d('2026-03-31')),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].start.toString()).toBe('2026-01-01');
    expect(r[0].end.toString()).toBe('2026-12-31');
    expect(r[0].bounds).toBe('closed');
  });

  it('touching closed intervals merge', () => {
    // touching with endIncluded(last) true: touchMerges via the || left arm
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-01-05')),
      interval(d('2026-01-05'), d('2026-01-10')),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].start.toString()).toBe('2026-01-01');
    expect(r[0].end.toString()).toBe('2026-01-10');
    expect(r[0].bounds).toBe('closed');
  });

  it('touching [s, e) + [e, x] merges via the shared point even though intersects() is false', () => {
    // touching, endIncluded(last) false, startIncluded(current) true,
    // and intersects(last, current) false: merges through touchMerges
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-01-05'), 'half-open-end'),
      interval(d('2026-01-05'), d('2026-01-10')),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].end.toString()).toBe('2026-01-10');
    expect(r[0].bounds).toBe('closed');
  });

  it('touching open intervals stay separate (hole at the shared point)', () => {
    // touching with neither side including the point: no merge
    const r = mergeIntervals([
      interval(d('2026-01-01'), d('2026-01-05'), 'open'),
      interval(d('2026-01-05'), d('2026-01-10'), 'open'),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].end.toString()).toBe('2026-01-05');
    expect(r[1].start.toString()).toBe('2026-01-05');
  });
});

describe('splitInterval: partitions, bounds and edge cases', () => {
  it('throws for negative n too', () => {
    // same n <= 0 branch as n = 0, negative side
    const iv = interval(d('2026-01-01'), d('2026-12-31'));
    expect(() => splitInterval(iv, -2)).toThrow(/requires n > 0/);
  });

  it('splits a closed date range into half-open slices plus a closed last', () => {
    // 30 days / 3 = exact 10-day chunks; covers i === 0 and i === n-1 arms
    const iv = interval(d('2026-01-01'), d('2026-01-31'));
    const slices = splitInterval(iv, 3);
    expect(slices).toHaveLength(3);
    expect(slices.map((s) => s.bounds)).toEqual(['half-open-end', 'half-open-end', 'closed']);
    expect(slices[0].start).toMatchObject({ year: 2026, month: 1, day: 1 });
    expect(slices[0].end).toMatchObject({ year: 2026, month: 1, day: 11 });
    expect(slices[1].start).toMatchObject({ year: 2026, month: 1, day: 11 });
    expect(slices[2].end).toMatchObject({ year: 2026, month: 1, day: 31 });
    // partition property: a boundary point belongs to exactly one slice
    expect(contains(slices[0], d('2026-01-11'))).toBe(false);
    expect(contains(slices[1], d('2026-01-11'))).toBe(true);
    expect(contains(slices[2], d('2026-01-31'))).toBe(true);
  });

  it('open input: first slice open, last keeps the exclusive end', () => {
    // ivStartInc false (slice 0) and ivEndInc false (last slice)
    const iv = interval(d('2026-01-01'), d('2026-01-31'), 'open');
    const slices = splitInterval(iv, 2);
    expect(slices.map((s) => s.bounds)).toEqual(['open', 'half-open-end']);
    expect(contains(slices[0], d('2026-01-01'))).toBe(false);
    expect(contains(slices[1], d('2026-01-31'))).toBe(false);
  });

  it('half-open-start input: first slice open, last slice closed', () => {
    // ivStartInc false, ivEndInc true
    const iv = interval(d('2026-01-01'), d('2026-01-31'), 'half-open-start');
    expect(splitInterval(iv, 2).map((s) => s.bounds)).toEqual(['open', 'closed']);
  });

  it('half-open-end input: every slice excludes its end', () => {
    // ivStartInc true, ivEndInc false
    const iv = interval(d('2026-01-01'), d('2026-01-31'), 'half-open-end');
    expect(splitInterval(iv, 2).map((s) => s.bounds)).toEqual(['half-open-end', 'half-open-end']);
  });

  it('remainder chunks: 31 days over n=2 lands mid-day', () => {
    // fractional step exercises the hour field of fromMs()
    const iv = interval(d('2026-01-01'), d('2026-02-01'));
    const slices = splitInterval(iv, 2);
    expect(slices[0].end).toMatchObject({ year: 2026, month: 1, day: 16, hour: 12 });
    expect(slices[1].end).toMatchObject({ year: 2026, month: 2, day: 1, hour: 0 });
  });

  it('PlainDateTime endpoints crossing the epoch normalize negative ms correctly', () => {
    // withinDay < 0 arm of fromMs(); time fields present in toMs()
    const iv = interval(dt('1969-12-31T12:00:00'), dt('1970-01-01T12:00:00'));
    const slices = splitInterval(iv, 2);
    expect(slices[0].start).toMatchObject({ year: 1969, month: 12, day: 31, hour: 12 });
    expect(slices[0].end).toMatchObject({ year: 1970, month: 1, day: 1, hour: 0 });
    expect(slices[1].end).toMatchObject({ year: 1970, month: 1, day: 1, hour: 12 });
  });

  it('negative years round-trip through the civil-day algorithm', () => {
    const iv = interval({ year: -1, month: 3, day: 1 }, { year: -1, month: 3, day: 31 });
    const slices = splitInterval(iv, 2);
    expect(slices[0].end).toMatchObject({ year: -1, month: 3, day: 16 });
  });

  it('throws a RangeError when the start is outside the representable Date range', () => {
    // Math.abs(startMs) > MAX_DATE_MS: left operand of the || is true
    const iv = interval({ year: -275000, month: 1, day: 1 }, { year: 0, month: 1, day: 1 });
    expect(() => splitInterval(iv, 2)).toThrow(RangeError);
    expect(() => splitInterval(iv, 2)).toThrow(/outside the representable Date range/);
  });

  it('throws a RangeError when only the end is outside the representable Date range', () => {
    // left operand false, Math.abs(endMs) > MAX_DATE_MS true
    const iv = interval({ year: 2000, month: 1, day: 1 }, { year: 280000, month: 1, day: 1 });
    expect(() => splitInterval(iv, 2)).toThrow(RangeError);
  });
});

describe('formatRange: token path, Intl fallback, error paths', () => {
  it('token path: joins both endpoints with an en dash', () => {
    const iv = interval(d('2026-08-04'), d('2026-08-06'));
    expect(formatRange(iv, 'yyyy-MM-dd')).toBe('2026-08-04 \u2013 2026-08-06');
  });

  it('token path honors locale options', () => {
    const iv = interval(d('2026-08-04'), d('2026-08-06'));
    expect(formatRange(iv, 'MMMM d, yyyy', { locale: 'en-US' })).toBe('August 4, 2026 \u2013 August 6, 2026');
  });

  it('falls back to Intl.formatRange when the token path cannot render the values', () => {
    // date-only field bags have no hour, so 'HH' throws -> fallback;
    // toJSDate takes the year/month/day branch, locale ?? 'en-US' default
    const iv = interval({ year: 2026, month: 8, day: 4 }, { year: 2026, month: 8, day: 6 });
    const expected = new Intl.DateTimeFormat('en-US', {}).formatRange(
      new Date(Date.UTC(2026, 7, 4)),
      new Date(Date.UTC(2026, 7, 6)),
    );
    expect(formatRange(iv, 'HH:mm')).toBe(expected);
  });

  it('fallback converts ZonedDateTime endpoints via toInstant()', () => {
    // format string over MAX_FORMAT_LENGTH -> token path throws -> fallback;
    // toJSDate takes the toInstant branch
    const iv = interval(
      Temporal.ZonedDateTime.from('2026-08-04T12:00:00Z[UTC]'),
      Temporal.ZonedDateTime.from('2026-08-06T12:00:00Z[UTC]'),
    );
    const expected = new Intl.DateTimeFormat('en-US', {}).formatRange(
      new Date(Date.UTC(2026, 7, 4, 12)),
      new Date(Date.UTC(2026, 7, 6, 12)),
    );
    expect(formatRange(iv, 'x'.repeat(1001))).toBe(expected);
  });

  it('fallback normalizes the locale tag and reads time fields from the bag', () => {
    // options.locale provided (underscored) + all hour/minute/second/
    // millisecond ?? branches defined in toJSDate's Date.UTC call
    const iv = interval(
      { year: 2026, month: 8, day: 4, hour: 10, minute: 30, second: 15, millisecond: 250 },
      { year: 2026, month: 8, day: 6, hour: 14, minute: 45, second: 30, millisecond: 500 },
    );
    const expected = new Intl.DateTimeFormat('fr-FR', {}).formatRange(
      new Date(Date.UTC(2026, 7, 4, 10, 30, 15, 250)),
      new Date(Date.UTC(2026, 7, 6, 14, 45, 30, 500)),
    );
    expect(formatRange(iv, 'x'.repeat(1001), { locale: 'fr_FR' })).toBe(expected);
  });

  it('rethrows the token-path error when the fallback also fails (null endpoint)', () => {
    // baseFormat rejects null; toJSDate rejects null too -> original error wins
    const iv = { start: null, end: d('2026-01-05'), bounds: 'closed' as const };
    expect(() => formatRange(iv, 'yyyy')).toThrow(/got null/);
  });

  it('rethrows when endpoints have no date fields at all (PlainTime-like bags)', () => {
    // {hour, minute} bags: token path fails on 'year', toJSDate has neither
    // toInstant nor year -> its error is swallowed and the original rethrown
    const iv = { start: { hour: 10, minute: 0 }, end: { hour: 12, minute: 0 }, bounds: 'closed' as const };
    expect(() => formatRange(iv, 'yyyy')).toThrow(/token "yyyy" requires "year"/);
  });

  it('rethrows when the field bag is missing month', () => {
    // year passes the && chain, month fails
    const iv = { start: { year: 2026 }, end: { year: 2027 }, bounds: 'closed' as const };
    expect(() => formatRange(iv, 'yyyy-MM')).toThrow(/token "MM" requires "month"/);
  });

  it('rethrows when the field bag is missing day', () => {
    // year and month pass, day fails
    const iv = { start: { year: 2026, month: 8 }, end: { year: 2026, month: 9 }, bounds: 'closed' as const };
    expect(() => formatRange(iv, 'yyyy-MM-dd')).toThrow(/token "dd" requires "day"/);
  });
});

describe('formatRangeToParts', () => {
  it('returns start parts, an en-dash literal, then end parts', () => {
    // options default-parameter branch: called without options
    const iv = interval(d('2026-01-01'), d('2026-01-05'));
    const parts = formatRangeToParts(iv, 'yyyy-MM-dd');
    expect(parts).toHaveLength(11);
    expect(parts[5]).toEqual({ type: 'literal', value: ' \u2013 ' });
    expect(parts[0]).toMatchObject({ type: 'token', value: '2026', token: 'yyyy' });
    expect(parts.map((p) => p.value).join('')).toBe('2026-01-01 \u2013 2026-01-05');
  });

  it('accepts format options', () => {
    const iv = interval(d('2026-01-01'), d('2026-01-05'));
    const parts = formatRangeToParts(iv, 'yyyy-MM-dd', { locale: 'en-US' });
    expect(parts.map((p) => p.value).join('')).toBe('2026-01-01 \u2013 2026-01-05');
  });
});
