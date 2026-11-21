import { describe, expect, it, vi, afterEach } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  compare,
  isBefore,
  isBetween,
  isSameQuarter,
  min,
  max,
  clamp,
  isEqual,
  isAfter,
  isSameDay,
  isSameWeek,
  isSameMonth,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  isWeekend,
  isWeekday,
} from '../../src/ops/comparison.js';

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

  it('compares epochNanoseconds and epochMilliseconds instant bags', () => {
    expect(compare({ epochNanoseconds: 10n, year: 2026, month: 1, day: 1 }, { epochNanoseconds: 20n, year: 2026, month: 1, day: 1 })).toBe(-1);
    expect(compare({ epochMilliseconds: 10, year: 2026, month: 1, day: 1 }, { epochMilliseconds: 20, year: 2026, month: 1, day: 1 })).toBe(-1);
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

/* ------------------------------------------------------------------
 * Coverage additions: every exported helper, all comparison
 * directions, inclusive isBetween bounds, every clamp arm, min/max
 * validation + no-update loop iterations, the ISO-week logic, and
 * the today/tomorrow/yesterday reference-date helpers (fake timers:
 * these read `new Date()` so the system clock is pinned; the host is
 * UTC so 12:00Z local-dates to the same calendar day).
 * ------------------------------------------------------------------ */

const middle = Temporal.PlainDate.from('2026-08-06');

describe('compare (time-field participation + mismatch throws)', () => {
  it('uses hour/minute/second/millisecond fields when present', () => {
    const a = Temporal.PlainDateTime.from('2026-08-04T15:45:30.500');
    const b = Temporal.PlainDateTime.from('2026-08-04T15:45:30.501');
    expect(compare(a, b)).toBe(-1); // millisecond decides
    expect(compare(b, a)).toBe(1);
    expect(compare(a, Temporal.PlainDateTime.from('2026-08-04T15:45:30.500'))).toBe(0);
  });

  it('orders correctly across a year boundary (exact day counts)', () => {
    // Regression guard from the source comment: 2025-01-01T00:00 is
    // ~5.8h after 2024-12-31T18:12.
    expect(compare(
      Temporal.PlainDateTime.from('2025-01-01T00:00:00'),
      Temporal.PlainDateTime.from('2024-12-31T18:12:00'),
    )).toBe(1);
  });

  it('throws on values without date fields (type-mismatch branch)', () => {
    expect(() => compare(Temporal.PlainTime.from('15:45'), early)).toThrow(/missing year\/month\/day/);
    expect(() => compare('2026-08-04', early)).toThrow(/expected a date-carrying Temporal value/);
  });
});

describe('isEqual / isAfter / isBefore (all directions)', () => {
  it('isEqual covers both outcomes', () => {
    expect(isEqual(early, Temporal.PlainDate.from('2026-08-04'))).toBe(true);
    expect(isEqual(early, late)).toBe(false);
  });

  it('isBefore is false for equal and later operands', () => {
    expect(isBefore(late, early)).toBe(false);
    expect(isBefore(early, early)).toBe(false);
  });

  it('isAfter covers all three comparison directions', () => {
    expect(isAfter(late, early)).toBe(true);
    expect(isAfter(early, late)).toBe(false);
    expect(isAfter(early, early)).toBe(false);
  });
});

describe('min / max (validation and loop branches)', () => {
  it('throws for a non-array argument', () => {
    expect(() => min('2026-08-04' as unknown as unknown[])).toThrow(/requires a non-empty array/);
    expect(() => max(null as unknown as unknown[])).toThrow(/requires a non-empty array/);
  });

  it('throws for an empty array', () => {
    expect(() => min([])).toThrow(/requires a non-empty array/);
    expect(() => max([])).toThrow(/requires a non-empty array/);
  });

  it('scans more than two values, including iterations that do not update the best', () => {
    // Ascending input: every min() comparison is >= 0 (no-update branch).
    expect(min([early, middle, late]).toString()).toBe(early.toString());
    // Descending input: every max() comparison is <= 0 (no-update branch).
    expect(max([late, middle, early]).toString()).toBe(late.toString());
    // The updating branches.
    expect(min([late, middle, early]).toString()).toBe(early.toString());
    expect(max([early, middle, late]).toString()).toBe(late.toString());
  });
});

describe('clamp (all three arms)', () => {
  it('returns the value when inside the range, hi when above, and passes lo through', () => {
    expect(clamp(middle, early, late).toString()).toBe(middle.toString()); // inside
    expect(clamp(Temporal.PlainDate.from('2026-12-25'), early, late).toString()).toBe(late.toString()); // above hi
    expect(clamp(early, early, late).toString()).toBe(early.toString()); // exactly at lo
  });
});

describe('isBetween (inclusive bounds)', () => {
  it('treats both bounds as inclusive', () => {
    expect(isBetween(early, early, late)).toBe(true); // value === lo
    expect(isBetween(late, early, late)).toBe(true); // value === hi
  });

  it('is false below the lower bound (first comparison short-circuits)', () => {
    expect(isBetween(Temporal.PlainDate.from('2026-08-03'), early, late)).toBe(false);
  });

  it('is false above the upper bound', () => {
    expect(isBetween(Temporal.PlainDate.from('2026-08-11'), early, late)).toBe(false);
  });
});

describe('isSameDay', () => {
  it('ignores time-of-day and detects each field mismatch', () => {
    expect(isSameDay(Temporal.PlainDateTime.from('2026-08-04T23:59:59'), early)).toBe(true);
    expect(isSameDay(Temporal.PlainDate.from('2026-08-05'), early)).toBe(false); // day differs
    expect(isSameDay(Temporal.PlainDate.from('2026-09-04'), early)).toBe(false); // month differs
    expect(isSameDay(Temporal.PlainDate.from('2025-08-04'), early)).toBe(false); // year differs
  });
});

describe('isToday / isTomorrow / isYesterday (system-date reference)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isToday matches the local system date', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 4, 12, 0, 0) }); // local 2026-08-04
    expect(isToday(early)).toBe(true);
    expect(isToday(Temporal.PlainDateTime.from('2026-08-04T23:59:59'))).toBe(true);
    expect(isToday(late)).toBe(false);
    expect(isToday(Temporal.PlainDate.from('1999-12-31'))).toBe(false);
  });

  it('isTomorrow / isYesterday roll over the month boundary (Jul 31 <-> Aug 1)', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 6, 31, 12, 0, 0) }); // local 2026-07-31
    expect(isTomorrow(Temporal.PlainDate.from('2026-08-01'))).toBe(true);
    expect(isTomorrow(Temporal.PlainDate.from('2026-07-31'))).toBe(false);
    expect(isYesterday(Temporal.PlainDate.from('2026-07-30'))).toBe(true);
    expect(isYesterday(Temporal.PlainDate.from('2026-08-01'))).toBe(false);
  });

  it('isTomorrow / isYesterday cross the year boundary (Dec 31 2025)', () => {
    vi.useFakeTimers({ now: Date.UTC(2025, 11, 31, 12, 0, 0) }); // local 2025-12-31
    expect(isTomorrow(Temporal.PlainDate.from('2026-01-01'))).toBe(true);
    expect(isYesterday(Temporal.PlainDate.from('2025-12-30'))).toBe(true);
    expect(isYesterday(Temporal.PlainDate.from('2025-12-31'))).toBe(false);
  });
});

