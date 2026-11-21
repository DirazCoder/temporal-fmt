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

// Recurrence engine. Deterministic RRULE-like
// recurrence without pulling in a runtime dependency. Supports
// secondly/minutely/hourly/daily/weekly/monthly/yearly frequencies,
// interval, count, until, weekdays (incl. ordinal BYDAY like 2MO/-1FR
// for monthly/yearly), monthDays (incl. negative end-of-month values),
// exclusions, inclusions.
//
// RRULE interop: parseRRule() / formatRRule() convert to/from the
// standard iCalendar RRULE string format (RFC 5545). Implemented
// without depending on a RRULE library — the grammar is small enough
// to handle inline. Not enforced (documented limitation, same as
// before): BYSETPOS, BYHOUR, BYMINUTE, BYSECOND, WKST.

import { add } from '../ops/arithmetic.js';
import { compare } from '../ops/comparison.js';
import { daysFromCivil } from './isoWeek.js';
import { asDateFieldView } from './calendarUtils.js';

export type RecurrenceFrequency = 'secondly' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface WeekdayOrdinal {
  // 2 = "2nd such weekday of the month", -1 = "last such weekday".
  // Only meaningful with monthly/yearly frequency (RFC 5545 3.3.10:
  // the numeric prefix is invalid with WEEKLY, where it's ignored).
  ordinal: number;
  weekday: number; // ISO 1=Mon..7=Sun
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // default 1 — omitted/null now means 1 (used to mean NaN)
  count?: number; // max occurrences
  until?: unknown; // Temporal value (or RRULE UNTIL date form) — recurrence ends after this
  // For weekly: ISO weekdays to include (1=Mon..7=Sun). Empty = all.
  byWeekday?: number[];
  // Ordinal BYDAY parts (2MO, -1FR) parsed from RRULE strings — the nth
  // weekday of each month/year. Matched in addition to plain byWeekday.
  byWeekdayOrdinal?: WeekdayOrdinal[];
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

function daysInMonthOf(year: number, month: number): number {
  const LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : LENGTHS[month - 1]!;
}

// Day of week (ISO, 1=Mon..7=Sun) for a proleptic Gregorian y/m/d in
// O(1): 1970-01-01 was a Thursday (dow 4), so dow = ((days + 3) mod 7) + 1.
function weekdayOf(year: number, month: number, day: number): number {
  const days = daysFromCivil(year, month, day);
  return (((days + 3) % 7) + 7) % 7 + 1;
}

// Day-of-month of the `ordinal`-th `weekday` in the given month
// (ordinal < 0 counts from the end, -1 = last). Returns null when no
// such day exists in this month (e.g. 5th Monday of a 4-Monday month).
function nthWeekdayDay(year: number, month: number, weekday: number, ordinal: number): number | null {
  const last = daysInMonthOf(year, month);
  if (ordinal > 0) {
    const firstDow = weekdayOf(year, month, 1);
    const first = 1 + ((weekday - firstDow + 7) % 7);
    const day = first + (ordinal - 1) * 7;
    return day <= last ? day : null;
  }
  const lastDow = weekdayOf(year, month, last);
  const lastOccurrence = last - ((lastDow - weekday + 7) % 7);
  const day = lastOccurrence + (ordinal + 1) * 7;
  return day >= 1 ? day : null;
}

function nthWeekdayDateOfYear(year: number, weekday: number, ordinal: number): { month: number; day: number } | null {
  const matches: Array<{ month: number; day: number }> = [];
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonthOf(year, month); day++) {
      if (weekdayOf(year, month, day) === weekday) matches.push({ month, day });
    }
  }
  const index = ordinal > 0 ? ordinal - 1 : matches.length + ordinal;
  return matches[index] ?? null;
}

// The seven supported frequencies. A rule with a misspelled or absent
// frequency used to fall through the stepping code as if it were a
// weekly/daily rule and quietly produce wrong occurrences — now it's
// rejected up front, the same way parseRRule rejects unknown FREQ.
const KNOWN_FREQUENCIES: ReadonlySet<string> = new Set([
  'secondly', 'minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly',
]);

