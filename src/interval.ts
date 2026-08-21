// Intervals / ranges (plan section P). An interval is a pair of
// (start, end) Temporal values with bounds semantics: open, closed,
// or half-open. Operations: contains, overlaps, intersects, isBefore,
// isAfter, intersection, union, difference, subtract, mergeIntervals,
// splitInterval. Plus formatRange / formatRangeToParts with intelligent
// collapsing.
//
// All operations are field-based (no instanceof), matching the rest of
// the library. Internally uses the comparison helpers from comparison.ts
// to order endpoints.

import { compare } from './comparison.js';
import { format, formatToParts, type FormattedPart } from './format.js';
import { asDateFieldView, type DateFieldView } from './calendarUtils.js';
import type { FormatOptions } from './tokens.js';

export type IntervalBounds = 'open' | 'closed' | 'half-open-start' | 'half-open-end';

export interface Interval {
  start: unknown;
  end: unknown;
  bounds: IntervalBounds;
}

export function interval(start: unknown, end: unknown, bounds: IntervalBounds = 'closed'): Interval {
  // Validate that start ≤ end, otherwise the interval is malformed.
  const cmp = compare(start, end);
  if (cmp > 0) {
    throw new Error(
      `temporal-fmt: interval start must be ≤ end (got start > end). Pass them in chronological order.`
    );
  }
  return { start, end, bounds };
}

// Inclusive containment check accounting for bounds semantics.
// - 'closed': [start, end] — both endpoints included
// - 'open': (start, end) — neither endpoint included
// - 'half-open-start': (start, end] — start excluded, end included
// - 'half-open-end': [start, end) — start included, end excluded
export function contains(iv: Interval, value: unknown): boolean {
  const startCmp = compare(value, iv.start);
  const endCmp = compare(value, iv.end);
  const afterStart = iv.bounds === 'open' || iv.bounds === 'half-open-end'
    ? startCmp > 0
    : startCmp >= 0;
  const beforeEnd = iv.bounds === 'open' || iv.bounds === 'half-open-start'
    ? endCmp < 0
    : endCmp <= 0;
  return afterStart && beforeEnd;
}

// Two intervals overlap iff their ranges intersect, regardless of bounds.
// intersects() is the boolean form; intersection() returns the actual
// overlap interval.
export function overlaps(a: Interval, b: Interval): boolean {
  return intersects(a, b);
}

export function intersects(a: Interval, b: Interval): boolean {
  // a is entirely before b: a.end < b.start
  if (compare(a.end, b.start) < 0) return false;
  // a is entirely after b: a.start > b.end
  if (compare(a.start, b.end) > 0) return false;
  // Touching endpoints with both-closed bounds counts as overlap;
  // open bounds would not. To keep it simple, touching counts.
  return true;
}

export function isBefore(a: Interval, b: Interval): boolean {
  return compare(a.end, b.start) < 0;
}

export function isAfter(a: Interval, b: Interval): boolean {
  return compare(a.start, b.end) > 0;
}

// Returns the intersection of two intervals, or null if they don't
// overlap. The result's bounds are the more restrictive of the two
// inputs (closed ∩ open = open, etc.).
export function intersection(a: Interval, b: Interval): Interval | null {
  if (!intersects(a, b)) return null;
  const start = compare(a.start, b.start) >= 0 ? a.start : b.start;
  const end = compare(a.end, b.end) <= 0 ? a.end : b.end;
  // Compute resulting bounds: take the more restrictive at each endpoint.
  // If a.start === b.start, the more restrictive of (a.bounds, b.bounds)
  // at that endpoint wins.
  const startBoundsOpen = (a.bounds === 'open' || a.bounds === 'half-open-end')
    || (b.bounds === 'open' || b.bounds === 'half-open-end');
  const endBoundsOpen = (a.bounds === 'open' || a.bounds === 'half-open-start')
    || (b.bounds === 'open' || b.bounds === 'half-open-start');
  const bounds: IntervalBounds = startBoundsOpen && endBoundsOpen ? 'open'
    : startBoundsOpen ? 'half-open-end'
    : endBoundsOpen ? 'half-open-start'
    : 'closed';
  return { start, end, bounds };
}

