// holiday framework. core just gives you the abstraction — actual
// country-specific holiday lists live outside this package, could be
// their own ecosystem packages built on top. a holiday calendar is
// basically a date -> boolean function ("is this a holiday") plus some
// iteration helpers (nextHoliday, previousHoliday, holidaysBetween)

import { add } from './arithmetic.js';
import { compare } from './comparison.js';

export interface HolidayCalendar {
  isHoliday(value: unknown): boolean;
  // everything in [start, end], inclusive on both ends
  holidaysBetween(start: unknown, end: unknown): unknown[];
}

export interface HolidaySpec {
  // for fixed-date holidays, like Jan 1 for New Year's
  month?: number;
  day?: number;
  // for the floating ones — give it a year, get back { month, day } for
  // that year. this is how you'd do "last Monday of May" type rules
  compute?: (year: number) => { month: number; day: number };
  // just a name, mostly for debugging
  name?: string;
}

// cap on how many years holidaysBetween() will walk through. it's a
// year-by-year loop with no bounds checking on the inputs, so someone
// passing year 1 to year 300000 would've made it iterate (and cache!)
// every single year in between. either an accident or someone being
// hostile, either way that used to just hang the process. 5000 matches
// the same walk-cap businessCalendar.ts and recurrence.ts already use
const MAX_HOLIDAY_YEAR_RANGE = 5_000;

export function createHolidayCalendar(specs: HolidaySpec[]): HolidayCalendar {
  // computes a year's holiday list lazily, then caches it
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
      if (typeof sv?.year !== 'number' || typeof ev?.year !== 'number') {
        throw new Error('temporal-fmt: holidaysBetween() needs start/end values with year/month/day.');
      }
      if (ev.year - sv.year > MAX_HOLIDAY_YEAR_RANGE) {
        throw new RangeError(
          `temporal-fmt: holidaysBetween() year range (${sv.year}–${ev.year}) exceeds the ` +
          `${MAX_HOLIDAY_YEAR_RANGE}-year limit. Split the query into smaller ranges.`
        );
      }
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

// finds the next holiday strictly after `value`. gives up and returns
// undefined if nothing shows up within 5 years — sanity cap so this
// can't loop forever on an empty calendar
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

// holidaysBetween already exists as a method on HolidayCalendar (above),
// this is just a standalone version so you don't have to type cal.holidaysBetween
export function holidaysBetween(cal: HolidayCalendar, start: unknown, end: unknown): unknown[] {
  return cal.holidaysBetween(start, end);
}
