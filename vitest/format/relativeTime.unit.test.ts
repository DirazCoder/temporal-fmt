import { afterEach, describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { formatRelative, formatRelativeToNow } from '../../src/format/relativeTime.js';
import { InvalidLocaleError } from '../../src/core/errors.js';

setTemporal(Temporal);

describe('formatRelative', () => {
  it('formats tomorrow using the day bucket', () => {
    const today = Temporal.PlainDate.from('2026-08-04');
    const tomorrow = today.add({ days: 1 });
    expect(formatRelative(tomorrow, today)).toMatch(/(tomorrow|in 1 day|1 day)/i);
  });

  it('crosses into the week, month, and year buckets at their thresholds', () => {
    const today = Temporal.PlainDate.from('2026-08-04');
    expect(formatRelative(today.add({ days: 8 }), today)).toMatch(/week/i);
    expect(formatRelative(today.add({ days: 40 }), today)).toMatch(/month/i);
    expect(formatRelative(today.add({ days: 400 }), today)).toMatch(/year/i);
  });

  it('also buckets correctly in the past direction', () => {
    const today = Temporal.PlainDate.from('2026-08-04');
    expect(formatRelative(today.subtract({ days: 8 }), today)).toMatch(/week/i);
  });
});

describe('formatRelativeToNow', () => {
  it('returns a non-empty string', () => {
    const r = formatRelativeToNow(Temporal.Now.plainDateISO());
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// Coverage additions: exact bucket thresholds in both directions,
// options (numeric / locale), InvalidLocaleError wrapping, the rtf
// cache eviction branch, and formatRelativeToNow under a faked clock.

describe('formatRelative: exact bucket thresholds', () => {
  const today = Temporal.PlainDate.from('2026-08-04');

  it('same day hits the 0-day bucket ("today", numeric auto)', () => {
    expect(formatRelative(today, today)).toBe('today');
  });

  it('6 days stays in the day bucket in both directions', () => {
    expect(formatRelative(today.add({ days: 6 }), today)).toBe('in 6 days');
    expect(formatRelative(today.subtract({ days: 6 }), today)).toBe('6 days ago');
  });

  it('7 days crosses into the week bucket', () => {
    expect(formatRelative(today.add({ days: 7 }), today)).toBe('next week');
  });

  it('29 days rounds to 4 weeks, 30 days crosses into the month bucket (both directions)', () => {
    expect(formatRelative(today.add({ days: 29 }), today)).toBe('in 4 weeks');
    expect(formatRelative(today.subtract({ days: 29 }), today)).toBe('4 weeks ago');
    expect(formatRelative(today.add({ days: 30 }), today)).toBe('next month');
    expect(formatRelative(today.subtract({ days: 30 }), today)).toBe('last month');
  });

  it('364 days rounds to 12 months, 365 days crosses into the year bucket (both directions)', () => {
    expect(formatRelative(today.add({ days: 364 }), today)).toBe('in 12 months');
    expect(formatRelative(today.subtract({ days: 364 }), today)).toBe('12 months ago');
    expect(formatRelative(today.add({ days: 365 }), today)).toBe('next year');
    expect(formatRelative(today.subtract({ days: 365 }), today)).toBe('last year');
  });
});

describe('formatRelative: options', () => {
  const today = Temporal.PlainDate.from('2026-08-04');

  it('numeric: "always" forces the always-numeric style', () => {
    expect(formatRelative(today, today, { numeric: 'always' })).toBe('in 0 days');
    expect(formatRelative(today.add({ days: 2 }), today, { numeric: 'always' })).toBe('in 2 days');
  });

  it('locale option routes through Intl (fr)', () => {
    expect(formatRelative(today.add({ days: 8 }), today, { locale: 'fr-FR' })).toBe('la semaine prochaine');
  });

  it('wraps a malformed locale tag in InvalidLocaleError', () => {
    let caught: unknown;
    try {
      formatRelative(today, today, { locale: 'not a locale!' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InvalidLocaleError);
    expect((caught as InvalidLocaleError).code).toBe('INVALID_LOCALE');
    expect((caught as InvalidLocaleError).actual).toBe('not a locale!');
    expect((caught as InvalidLocaleError).reason).toMatch(/locale|language tag/i);
  });
});

describe('formatRelative: rtf cache eviction', () => {
  it('evicts the oldest cached formatter past 100 entries', () => {
    const today = Temporal.PlainDate.from('2026-08-04');
    const tomorrow = today.add({ days: 1 });
    // 110 distinct locales × 2 numeric modes = 220 cache keys, well past
    // MAX_RTF_CACHE_SIZE (100) — the 101st insertion takes the eviction
    // branch. en-1XX are all structurally-valid BCP-47 numeric regions.
    for (let i = 0; i < 110; i++) {
      const locale = `en-1${String(i).padStart(2, '0')}`;
      expect(typeof formatRelative(tomorrow, today, { locale })).toBe('string');
      expect(typeof formatRelative(tomorrow, today, { locale, numeric: 'always' })).toBe('string');
    }
  });
});

describe('formatRelativeToNow (faked system clock)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the current date as the reference date', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 4, 12, 0, 0) });
    // Derive "today" from the same local-date fields the implementation
    // reads, so the assertion holds in any machine timezone.
    const now = new Date();
    const today = Temporal.PlainDate.from({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
    expect(formatRelativeToNow(today)).toBe('today');
    expect(formatRelativeToNow(today.add({ days: 1 }))).toBe('tomorrow');
    expect(formatRelativeToNow(today.subtract({ days: 2 }))).toBe('2 days ago');
  });

  it('passes options through to formatRelative', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 4, 12, 0, 0) });
    const now = new Date();
    const today = Temporal.PlainDate.from({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
    expect(formatRelativeToNow(today, { numeric: 'always' })).toBe('in 0 days');
  });
});
