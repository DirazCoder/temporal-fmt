// Holiday framework. Core provides the abstraction only —
// country-specific holiday datasets stay out of core; those can be
// separate ecosystem packages built on top of this. A holiday calendar
// is a function from a date → boolean ("is this a holiday?") plus
// iteration helpers (nextHoliday, previousHoliday, holidaysBetween).

import { add } from './arithmetic.js';
import { compare } from './comparison.js';

export interface HolidayCalendar {
  isHoliday(value: unknown): boolean;
  // Returns the list of holidays within [start, end] inclusive.
  holidaysBetween(start: unknown, end: unknown): unknown[];
}

export interface HolidaySpec {
  // Month + day for fixed-date holidays (e.g. Jan 1 → New Year's).
  month?: number;
  day?: number;
  // For floating holidays: a function that takes a year and returns
  // the { month, day } of the holiday in that year. Used for "last
  // Monday of May" style rules.
  compute?: (year: number) => { month: number; day: number };
  // Optional name (for introspection / debugging).
  name?: string;
}

export function createHolidayCalendar(specs: HolidaySpec[]): HolidayCalendar {
  // Pre-compute holidays for a year on demand, cache by year.
  const cache = new Map<number, Array<{ month: number; day: number; name?: string }>>();
  function forYear(year: number) {
    let list = cache.get(year);
    if (list) return list;
    list = specs.map((s) => {
      let md: { month: number; day: number };
      if (s.compute) {
        md = s.compute(year);
      } else {
        md = { month: s.month!, day: s.day! };
      }
      return { ...md, name: s.name };
    });
    cache.set(year, list);
    return list;
  }
  return {
    isHoliday(value: unknown) {
      const v = value as { year?: number; month?: number; day?: number };
      if (typeof v.year !== 'number' || typeof v.month !== 'number' || typeof v.day !== 'number') {
        throw new Error('temporal-fmt: isHoliday() needs a value with year/month/day.');
      }
      const list = forYear(v.year);
      return list.some((h) => h.month === v.month && h.day === v.day);
    },
    holidaysBetween(start: unknown, end: unknown) {
      const sv = start as { year: number; month: number; day: number };
      const ev = end as { year: number; month: number; day: number };
      const result: unknown[] = [];
      for (let y = sv.year; y <= ev.year; y++) {
        const list = forYear(y);
        for (const h of list) {
          const date = { year: y, month: h.month, day: h.day };
          if (compare(date, sv) >= 0 && compare(date, ev) <= 0) {
            result.push({ year: y, month: h.month, day: h.day });
          }
        }
      }
      return result;
    },
  };
}

// Returns the next holiday strictly after `value`. Returns undefined
// if no holiday is registered within the next 5 years (sanity cap).
export function nextHoliday(cal: HolidayCalendar, value: unknown): unknown | undefined {
  let candidate = add(value, 1, 'days');
  for (let i = 0; i < 365 * 5; i++) {
    if (cal.isHoliday(candidate)) return candidate;
    candidate = add(candidate, 1, 'days');
  }
  return undefined;
}

export function previousHoliday(cal: HolidayCalendar, value: unknown): unknown | undefined {
  let candidate = add(value, -1, 'days');
  for (let i = 0; i < 365 * 5; i++) {
    if (cal.isHoliday(candidate)) return candidate;
    candidate = add(candidate, -1, 'days');
  }
  return undefined;
}

// holidaysBetween is exposed as a HolidayCalendar method (see above);
// this standalone helper delegates to it for ergonomic access.
export function holidaysBetween(cal: HolidayCalendar, start: unknown, end: unknown): unknown[] {
  return cal.holidaysBetween(start, end);
}