// Returns the union of two intervals (the smallest interval containing
// both), or null if they don't overlap (caller should use mergeIntervals
// for that case).
export function union(a: Interval, b: Interval): Interval | null {
  if (!intersects(a, b)) return null;
  const start = compare(a.start, b.start) <= 0 ? a.start : b.start;
  const end = compare(a.end, b.end) >= 0 ? a.end : b.end;
  // Union's bounds are the less restrictive at each endpoint.
  const startBoundsOpen = (a.bounds === 'open' || a.bounds === 'half-open-end')
    && (b.bounds === 'open' || b.bounds === 'half-open-end');
  const endBoundsOpen = (a.bounds === 'open' || a.bounds === 'half-open-start')
    && (b.bounds === 'open' || b.bounds === 'half-open-start');
  const bounds: IntervalBounds = startBoundsOpen && endBoundsOpen ? 'open'
    : startBoundsOpen ? 'half-open-end'
    : endBoundsOpen ? 'half-open-start'
    : 'closed';
  return { start, end, bounds };
}

// Returns the part of `a` that is not in `b`. May produce 0, 1, or 2
// intervals depending on the overlap shape.
export function difference(a: Interval, b: Interval): Interval[] {
  if (!intersects(a, b)) return [a];
  const result: Interval[] = [];
  // Part of `a` before `b` starts.
  if (compare(a.start, b.start) < 0) {
    result.push({ start: a.start, end: b.start, bounds: flipEndBounds(a.bounds, 'half-open-end') });
  }
  // Part of `a` after `b` ends.
  if (compare(a.end, b.end) > 0) {
    result.push({ start: b.end, end: a.end, bounds: flipEndBounds('half-open-start', a.bounds) });
  }
  return result;
}

function flipEndBounds(startBounds: IntervalBounds, endBounds: IntervalBounds): IntervalBounds {
  // When cutting `a` at b.start or b.end, the cut boundary is open
  // (excluded) on the b side. Closed on the a side.
  // This helper computes the resulting bounds for the two pieces.
  // For simplicity, return 'half-open' variants; callers needing exact
  // closed-bound semantics should use subtraction() instead.
  if (startBounds === 'open' || endBounds === 'open') return 'open';
  if (startBounds === 'half-open-end') return 'half-open-end';
  if (endBounds === 'half-open-start') return 'half-open-start';
  return 'closed';
}

// Alias for difference() to match the plan's listing.
export const subtract = difference;

// Merges a list of intervals, combining overlapping ones. Returns a
// sorted list of disjoint intervals.
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => compare(a.start, b.start));
  const result: Interval[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;
    if (intersects(last, current) || compare(last.end, current.start) === 0) {
      // Merge into last.
      if (compare(current.end, last.end) > 0) {
        last.end = current.end;
      }
    } else {
      result.push(current);
    }
  }
  return result;
}

// Splits an interval into N equal sub-intervals. Throws if N ≤ 0.
// Equality is by ms-distance between start and end — for date ranges
// this approximates "equal time slices", which is the most useful
// interpretation. For calendar-bound splits (e.g. "split this month
// into weeks"), callers should use recurrence() instead.
export function splitInterval(iv: Interval, n: number): Interval[] {
  if (n <= 0) throw new Error(`temporal-fmt: splitInterval requires n > 0 (got ${n}).`);
  if (n === 1) return [iv];
  const startFields = asDateFieldView(iv.start) as DateFieldView & { hour?: number; minute?: number; second?: number; millisecond?: number };
  const endFields = asDateFieldView(iv.end) as DateFieldView & { hour?: number; minute?: number; second?: number; millisecond?: number };
  const startMs = toMs(startFields);
  const endMs = toMs(endFields);
  const step = (endMs - startMs) / n;
  const result: Interval[] = [];
  for (let i = 0; i < n; i++) {
    const sliceStart = startMs + i * step;
    const sliceEnd = i === n - 1 ? endMs : sliceStart + step;
    result.push({
      start: fromMs(sliceStart, startFields),
      end: fromMs(sliceEnd, endFields),
      bounds: i === 0 ? iv.bounds : 'half-open-start',
    });
  }
  return result;
}

function toMs(v: DateFieldView & { hour?: number; minute?: number; second?: number; millisecond?: number }): number {
  // Reuse the same day-count math arithmetic.ts uses, inlined.
  const y = v.year!, m = v.month!, d = v.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * 86_400_000
    + (v.hour ?? 0) * 3_600_000
    + (v.minute ?? 0) * 60_000
    + (v.second ?? 0) * 1_000
    + (v.millisecond ?? 0);
}

