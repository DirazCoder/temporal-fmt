import { describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { recurrence, take, skip, between, parseRRule, formatRRule, type RecurrenceRule } from '../../src/calendar/recurrence.js';

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

// ---------------------------------------------------------------------------
// Task 2-c additions: drive every remaining branch of recurrence.ts.
// ---------------------------------------------------------------------------

const dt = (s: string) => Temporal.PlainDateTime.from(s);

const isoDateTime = (v: unknown) => {
  const f = v as { year: number; month: number; day: number; hour?: number; minute?: number; second?: number };
  const date = `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
  if (f.hour === undefined) return date;
  return `${date}T${String(f.hour).padStart(2, '0')}:${String(f.minute ?? 0).padStart(2, '0')}:${String(f.second ?? 0).padStart(2, '0')}`;
};

describe('recurrence rule validation', () => {
  const start = Temporal.PlainDate.from('2026-01-01');

  it('rejects a count that is not a positive safe integer', () => {
    // count = 0 is a safe integer but < 1; 1.5 is not an integer.
    expect(() => recurrence(start, { frequency: 'daily', interval: 1, count: 0 })).toThrow(RangeError);
    expect(() => recurrence(start, { frequency: 'daily', interval: 1, count: 1.5 })).toThrow(/count must be a positive safe integer/);
  });

  it('treats a missing or null interval as 1', () => {
    // interval omitted / null used to poison every candidate with NaN arithmetic.
    const a = recurrence(start, { frequency: 'daily' } as unknown as RecurrenceRule);
    const b = recurrence(start, { frequency: 'daily', interval: null } as unknown as RecurrenceRule);
    expect(take(a, 2).map(iso)).toEqual(['2026-01-01', '2026-01-02']);
    expect(take(b, 2).map(iso)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('rejects an interval that is not a positive safe integer', () => {
    for (const interval of [0, -1, 1.5, Number.NaN]) {
      expect(() => recurrence(start, { frequency: 'daily', interval })).toThrow(/interval must be a positive safe integer/);
    }
  });

  it('rejects out-of-range byMonthDay entries', () => {
    for (const byMonthDay of [[0], [32], [-32], [1.5]]) {
      expect(() => recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay })).toThrow(/byMonthDay entries must be nonzero integers/);
    }
  });

  it('rejects out-of-range byWeekday entries', () => {
    for (const byWeekday of [[0], [8], [2.5]]) {
      expect(() => recurrence(start, { frequency: 'daily', interval: 1, byWeekday })).toThrow(/byWeekday entries must be ISO weekdays/);
    }
  });

  it('rejects out-of-range byMonth entries', () => {
    for (const byMonth of [[0], [13]]) {
      expect(() => recurrence(start, { frequency: 'yearly', interval: 1, byMonth })).toThrow(/byMonth entries must be months 1 through 12/);
    }
  });

  it('rejects out-of-range byWeekdayOrdinal entries', () => {
    const bad = [
      { ordinal: 0, weekday: 1 },
      { ordinal: 54, weekday: 1 },
      { ordinal: -54, weekday: 1 },
      { ordinal: 2, weekday: 0 },
      { ordinal: 2, weekday: 8 },
    ];
    for (const byWeekdayOrdinal of bad) {
      expect(() => recurrence(start, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [byWeekdayOrdinal] })).toThrow(/byWeekdayOrdinal entries/);
    }
  });
});

describe('recurrence frequencies and intervals', () => {
  it('steps by interval at every frequency granularity', () => {
    const d0 = Temporal.PlainDate.from('2026-01-01');
    expect(take(recurrence(d0, { frequency: 'daily', interval: 2 }), 3).map(iso))
      .toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
    expect(take(recurrence(d0, { frequency: 'weekly', interval: 1 }), 3).map(iso))
      .toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    // byWeekday: [] behaves like no BYDAY filter (no daywise stepping)
    expect(take(recurrence(d0, { frequency: 'weekly', interval: 1, byWeekday: [] }), 2).map(iso))
      .toEqual(['2026-01-01', '2026-01-08']);
    expect(take(recurrence(d0, { frequency: 'weekly', interval: 2 }), 3).map(iso))
      .toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-15'), { frequency: 'monthly', interval: 1 }), 3).map(iso))
      .toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-15'), { frequency: 'monthly', interval: 3 }), 3).map(iso))
      .toEqual(['2026-01-15', '2026-04-15', '2026-07-15']);
    expect(take(recurrence(Temporal.PlainDate.from('2026-08-04'), { frequency: 'yearly', interval: 1 }), 3).map(iso))
      .toEqual(['2026-08-04', '2027-08-04', '2028-08-04']);
    expect(take(recurrence(Temporal.PlainDate.from('2026-08-04'), { frequency: 'yearly', interval: 4 }), 3).map(iso))
      .toEqual(['2026-08-04', '2030-08-04', '2034-08-04']);
    const t0 = dt('2026-01-01T09:30:15');
    expect(take(recurrence(t0, { frequency: 'hourly', interval: 1 }), 3).map(isoDateTime))
      .toEqual(['2026-01-01T09:30:15', '2026-01-01T10:30:15', '2026-01-01T11:30:15']);
    expect(take(recurrence(t0, { frequency: 'minutely', interval: 1 }), 3).map(isoDateTime))
      .toEqual(['2026-01-01T09:30:15', '2026-01-01T09:31:15', '2026-01-01T09:32:15']);
    expect(take(recurrence(t0, { frequency: 'secondly', interval: 1 }), 3).map(isoDateTime))
      .toEqual(['2026-01-01T09:30:15', '2026-01-01T09:30:16', '2026-01-01T09:30:17']);
  });

  it('keeps the anchor day-of-month and skips months that lack it (no clamping drift)', () => {
    // Jan 31 anchor: Feb (28) and Apr (30) are skipped, not clamped.
    const start = Temporal.PlainDate.from('2026-01-31');
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1 }), 3).map(iso))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('iterates across a DST spring-forward from a ZonedDateTime start (wall-clock stable)', () => {
    // 2026-03-08 is the US spring-forward; field-based stepping keeps the wall clock.
    const zdt = Temporal.ZonedDateTime.from('2026-03-07T09:00:00-05:00[America/New_York]');
    const out = take(recurrence(zdt, { frequency: 'daily', interval: 1, count: 3 }), 5);
    expect(out.map(iso)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });
});

describe('recurrence BYDAY (weekly)', () => {
  it('advances a non-matching start day-by-day to the next BYDAY weekday', () => {
    // 2026-01-05 is a Monday; BYDAY=SA → first Saturday is 2026-01-10.
    const start = Temporal.PlainDate.from('2026-01-05');
    expect(take(recurrence(start, { frequency: 'weekly', interval: 1, byWeekday: [6] }), 3).map(iso))
      .toEqual(['2026-01-10', '2026-01-17', '2026-01-24']);
  });

  it('honors interval > 1 by gating BYDAY matches to every Nth week from the anchor', () => {
    const start = Temporal.PlainDate.from('2026-01-01'); // Thursday
    expect(take(recurrence(start, { frequency: 'weekly', interval: 2, byWeekday: [4] }), 3).map(iso))
      .toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
  });

  it('seeds dayOfWeek for a plain field-bag start so BYDAY rules can match it', () => {
    // A bag start has no dayOfWeek getter — recurrence() derives it once (2026-01-01 = Thursday).
    const bagStart = { year: 2026, month: 1, day: 1 };
    expect(take(recurrence(bagStart, { frequency: 'weekly', interval: 1, byWeekday: [4] }), 3).map(iso))
      .toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });
});

describe('recurrence monthly BY* expansion', () => {
  const start = Temporal.PlainDate.from('2026-01-01');

  it('BYMONTHDAY generates the listed days each month, in order', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay: [15] }), 3).map(iso))
      .toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('negative BYMONTHDAY counts back from the end of the month', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay: [-1] }), 3).map(iso))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('BYMONTHDAY days that do not exist in a month are skipped, positive or negative', () => {
    // February 2026 has 28 days: 30/31 overflow it, and -30 resolves to -1.
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay: [30, 31] }), 4).map(iso))
      .toEqual(['2026-01-30', '2026-01-31', '2026-03-30', '2026-03-31']);
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay: [-30] }), 4).map(iso))
      .toEqual(['2026-01-02', '2026-03-02', '2026-04-01', '2026-05-02']);
  });

  it('mixed positive/negative BYMONTHDAY days sort chronologically inside the month', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byMonthDay: [-1, 15] }), 4).map(iso))
      .toEqual(['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28']);
  });

  it('daily frequency + BYMONTHDAY filters candidates through matches()', () => {
    expect(take(recurrence(start, { frequency: 'daily', interval: 1, byMonthDay: [15] }), 2).map(iso))
      .toEqual(['2026-01-15', '2026-02-15']);
  });

  it('daily frequency + BYMONTH filters out the months not listed', () => {
    // take() collects occurrences, not candidates: February and April never appear.
    const out = take(recurrence(start, { frequency: 'daily', interval: 1, byMonth: [1, 3] }), 65);
    expect(out).toHaveLength(65); // unbounded rule: every requested occurrence exists
    expect(iso(out[30])).toBe('2026-01-31');
    expect(iso(out[31])).toBe('2026-03-01'); // February was filtered out
    expect(iso(out[61])).toBe('2026-03-31');
    // Apr–Dec 2026 are all filtered out too — the next allowed month is Jan 2027.
    expect(iso(out[62])).toBe('2027-01-01');
    expect(iso(out[64])).toBe('2027-01-03');
  });

  it('ordinal BYDAY (2MO) yields the 2nd Monday of each month', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] }), 3).map(iso))
      .toEqual(['2026-01-12', '2026-02-09', '2026-03-09']);
  });

  it('negative ordinal BYDAY (-1FR) yields the last Friday of each month', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: -1, weekday: 5 }] }), 3).map(iso))
      .toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
  });

  it('an ordinal with no instance in a month (5MO in a 4-Monday month) skips that month', () => {
    // Jan/Feb/Apr/May 2026 have only 4 Mondays; Mar and Jun have 5.
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: 5, weekday: 1 }] }), 2).map(iso))
      .toEqual(['2026-03-30', '2026-06-29']);
  });

  it('a start that fails the ordinal check advances to the first ordinal match', () => {
    // Jan 5 2026 is a Monday but NOT the 2nd Monday → first match is Jan 12.
    const monday = Temporal.PlainDate.from('2026-01-05');
    expect(take(recurrence(monday, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] }), 1).map(iso))
      .toEqual(['2026-01-12']);
  });

  it('plain BYDAY entries combine with ordinal entries in monthly context', () => {
    const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, byWeekday: [1], byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] };
    expect(take(recurrence(start, rule), 3).map(iso)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('an empty byWeekday array with ordinal entries still matches the ordinal', () => {
    const rule: RecurrenceRule = { frequency: 'monthly', interval: 1, byWeekday: [], byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] };
    expect(take(recurrence(start, rule), 2).map(iso)).toEqual(['2026-01-12', '2026-02-09']);
  });

  it('plain BYDAY in monthly context expands to every matching weekday of the month', () => {
    expect(take(recurrence(start, { frequency: 'monthly', interval: 1, byWeekday: [1, 3] }), 3).map(iso))
      .toEqual(['2026-01-05', '2026-01-07', '2026-01-12']);
  });

  it('a monthly rule no month can satisfy exhausts via the safety cap instead of spinning forever', () => {
    // BYDAY=-6MO: the 6th-from-last Monday needs day ≥ 36 — impossible in any month.
    const iter = recurrence(start, { frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: -6, weekday: 1 }] });
    expect(take(iter, 3)).toEqual([]);
    expect(iter.next()).toEqual({ value: undefined, done: true });
  });
});

describe('recurrence yearly BY* expansion', () => {
  const start = Temporal.PlainDate.from('2026-01-01');

  it('yearly + BYMONTH searches the listed months (sorted) each year', () => {
    // Anchor day 15; 2026's Jan/Mar candidates precede the May 15 start.
    const may = Temporal.PlainDate.from('2026-05-15');
    expect(take(recurrence(may, { frequency: 'yearly', interval: 1, byMonth: [3, 1] }), 2).map(iso))
      .toEqual(['2027-01-15', '2027-03-15']);
  });

  it('yearly + BYMONTHDAY generates the day in the anchor month', () => {
    const aug = Temporal.PlainDate.from('2026-08-04');
    expect(take(recurrence(aug, { frequency: 'yearly', interval: 1, byMonthDay: [15] }), 2).map(iso))
      .toEqual(['2026-08-15', '2027-08-15']);
  });

  it('yearly + plain BYDAY expands every matching weekday of the anchor month', () => {
    const aug = Temporal.PlainDate.from('2026-08-04');
    expect(take(recurrence(aug, { frequency: 'yearly', interval: 1, byWeekday: [1] }), 3).map(iso))
      .toEqual(['2026-08-10', '2026-08-17', '2026-08-24']);
  });

  it('yearly ordinal BYDAY ranks across the whole year when BYMONTH is absent (20MO)', () => {
    const mixed: RecurrenceRule = {
      frequency: 'yearly', interval: 1,
      byWeekday: [1], byWeekdayOrdinal: [{ ordinal: 20, weekday: 1 }],
    };
    expect(take(recurrence(start, mixed), 2).map(iso)).toEqual(['2026-01-05', '2026-01-12']);
    expect(take(recurrence(start, { frequency: 'yearly', interval: 1, byWeekdayOrdinal: [{ ordinal: 20, weekday: 1 }] }), 1).map(iso))
      .toEqual(['2026-05-18']);
  });

  it('negative yearly ordinal BYDAY (-1FR) is the last Friday of the year', () => {
    expect(take(recurrence(start, { frequency: 'yearly', interval: 1, byWeekdayOrdinal: [{ ordinal: -1, weekday: 5 }] }), 2).map(iso))
      .toEqual(['2026-12-25', '2027-12-31']);
  });

  it('a 53rd weekday only occurs in years that have 53 of that weekday', () => {
    // 2026 has 53 Thursdays; the next 53rd Monday after the anchor year is in 2029.
    const thu = recurrence(start, { frequency: 'yearly', interval: 1, byWeekdayOrdinal: [{ ordinal: 53, weekday: 4 }] });
    expect(take(thu, 1).map(iso)).toEqual(['2026-12-31']);
    const mon = recurrence(start, { frequency: 'yearly', interval: 1, byWeekdayOrdinal: [{ ordinal: 53, weekday: 1 }] });
    expect(take(mon, 1).map(iso)).toEqual(['2029-12-31']);
    // In a 53-Monday year, -53MO is the first Monday of that year.
    const neg = recurrence(start, { frequency: 'yearly', interval: 1, byWeekdayOrdinal: [{ ordinal: -53, weekday: 1 }] });
    expect(take(neg, 1).map(iso)).toEqual(['2029-01-01']);
  });

  it('yearly + BYMONTH + ordinal BYDAY ranks within the listed month only', () => {
    const rule: RecurrenceRule = { frequency: 'yearly', interval: 1, byMonth: [5], byWeekdayOrdinal: [{ ordinal: 1, weekday: 1 }] };
    expect(take(recurrence(start, rule), 2).map(iso)).toEqual(['2026-05-04', '2027-05-03']);
  });
});

describe('recurrence count / until bounds', () => {
  it('count: 1 ends the iterator right after the matching start', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 1 });
    expect(take(iter, 5).map(iso)).toEqual(['2026-01-01']);
    expect(iter.next().done).toBe(true);
  });

  it('count ends the iterator when the first match comes from an advance', () => {
    // Monday start doesn't match BYDAY=TH → first next() advances to Jan 8 and hits count.
    const iter = recurrence(Temporal.PlainDate.from('2026-01-05'), { frequency: 'daily', interval: 1, count: 1, byWeekday: [4] });
    expect(take(iter, 3).map(iso)).toEqual(['2026-01-08']);
  });

  it('count ends the iterator in the steady state', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 3 });
    expect(take(iter, 5).map(iso)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(iter.next().done).toBe(true);
  });

  it('until stops the iterator once a candidate passes the bound', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, until: Temporal.PlainDate.from('2026-01-03') };
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), rule), 5).map(iso))
      .toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('until before the start ends the iterator immediately (the start itself is beyond until)', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, until: Temporal.PlainDate.from('2025-12-31') };
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), rule);
    expect(take(iter, 3)).toEqual([]);
  });

  it('until also bounds weekly BYDAY and monthly BYMONTHDAY stepping', () => {
    const weekly: RecurrenceRule = { frequency: 'weekly', interval: 1, byWeekday: [4], until: Temporal.PlainDate.from('2026-01-15') };
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), weekly), 5).map(iso))
      .toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    const monthly: RecurrenceRule = { frequency: 'monthly', interval: 1, byMonthDay: [15], until: Temporal.PlainDate.from('2026-02-15') };
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), monthly), 5).map(iso))
      .toEqual(['2026-01-15', '2026-02-15']);
  });

  it('a parsed RRULE UNTIL (date or UTC date-time form) bounds iteration', () => {
    const dateOnly = parseRRule('FREQ=DAILY;UNTIL=20260103');
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), dateOnly), 5).map(iso))
      .toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    const dateTime = parseRRule('FREQ=HOURLY;UNTIL=20260101T110000Z');
    expect(take(recurrence(dt('2026-01-01T09:30:15'), dateTime), 5).map(isoDateTime))
      .toEqual(['2026-01-01T09:30:15', '2026-01-01T10:30:15']);
  });
});

describe('recurrence exDates', () => {
  it('skips excluded dates even when they match the rule', () => {
    const rule: RecurrenceRule = {
      frequency: 'daily',
      interval: 1,
      count: 3,
      exDates: [Temporal.PlainDate.from('2026-01-02')],
    };
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), rule), 5).map(iso))
      .toEqual(['2026-01-01', '2026-01-03', '2026-01-04']);
  });
});

describe('recurrence previous() history', () => {
  it('returns done with no history, then walks back through yielded values', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1 });
    expect(iter.previous()).toEqual({ value: undefined, done: true });
    expect(iso(iter.next().value)).toBe('2026-01-01');
    expect(iso(iter.next().value)).toBe('2026-01-02');
    expect(iso(iter.previous().value)).toBe('2026-01-02');
    expect(iso(iter.previous().value)).toBe('2026-01-01');
    expect(iter.previous()).toEqual({ value: undefined, done: true });
  });

  it('caps the history ring buffer at 10,000 entries', () => {
    const iter = recurrence(dt('2026-01-01T00:00:00'), { frequency: 'secondly', interval: 1 });
    for (let i = 0; i < 10_001; i++) iter.next();
    // 10,001 yields → history holds the last 10,000; most recent is +10,000s.
    expect(isoDateTime(iter.previous().value)).toBe('2026-01-01T02:46:40');
  });
});

describe('take / skip / between extras', () => {
  it('take stops early when the iterator is exhausted', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 3 });
    expect(take(iter, 5)).toHaveLength(3);
  });

  it('skip breaks out of the skip phase when the iterator ends first', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 3 });
    expect(skip(iter, 10)).toEqual([]);
  });

  it('skip(0) returns the remaining occurrences of a bounded rule', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 3 });
    expect(skip(iter, 0).map(iso)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('skip throws when asked to skip more than 1,000,000 occurrences', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1 });
    expect(() => skip(iter, 1_000_001)).toThrow(/not a bounded operation/);
  }, 60_000);

  it('skip throws when the rule keeps producing past 100,000 collected occurrences', () => {
    const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 100_000 });
    expect(() => skip(iter, 0)).toThrow(/collected 100000 occurrences/);
  }, 60_000);

  it('between stops at iterator exhaustion before rangeEnd', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, count: 2 };
    const out = between(
      Temporal.PlainDate.from('2026-01-01'), rule,
      Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'),
    );
    expect(out.map(iso)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('between throws rather than walking unboundedly toward a far rangeEnd', () => {
    const rule: RecurrenceRule = { frequency: 'secondly', interval: 1 };
    expect(() => between(
      dt('2026-01-01T00:00:00'), rule,
      Temporal.PlainDate.from('2026-06-01'), Temporal.PlainDate.from('2026-07-01'),
    )).toThrow(/walked more than 1000000/);
  }, 60_000);
});

describe('parseRRule extras', () => {
  it('parses a full rule with every supported part', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;COUNT=10;UNTIL=20260630;BYDAY=MO,2TU,-1FR;BYMONTHDAY=15,-1;BYMONTH=1,3')).toEqual({
      frequency: 'monthly',
      interval: 2,
      count: 10,
      until: { year: 2026, month: 6, day: 30, hour: undefined, minute: undefined, second: undefined },
      byWeekday: [1],
      byWeekdayOrdinal: [{ ordinal: 2, weekday: 2 }, { ordinal: -1, weekday: 5 }],
      byMonthDay: [15, -1],
      byMonth: [1, 3],
    });
  });

  it('strips the RRULE: prefix, uppercases, trims, and defaults to daily/1', () => {
    expect(parseRRule('  rrule:freq=daily;count=2  ')).toEqual({ frequency: 'daily', interval: 1, count: 2 });
    expect(parseRRule('')).toEqual({ frequency: 'daily', interval: 1 });
  });

  it('ignores empty segments, segments without "=", and unknown parts', () => {
    expect(parseRRule('FREQ=DAILY;;COUNT')).toEqual({ frequency: 'daily', interval: 1 });
    expect(parseRRule('FREQ=DAILY;BYSETPOS=1;WKST=MO;COUNT=2')).toEqual({ frequency: 'daily', interval: 1, count: 2 });
  });

  it('rejects an unsupported frequency', () => {
    expect(() => parseRRule('FREQ=BOGUS')).toThrow(/unsupported RRULE frequency/);
  });

  it('rejects invalid INTERVAL and COUNT values', () => {
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=0')).toThrow(/INTERVAL must be a positive safe integer/);
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=2.5')).toThrow(/INTERVAL must be a positive safe integer/);
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=abc')).toThrow(/INTERVAL must be a positive safe integer/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=0')).toThrow(/COUNT must be a positive safe integer/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=-3')).toThrow(/COUNT must be a positive safe integer/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=x')).toThrow(/COUNT must be a positive safe integer/);
  });

  it('parses UNTIL in date and UTC date-time form (with or without Z)', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20260110').until)
      .toEqual({ year: 2026, month: 1, day: 10, hour: undefined, minute: undefined, second: undefined });
    expect(parseRRule('FREQ=DAILY;UNTIL=20240110T153000Z').until)
      .toEqual({ year: 2024, month: 1, day: 10, hour: 15, minute: 30, second: 0 });
    expect(parseRRule('FREQ=DAILY;UNTIL=20240110T153000').until)
      .toEqual({ year: 2024, month: 1, day: 10, hour: 15, minute: 30, second: 0 });
    // whitespace inside the UNTIL value is trimmed
    expect(parseRRule('FREQ=DAILY;UNTIL= 20260110').until).toMatchObject({ year: 2026, month: 1, day: 10 });
  });

  it('rejects malformed and out-of-range UNTIL values', () => {
    expect(() => parseRRule('FREQ=DAILY;UNTIL=JUNK')).toThrow(/UNTIL must be a date/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20261301')).toThrow(/out-of-range date/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20260132')).toThrow(/out-of-range date/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20260110T245900Z')).toThrow(/out-of-range time/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20260110T236000Z')).toThrow(/out-of-range time/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=20260110T235960Z')).toThrow(/out-of-range time/);
  });

  it('parses BYDAY plain, signed, and two-digit ordinals', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO')).toEqual({ frequency: 'monthly', interval: 1, byWeekday: [1] });
    expect(parseRRule('FREQ=MONTHLY;BYDAY=53MO,+2TU')).toEqual({
      frequency: 'monthly',
      interval: 1,
      byWeekday: [],
      byWeekdayOrdinal: [{ ordinal: 53, weekday: 1 }, { ordinal: 2, weekday: 2 }],
    });
  });

  it('rejects invalid BYDAY tokens and out-of-range ordinals', () => {
    expect(() => parseRRule('FREQ=DAILY;BYDAY=XX')).toThrow(/invalid weekday/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=MOX')).toThrow(/invalid weekday/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=5')).toThrow(/invalid weekday/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=54MO')).toThrow(/ordinal out of range/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=0MO')).toThrow(/ordinal out of range/);
  });

  it('rejects out-of-range BYMONTHDAY and BYMONTH values', () => {
    for (const v of ['0', '32', '-32', '1.5']) {
      expect(() => parseRRule(`FREQ=MONTHLY;BYMONTHDAY=${v}`)).toThrow(/BYMONTHDAY contains an out-of-range value/);
    }
    for (const v of ['0', '13']) {
      expect(() => parseRRule(`FREQ=YEARLY;BYMONTH=${v}`)).toThrow(/BYMONTH contains an out-of-range value/);
    }
  });

  it('drives a recurrence iterator directly (RRULE → occurrences)', () => {
    const rule = parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=3');
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-01'), rule), 10).map(iso))
      .toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
    const weekly = parseRRule('FREQ=WEEKLY;BYDAY=SA');
    expect(take(recurrence(Temporal.PlainDate.from('2026-01-05'), weekly), 2).map(iso))
      .toEqual(['2026-01-10', '2026-01-17']);
  });
});

describe('formatRRule extras', () => {
  it('omits interval when the rule does not carry one (programmatic rule)', () => {
    expect(formatRRule({ frequency: 'daily' } as unknown as RecurrenceRule)).toBe('FREQ=DAILY');
  });

  it('renders count, until, and the BYMONTHDAY/BYMONTH parts', () => {
    expect(formatRRule({ frequency: 'daily', interval: 1, count: 5, until: Temporal.PlainDate.from('2026-06-30') }))
      .toBe('FREQ=DAILY;COUNT=5;UNTIL=2026-06-30');
    expect(formatRRule({ frequency: 'monthly', interval: 2, byMonthDay: [15, -1], byMonth: [1, 3] }))
      .toBe('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15,-1;BYMONTH=1,3');
  });

  it('merges plain and ordinal BYDAY into one part, or emits ordinals alone', () => {
    expect(formatRRule({
      frequency: 'monthly', interval: 1, byWeekday: [1, 3], byWeekdayOrdinal: [{ ordinal: -1, weekday: 5 }],
    })).toBe('FREQ=MONTHLY;BYDAY=MO,WE,-1FR');
    expect(formatRRule({
      frequency: 'monthly', interval: 1, byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }, { ordinal: -1, weekday: 5 }],
    })).toBe('FREQ=MONTHLY;BYDAY=2MO,-1FR');
    // A non-ISO weekday code in the plain list must fall back to the raw
    // number inside the MERGED BYDAY rendering too (the ?? String(d) arm
    // on the merge line itself).
    expect(formatRRule({
      frequency: 'daily', interval: 1, byWeekday: [9], byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }],
    })).toBe('FREQ=DAILY;BYDAY=9,2MO');
  });

  it('falls back to the raw number for non-ISO weekday codes', () => {
    // WEEKDAY_NAMES has no entry for 9/8 — the ?? fallback emits the number itself.
    expect(formatRRule({ frequency: 'daily', interval: 1, byWeekday: [9] })).toBe('FREQ=DAILY;BYDAY=9');
    expect(formatRRule({ frequency: 'daily', interval: 1, byWeekdayOrdinal: [{ ordinal: 3, weekday: 8 }] })).toBe('FREQ=DAILY;BYDAY=38');
  });

  it('round-trips through parseRRule', () => {
    const rule: RecurrenceRule = {
      frequency: 'monthly', interval: 2, count: 10,
      byWeekday: [1, 3], byWeekdayOrdinal: [{ ordinal: -1, weekday: 5 }],
      byMonthDay: [15, -1], byMonth: [1, 3],
    };
    expect(parseRRule(formatRRule(rule))).toEqual(rule);
  });
});
