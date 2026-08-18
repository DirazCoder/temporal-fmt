// ISO 8601 week numbering: a week runs Monday–Sunday, and week 1 of a year
// is the week containing the year's first Thursday (equivalently, the week
// containing January 4). This means late-December dates can fall in week 1
// of the *next* year, and early-January dates can fall in week 52 or 53 of
// the *previous* year. The "ISO week-numbering year" (what `RRRR` formats)
// is that adjacent year, not the calendar year.
//
// Computed here from the date's own year/month/day plus its ISO dayOfWeek
// (1=Mon..7=Sun, matching Temporal's numbering) using plain Gregorian
// arithmetic — no Temporal factory needed. format() only has the fields
// the caller already put on the object, and requiring a Temporal
// implementation just for ISO week would be a regression for callers who
// use format() without setTemporal() on a non-26 Node.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUMULATIVE_DAYS_BY_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function isGregorianLeapYear(year: number): boolean {
  // Gregorian rule: divisible by 4, except centuries which must also be
  // divisible by 400. Temporal's iso8601 calendar is proleptic Gregorian
  // (no Julian cutover), so this applies for every year, including BCE.
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

// Jan 1, 2000 was a Saturday — ISO dayOfWeek 6. Anchoring day-of-week
// computations to a known reference date is simpler and cheaper than
// pulling in Zeller's congruence, and the reference never changes.
const REFERENCE_YEAR = 2000;
const REFERENCE_JAN1_DAY_OF_WEEK = 6;

function dayOfWeekOfJan1(year: number): number {
  // Sum full-year deltas from the 2000 anchor rather than recomputing from
  // scratch each call — the per-call work is a single mod this way, and
  // the loop rarely runs far (a typical caller passes a current-era year).
  let offset = 0;
  if (year >= REFERENCE_YEAR) {
    for (let y = REFERENCE_YEAR; y < year; y++) offset += daysInYear(y);
  } else {
    for (let y = year; y < REFERENCE_YEAR; y++) offset -= daysInYear(y);
  }
  // Convert "days since Jan 1, 2000" into an ISO day-of-week (1=Mon..7=Sun).
  // Jan 1, 2000 was ISO 6 (Sat), so zero-indexed dow = (6-1 + offset) mod 7.
  const zeroIndexed = (((6 - 1 + offset) % 7) + 7) % 7;
  return zeroIndexed + 1;
}

export interface IsoWeekDate {
  isoYear: number;
  week: number; // 1..53
}

export function isoWeekYearAndWeek(year: number, month: number, day: number, dayOfWeek: number): IsoWeekDate {
  // Step 1: find the Thursday of the current ISO week. The ISO week-numbering
  // year is whichever calendar year that Thursday falls in. Computing it via
  // day-of-year offsets (rather than constructing a Temporal.PlainDate and
  // adding days) keeps this function pure-numeric.
  const doy = dayOfYear(year, month, day);
  const thursdayDoyRelative = doy + (4 - dayOfWeek); // may be <1 or >daysInYear

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

  // Step 2: locate the first Thursday of isoYear — its week is week 1. The
  // first Thursday's day-of-year depends on what weekday Jan 1 of isoYear is.
  const jan1Dow = dayOfWeekOfJan1(isoYear);
  const firstThursdayDoy = 1 + ((4 - jan1Dow + 7) % 7); // 1..7

  // Step 3: count full weeks between the two Thursdays.
  const week = 1 + Math.floor((thursdayDoy - firstThursdayDoy) / 7);
  return { isoYear, week };
}