describe('isSameWeek (ISO Mon-Sun weeks)', () => {
  it('accepts any two days of the same Mon-Sun span, including year boundaries', () => {
    // 2026-08-04 is a Tuesday; its ISO week runs Mon 2026-08-03 .. Sun 2026-08-09.
    expect(isSameWeek(early, Temporal.PlainDate.from('2026-08-03'))).toBe(true);
    expect(isSameWeek(early, Temporal.PlainDate.from('2026-08-09'))).toBe(true);
    // Dec 31 2026 (Thu) and Jan 1 2027 (Fri) share ISO week 53 of 2026.
    expect(isSameWeek(Temporal.PlainDate.from('2026-12-31'), Temporal.PlainDate.from('2027-01-01'))).toBe(true);
  });

  it('rejects days less than a week apart but in different weeks', () => {
    // Sun 2026-08-09 and Mon 2026-08-10 are one day apart, different ISO weeks.
    expect(isSameWeek(Temporal.PlainDate.from('2026-08-09'), Temporal.PlainDate.from('2026-08-10'))).toBe(false);
  });

  it('rejects dates a full week or more apart (>= 7 branch)', () => {
    expect(isSameWeek(early, Temporal.PlainDate.from('2026-08-11'))).toBe(false); // exactly 7 days
    expect(isSameWeek(early, Temporal.PlainDate.from('2026-09-04'))).toBe(false); // a month apart
  });
});

