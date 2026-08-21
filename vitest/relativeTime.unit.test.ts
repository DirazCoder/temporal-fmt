import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { formatRelative, formatRelativeToNow } from '../src/relativeTime.js';

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
