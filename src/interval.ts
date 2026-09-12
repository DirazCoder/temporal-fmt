/*
 * Copyright 2026 DirazCoder
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Intervals / ranges. An interval is a pair of
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
import { formatToParts, format as baseFormat, type FormattedPart } from './format.js';
import { callFormatImplBatch } from './runtime.js';
import { asDateFieldView, type DateFieldView } from './calendarUtils.js';
import { normalizeLocaleTag } from './localeVocab.js';
import { daysFromCivil } from './isoWeek.js';
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
//
// The two half-open conditions below used to have their labels swapped —
// 'half-open-end' excluded the start and included the end (the exact
// behavior 'half-open-start' documents, and vice versa) — which made
// contains() disagree with difference() (whose labels were correct all
// along) and silently broke splitInterval's partition (see below).
// startOpen/beginOpen naming below says which *endpoint* is excluded, so
// the mapping to the label can't drift again.
function startIncluded(bounds: IntervalBounds): boolean {
  return bounds === 'closed' || bounds === 'half-open-end';
}
function endIncluded(bounds: IntervalBounds): boolean {
  return bounds === 'closed' || bounds === 'half-open-start';
}

export function contains(iv: Interval, value: unknown): boolean {
  const startCmp = compare(value, iv.start);
  const endCmp = compare(value, iv.end);
  const afterStart = startIncluded(iv.bounds) ? startCmp >= 0 : startCmp > 0;
  const beforeEnd = endIncluded(iv.bounds) ? endCmp <= 0 : endCmp < 0;
  return afterStart && beforeEnd;
}

// Two intervals overlap iff their ranges intersect, regardless of bounds.
// intersects() is the boolean form; intersection() returns the actual
// overlap interval.
export function overlaps(a: Interval, b: Interval): boolean {
  return intersects(a, b);
}

export function intersects(a: Interval, b: Interval): boolean {
  // Two intervals intersect iff they share at least one point. The old
  // version returned true whenever the spans touched, regardless of
  // bounds — so (Jan 1, Jan 5) and (Jan 5, Jan 10), which share no point
  // (Jan 5 belongs to neither), reported as overlapping, and
  // intersection() returned a degenerate non-empty-looking result for
  // the empty intersection. Computing the candidate shared span and
  // consulting contains() at the single shared point handles every
  // bounds combination uniformly.
  const loCmp = compare(a.start, b.start);
  const lo = loCmp >= 0 ? a.start : b.start; // later start
  const hiCmp = compare(a.end, b.end);
  const hi = hiCmp <= 0 ? a.end : b.end; // earlier end
  const inner = compare(lo, hi);
  if (inner < 0) return true; // strictly inside — a real span is shared
  if (inner > 0) return false; // spans don't reach each other
  // lo === hi: the only possible shared point is that single value —
  // it has to be contained in BOTH intervals.
  return contains(a, lo) && contains(b, lo);
}

export function isBefore(a: Interval, b: Interval): boolean {
  return compare(a.end, b.start) < 0;
}

export function isAfter(a: Interval, b: Interval): boolean {
  return compare(a.start, b.end) > 0;
}

// Returns the intersection of two intervals, or null if they don't
// overlap. The result's bounds at each endpoint come from whichever
// interval OWNS that endpoint (the later start, the earlier end) — when
// both intervals supply the same endpoint, intersection inclusivity is
// the AND of the two (a point is in a∩b only if it's in both).
export function intersection(a: Interval, b: Interval): Interval | null {
  if (!intersects(a, b)) return null;
  const aStartLater = compare(a.start, b.start) > 0;
  const start = aStartLater ? a.start : b.start;
  const aEndEarlier = compare(a.end, b.end) < 0;
  const end = aEndEarlier ? a.end : b.end;
  // Start-side inclusivity: owned by the later-start interval, or the
  // conjunction when the starts are equal.
  const startInc = aStartLater
    ? startIncluded(a.bounds)
    : compare(b.start, a.start) > 0
      ? startIncluded(b.bounds)
      : startIncluded(a.bounds) && startIncluded(b.bounds);
  // End-side inclusivity: owned by the earlier-end interval, or the
  // conjunction when the ends are equal.
  const endInc = aEndEarlier
    ? endIncluded(a.bounds)
    : compare(a.end, b.end) > 0
      ? endIncluded(b.bounds)
      : endIncluded(a.bounds) && endIncluded(b.bounds);
  const bounds: IntervalBounds = startInc
    ? (endInc ? 'closed' : 'half-open-end')
    : (endInc ? 'half-open-start' : 'open');
  return { start, end, bounds };
}

// Returns the union of two intervals (the smallest interval containing
// both), or null if they don't overlap (caller should use mergeIntervals
// for that case). Union inclusivity at each endpoint comes from the
// interval that extends further, or the disjunction when both reach the
// same endpoint.
export function union(a: Interval, b: Interval): Interval | null {
  if (!intersects(a, b)) return null;
  const aStartEarlier = compare(a.start, b.start) < 0;
  const start = aStartEarlier ? a.start : b.start;
  const aEndLater = compare(a.end, b.end) > 0;
  const end = aEndLater ? a.end : b.end;
  const startInc = aStartEarlier
    ? startIncluded(a.bounds)
    : compare(b.start, a.start) < 0
      ? startIncluded(b.bounds)
      : startIncluded(a.bounds) || startIncluded(b.bounds);
  const endInc = aEndLater
    ? endIncluded(a.bounds)
    : compare(a.end, b.end) < 0
      ? endIncluded(b.bounds)
      : endIncluded(a.bounds) || endIncluded(b.bounds);
  const bounds: IntervalBounds = startInc
    ? (endInc ? 'closed' : 'half-open-end')
    : (endInc ? 'half-open-start' : 'open');
  return { start, end, bounds };
}

// Returns the part of `a` that is not in `b`. May produce 0, 1, or 2
// intervals depending on the overlap shape.
//
// Bounds semantics: each surviving piece keeps the inclusivity of the
// original endpoint it inherits from `a`, and the endpoint created by the
// cut is always exclusive (it is `b`'s edge, which belongs to the removed
// overlap). The old implementation derived both bounds from a lossy
// helper that collapsed several of these combinations — the pieces'
// endpoints were right, but the bounds metadata was stricter than the
// actual remainder for open/half-open inputs.
export function difference(a: Interval, b: Interval): Interval[] {
  if (!intersects(a, b)) return [a];
  const result: Interval[] = [];
  // Part of `a` before `b` starts. Its end is b.start; that point stays
  // in the remainder iff a still contains it AND b doesn't — a cut edge
  // is only removed when the removed interval actually includes it (a
  // cut against an open-bounded b used to drop the edge point even
  // though b never owned it).
  if (compare(a.start, b.start) < 0) {
    const endInc = contains(a, b.start) && !contains(b, b.start);
    result.push({
      start: a.start,
      end: b.start,
      bounds: startIncluded(a.bounds)
        ? (endInc ? 'closed' : 'half-open-end')
        : (endInc ? 'half-open-start' : 'open'),
    });
  }
  // Part of `a` after `b` ends — mirror image of the above.
  if (compare(a.end, b.end) > 0) {
    const startInc = contains(a, b.end) && !contains(b, b.end);
    result.push({
      start: b.end,
      end: a.end,
      bounds: startInc
        ? (endIncluded(a.bounds) ? 'closed' : 'half-open-end')
        : (endIncluded(a.bounds) ? 'half-open-start' : 'open'),
    });
  }
  return result;
}

// Alias for difference() — "subtract" reads more naturally at some
// call sites than "difference" does.
export const subtract = difference;

// Merges a list of intervals, combining overlapping ones. Returns a
// sorted list of disjoint intervals. The inputs are treated as
// immutable — the merged result carries shallow copies of any interval
// object it extends, so a caller's own `end` reference is never
// reassigned under them (mergeIntervals used to write `last.end =
// current.end` straight into the caller's object).
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => compare(a.start, b.start));
  // Shallow-copy EVERY interval placed into the result, not just the
  // first — the inputs are documented as immutable and the merged
  // object is mutated below (last.end is reassigned), so aliasing any
  // input would write through to the caller's objects. Non-merged
  // intervals used to be pushed by reference.
  const result: Interval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = result[result.length - 1]!;
    // Touching endpoints merge only when at least one interval actually
    // contains the shared point — [1,5) + [5,10] union to [1,10], but
    // (1,5) + (5,10) leave a hole at exactly 5 and must stay separate.
    // (Plain overlaps always merge, per intersects().)
    const touching = compare(last.end, current.start) === 0;
    const touchMerges = touching && (endIncluded(last.bounds) || startIncluded(current.bounds));
    if (intersects(last, current) || touchMerges) {
      // Extend to the farther end, carrying that interval's end
      // inclusivity over (and when the ends are equal, the union of the
      // two end inclusivities).
      const endCmp = compare(current.end, last.end);
      if (endCmp > 0) {
        last.end = current.end;
        last.bounds = startIncluded(last.bounds)
          ? (endIncluded(current.bounds) ? 'closed' : 'half-open-end')
          : (endIncluded(current.bounds) ? 'half-open-start' : 'open');
      } else if (endCmp === 0) {
        last.bounds = startIncluded(last.bounds)
          ? (endIncluded(last.bounds) || endIncluded(current.bounds) ? 'closed' : 'half-open-end')
          : (endIncluded(last.bounds) || endIncluded(current.bounds) ? 'half-open-start' : 'open');
      }
    } else {
      result.push({ ...current });
    }
  }
  return result;
}

// Widest instant JS Date can represent (±8.64e15 ms, i.e. ±100,000,000
// days from the Unix epoch). splitInterval rebuilds endpoints via Date,
// so anything outside this window would silently produce Invalid Date
// objects with NaN year/month/day fields — reject it descriptively
// instead.
const MAX_DATE_MS = 8.64e15;

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
  if (Math.abs(startMs) > MAX_DATE_MS || Math.abs(endMs) > MAX_DATE_MS) {
    throw new RangeError(
      `temporal-fmt: splitInterval() endpoints are outside the representable Date range ` +
      `(approximately ±275,760 years). Split the interval into smaller ranges first.`
    );
  }
  const step = (endMs - startMs) / n;
  const result: Interval[] = [];
  // A partition: slice 0 keeps the caller's start inclusivity, slices
  // 1..n-1 start exactly where the previous slice ended (exclusively),
  // so their starts are INCLUDED, and every slice except the last
  // excludes its end; the last slice keeps the caller's end inclusivity.
  // Together: [s0, s1) [s1, s2) ... [s_{n-1}, s_n] for a closed input —
  // every point in exactly one slice. (The old version labeled the
  // middle slices 'half-open-start' — which under the pre-fix, swapped
  // contains() semantics accidentally behaved like [s, e) — and left
  // the ORIGINAL end point out of the last slice entirely.)
  const ivStartInc = startIncluded(iv.bounds);
  const ivEndInc = endIncluded(iv.bounds);
  for (let i = 0; i < n; i++) {
    const sliceStart = startMs + i * step;
    const sliceEnd = i === n - 1 ? endMs : sliceStart + step;
    const startInc = i === 0 ? ivStartInc : true;
    const endInc = i === n - 1 ? ivEndInc : false;
    result.push({
      start: fromMs(sliceStart, startFields),
      end: fromMs(sliceEnd, endFields),
      // The 'half-open-start' arm on the last line below is structurally
      // unreachable: startInc is false only for slice 0 (later slices
      // start included), and slice 0's endInc is always false (only the
      // last slice carries the input's end inclusivity) — a slice with an
      // exclusive start AND inclusive end would require n === 1, which
      // returns [iv] unchanged above. The other arms are live and covered.
      /* c8 ignore next 3 @preserve */
      bounds: startInc
        ? (endInc ? 'closed' : 'half-open-end')
        : (endInc ? 'half-open-start' : 'open'),
    });
  }
  return result;
}

