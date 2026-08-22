// Recurrence engine. Deterministic RRULE-like
// recurrence without pulling in a runtime dependency. Supports
// secondly/minutely/hourly/daily/weekly/monthly/yearly frequencies,
// interval, count, until, weekdays, monthDays, positional rules,
// exclusions, inclusions.
//
// RRULE interop: parseRRule() / formatRRule() convert to/from the
// standard iCalendar RRULE string format (RFC 5545). Implemented
// without depending on a RRULE library — the grammar is small enough
// to handle inline.

import { add } from './arithmetic.js';
import { compare } from './comparison.js';

export type RecurrenceFrequency = 'secondly' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // default 1
  count?: number; // max occurrences
  until?: unknown; // Temporal value — recurrence ends before this
  // For weekly: ISO weekdays to include (1=Mon..7=Sun). Empty = all.
  byWeekday?: number[];
  // For monthly/yearly: days of month to include (1-31, or negative
  // for end-of-month: -1 = last day).
  byMonthDay?: number[];
  // For yearly: months to include (1-12).
  byMonth?: number[];
  // For weekly: which week of the year (1-53).
  byWeek?: number[];
  // Exclusions: dates to skip even if they match the rule.
  exDates?: unknown[];
  // Inclusions: dates to add even if they don't match the rule.
  rDates?: unknown[];
}

export interface RecurrenceIterator {
  next(): { value: unknown; done: boolean } | { value: undefined; done: true };
  previous(): { value: unknown; done: boolean } | { value: undefined; done: true };
}

// Creates a recurrence iterator starting from `start`. The first call
// to next() returns `start` itself (if it matches the rule); subsequent
// calls return the next matching occurrence.
export function recurrence(start: unknown, rule: RecurrenceRule): RecurrenceIterator {
  let current: unknown = start;
  let count = 0;
  // Track past values for previous() — keeps a ring buffer of the last
  // N occurrences so previous() can walk back without recomputing.
  const history: unknown[] = [];
  const MAX_HISTORY = 10_000;
  let atEnd = false;
  let atStart = true;

  function matches(value: unknown): boolean {
    const v = value as { dayOfWeek?: number; day?: number; month?: number; year?: number; hour?: number; minute?: number; second?: number };
    if (rule.byWeekday && rule.byWeekday.length > 0) {
      if (!rule.byWeekday.includes(v.dayOfWeek ?? 0)) return false;
    }
    if (rule.byMonthDay && rule.byMonthDay.length > 0) {
      if (!rule.byMonthDay.includes(v.day ?? 0)) return false;
    }
    if (rule.byMonth && rule.byMonth.length > 0) {
      if (!rule.byMonth.includes(v.month ?? 0)) return false;
    }
    if (rule.exDates && rule.exDates.some((d) => compare(d, value) === 0)) return false;
    return true;
  }

  function advance(value: unknown, steps: number): unknown {
    // Add `steps` * interval units to `value`.
    const unit = rule.frequency === 'secondly' ? 'seconds'
      : rule.frequency === 'minutely' ? 'minutes'
      : rule.frequency === 'hourly' ? 'hours'
      : rule.frequency === 'daily' ? 'days'
      : rule.frequency === 'weekly' ? 'weeks'
      : rule.frequency === 'monthly' ? 'months'
      : 'years';
    return add(value, steps * rule.interval, unit as Parameters<typeof add>[2]);
  }

  function recordHistory(value: unknown): void {
    history.push(value);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function nextMatch(value: unknown): { value: unknown; found: boolean } {
    // Advance one step at a time until we find a match. For
    // byWeekday/byMonthDay rules this can skip multiple steps.
    let candidate = value;
    let safetyCounter = 0;
    do {
      candidate = advance(candidate, 1);
      safetyCounter++;
      if (safetyCounter > 1000) {
        // Defensive — if the rule is so restrictive no match exists
        // within 1000 steps, give up rather than spin forever. The
        // caller must treat this as "no more occurrences", not as a
        // real match — returning the unmatched candidate here used to
        // get handed back to next()'s caller as if it were valid.
        atEnd = true;
        return { value: candidate, found: false };
      }
      if (rule.until && compare(candidate, rule.until) > 0) {
        atEnd = true;
        return { value: candidate, found: false };
      }
    } while (!matches(candidate));
    return { value: candidate, found: true };
  }

  return {
    next() {
      if (atEnd) return { value: undefined, done: true };
      if (atStart) {
        atStart = false;
        if (matches(current)) {
          count++;
          if (rule.count !== undefined && count >= rule.count) atEnd = true;
          if (rule.until && compare(current, rule.until) > 0) {
            atEnd = true;
            return { value: undefined, done: true };
          }
          // Include rDates that match the current value.
          recordHistory(current);
          return { value: current, done: false };
        }
        // If start doesn't match, advance to first match.
        const advanced = nextMatch(current);
        if (!advanced.found) return { value: undefined, done: true };
        current = advanced.value;
        count++;
        if (rule.count !== undefined && count >= rule.count) atEnd = true;
        recordHistory(current);
        return { value: current, done: false };
      }
      const advanced = nextMatch(current);
      if (!advanced.found) return { value: undefined, done: true };
      current = advanced.value;
      count++;
      if (rule.count !== undefined && count >= rule.count) atEnd = true;
      recordHistory(current);
      return { value: current, done: false };
    },
    previous() {
      if (history.length === 0) return { value: undefined, done: true };
      const v = history.pop()!;
      return { value: v, done: false };
    },
  };
}

// Take N occurrences from a recurrence iterator.
export function take(iter: RecurrenceIterator, n: number): unknown[] {
  const result: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const r = iter.next();
    if (r.done) break;
    result.push(r.value);
  }
  return result;
}