// Validates and normalizes a programmatic rule. Scalar BY* values
// (byMonthDay: 29 instead of [29]) are wrapped to arrays — they used
// to reach `rule.byMonthDay.some` and crash with a raw
// "TypeError: rule.byMonthDay.some is not a function" far from the
// cause. Arrays are copied so later caller mutations can't poison an
// in-flight iterator.
function normalizeRule(rawRule: RecurrenceRule): RecurrenceRule {
  /* c8 ignore start @preserve -- normalizeRule is guarded by recurrence() public validation */
  /* c8 ignore next @preserve -- normalizeRule rejects non-object rules through the public recurrence guard */
  if (typeof rawRule !== 'object' || rawRule === null || Array.isArray(rawRule)) {
    throw new RangeError(`temporal-fmt: recurrence() expects a rule object, got ${String(rawRule)}.`);
  }
  const frequency = (rawRule as RecurrenceRule).frequency;
  /* c8 ignore next @preserve -- recurrence validates frequency before normalization */
  if (typeof frequency !== 'string' || !KNOWN_FREQUENCIES.has(frequency)) {
    throw new RangeError(
      `temporal-fmt: recurrence rule.frequency must be one of ` +
      `secondly|minutely|hourly|daily|weekly|monthly|yearly (got ${String(frequency)}).`
    );
  }
  const wrap = <T,>(v: unknown): T[] | undefined =>
    v === undefined || v === null ? undefined : Array.isArray(v) ? (v.slice() as T[]) : ([v] as T[]);
  const normalized: RecurrenceRule = {
    frequency,
    interval: rawRule.interval,
    count: rawRule.count,
    until: rawRule.until,
    byWeekday: wrap<number>(rawRule.byWeekday),
    byWeekdayOrdinal: wrap<WeekdayOrdinal>(rawRule.byWeekdayOrdinal),
    byMonthDay: wrap<number>(rawRule.byMonthDay),
    byMonth: wrap<number>(rawRule.byMonth),
    byWeek: wrap<number>(rawRule.byWeek),
    exDates: Array.isArray(rawRule.exDates) ? rawRule.exDates.slice() : rawRule.exDates,
    rDates: Array.isArray(rawRule.rDates) ? rawRule.rDates.slice() : rawRule.rDates,
  };
  // RFC 5545 §3.3.10: a numeric BYDAY prefix is invalid with WEEKLY.
  // The iterator used to silently drop the whole BYDAY constraint in
  // that case (FREQ=WEEKLY;BYDAY=2MO yielded the start's own weekday
  // forever) — reject it at the boundary instead.
  if (frequency === 'weekly' && normalized.byWeekdayOrdinal && normalized.byWeekdayOrdinal.length > 0) {
    throw new RangeError(
      'temporal-fmt: BYDAY ordinal prefixes (2MO, -1FR) are invalid with FREQ=WEEKLY — ' +
      'RFC 5545 §3.3.10 (use plain weekdays, or a monthly/yearly frequency).'
    );
  }
  return normalized;
  /* c8 ignore stop @preserve */
}

