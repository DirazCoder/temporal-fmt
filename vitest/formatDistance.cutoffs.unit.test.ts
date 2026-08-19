import { describe, expect, it } from 'vitest';
import { formatDistance } from '../src/formatDistance.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Unit tests for the cutoffs option on formatDistance. node --test
// (test/formatDistance.cutoffs.test.js) covers the public API.
// These go straight at src/ so a regression in resolveCutoffs (a
// wrong boundary check, a missing validation) surfaces with the
// actual cutoff state in the failure message rather than as a
// confusing "5 days" output three layers up.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

function date(year: number, month: number, day: number) {
  return Temporal.PlainDate.from({ year, month, day });
}
function dateTime(year: number, month: number, day: number, hour: number, minute = 0, second = 0, millisecond = 0) {
  return Temporal.PlainDateTime.from({ year, month, day, hour, minute, second, millisecond });
}

describe('formatDistance cutoffs: default-path regression', () => {
  it('default cutoffs (no `cutoffs` option) match pre-change behavior for every boundary', () => {
    const today = date(2026, 8, 4);
    // <60s → seconds
    expect(formatDistance(dateTime(2026, 8, 4, 12, 0, 30), dateTime(2026, 8, 4, 12, 0, 0), { numeric: 'always' })).toBe('in 30 seconds');
    // <60min → minutes
    expect(formatDistance(dateTime(2026, 8, 4, 12, 30), dateTime(2026, 8, 4, 12, 0), { numeric: 'always' })).toBe('in 30 minutes');
    // <24h → hours
    expect(formatDistance(dateTime(2026, 8, 4, 14), dateTime(2026, 8, 4, 12), { numeric: 'always' })).toBe('in 2 hours');
    // <30d → days
    expect(formatDistance(date(2026, 8, 14), today, { numeric: 'always' })).toBe('in 10 days');
    // >=30d <365d → months
    expect(formatDistance(date(2026, 9, 3), today, { numeric: 'always' })).toMatch(/month/);
    // >=365d → years
    expect(formatDistance(date(2027, 8, 4), today, { numeric: 'always' })).toMatch(/year/);
  });
});