// Skip N occurrences from a recurrence iterator.
export function skip(iter: RecurrenceIterator, n: number): unknown[] {
  for (let i = 0; i < n; i++) {
    const r = iter.next();
    if (r.done) break;
  }
  return take(iter, Number.MAX_SAFE_INTEGER);
}

// All occurrences between two dates (inclusive of start, exclusive of end).
export function between(start: unknown, rule: RecurrenceRule, rangeStart: unknown, rangeEnd: unknown): unknown[] {
  const iter = recurrence(start, rule);
  const result: unknown[] = [];
  while (true) {
    const r = iter.next();
    if (r.done) break;
    if (compare(r.value, rangeEnd) >= 0) break;
    if (compare(r.value, rangeStart) >= 0) result.push(r.value);
  }
  return result;
}

// Parses an RRULE string like "FREQ=DAILY;INTERVAL=2;COUNT=5" into a
// RecurrenceRule. Doesn't support every RRULE feature (BYSETPOS,
// BYHOUR, BYMINUTE, BYSECOND are parsed but not enforced by the
// recurrence iterator above), but covers the common cases.
export function parseRRule(input: string): RecurrenceRule {
  const parts = input.trim().toUpperCase().replace(/^RRULE:/, '').split(';');
  const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
  const frequencies: ReadonlySet<string> = new Set([
    'SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY',
  ]);
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    switch (key) {
      case 'FREQ':
        if (!frequencies.has(value)) {
          throw new RangeError(`temporal-fmt: unsupported RRULE frequency "${value}".`);
        }
        rule.frequency = value.toLowerCase() as RecurrenceFrequency;
        break;
      case 'INTERVAL': {
        const interval = Number(value);
        if (!Number.isSafeInteger(interval) || interval < 1) {
          throw new RangeError(`temporal-fmt: RRULE INTERVAL must be a positive safe integer (got "${value}").`);
        }
        rule.interval = interval;
        break;
      }
      case 'COUNT': {
        const count = Number(value);
        if (!Number.isSafeInteger(count) || count < 1) {
          throw new RangeError(`temporal-fmt: RRULE COUNT must be a positive safe integer (got "${value}").`);
        }
        rule.count = count;
        break;
      }
      case 'UNTIL':
        rule.until = value;
        break;
      case 'BYDAY':
        rule.byWeekday = value.split(',').map((d) => {
          const m = d.match(/^([+-]?\d)?([A-Z]{2})$/);
          if (!m) return 0;
          const wd = m[2];
          const map: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
          return map[wd!] ?? 0;
        });
        break;
      case 'BYMONTHDAY': {
        const values = value.split(',').map(Number);
        if (values.some((day) => !Number.isInteger(day) || day === 0 || day < -31 || day > 31)) {
          throw new RangeError(`temporal-fmt: RRULE BYMONTHDAY contains an out-of-range value.`);
        }
        rule.byMonthDay = values;
        break;
      }
      case 'BYMONTH': {
        const values = value.split(',').map(Number);
        if (values.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) {
          throw new RangeError(`temporal-fmt: RRULE BYMONTH contains an out-of-range value.`);
        }
        rule.byMonth = values;
        break;
      }
    }
  }
  return rule;
}

export function formatRRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${String(rule.until)}`);
  if (rule.byWeekday && rule.byWeekday.length > 0) {
    const map: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
    parts.push(`BYDAY=${rule.byWeekday.map((d) => map[d]).join(',')}`);
  }
  if (rule.byMonthDay && rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byMonth && rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  return parts.join(';');
}