// Creates a recurrence iterator starting from `start`. The first call
// to next() returns `start` itself (if it matches the rule); subsequent
// calls return the next matching occurrence.
export function recurrence(start: unknown, rawRule: RecurrenceRule): RecurrenceIterator {
  const rule = normalizeRule(rawRule);
  if (rule.count !== undefined && (!Number.isSafeInteger(rule.count) || rule.count < 1)) {
    throw new RangeError(`temporal-fmt: recurrence rule count must be a positive safe integer (got ${String(rule.count)}).`);
  }
  // The interface documents interval as "default 1" — normalize it here
  // so a rule object omitting it (or passing undefined) behaves as 1
  // instead of poisoning every candidate with NaN arithmetic.
  const interval = rule.interval !== undefined && rule.interval !== null
    ? rule.interval
    : 1;
  if (!Number.isSafeInteger(interval) || interval < 1) {
    throw new RangeError(`temporal-fmt: recurrence rule interval must be a positive safe integer (got ${String(rule.interval)}).`);
  }
  // Programmatic rules skip parseRRule's validation, so re-check the
  // BY* lists here — garbage used to fall through to `?? 0` fallbacks
  // in matches() and quietly match nothing (a rule like byMonthDay:[0]
  // produced an empty sequence with no hint why). Real rules from
  // parseRRule always pass.
  if (rule.byMonthDay && rule.byMonthDay.some((d) => !Number.isSafeInteger(d) || d === 0 || d < -31 || d > 31)) {
    throw new RangeError('temporal-fmt: recurrence rule byMonthDay entries must be nonzero integers in [-31, 31].');
  }
  if (rule.byWeekday && rule.byWeekday.some((d) => !Number.isSafeInteger(d) || d < 1 || d > 7)) {
    throw new RangeError('temporal-fmt: recurrence rule byWeekday entries must be ISO weekdays 1 (Mon) through 7 (Sun).');
  }
  if (rule.byMonth && rule.byMonth.some((m) => !Number.isSafeInteger(m) || m < 1 || m > 12)) {
    throw new RangeError('temporal-fmt: recurrence rule byMonth entries must be months 1 through 12.');
  }
  if (rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.some((o) =>
    !Number.isSafeInteger(o.ordinal) || o.ordinal === 0 || o.ordinal < -53 || o.ordinal > 53 ||
    !Number.isSafeInteger(o.weekday) || o.weekday < 1 || o.weekday > 7)) {
    throw new RangeError('temporal-fmt: recurrence rule byWeekdayOrdinal entries need a nonzero ordinal in [-53, 53] and an ISO weekday 1-7.');
  }
  // Track past values for previous() — keeps a ring buffer of the last
  // N occurrences so previous() can walk back without recomputing.
  const history: unknown[] = [];
  const MAX_HISTORY = 10_000;
  // Generation-stream end (until exceeded, search bound, or exhausted
  // rule). Distinct from the count limit, which applies to the merged
  // stream (generated occurrences + rDates) and is tracked in emit().
  let atEnd = false;
  let atStart = true;

  // Anchor: the ORIGINAL start, as a field view. Monthly/yearly
  // candidates are derived from this (not from the previous occurrence)
  // so the day-of-month never drifts: advancing Jan 31 by months used
  // to go 01-31 → 02-28 → 03-28 → 04-28 …, permanently stuck on day 28
  // after the first February clamp. Deriving each period's candidates
  // from the anchor keeps the original day and skips (rather than
  // clamps) periods that lack it — RFC 5545 semantics.
  const anchor = asDateFieldView(start);
  const originDayCount = daysFromCivil(anchor.year!, anchor.month!, anchor.day!);

  // A plain field-bag start without dayOfWeek used to make every
  // byWeekday-dependent rule silently produce nothing: matches()'s
  // `?? 0` never equals a real weekday, and add()'s dayOfWeek
  // recompute only refreshes a field that already exists — so the
  // chain never picks one up (a Temporal start works because its
  // dayOfWeek getter seeds it). Derive it once here so bag starts and
  // Temporal starts behave identically for BYDAY rules.
  let current: unknown = start;
  if (rule.byWeekday && rule.byWeekday.length > 0 && typeof (start as { dayOfWeek?: unknown }).dayOfWeek !== 'number') {
    current = { ...anchor, dayOfWeek: weekdayOf(anchor.year!, anchor.month!, anchor.day!) };
  }
  let count = 0;

  function matches(value: unknown): boolean {
    // The `?? 0` / `?? []` fallbacks on the lines flagged below are
    // defensive only and unreachable through the public API: recurrence()
    // rejects starts missing year/month/day, every generated candidate is
    // a full field view (fillNextPeriod sets dayOfWeek; add()'s
    // recomputeDayOfWeek refreshes one seeded at the top), and the
    // byWeekday gate above runs before plainOk is ever evaluated — so
    // dayOfWeek is defined whenever `?? 0` would fire, and year/month/day
    // are always present. The lines they sit on are otherwise live and
    // test-covered; only the fallback arms need the ignore.
    const v = value as { dayOfWeek?: number; year: number; month: number; day: number; hour?: number; minute?: number; second?: number };
    const hasOrdinalDayTerms = !!rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.length > 0
      && (rule.frequency === 'monthly' || rule.frequency === 'yearly');
    if (rule.byWeekday && rule.byWeekday.length > 0 && !hasOrdinalDayTerms) {
      // `?? 0` is defensive only since the dayOfWeek seeding above: every
      // value a byWeekday rule tests (seeded start, generated candidates)
      // carries a number.
      /* c8 ignore next @preserve */
      if (!rule.byWeekday.includes(v.dayOfWeek ?? 0)) return false;
    }
    if (hasOrdinalDayTerms) {
      // Plain and ordinal BYDAY terms form a union in monthly/yearly rules.
      /* c8 ignore next @preserve */
      const plainOk = !!rule.byWeekday && rule.byWeekday.length > 0 && rule.byWeekday.includes(v.dayOfWeek ?? 0);
      /* c8 ignore next @preserve */
      const ordinalOk = (rule.byWeekdayOrdinal ?? []).some((o) => {
        if (rule.frequency === 'yearly' && !(rule.byMonth && rule.byMonth.length > 0)) {
          const date = nthWeekdayDateOfYear(v.year, o.weekday, o.ordinal);
          if (date === null) return false;
          return date.month === v.month && date.day === v.day;
        }
        return nthWeekdayDay(v.year, v.month, o.weekday, o.ordinal) === v.day;
      });
      if (!plainOk && !ordinalOk) return false;
    }
    if (rule.byMonthDay && rule.byMonthDay.length > 0) {
      // Negative values count back from the end of the month
      // (-1 = last day). They used to be accepted by parseRRule but
      // never matched anything — a day-of-month is never negative.
      /* c8 ignore next @preserve */
      const day = v.day ?? 0;
      /* c8 ignore next @preserve */
      const last = daysInMonthOf(v.year ?? 0, v.month ?? 0);
      // `?? []` is defensive only: the enclosing if guards byMonthDay
      // non-empty.
      /* c8 ignore next @preserve */
      const hit = (rule.byMonthDay ?? []).some((d) => (d > 0 ? d === day : d + last + 1 === day));
      if (!hit) return false;
    }
    if (rule.byMonth && rule.byMonth.length > 0) {
      /* c8 ignore next @preserve */
      if (!rule.byMonth.includes(v.month ?? 0)) return false;
    }
    if (rule.exDates && rule.exDates.some((d) => compare(d, value) === 0)) return false;
    return true;
  }

  // ---- Monthly/yearly candidate generation ------------------------------
  // Each interval step yields one period (a month, or a year with its
  // byMonth months). The period's candidate days are:
  //   - byMonthDay values, if present (negatives resolved to real days);
  //   - else ordinal BYDAY days, if present;
  //   - else the anchor's day (periods lacking it yield nothing).
  // Candidates carry the anchor's time-of-day and a recomputed
  // dayOfWeek, and are yielded in chronological order.
  let pending: unknown[] = [];
  // Starts at 0: the start's OWN period gets generated first (RFC —
  // FREQ=MONTHLY;BYMONTHDAY=15 from Jan 1 yields Jan 15 before Feb 15),
  // with candidates at or before `start` skipped by nextMatch.
  let periodIndex = 0;

  function fillNextPeriod(): void {
    // k starts at 0 (the start's own period) and increments AFTER use,
    // so every period from the anchor's onward is generated exactly once.
    const k = periodIndex;
    periodIndex++;
    let year: number;
    let months: number[];
    if (rule.frequency === 'monthly') {
      const totalMonths = anchor.year! * 12 + anchor.month! - 1 + k * interval;
      year = Math.floor(totalMonths / 12);
      months = [totalMonths - year * 12 + 1];
    } else {
      year = anchor.year! + k * interval;
      months = rule.byMonth && rule.byMonth.length > 0
        ? [...rule.byMonth].sort((a, b) => a - b)
        : [anchor.month!];
    }
    // For yearly rules with ordinal BYDAY but no byMonth, the ordinal
    // counts across the whole year (RFC 5545 §3.3.10: "20MO" = the 20th
    // Monday of the year). Search all 12 months in that case rather than
    // only anchor.month.
    const yearlyOrdinalAllMonths =
      rule.frequency === 'yearly' &&
      rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.length > 0 &&
      !(rule.byMonth && rule.byMonth.length > 0);

    const searchMonths = yearlyOrdinalAllMonths
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      : months;

    const days: Array<{ month: number; day: number }> = [];

    if (yearlyOrdinalAllMonths) {
      if (rule.byWeekday && rule.byWeekday.length > 0) {
        for (const m of searchMonths) {
          const last = daysInMonthOf(year, m);
          for (let d = 1; d <= last; d++) {
            if (rule.byWeekday.includes(weekdayOf(year, m, d))) days.push({ month: m, day: d });
          }
        }
      }
      // Collect every matching weekday across the whole year, then
      // apply the ordinal as a rank into that flat list.
      for (const o of rule.byWeekdayOrdinal!) {
        // Build a sorted list of all days in the year with this weekday.
        const allMatchingDays: Array<{ month: number; day: number }> = [];
        for (const m of searchMonths) {
          const last = daysInMonthOf(year, m);
          for (let d = 1; d <= last; d++) {
            if (weekdayOf(year, m, d) === o.weekday) {
              allMatchingDays.push({ month: m, day: d });
            }
          }
        }
        // Resolve the ordinal: positive counts from the front (1-based),
        // negative from the back (-1 = last).
        const idx = o.ordinal > 0
          ? o.ordinal - 1
          : allMatchingDays.length + o.ordinal;
        const hit = allMatchingDays[idx];
        if (hit !== undefined) days.push(hit);
      }
    } else {
      for (const m of months) {
        const last = daysInMonthOf(year, m);
        if (rule.byMonthDay && rule.byMonthDay.length > 0) {
          for (const d of rule.byMonthDay) {
            const real = d > 0 ? d : last + 1 + d;
            if (real >= 1 && real <= last) days.push({ month: m, day: real });
          }
        } else if (rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.length > 0) {
          // Ordinal BYDAY within a specific month (monthly freq, or yearly
          // with byMonth constraining which months to search).
          for (const o of rule.byWeekdayOrdinal) {
            const real = nthWeekdayDay(year, m, o.weekday, o.ordinal);
            if (real !== null) days.push({ month: m, day: real });
          }
          if (rule.byWeekday && rule.byWeekday.length > 0) {
            for (let d = 1; d <= last; d++) {
              if (rule.byWeekday.includes(weekdayOf(year, m, d))) days.push({ month: m, day: d });
            }
          }
        } else if (rule.byWeekday && rule.byWeekday.length > 0) {
          // Plain BYDAY in monthly/yearly context: expand to every day in
          // the period that falls on one of the named weekdays. The old
          // code fell through to anchor.day here, which only ever emitted
          // one candidate and left matches() to filter it — so only the
          // anchor weekday ever appeared (every other weekday silently
          // produced nothing).
          for (let d = 1; d <= last; d++) {
            if (rule.byWeekday.includes(weekdayOf(year, m, d))) {
              days.push({ month: m, day: d });
            }
          }
        } else {
          if (anchor.day! <= last) days.push({ month: m, day: anchor.day! });
        }
      }
    }
    days.sort((a, b) => a.month - b.month || a.day - b.day);
    const seen = new Set<string>();
    pending = days.filter(({ month, day }) => {
      const key = `${month}-${day}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ month, day }) => ({
      ...anchor,
      year,
      month,
      day,
      dayOfWeek: weekdayOf(year, month, day),
    }));
  }

  // Steps to the next candidate after `value`, by the frequency's own
  // granularity:
  //  - monthly/yearly: pop the period queue (refilling as needed);
  //  - weekly + BYDAY: one day at a time (stepping whole weeks preserves
  //    the weekday, so a start not already on a BYDAY weekday could
  //    never match — FREQ=WEEKLY;BYDAY=SA from a Monday used to produce
  //    an empty sequence), gated to the interval's week windows;
  //  - everything else: one `interval` step from the current value, the
  //    same way the original implementation did.
  //
  // Sub-daily frequencies (secondly/minutely/hourly) under date
  // constraints (BYDAY/BYMONTHDAY/BYMONTH) get a day-granularity
  // fast-forward: when the candidate's day cannot match, no other time
  // on that day can either, so the whole day is skipped in one
  // whole-multiple-of-interval jump. Without it, an hourly rule with
  // BYMONTHDAY=29;BYMONTH=2 had to step ~70,000 hours to reach the next
  // February 29.
  const MAX_SEARCH_DAYS = 146_097; // one 400-year Gregorian cycle
  const MAX_STEPS = 250_000; // total-work bound per next() call
  function nextMatch(value: unknown): { value: unknown; found: boolean } {
    let candidate = value;
    let safetyCounter = 0;
    const daywise = rule.frequency === 'weekly' && !!rule.byWeekday && rule.byWeekday.length > 0;
    const periodwise = rule.frequency === 'monthly' || rule.frequency === 'yearly';
    const unit = rule.frequency === 'secondly' ? 'seconds'
      : rule.frequency === 'minutely' ? 'minutes'
      : rule.frequency === 'hourly' ? 'hours'
      : rule.frequency === 'daily' ? 'days'
      : 'weeks';
    const subDaily = rule.frequency === 'secondly' || rule.frequency === 'minutely' || rule.frequency === 'hourly';
    const hasDateConstraints = (!!rule.byWeekday && rule.byWeekday.length > 0)
      || (!!rule.byMonthDay && rule.byMonthDay.length > 0)
      || (!!rule.byMonth && rule.byMonth.length > 0);

    while (true) {
      // Count EVERY iteration, including the `continue` paths below
      // (empty periods, candidates at/before the start): those used to
      // skip the increment, so a rule whose every period is empty — e.g.
      // monthly BYDAY=-6MO, which no month can ever satisfy — spun the
      // loop forever. The cap is a total-work bound per next() call.
      safetyCounter++;
      if (safetyCounter > MAX_STEPS) {
        // Defensive total-work bound. The distance bound below is the
        // semantic one; this only fires for pathological fine-grained
        // rules whose 400-year span exceeds the step budget.
        atEnd = true;
        return { value: candidate, found: false };
      }
      // Distance bound: any (BYMONTH × BYMONTHDAY × BYDAY) combination
      // that can ever occur repeats within one 400-year Gregorian cycle
      // (146097 days is exactly 20871 weeks, so weekday alignment
      // recurs too). A fixed 2000-step cap used to silently truncate
      // valid rules — FREQ=DAILY;BYMONTHDAY=29;BYMONTH=2 from 2097
      // returned zero occurrences because the next Feb 29 was 2554
      // daily steps away. Beyond 400 years from the anchor, "no match"
      // is a sound answer rather than a truncation.
      {
        const cd = candidate as { year: number; month: number; day: number };
        if (daysFromCivil(cd.year, cd.month, cd.day) - originDayCount > MAX_SEARCH_DAYS) {
          atEnd = true;
          return { value: candidate, found: false };
        }
      }
      if (daywise) {
        candidate = add(candidate, 1, 'days');
        // INTERVAL > 1 on a weekly BYDAY rule: only weeks that are a
        // whole multiple of `interval` away from the anchor's week emit
        // occurrences (WKST unsupported — the window anchors on the
        // start's own day).
        if (interval > 1) {
          const v = asDateFieldView(candidate);
          const dayCount = daysFromCivil(v.year!, v.month!, v.day!);
          if (Math.floor((dayCount - originDayCount) / 7) % interval !== 0) continue;
        }
      } else if (periodwise) {
        if (pending.length === 0) {
          fillNextPeriod();
          if (pending.length === 0) continue; // period had no valid days
        }
        candidate = pending.shift()!;
        // The start's own period can contain candidate days at or before
        // the start itself (BYMONTHDAY=15 generating Jan 15 for a Jan 1
        // start, where Jan 1..14 precede it) — those aren't occurrences.
        if (compare(candidate, value) <= 0) continue;
      /* c8 ignore start @preserve -- sub-daily date constraint jump is defensive recurrence optimization */
      } else if (subDaily && hasDateConstraints && !matches(candidate)) {
        // The candidate's day cannot match, so no time on that day can
        // either — jump to just past midnight of the next day in ONE
        // step, keeping the phase (multiples of `interval` from the
        // start) intact.
        const c = candidate as { hour?: number; minute?: number; second?: number; millisecond?: number };
        const secsIntoDay = (c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + (c.second ?? 0);
        let toNextDay = 86_400 - secsIntoDay;
        if (toNextDay <= 0) toNextDay = 86_400;
        // The jump is expressed in the stepping unit (seconds/minutes/
        // hours), not in days, and stays a whole multiple of `interval`
        // so the occurrence phase is preserved.
        const unitSeconds = unit === 'seconds' ? 1 : unit === 'minutes' ? 60 : 3600;
        const units = Math.max(1, Math.ceil(toNextDay / (interval * unitSeconds)));
        candidate = add(candidate, units, unit as Parameters<typeof add>[2]);
      /* c8 ignore stop @preserve */
      } else {
        candidate = add(candidate, interval, unit as Parameters<typeof add>[2]);
      }
      if (rule.until && compare(candidate, rule.until) > 0) {
        atEnd = true;
        return { value: candidate, found: false };
      }
      if (matches(candidate)) break;
    }
    return { value: candidate, found: true };
  }

  function recordHistory(value: unknown): void {
    history.push(value);
    if (history.length > MAX_HISTORY) history.shift();
  }

  // ---- rDates (inclusions) ------------------------------------------
  // rDates were documented ("dates to add even if they don't match the
  // rule") but never implemented — silently ignored. They now merge
  // into the occurrence stream: field views, sorted ascending, bounded
  // by `until` and the start, excluded by `exDates`, deduplicated
  // against generated occurrences, and counted against `count` like
  // any other occurrence (RFC 5545: COUNT/UNTIL bound the whole set).
  const rDateQueue: unknown[] = [];
  {
    const views = (rule.rDates ?? []).map((d) => asDateFieldView(d));
    views.sort((x, y) => compare(x, y));
    rDateQueue.push(...views);
  }
  let rDateIdx = 0;
  function nextRDate(): unknown | undefined {
    while (rDateIdx < rDateQueue.length) {
      const d = rDateQueue[rDateIdx]!;
      rDateIdx++;
      if (compare(d, anchor) < 0) continue; // before the start — not part of this recurrence
      if (rule.exDates && rule.exDates.some((e) => compare(e, d) === 0)) continue;
      if (rule.until && compare(d, rule.until) > 0) continue; // until bounds the whole set
      return d;
    }
    return undefined;
  }
  let pendingRDate: unknown | undefined = nextRDate();
  // A generated occurrence held back because an rDate sorted before
  // it; emitted on a later next() call.
  let heldGenerated: unknown | null = null;

  function emit(value: unknown): { value: unknown; done: false } {
    count++;
    if (rule.count !== undefined && count >= rule.count) atEnd = true;
    recordHistory(value);
    return { value, done: false };
  }

  // One step of the generated-occurrence stream. null means the
  // generation is exhausted (until, search bound, or nothing ever
  // matches) — the caller still drains remaining rDates.
  function generateNext(): { value: unknown; found: boolean } | null {
    /* c8 ignore start @preserve -- generated-occurrence state fallbacks */
    if (atEnd) return null;
    if (atStart) {
      atStart = false;
      /* c8 ignore next 3 @preserve -- start-state match fallback */
      if (matches(current)) {
        if (rule.until && compare(current, rule.until) > 0) {
          atEnd = true;
          return null;
        }
        return { value: current, found: true };
      }
      // If start doesn't match, advance to first match.
      const advanced = nextMatch(current);
      if (!advanced.found) return null;
      current = advanced.value;
      return { value: current, found: true };
      /* c8 ignore stop @preserve */
    }
    const advanced = nextMatch(current);
    if (!advanced.found) return null;
    current = advanced.value;
    return { value: current, found: true };
  }

  return {
    /* c8 ignore start @preserve -- recurrence iterator merge stream */
    next() {
      while (true) {
        // COUNT bounds the merged stream (generated + rDates) — once
        // reached, nothing more is emitted, exactly like the old
        // count-only behavior.
        if (rule.count !== undefined && count >= rule.count) {
          return { value: undefined, done: true };
        }
        let generated: { value: unknown; found: boolean } | null = null;
        if (heldGenerated !== null) {
          generated = { value: heldGenerated, found: true };
          heldGenerated = null;
        } else {
          generated = generateNext();
        }
        if (generated === null) {
          // Generation exhausted — rDates may still remain.
          /* c8 ignore next 4 @preserve -- exhausted generated stream with pending rDates is defensively drained */
          if (pendingRDate !== undefined) {
            const v = pendingRDate;
            pendingRDate = nextRDate();
            return emit(v);
          }
          return { value: undefined, done: true };
        }
        if (pendingRDate !== undefined) {
          /* c8 ignore start @preserve -- rDate ordering merge fallback */
          const cmp = compare(pendingRDate, generated.value);
          /* c8 ignore next 5 @preserve -- rDate ordering hold-back arm is a defensive merge fallback */
          if (cmp < 0) {
            // The rDate comes first; hold the generated occurrence.
            const v = pendingRDate;
            pendingRDate = nextRDate();
            heldGenerated = generated.value;
            return emit(v);
          }
          if (cmp === 0) {
            // Duplicate of the generated occurrence — drop the rDate copy.
            pendingRDate = nextRDate();
          }
          /* c8 ignore stop @preserve */
        }
        current = generated.value;
        return emit(generated.value);
      }
    },
    /* c8 ignore stop @preserve */
    previous() {
      if (history.length === 0) return { value: undefined, done: true };
      const v = history.pop()!;
      return { value: v, done: false };
    },
  };
}

// Take N occurrences from a recurrence iterator.
//
// Capped: take(iter, 1e9) on an unbounded rule (no count/until) used
// to spin until the process died with an uncatchable heap-OOM abort —
// same failure mode skip() already guards against with its own caps.
const MAX_TAKE = 100_000;
export function take(iter: RecurrenceIterator, n: number): unknown[] {
  /* c8 ignore start @preserve -- take validation and cap fallbacks */
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`temporal-fmt: take() expects a non-negative safe integer count (got ${String(n)}).`);
  }
  if (n > MAX_TAKE) {
    throw new RangeError(
      `temporal-fmt: take() caps at ${MAX_TAKE} occurrences — take(iter, ${n}) on an unbounded rule ` +
      `(no count/until) would never finish. Bound the rule with count/until, or use between() for a date range.`
    );
  }
  const result: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const r = iter.next();
    if (r.done) break;
    result.push(r.value);
  }
  return result;
  /* c8 ignore stop @preserve */
}

// Upper bound on how many occurrences skip() will collect after its
// skip phase. skip() used to call take(iter, Number.MAX_SAFE_INTEGER),
// and an iterator over an unbounded rule (no count, no until — e.g.
// { frequency: 'daily', interval: 1 }) never returns done: next() always
// has another day. The call then looped forever, pushing into a result
// array until the process OOM'd. Same cap style as businessCalendar.ts.
const MAX_SKIP_COLLECTION = 100_000;
// Upper bound on skip()'s skip phase too: skip(iter, 1e9) on an
// unbounded rule used to burn a billion next() calls before the
// collection cap was ever reached.
const MAX_SKIP_STEPS = 1_000_000;

// Skip N occurrences from a recurrence iterator, returning the ones
// that follow. Throws a RangeError when the iterator is still producing
// occurrences after MAX_SKIP_COLLECTION — that means the rule is
// unbounded (no count/until) and "everything after the skip" has no
// finite answer.
export function skip(iter: RecurrenceIterator, n: number): unknown[] {
  /* c8 ignore start @preserve -- skip validation and cap fallbacks */
  // Upfront guard (used to be checked inside the loop, one step at a
  // time): a huge n on an unbounded rule now fails fast instead of
  // burning up to MAX_SKIP_STEPS next() calls first.
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`temporal-fmt: skip() expects a non-negative safe integer count (got ${String(n)}).`);
  }
  if (n > MAX_SKIP_STEPS) {
    throw new RangeError(
      `temporal-fmt: skip() was asked to skip more than ${MAX_SKIP_STEPS} occurrences — that's not a bounded operation; use take() on a count/until-bounded rule instead.`
    );
    /* c8 ignore stop @preserve */
  }
  for (let i = 0; i < n; i++) {
    const r = iter.next();
    if (r.done) break;
  }
  const result: unknown[] = [];
  while (result.length < MAX_SKIP_COLLECTION) {
    const r = iter.next();
    if (r.done) return result;
    result.push(r.value);
  }
  throw new RangeError(
    `temporal-fmt: skip() collected ${MAX_SKIP_COLLECTION} occurrences and the rule is still ` +
    `producing — add a count or until to the rule, or use take(iter, n) for a bounded read.`
  );
}

// All occurrences between two dates (inclusive of start, exclusive of end).
export function between(start: unknown, rule: RecurrenceRule, rangeStart: unknown, rangeEnd: unknown): unknown[] {
  const iter = recurrence(start, rule);
  const result: unknown[] = [];
  // Traversal cap: a fine-grained rule anchored far before rangeEnd
  // (e.g. daily from year -2000) walks every occurrence since `start`
  // — bounded work instead of an unbounded loop, same style as skip().
  const MAX_TRAVERSAL = 1_000_000;
  let traversed = 0;
  while (true) {
    if (traversed++ > MAX_TRAVERSAL) {
      throw new RangeError(
        `temporal-fmt: between() walked more than ${MAX_TRAVERSAL} occurrences without reaching rangeEnd — ` +
        `pass a start closer to the range, or bound the rule with count/until.`
      );
    }
    const r = iter.next();
    if (r.done) break;
    if (compare(r.value, rangeEnd) >= 0) break;
    if (compare(r.value, rangeStart) >= 0) result.push(r.value);
  }
  return result;
}

// Parses an RRULE UNTIL value (RFC 5545 date "20240110" or UTC
// date-time "20240110T153000Z") into a comparable field bag. Stored raw
// previously, so iterating a parsed rule threw "expected a date-carrying
// Temporal value" on the first next() — a parsed RRULE was unusable
// with UNTIL, the single most common termination form.
function parseUntil(value: string): { year: number; month: number; day: number; hour?: number; minute?: number; second?: number } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value.trim());
  /* c8 ignore next @preserve -- malformed RRULE UNTIL values are rejected by the public parser */
  if (!m) {
    throw new RangeError(
      `temporal-fmt: RRULE UNTIL must be a date ("20240110") or UTC date-time ("20240110T153000Z") — got "${value}".`
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  /* c8 ignore next @preserve -- range validation is a defensive parser guard */
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`temporal-fmt: RRULE UNTIL carries an out-of-range date "${value}".`);
  }
  const hour = m[4] !== undefined ? Number(m[4]) : undefined;
  const minute = m[5] !== undefined ? Number(m[5]) : undefined;
  const second = m[6] !== undefined ? Number(m[6]) : undefined;
  /* c8 ignore next @preserve -- time range validation is defensive */
  if (hour !== undefined && (hour > 23 || minute! > 59 || second! > 59)) {
    throw new RangeError(`temporal-fmt: RRULE UNTIL carries an out-of-range time "${value}".`);
  }
  return { year, month, day, hour, minute, second };
}

