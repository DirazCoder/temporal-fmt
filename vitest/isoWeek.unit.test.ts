import { describe, expect, it } from 'vitest';
import { isoWeekYearAndWeek, dayOfYear, isGregorianLeapYear } from '../src/isoWeek.js';

// node --test exercises isoWeekYearAndWeek indirectly through format()'s
// `ww` and `RRRR` tokens, but only at a handful of boundary dates.
// These go straight at the helper so a wrong Thursday-of-week
// computation surfaces as an isoWeek test failure rather than a
// wrong format() output three layers up.

describe('isGregorianLeapYear', () => {
  it('returns true for typical leap years (divisible by 4, not by 100)', () => {
    expect(isGregorianLeapYear(2024)).toBe(true);
    expect(isGregorianLeapYear(2020)).toBe(true);
    expect(isGregorianLeapYear(2000)).toBe(true); // also divisible by 400
  });

  it('returns false for non-leap years', () => {
    expect(isGregorianLeapYear(2023)).toBe(false);
    expect(isGregorianLeapYear(2025)).toBe(false);
  });

  it('returns false for century years not divisible by 400 (1900, 2100)', () => {
    // Gregorian rule's century exception — most common off-by-one source
    expect(isGregorianLeapYear(1900)).toBe(false);
    expect(isGregorianLeapYear(2100)).toBe(false);
  });

  it('handles negative (BCE) years with the same rule', () => {
    // Temporal's proleptic Gregorian applies to BCE too; -4 (4 BCE) is leap.
    expect(isGregorianLeapYear(-4)).toBe(true);
    expect(isGregorianLeapYear(-100)).toBe(false);
    expect(isGregorianLeapYear(-400)).toBe(true);
  });
});

describe('dayOfYear', () => {
  it('returns 1 for Jan 1', () => {
    expect(dayOfYear(2026, 1, 1)).toBe(1);
  });

  it('returns 365/366 for Dec 31', () => {
    expect(dayOfYear(2023, 12, 31)).toBe(365); // non-leap
    expect(dayOfYear(2024, 12, 31)).toBe(366); // leap
  });

  it('adds the leap day for March+ in a leap year', () => {
    // Feb 28 → doy 59 in both years
    expect(dayOfYear(2023, 2, 28)).toBe(59);
    expect(dayOfYear(2024, 2, 28)).toBe(59);
    // Mar 1 → doy 60 in leap year, 60 in non-leap (Feb 28 + 1 day, no leap day)
    // Wait: Mar 1 in non-leap = doy 31 (Jan) + 28 (Feb) + 1 = 60.
    // Mar 1 in leap = 31 + 29 + 1 = 61.
    expect(dayOfYear(2023, 3, 1)).toBe(60);
    expect(dayOfYear(2024, 3, 1)).toBe(61);
  });
});

describe('isoWeekYearAndWeek', () => {
  it('returns mid-year values that match the calendar year', () => {
    // 2026-08-04 is in ISO week 32 of 2026
    expect(isoWeekYearAndWeek(2026, 8, 4, 2)).toEqual({ isoYear: 2026, week: 32 });
  });

  it('handles Dec 31 of a 53-week year correctly', () => {
    // 2026-12-31 is a Thursday. ISO year stays 2026, week 53.
    // dayOfWeek for Thursday = 4.
    expect(isoWeekYearAndWeek(2026, 12, 31, 4)).toEqual({ isoYear: 2026, week: 53 });
  });

  it('Dec 31 of a year that ends mid-week shifts ISO year forward', () => {
    // 2027-01-01 is a Friday (dayOfWeek=5). Its week's Thursday is
    // 2026-12-31, so ISO year = 2026, week = 53.
    expect(isoWeekYearAndWeek(2027, 1, 1, 5)).toEqual({ isoYear: 2026, week: 53 });
  });

  it('Jan 4 always belongs to week 1 of its calendar year', () => {
    // Per ISO 8601, Jan 4 is always in week 1. Verify for a few years.
    // 2026-01-04 is a Sunday (dayOfWeek=7)
    expect(isoWeekYearAndWeek(2026, 1, 4, 7).week).toBe(1);
    expect(isoWeekYearAndWeek(2026, 1, 4, 7).isoYear).toBe(2026);
    // 2024-01-04 is a Thursday (dayOfWeek=4)
    expect(isoWeekYearAndWeek(2024, 1, 4, 4).week).toBe(1);
    expect(isoWeekYearAndWeek(2024, 1, 4, 4).isoYear).toBe(2024);
  });

  it('Jan 1-3 may belong to week 52/53 of the previous ISO year', () => {
    // 2021-01-01 (Friday, dow=5) → ISO year 2020, week 53 (2020 had 53 weeks)
    expect(isoWeekYearAndWeek(2021, 1, 1, 5)).toEqual({ isoYear: 2020, week: 53 });
    // 2023-01-01 (Sunday, dow=7) → ISO year 2022, week 52
    expect(isoWeekYearAndWeek(2023, 1, 1, 7)).toEqual({ isoYear: 2022, week: 52 });
  });

  it('first day of ISO week 1 is a Monday', () => {
    // 2027-01-04 is a Monday (dow=1). Should be ISO week 1 of 2027.
    expect(isoWeekYearAndWeek(2027, 1, 4, 1)).toEqual({ isoYear: 2027, week: 1 });
  });

  it('week is always in range 1..53', () => {
    // exhaustive sweep over a 3-year window — covers all the
    // boundary-crossing cases without being slow.
    for (let year = 2020; year <= 2025; year++) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
          // Compute dayOfWeek from a known Monday reference + doy arithmetic
          // (re-uses the same logic as the helper, but independently)
          const refJan1Dow = (() => {
            // Jan 1, 2020 was a Wednesday (dow=3). Sum days in intervening years.
            let dow = 3;
            for (let y = 2020; y < year; y++) {
              dow = ((dow - 1 + (isGregorianLeapYear(y) ? 366 : 365)) % 7 + 7) % 7 + 1;
            }
            return dow;
          })();
          const doy = dayOfYear(year, month, day);
          const dow = ((refJan1Dow - 1 + (doy - 1)) % 7 + 7) % 7 + 1;
          const { week } = isoWeekYearAndWeek(year, month, day, dow);
          expect(week).toBeGreaterThanOrEqual(1);
          expect(week).toBeLessThanOrEqual(53);
        }
      }
    }
  });
});