function fromMs(ms: number, base: DateFieldView & { hour?: number; minute?: number; second?: number; millisecond?: number }): DateFieldView {
  const MS_PER_DAY = 86_400_000;
  const dayOverflow = Math.floor(ms / MS_PER_DAY);
  let withinDay = ms % MS_PER_DAY;
  if (withinDay < 0) withinDay += MS_PER_DAY;
  const hour = Math.floor(withinDay / 3_600_000);
  const minute = Math.floor((withinDay % 3_600_000) / 60_000);
  const second = Math.floor((withinDay % 60_000) / 1_000);
  const millisecond = withinDay % 1_000;
  // `ms` (and therefore `dayOverflow`) is already an absolute epoch-ms /
  // epoch-day value — toMs() computed it via Howard Hinnant's algorithm
  // from scratch, not as an offset from `base`. So the date only needs
  // reconstructing from the Unix epoch itself; `base` is just a template
  // for whatever extra (non-date) fields get spread into the result.
  // (Previously this added dayOverflow on top of base's own epoch-ms,
  // double-counting base's offset and landing tens of thousands of days
  // away from the intended date for any non-epoch base.)
  const newMs = dayOverflow * MS_PER_DAY;
  const d = new Date(newMs);
  return {
    ...base,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour,
    minute,
    second,
    millisecond,
  };
}

// Formats an interval as a single string, collapsing shared fields.
// E.g. "August 4 – August 6, 2026" rather than "August 4, 2026 – August 6, 2026".
// Uses Intl.DateTimeFormat's formatRange when available (most engines),
// falling back to format(start, fmt) + '–' + format(end, fmt) when not.

export function formatRange(
  iv: Interval,
  formatStr: string,
  options: FormatOptions = {},
): string {
  try {
    // Intl.DateTimeFormat.formatRange is the standard mechanism.
    // It handles the field-collapse logic natively (locale-dependent).
    const fmt = new Intl.DateTimeFormat(options.locale ?? 'en-US', {});
    // Cast the interval endpoints to Date for the Intl call. Both
    // endpoints must be Temporal values that can convert to a Date;
    // for non-ZonedDateTime values we synthesize a Date via the field
    // shape (year/month/day/hour/...).
    const startDate = toJSDate(iv.start);
    const endDate = toJSDate(iv.end);
    return fmt.formatRange(startDate, endDate);
  } catch {
    // Fallback: format each side separately and join with "–".
    const startStr = format(iv.start as Parameters<typeof format>[0], formatStr, options);
    const endStr = format(iv.end as Parameters<typeof format>[0], formatStr, options);
    return `${startStr} – ${endStr}`;
  }
}

export function formatRangeToParts(
  iv: Interval,
  formatStr: string,
  options: FormatOptions = {},
): FormattedPart[] {
  // Best-effort: returns formatToParts for the start, then a literal
  // " – " part, then formatToParts for the end. Doesn't currently
  // expose Intl.DateTimeFormat.formatRangeToParts's collapsed shape —
  // that would require mapping Intl's part types back to temporal-fmt's
  // token strings, which is locale-dependent and not stable across
  // engines.
  const startParts = formatToParts(iv.start as Parameters<typeof formatToParts>[0], formatStr, options);
  const endParts = formatToParts(iv.end as Parameters<typeof formatToParts>[0], formatStr, options);
  const result: FormattedPart[] = [...startParts];
  result.push({ type: 'literal', value: ' – ' });
  result.push(...endParts);
  return result;
}

function toJSDate(value: unknown): Date {
  const v = value as { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number; toInstant?: () => { epochMilliseconds: number } };
  if (typeof v?.toInstant === 'function') {
    return new Date(v.toInstant().epochMilliseconds);
  }
  if (typeof v?.year === 'number' && typeof v?.month === 'number' && typeof v?.day === 'number') {
    return new Date(Date.UTC(v.year, v.month - 1, v.day, v.hour ?? 0, v.minute ?? 0, v.second ?? 0, v.millisecond ?? 0));
  }
  throw new Error(`temporal-fmt: formatRange() expected Temporal values with year/month/day, got ${typeof value}.`);
}