describe('formatDistance cutoffs: individual boundary overrides', () => {
  it('`seconds` override moves the seconds→minutes boundary', () => {
    const t1 = dateTime(2026, 8, 4, 12, 0, 45);
    const t2 = dateTime(2026, 8, 4, 12, 0, 0);
    // Default: 45s < 60s → seconds
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 45 seconds');
    // Override: 45s > 30s → minutes
    expect(formatDistance(t1, t2, { numeric: 'always', cutoffs: { seconds: 30 } })).toBe('in 1 minute');
  });

  it('`minutes` override moves the minutes→hours boundary', () => {
    const t1 = dateTime(2026, 8, 4, 12, 45);
    const t2 = dateTime(2026, 8, 4, 12, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 45 minutes');
    expect(formatDistance(t1, t2, { numeric: 'always', cutoffs: { minutes: 30 } })).toBe('in 1 hour');
  });

  it('`hours` override moves the hours→days boundary', () => {
    const t1 = dateTime(2026, 8, 5, 6);
    const t2 = dateTime(2026, 8, 4, 12);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 18 hours');
    expect(formatDistance(t1, t2, { numeric: 'always', cutoffs: { hours: 12 } })).toBe('in 1 day');
  });

  it('`days` override moves the days→months boundary', () => {
    const today = date(2026, 8, 4);
    const in14d = date(2026, 8, 18);
    expect(formatDistance(in14d, today, { numeric: 'always' })).toBe('in 14 days');
    expect(formatDistance(in14d, today, { numeric: 'always', cutoffs: { days: 7 } })).toMatch(/month/);
  });

  it('`months` override moves the months→years boundary', () => {
    const today = date(2026, 8, 4);
    const in200d = date(2027, 2, 22); // ~200 days
    expect(formatDistance(in200d, today, { numeric: 'always' })).toMatch(/month/);
    expect(formatDistance(in200d, today, { numeric: 'always', cutoffs: { months: 100 } })).toMatch(/year/);
  });
});

describe('formatDistance cutoffs: boundary edges', () => {
  it('exactly at a cutoff resolves to the next unit up (strict less-than)', () => {
    // 60000ms is NOT < 60000ms (default seconds cutoff), so it's minutes.
    const t1 = dateTime(2026, 8, 4, 12, 1, 0);
    const t2 = dateTime(2026, 8, 4, 12, 0, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 1 minute');

    // Just under: 59999ms → seconds, rounds to "60 seconds"
    const t3 = dateTime(2026, 8, 4, 12, 0, 59, 999);
    const t4 = dateTime(2026, 8, 4, 12, 0, 0);
    expect(formatDistance(t3, t4, { numeric: 'always' })).toBe('in 60 seconds');

    // Override: 90s cutoff means 60s is now seconds, not minutes.
    expect(formatDistance(t1, t2, { numeric: 'always', cutoffs: { seconds: 90 } })).toBe('in 60 seconds');
  });

  it('exactly at days→months cutoff (30d) resolves to months', () => {
    const today = date(2026, 8, 4);
    const in30d = date(2026, 9, 3); // 30 days later
    expect(formatDistance(in30d, today)).toMatch(/month/);
    // Just under: 29 days → days
    const in29d = date(2026, 9, 2);
    expect(formatDistance(in29d, today)).toMatch(/day/);
  });
});

describe('formatDistance cutoffs: validation', () => {
  it('throws on negative cutoffs', () => {
    for (const key of ['seconds', 'minutes', 'hours', 'days', 'months'] as const) {
      expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { [key]: -1 } }))
        .toThrow(new RegExp(`cutoff "${key}" must be a positive finite number \\(got -1\\)`));
    }
  });

  it('throws on zero cutoffs (must be strictly positive)', () => {
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: 0 } }))
      .toThrow(/cutoff "seconds" must be a positive finite number \(got 0\)/);
  });

  it('throws on NaN cutoffs', () => {
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: NaN } }))
      .toThrow(/cutoff "seconds" must be a positive finite number \(got NaN\)/);
  });

  it('throws on Infinity cutoffs (must be finite)', () => {
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: Infinity } }))
      .toThrow(/cutoff "seconds" must be a positive finite number \(got Infinity\)/);
  });

  it('throws on non-number cutoffs (e.g. a string)', () => {
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: '60' as unknown as number } }))
      .toThrow(/cutoff "seconds" must be a positive finite number/);
  });

  it('throws on non-monotonic cutoffs (seconds > minutes)', () => {
    // seconds=300 (5min), minutes=1 (1min). 300s > 1min, so the
    // seconds branch would always win and the minutes branch would be
    // unreachable.
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: 300, minutes: 1 } }))
      .toThrow(/non-decreasing in equivalent ms/);
  });

  it('non-monotonic error names all five cutoff values so the user can spot the inverted pair', () => {
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { cutoffs: { seconds: 300, minutes: 1 } }))
      .toThrow(/seconds=300s.*minutes=1min.*hours=24h.*days=30d.*months=365d/);
  });
});

describe('formatDistance cutoffs: option independence', () => {
  it('overriding cutoffs on one call does not bleed into subsequent calls', () => {
    const today = date(2026, 8, 4);
    const tomorrow = date(2026, 8, 5);
    formatDistance(tomorrow, today, { cutoffs: { seconds: 5 } });
    // Subsequent call with no cutoffs uses defaults.
    expect(formatDistance(tomorrow, today)).toBe('tomorrow');
    expect(formatDistance(dateTime(2026, 8, 4, 12, 0, 30), dateTime(2026, 8, 4, 12, 0, 0)))
      .toBe('in 30 seconds');
  });

  it('composes with locale and numeric options (orthogonal)', () => {
    const today = date(2026, 8, 4);
    const in10d = date(2026, 8, 14);
    expect(formatDistance(in10d, today, { locale: 'fr-FR' })).toBe('dans 10 jours');
    expect(formatDistance(in10d, today, { locale: 'fr-FR', cutoffs: { days: 7 } })).toMatch(/mois/);
    expect(formatDistance(in10d, today, { numeric: 'always', cutoffs: { days: 7 } })).toMatch(/month/);
  });
});
