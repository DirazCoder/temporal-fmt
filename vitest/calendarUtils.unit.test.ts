import { describe, expect, it } from 'vitest';
import { startOf, endOf } from '../src/calendarUtils.js';

// startOf/endOf reassign year/month/day but used to copy dayOfWeek
// straight from the input via `{ ...view }` without recomputing it.
// Any call that crosses a month or year boundary landed on the wrong
// weekday. Jan 1 2026 is a Thursday (ISO dayOfWeek 4) — picked here
// because it's a real boundary case, not a coincidence where the
// input's dayOfWeek happens to already be correct.

describe('startOf', () => {
  it('recomputes dayOfWeek when year boundary changes the date', () => {
    // Aug 4 2026 is a Tuesday (dayOfWeek 2).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = startOf(input, 'year');
    expect(result.year).toBe(2026);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(4); // Thursday, not the stale 2
  });

  it('recomputes dayOfWeek when month boundary changes the date', () => {
    // Aug 4 2026 is a Tuesday; Aug 1 2026 is a Saturday (dayOfWeek 6).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = startOf(input, 'month');
    expect(result.day).toBe(1);
    expect(result.dayOfWeek).toBe(6);
  });

  it('leaves dayOfWeek untouched when the unit does not change the date', () => {
    const input = { year: 2026, month: 8, day: 4, hour: 15, dayOfWeek: 2 };
    const result = startOf(input, 'hour');
    expect(result.dayOfWeek).toBe(2);
  });
});

describe('endOf', () => {
  it('recomputes dayOfWeek when year boundary changes the date', () => {
    // Dec 31 2026 is a Thursday (dayOfWeek 4).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = endOf(input, 'year');
    expect(result.month).toBe(12);
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(4);
  });

  it('recomputes dayOfWeek when month boundary changes the date', () => {
    // Aug 31 2026 is a Monday (dayOfWeek 1).
    const input = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = endOf(input, 'month');
    expect(result.day).toBe(31);
    expect(result.dayOfWeek).toBe(1);
  });

  it('handles a leap-year month-end correctly', () => {
    // Feb 29 2024 is a Thursday (dayOfWeek 4).
    const input = { year: 2024, month: 2, day: 10, dayOfWeek: 6 };
    const result = endOf(input, 'month');
    expect(result.day).toBe(29);
    expect(result.dayOfWeek).toBe(4);
  });
});
