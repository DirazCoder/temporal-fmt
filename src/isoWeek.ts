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

// ISO week stuff. week runs Mon-Sun, and week 1 is whichever week has
// the year's first Thursday in it (same as saying "the week with Jan 4").
// took me a minute to wrap my head around this but the upshot is late-Dec
// dates can land in week 1 of NEXT year, and early-Jan dates can land in
// week 52/53 of the PREVIOUS year. that adjacent year is what RRRR prints,
// not the plain calendar year.
//
// doing this with plain year/month/day + dayOfWeek math instead of asking
// Temporal for it, since format() only has whatever fields got handed in
// and dragging in a whole Temporal implementation just for week numbers
// felt like overkill (also breaks for people not on setTemporal()).

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUMULATIVE_DAYS_BY_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function isGregorianLeapYear(year: number): boolean {
  // divisible by 4, unless it's a century, then it also needs /400.
  // Temporal's iso8601 calendar never switches to Julian, so this rule
  // just applies all the way back, even for BCE years.
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year: number): 365 | 366 {
  return isGregorianLeapYear(year) ? 366 : 365;
}

export function dayOfYear(year: number, month: number, day: number): number {
  let doy = CUMULATIVE_DAYS_BY_MONTH[month - 1]! + day;
  if (month > 2 && isGregorianLeapYear(year)) doy += 1;
  return doy;
}

// Jan 1 2000 was a Saturday (ISO dow 6). picked this as an anchor point
// since it's easier than reaching for Zeller's congruence every time,
// and obviously this fact about Jan 1 2000 isn't going to change on us
const REFERENCE_YEAR = 2000;
const REFERENCE_JAN1_DAY_OF_WEEK = 6;

// Howard Hinnant's days_from_civil: O(1) day count for a proleptic
// Gregorian y/m/d, correct for negative years and year 0 (the (y2>=0?
// y2 : y2-399)/400 offset form relies on truncating division, which JS
// doesn't have — Math.floor on the *un-offset* numerator is the exact
// JS equivalent, see the matching formulas in arithmetic.ts). Shared by
// dayOfWeekOfJan1 and any caller needing days between two arbitrary
// dates without a year-by-year walk (those walks were O(|year − 2000|)
// per call — a field bag claiming year 2e8 hung formatDistance for
// ~400ms per call and worse for bigger values).
export function daysFromCivil(year: number, month: number, day: number): number {
  const y2 = month <= 2 ? year - 1 : year;
  const era = Math.floor(y2 / 400);
  const yoe = y2 - era * 400; // [0, 399]
  const m2 = month > 2 ? month - 3 : month + 9; // [0, 11]
  const doy = Math.floor((153 * m2 + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

// Day of week (ISO, 1=Mon..7=Sun) for a proleptic Gregorian y/m/d, in
// O(1). 1970-01-01 was a Thursday (dow 4), so dow = (days + 3) mod 7
// shifted to 1..7. Replaces the Date.UTC(year, month-1, day) idiom used
// elsewhere in this library, which silently remaps years 0-99 to
// 1900-1999 per the ECMAScript spec and produces the wrong weekday for
// first-century dates.
export function dayOfWeekFromCivil(year: number, month: number, day: number): number {
  const days = daysFromCivil(year, month, day);
  // days=0 is 1970-01-01 (Thursday, dow 4): (0 + 3) % 7 = 3 → 4 ✓
  return (((days + 3) % 7) + 7) % 7 + 1;
}

function dayOfWeekOfJan1(year: number): number {
  // O(1) via daysFromCivil: Jan 1 of `year` is `days` after Jan 1 2000
  // (a Saturday, dow 6), so dow = (6 - 1 + days) mod 7, bumped to 1-indexed.
  // The old year-by-year walk from 2000 was O(|year − 2000|) — correct
  // but linear, and unbounded for hostile field-bag years.
  const days = daysFromCivil(year, 1, 1) - daysFromCivil(REFERENCE_YEAR, 1, 1);
  const zeroIndexed = (((REFERENCE_JAN1_DAY_OF_WEEK - 1 + days) % 7) + 7) % 7;
  return zeroIndexed + 1;
}

export interface IsoWeekDate {
  isoYear: number;
  week: number; // goes 1 to 53
}

export function isoWeekYearAndWeek(year: number, month: number, day: number, dayOfWeek: number): IsoWeekDate {
  // step 1: figure out the Thursday of this week — whatever calendar year
  // that Thursday's in IS the ISO week-numbering year. doing this with
  // day-of-year offsets so we don't need an actual Temporal.PlainDate here
  const doy = dayOfYear(year, month, day);
  const thursdayDoyRelative = doy + (4 - dayOfWeek); // can go negative or past daysInYear, that's fine

  let isoYear: number;
  let thursdayDoy: number;
  if (thursdayDoyRelative < 1) {
    isoYear = year - 1;
    thursdayDoy = thursdayDoyRelative + daysInYear(isoYear);
  } else if (thursdayDoyRelative > daysInYear(year)) {
    isoYear = year + 1;
    thursdayDoy = thursdayDoyRelative - daysInYear(year);
  } else {
    isoYear = year;
    thursdayDoy = thursdayDoyRelative;
  }

  // step 2: find the first Thursday of isoYear, that one's week 1 by definition.
  // depends entirely on which weekday Jan 1 lands on
  const jan1Dow = dayOfWeekOfJan1(isoYear);
  const firstThursdayDoy = 1 + ((4 - jan1Dow + 7) % 7); // always lands somewhere 1-7

  // step 3: just count how many full weeks between the two Thursdays
  const week = 1 + Math.floor((thursdayDoy - firstThursdayDoy) / 7);
  return { isoYear, week };
}
