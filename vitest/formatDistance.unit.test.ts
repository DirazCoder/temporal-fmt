import { describe, expect, it } from 'vitest';
import { formatDistance } from '../src/formatDistance.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

// node --test exercises formatDistance end-to-end at the public-API
// level. These go straight at the source so a wrong unit-selection
// cutoff or bad rounding surfaces as a formatDistance failure rather
// than as a wrong string three layers up.

function date(year: number, month: number, day: number) {
  return Temporal.PlainDate.from({ year, month, day });
}
function dateTime(year: number, month: number, day: number, hour: number, minute = 0, second = 0, millisecond = 0) {
  return Temporal.PlainDateTime.from({ year, month, day, hour, minute, second, millisecond });
}

describe('formatDistance: numeric auto', () => {
  it('returns "now" for equal dates', () => {
    expect(formatDistance(date(2026, 8, 4), date(2026, 8, 4))).toBe('now');
  });

  it('returns "yesterday"/"tomorrow" for ±1 day with numeric:auto', () => {
    const today = date(2026, 8, 4);
    expect(formatDistance(date(2026, 8, 5), today)).toBe('tomorrow');
    expect(formatDistance(date(2026, 8, 3), today)).toBe('yesterday');
  });
});

describe('formatDistance: numeric always', () => {
  it('forces "in 0 seconds" for equal dates', () => {
    expect(formatDistance(date(2026, 8, 4), date(2026, 8, 4), { numeric: 'always' })).toBe('in 0 seconds');
  });

  it('forces "in 1 day" / "1 day ago" for ±1 day', () => {
    const today = date(2026, 8, 4);
    expect(formatDistance(date(2026, 8, 5), today, { numeric: 'always' })).toBe('in 1 day');
    expect(formatDistance(date(2026, 8, 3), today, { numeric: 'always' })).toBe('1 day ago');
  });
});

describe('formatDistance: unit selection cutoffs', () => {
  // cutoffs per README: <60s seconds, <60min minutes, <24h hours,
  // <30d days, <365d months, else years
  it('<60s resolves to seconds', () => {
    const t1 = dateTime(2026, 8, 4, 12, 0, 30);
    const t2 = dateTime(2026, 8, 4, 12, 0, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 30 seconds');
  });

  it('<60min resolves to minutes', () => {
    const t1 = dateTime(2026, 8, 4, 12, 30);
    const t2 = dateTime(2026, 8, 4, 12, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 30 minutes');
  });

  it('<24h resolves to hours', () => {
    const t1 = dateTime(2026, 8, 4, 14);
    const t2 = dateTime(2026, 8, 4, 12);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 2 hours');
  });

  it('<30d resolves to days', () => {
    const today = date(2026, 8, 4);
    const in10 = date(2026, 8, 14);
    expect(formatDistance(in10, today, { numeric: 'always' })).toBe('in 10 days');
  });
});

describe('formatDistance: direction', () => {
  it('positive diff → future, negative diff → past', () => {
    const today = date(2026, 8, 4);
    const future = date(2026, 8, 7);
    const past = date(2026, 8, 1);
    expect(formatDistance(future, today)).toBe('in 3 days');
    expect(formatDistance(past, today)).toBe('3 days ago');
    // swapping flips the direction
    expect(formatDistance(today, future)).toBe('3 days ago');
    expect(formatDistance(today, past)).toBe('in 3 days');
  });
});

describe('formatDistance: locales', () => {
  it('localizes via Intl.RelativeTimeFormat', () => {
    const today = date(2026, 8, 4);
    const tomorrow = date(2026, 8, 5);
    expect(formatDistance(tomorrow, today, { locale: 'fr-FR' })).toBe('demain');
    expect(formatDistance(tomorrow, today, { locale: 'ja-JP' })).toBe('明日');
  });
});

describe('formatDistance: input validation', () => {
  it('throws on non-Temporal values', () => {
    expect(() => formatDistance(null, date(2026, 8, 4))).toThrow(/expects Temporal values/);
    expect(() => formatDistance('2026-08-04', date(2026, 8, 4))).toThrow(/expects Temporal values/);
  });

  it('throws on PlainTime (no date anchor)', () => {
    const time = Temporal.PlainTime.from('15:45:00');
    expect(() => formatDistance(time, time)).toThrow(/year\/month\/day|Temporal values/);
  });

  it('throws on partial date shape', () => {
    expect(() => formatDistance({ year: 2026 }, { year: 2026, month: 8, day: 4 })).toThrow(/partial date/);
  });
});

describe('formatDistance: mixed PlainDate + PlainDateTime', () => {
  it('treats PlainDate as midnight when diffing against PlainDateTime', () => {
    const today = date(2026, 8, 4);
    const noon = dateTime(2026, 8, 4, 12);
    expect(formatDistance(noon, today, { numeric: 'always' })).toBe('in 12 hours');
    expect(formatDistance(today, noon, { numeric: 'always' })).toBe('12 hours ago');
  });
});
