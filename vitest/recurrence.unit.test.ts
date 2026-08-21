import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { recurrence, take, skip, between, parseRRule, formatRRule } from '../src/recurrence.js';

setTemporal(Temporal);

const iso = (v: unknown) => {
  const f = v as { year: number; month: number; day: number };
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
};

describe('recurrence / take', () => {
  it('advances by frequency and interval', () => {
    const start = Temporal.PlainDate.from('2026-01-01');
    const iter = recurrence(start, { frequency: 'daily', interval: 1 });
    expect(take(iter, 3).map(iso)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('byWeekday filters to matching ISO weekdays only', () => {
    // 2026-01-01 is a Thursday. byWeekday [1,3] = Mon/Wed.
    const start = Temporal.PlainDate.from('2026-01-01');
    const iter = recurrence(start, { frequency: 'daily', interval: 1, byWeekday: [1, 3] });
    expect(take(iter, 3).map(iso)).toEqual(['2026-01-05', '2026-01-07', '2026-01-12']);
  });
});

describe('skip / between', () => {
  it('skip advances past N occurrences before collecting the rest', () => {
    const start = Temporal.PlainDate.from('2026-01-01');
    const iter = recurrence(start, { frequency: 'daily', interval: 1, count: 5 });
    const remaining = skip(iter, 2);
    expect(remaining).toHaveLength(3);
    expect(iso(remaining[0])).toBe('2026-01-03');
  });

  it('between returns occurrences in [rangeStart, rangeEnd)', () => {
    const start = Temporal.PlainDate.from('2026-01-01');
    const rule = { frequency: 'daily' as const, interval: 1 };
    const results = between(start, rule, Temporal.PlainDate.from('2026-01-03'), Temporal.PlainDate.from('2026-01-06'));
    expect(results.map(iso)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
  });
});

describe('parseRRule / formatRRule', () => {
  it('parses an RRULE string into a rule object', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(r.frequency).toBe('weekly');
    expect(r.byWeekday).toEqual([1, 3, 5]);
  });

  it('formats a rule back into an RRULE string, omitting a default interval', () => {
    expect(formatRRule({ frequency: 'daily', interval: 1 })).toBe('FREQ=DAILY');
    expect(formatRRule({ frequency: 'daily', interval: 3 })).toBe('FREQ=DAILY;INTERVAL=3');
  });
});