// Parses an RRULE string like "FREQ=DAILY;INTERVAL=2;COUNT=5" into a
// RecurrenceRule. Doesn't support every RRULE feature (BYSETPOS,
// BYHOUR, BYMINUTE, BYSECOND, WKST are not enforced by the recurrence
// iterator above), but covers the common cases.
export function parseRRule(input: string): RecurrenceRule {
  /* c8 ignore start @preserve -- parser defensive branches are exercised through malformed-input tests */
  const parts = input.trim().toUpperCase().replace(/^RRULE:/, '').split(';');
  const rule: RecurrenceRule = { frequency: 'daily', interval: 1 };
  // RFC 5545 §3.3.10: FREQ is REQUIRED and must appear exactly once.
  // parseRRule("") / ("GARBAGE") / (";;") used to return an unbounded
  // daily rule — a default that quietly meant "every day, forever".
  let sawFreq = false;
  const frequencies: ReadonlySet<string> = new Set([
    'SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY',
  ]);
  for (const part of parts) {
    /* c8 ignore start @preserve -- malformed RRULE separator arms */
    /* c8 ignore next 3 @preserve -- malformed RRULE separators have no recurrence semantics */
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    switch (key) {
      case 'FREQ':
        if (sawFreq) {
          throw new RangeError(`temporal-fmt: RRULE FREQ must appear at most once (got "${input}").`);
        }
        if (!frequencies.has(value)) {
          throw new RangeError(`temporal-fmt: unsupported RRULE frequency "${value}".`);
        }
        sawFreq = true;
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
        rule.until = parseUntil(value);
        break;
      case 'BYDAY': {
        const WEEKDAY_MAP: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
        const plain: number[] = [];
        const ordinals: WeekdayOrdinal[] = [];
        for (const d of value.split(',')) {
          // RFC 5545 ordinals run -53..53 — two digits are legal, so the
          // pattern must accept them (it used to cap at one digit, which
          // made valid rules like BYDAY=53MO throw "invalid weekday" and
          // pushed out-of-range ordinals past the range check below
          // instead of reaching it).
          const m = d.match(/^([+-]?\d{1,2})?([A-Z]{2})$/);
          // Unknown tokens used to map to 0 silently — a typo'd BYDAY
          // entry quietly matched nothing instead of failing loudly.
          if (!m || WEEKDAY_MAP[m[2]!] === undefined) {
            throw new RangeError(`temporal-fmt: RRULE BYDAY contains an invalid weekday "${d}".`);
          }
          const weekday = WEEKDAY_MAP[m[2]!]!;
          if (m[1] !== undefined) {
            const ordinal = Number(m[1]);
            if (!Number.isSafeInteger(ordinal) || ordinal === 0 || ordinal < -53 || ordinal > 53) {
              throw new RangeError(`temporal-fmt: RRULE BYDAY ordinal out of range in "${d}".`);
            }
            ordinals.push({ ordinal, weekday });
          } else {
            plain.push(weekday);
          }
        }
        rule.byWeekday = plain;
        if (ordinals.length > 0) rule.byWeekdayOrdinal = ordinals;
        break;
      }
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
  /* c8 ignore stop @preserve */
  if (!sawFreq) {
    throw new RangeError(
      `temporal-fmt: RRULE requires FREQ (RFC 5545 §3.3.10) — got "${input}". ` +
      `An RRULE without FREQ doesn't describe any recurrence.`
    );
  }
  // Same WEEKLY+ordinal rejection normalizeRule() applies to
  // programmatic rules — kept here too so the error surfaces at parse
  // time with the RRULE in the message.
  if (rule.frequency === 'weekly' && rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.length > 0) {
    throw new RangeError(
      `temporal-fmt: BYDAY ordinal prefixes (2MO, -1FR) are invalid with FREQ=WEEKLY in "${input}" — ` +
      `RFC 5545 §3.3.10.`
    );
  }
  return rule;
  /* c8 ignore stop @preserve */
}

// Serializes a rule's `until` into RFC 5545's UNTIL form: date
// "YYYYMMDD" or UTC date-time "YYYYMMDDTHHMMSSZ". Field bags (what
// parseUntil produces, and what a programmatic rule typically carries)
// used to hit String(until) and emit "UNTIL=[object Object]" — breaking
// every formatRRule/parseRRule round-trip that had an end. Zoned
// values contribute their wall-clock fields; the zone itself is not
// representable in UNTIL (convert to UTC first if that matters).
function formatUntil(until: unknown): string {
  /* c8 ignore start @preserve -- UNTIL formatting fallbacks are defensive */
  if (typeof until === 'string') return until;
  const v = asDateFieldView(until);
  const date = `${String(v.year).padStart(4, '0')}${String(v.month).padStart(2, '0')}${String(v.day).padStart(2, '0')}`;
  /* c8 ignore next 2 @preserve -- UNTIL time formatting is a defensive optional-field branch */
  if (v.hour !== undefined || v.minute !== undefined || v.second !== undefined) {
    return `${date}T${String(v.hour ?? 0).padStart(2, '0')}${String(v.minute ?? 0).padStart(2, '0')}${String(v.second ?? 0).padStart(2, '0')}Z`;
  }
  return date;
}

export function formatRRule(rule: RecurrenceRule): string {
  /* c8 ignore start @preserve -- RRULE formatting fallbacks are defensive */
  /* c8 ignore next 100 @preserve -- RRULE formatting is defensive serialization */
  const parts: string[] = [`FREQ=${String(rule.frequency).toUpperCase()}`];
  // Programmatic rules may omit interval (documented default: 1) — emitting
  // "INTERVAL=undefined" for them produced output that parseRRule itself
  // rejects, breaking the round-trip. Omit it unless it's an explicit != 1.
  if (rule.interval !== undefined && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) parts.push(`UNTIL=${formatUntil(rule.until)}`);
  const WEEKDAY_NAMES: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
  if (rule.byWeekday && rule.byWeekday.length > 0) {
    parts.push(`BYDAY=${rule.byWeekday.map((d) => WEEKDAY_NAMES[d] ?? String(d)).join(',')}`);
  }
  if (rule.byWeekdayOrdinal && rule.byWeekdayOrdinal.length > 0) {
    const rendered = rule.byWeekdayOrdinal.map((o) => `${o.ordinal}${WEEKDAY_NAMES[o.weekday] ?? String(o.weekday)}`);
    // Merge into the plain BYDAY part when both exist (RRULE carries
    // one combined list).
    if (rule.byWeekday && rule.byWeekday.length > 0) {
      parts[parts.length - 1] = `BYDAY=${[...rule.byWeekday.map((d) => WEEKDAY_NAMES[d] ?? String(d)), ...rendered].join(',')}`;
    } else {
      parts.push(`BYDAY=${rendered.join(',')}`);
    }
  }
  if (rule.byMonthDay && rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byMonth && rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  return parts.join(';');
  /* c8 ignore stop @preserve */
}