describe('isSameMonth / isSameYear', () => {
  it('isSameMonth compares year and month', () => {
    expect(isSameMonth(early, Temporal.PlainDate.from('2026-08-31'))).toBe(true);
    expect(isSameMonth(early, Temporal.PlainDate.from('2026-09-04'))).toBe(false); // same year, different month
    expect(isSameMonth(early, Temporal.PlainDate.from('2025-08-04'))).toBe(false); // different year
  });

  it('isSameYear compares only the year field', () => {
    expect(isSameYear(early, Temporal.PlainDate.from('2026-02-01'))).toBe(true);
    expect(isSameYear(early, Temporal.PlainDate.from('2027-01-01'))).toBe(false);
  });
});

describe('isSameQuarter (false branches)', () => {
  it('is false across quarter or year boundaries', () => {
    expect(isSameQuarter(early, Temporal.PlainDate.from('2026-09-30'))).toBe(true); // Aug & Sep are both Q3
    expect(isSameQuarter(early, Temporal.PlainDate.from('2026-10-01'))).toBe(false); // Q3 vs Q4
    expect(isSameQuarter(early, Temporal.PlainDate.from('2025-08-04'))).toBe(false); // same quarter, different year
  });
});

describe('isWeekend / isWeekday', () => {
  it('flags Saturday and Sunday as weekend days', () => {
    expect(isWeekend(Temporal.PlainDate.from('2026-08-08'))).toBe(true); // Saturday (dayOfWeek 6)
    expect(isWeekend(Temporal.PlainDate.from('2026-08-09'))).toBe(true); // Sunday (dayOfWeek 7)
  });

  it('Mon-Fri are weekdays', () => {
    expect(isWeekend(early)).toBe(false); // Tuesday
    expect(isWeekday(early)).toBe(true);
    expect(isWeekday(Temporal.PlainDate.from('2026-08-08'))).toBe(false); // Saturday
  });

  it('works on any object exposing a numeric dayOfWeek', () => {
    expect(isWeekend({ dayOfWeek: 6 })).toBe(true);
    expect(isWeekend({ dayOfWeek: 1 })).toBe(false);
    expect(isWeekday({ dayOfWeek: 3 })).toBe(true);
  });

  it('throws for non-object input (typeof/null guard branches)', () => {
    expect(() => isWeekend('2026-08-08')).toThrow(/isWeekend\(\) expected a Temporal value/);
    expect(() => isWeekend(null)).toThrow(/isWeekend\(\) expected a Temporal value/);
    expect(() => isWeekend(42)).toThrow(/isWeekend\(\) expected a Temporal value/);
  });

  it('throws for values without a dayOfWeek field (PlainTime has none)', () => {
    expect(() => isWeekend(Temporal.PlainTime.from('15:45'))).toThrow(/needs a value with a dayOfWeek field/);
    expect(() => isWeekend({})).toThrow(/needs a value with a dayOfWeek field/);
    // isWeekday delegates to isWeekend, so it propagates the same throw.
    expect(() => isWeekday({})).toThrow(/needs a value with a dayOfWeek field/);
  });
});