function toMs(v: DateFieldView & { hour?: number; minute?: number; second?: number; millisecond?: number }): number {
  // daysFromCivil (isoWeek.ts) is the O(1) Hinnant day count, correct
  // for negative years. The formula previously inlined here carried a
  // Math.floor applied to Hinnant's -399-offset numerator — a double
  // correction that shifted every pre-year-0 date by one day (the
  // offset form is only equivalent under truncating division, which JS
  // doesn't have).
  const days = daysFromCivil(v.year!, v.month!, v.day!);
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
  // The formatStr parameter is this function's contract — the caller
  // asked for their token format on both endpoints. Honor it first:
  // format each side with the caller's format string and join with an
  // en dash. (This used to try Intl.DateTimeFormat.formatRange() first,
  // which ignores formatStr entirely — formatRange(iv, 'yyyy-MM-dd')
  // silently returned locale-default output like "8/4/2026 – 8/6/2026"
  // instead of "2026-08-04 – 2026-08-06".) Intl's range collapsing is
  // kept as a fallback for inputs the token path can't render.
  try {
    // Both endpoints in one call: with a mod's format() override bridged
    // to a subprocess, each format() is a pipe round trip, and the batch
    // form halves that. With no override it's just the two calls this
    // used to make.
    const [startStr, endStr] = callFormatImplBatch([iv.start, iv.end] as Array<Parameters<typeof baseFormat>[0]>, formatStr, options);
    return `${startStr} – ${endStr}`;
  } catch (err) {
    // Fallback: Intl.DateTimeFormat.formatRange is the standard
    // mechanism with native field-collapse behavior, but it has no
    // knowledge of the caller's token format string.
    try {
      const fmt = new Intl.DateTimeFormat(normalizeLocaleTag(options.locale ?? 'en-US'), {});
      // Cast the interval endpoints to Date for the Intl call. Both
      // endpoints must be Temporal values that can convert to a Date;
      // for non-ZonedDateTime values we synthesize a Date via the field
      // shape (year/month/day/hour/...).
      const startDate = toJSDate(iv.start);
      const endDate = toJSDate(iv.end);
      return fmt.formatRange(startDate, endDate);
    } catch {
      // Neither path could render — surface the token-path error, since
      // the formatStr contract is the primary one.
      throw err;
    }
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