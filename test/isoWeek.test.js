import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// ww (ISO week number, 01-53) and RRRR (ISO week-numbering year) are
// format-only tokens. The ISO-week year can differ from the calendar
// year at the boundary: Dec 29-31 often belong to week 1 of the *next*
// year, and Jan 1-3 often belong to week 52/53 of the *previous* year.
//
// Parsing ISO week + weekday into a specific date is a different
// surface than the token-based parse() here, so ww/RRRR are format-only.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('ww: mid-year date renders as the expected ISO week', () => {
  // 2026-08-04 is in ISO week 32
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'ww'), '32');
});

test('ww: pads to 2 digits (week 1-9)', () => {
  // 2026-01-04 is the Sunday ending ISO week 1 of 2026 (since 2026-01-01
  // is a Thursday, the first Thursday of the year — week 1 contains Jan 1-4)
  assert.equal(format(Temporal.PlainDate.from('2026-01-04'), 'ww'), '01');
  // week 2 starts Mon Jan 5
  assert.equal(format(Temporal.PlainDate.from('2026-01-05'), 'ww'), '02');
});

test('RRRR: same as calendar year mid-year', () => {
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'RRRR'), '2026');
});

// ISO 8601 boundary-crossing cases. Week 1 of a year is the week
// containing the year's first Thursday; equivalently, the week
// containing January 4. Dec 29-31 may belong to week 1 of the *next*
// year; Jan 1-3 may belong to week 52/53 of the *previous* year.

test('boundary: 2026-12-31 (Thursday) — ISO year stays 2026, week 53', () => {
  // 2026-12-31 is a Thursday. The week containing that Thursday is
  // ISO week 53 of 2026 (the year of the Thursday). So ww=53, RRRR=2026.
  assert.equal(format(Temporal.PlainDate.from('2026-12-31'), 'ww RRRR'), '53 2026');
});

test('boundary: 2027-01-01 (Friday) — ISO year still 2026, week 53', () => {
  // 2027-01-01 is a Friday, so its week's Thursday (2026-12-31) is in
  // calendar year 2026 — ISO year 2026, week 53. The calendar year
  // shifted forward by one but the ISO year stays at 2026.
  assert.equal(format(Temporal.PlainDate.from('2027-01-01'), 'ww RRRR'), '53 2026');
});

test('boundary: 2027-01-04 (Monday) — first day of ISO week 1 of 2027', () => {
  // 2027-01-04 is a Monday, the start of ISO week 1 of 2027. The
  // Thursday of this week (2027-01-07) is in calendar year 2027.
  assert.equal(format(Temporal.PlainDate.from('2027-01-04'), 'ww RRRR'), '01 2027');
});

test('boundary: 2021-01-01 (Friday) — ISO year 2020, week 53 (2020 had 53 weeks)', () => {
  // 2020 was a 53-week ISO year (because 2020-01-01 was a Wednesday).
  // 2021-01-01 is a Friday; its week's Thursday is 2020-12-31 — ISO
  // year 2020, week 53.
  assert.equal(format(Temporal.PlainDate.from('2021-01-01'), 'ww RRRR'), '53 2020');
});

test('boundary: 2020-12-31 (Thursday) — ISO year 2020, week 53', () => {
  assert.equal(format(Temporal.PlainDate.from('2020-12-31'), 'ww RRRR'), '53 2020');
});

test('boundary: 2021-01-04 (Monday) — first day of ISO week 1 of 2021', () => {
  assert.equal(format(Temporal.PlainDate.from('2021-01-04'), 'ww RRRR'), '01 2021');
});

test('boundary: 2023-01-01 (Sunday) — ISO year 2022, week 52', () => {
  // 2023-01-01 is a Sunday; its week's Thursday is 2022-12-29, ISO
  // year 2022, week 52.
  assert.equal(format(Temporal.PlainDate.from('2023-01-01'), 'ww RRRR'), '52 2022');
});

