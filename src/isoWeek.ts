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

function dayOfWeekOfJan1(year: number): number {
  // walk year by year from 2000 instead of doing this from scratch every
  // time — most callers pass a current-era year so this loop is short anyway
  let offset = 0;
  if (year >= REFERENCE_YEAR) {
    for (let y = REFERENCE_YEAR; y < year; y++) offset += daysInYear(y);
  } else {
    for (let y = year; y < REFERENCE_YEAR; y++) offset -= daysInYear(y);
  }
  // now turn "days since Jan 1 2000" into an ISO weekday. Jan 1 2000 was a 6
  // (Sat), so: zero-indexed = (6-1 + offset) mod 7, then bump back to 1-indexed
  const zeroIndexed = (((6 - 1 + offset) % 7) + 7) % 7;
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