test('boundary: 2023-01-02 (Monday) — first day of ISO week 1 of 2023', () => {
  assert.equal(format(Temporal.PlainDate.from('2023-01-02'), 'ww RRRR'), '01 2023');
});

// Walk the full boundary-crossing region for several years and check
// the ISO week/year arithmetic is internally consistent: the result
// must always be a valid (week, year) pair, and Dec 29-31 → early Jan
// boundary behavior must match what a reference algorithm produces.
// Reference: every Thursday's year is the ISO year, and week 1 is the
// week of the year's first Thursday — compute via the actual code.
test('consistency: ww and RRRR are mutually consistent across a multi-year boundary sweep', () => {
  // For every date in a 5-year span, the Thursday of the same week
  // (computed via dayOfWeek) must lie in the same ISO year as RRRR
  // reports. This catches any drift between how ww and RRRR are
  // computed — they share the isoWeekYearAndWeek() helper, but the
  // assertion here is end-to-end against format()'s output.
  const failures = [];
  let cursor = Temporal.PlainDate.from('2020-01-01');
  const end = Temporal.PlainDate.from('2025-01-01');
  const compare = Temporal.PlainDate.compare;
  while (compare(cursor, end) <= 0) {
    const formatted = format(cursor, 'ww RRRR');
    const [weekStr, yearStr] = formatted.split(' ');
    const week = Number(weekStr);
    const isoYear = Number(yearStr);
    // The Thursday of cursor's week is at cursor + (4 - dayOfWeek) days
    const thursday = cursor.add({ days: 4 - cursor.dayOfWeek });
    if (thursday.year !== isoYear) {
      failures.push({ cursor: cursor.toString(), formatted, thursdayYear: thursday.year });
    }
    // week must be 1-53
    if (week < 1 || week > 53) {
      failures.push({ cursor: cursor.toString(), formatted, weekOutOfRange: week });
    }
    cursor = cursor.add({ days: 1 });
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 5), null, 2));
});

test('ww/RRRR compose with other tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy-MM-dd 'is in' RRRR-'W'ww"), '2026-08-04 is in 2026-W32');
});

test('ww/RRRR: requires dayOfWeek field, throws on PlainTime', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => format(time, 'ww'), /requires "dayOfWeek"/);
  assert.throws(() => format(time, 'RRRR'), /requires "dayOfWeek"/);
});

test('ww: year with 53 weeks vs 52 weeks is handled correctly', () => {
  // ISO years with 53 weeks include 2020, 2026, 2032; 2021 has 52.
  // Just spot-check that the maximum week for 2026 is 53 and for
  // 2021 is 52.
  let maxWeek2026 = 0;
  let cursor = Temporal.PlainDate.from('2026-12-15');
  for (let i = 0; i < 25; i++) {
    const w = Number(format(cursor, 'ww'));
    if (w > maxWeek2026) maxWeek2026 = w;
    cursor = cursor.add({ days: 1 });
  }
  assert.equal(maxWeek2026, 53, '2026 should have ISO week 53');

  let maxWeek2021 = 0;
  cursor = Temporal.PlainDate.from('2021-12-15');
  for (let i = 0; i < 25; i++) {
    const w = Number(format(cursor, 'ww'));
    if (w > maxWeek2021) maxWeek2021 = w;
    cursor = cursor.add({ days: 1 });
  }
  // 2021's last week is 52 (Friday 2021-12-31 → ISO year 2021 week 52)
  // — so week 52 should be the max seen across Dec 15..Jan 8.
  assert.equal(maxWeek2021, 52, '2021 ISO week max should be 52');
});

test('ww/RRRR cannot be parsed back — pattern builder rejects them as format-only', () => {
  assert.throws(() => parse('ww yyyy', '32 2026'), /format-only/);
  assert.throws(() => parse('RRRR yyyy', '2026 2026'), /format-only/);
});
