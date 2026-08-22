import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBusinessDays,
  createBusinessCalendar,
  createHolidayCalendar,
  differenceInBusinessDays,
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  setTemporal,
  subtractBusinessDays,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// phase2-final.test.js covers the happy-path basics (default weekend,
// nextBusinessDay, addBusinessDays/subtractBusinessDays, a custom weekend).
// This fills in previousBusinessDay, holiday-calendar wiring, the 14-day
// give-up throws, differenceInBusinessDays, and isBusinessDay's plain
// year/month/day fallback path.

test('previousBusinessDay: skips backward over a weekend', () => {
  const cal = createBusinessCalendar();
  const monday = Temporal.PlainDate.from('2026-08-10'); // Monday
  const prev = previousBusinessDay(cal, monday);
  // add()/subtract() return a plain field bag, not a Temporal.PlainDate,
  // so compare fields directly rather than via String().
  assert.deepEqual({ year: prev.year, month: prev.month, day: prev.day }, { year: 2026, month: 8, day: 7 }); // Friday
});

test('isBusinessDay: a holiday calendar makes a weekday count as non-business', () => {
  const holidays = createHolidayCalendar([{ month: 8, day: 5, name: 'Test Holiday' }]);
  const cal = createBusinessCalendar({ holidays });
  const holiday = Temporal.PlainDate.from('2026-08-05'); // Wednesday
  assert.ok(!isBusinessDay(cal, holiday));
  const dayAfter = Temporal.PlainDate.from('2026-08-06');
  assert.ok(isBusinessDay(cal, dayAfter));
});

test('nextBusinessDay: skips both a weekend and a holiday landing right after it', () => {
  const holidays = createHolidayCalendar([{ month: 8, day: 10, name: 'Monday holiday' }]);
  const cal = createBusinessCalendar({ holidays });
  const friday = Temporal.PlainDate.from('2026-08-07');
  const next = nextBusinessDay(cal, friday);
  assert.deepEqual({ year: next.year, month: next.month, day: next.day }, { year: 2026, month: 8, day: 11 }); // Tue, since Sat/Sun/Mon are all out
});

test('nextBusinessDay: throws when every candidate within the search window is excluded', () => {
  // Weekend covers all 7 ISO weekdays -- no day can ever be a business day.
  const cal = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
  assert.throws(
    () => nextBusinessDay(cal, Temporal.PlainDate.from('2026-08-04')),
    /gave up after 14 days/,
  );
});

test('previousBusinessDay: throws when every candidate within the search window is excluded', () => {
  const cal = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
  assert.throws(
    () => previousBusinessDay(cal, Temporal.PlainDate.from('2026-08-04')),
    /gave up after 14 days/,
  );
});

test('addBusinessDays: zero days returns the input unchanged', () => {
  const cal = createBusinessCalendar();
  const d = Temporal.PlainDate.from('2026-08-04');
  const r = addBusinessDays(cal, d, 0);
  assert.equal(r, d);
});

test('subtractBusinessDays: delegates to addBusinessDays with a negated count', () => {
  const cal = createBusinessCalendar();
  const friday = Temporal.PlainDate.from('2026-08-07');
  const r = subtractBusinessDays(cal, friday, 1);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 2026, month: 8, day: 6 });
});

test('differenceInBusinessDays: counts forward business days between two dates', () => {
  const cal = createBusinessCalendar();
  // Mon 2026-08-10 to Fri 2026-08-14: 4 business days apart (Tue,Wed,Thu,Fri).
  const a = Temporal.PlainDate.from('2026-08-10');
  const b = Temporal.PlainDate.from('2026-08-14');
  assert.equal(differenceInBusinessDays(cal, a, b), 4);
});

test('differenceInBusinessDays: counts backward (negative) when b precedes a', () => {
  const cal = createBusinessCalendar();
  const a = Temporal.PlainDate.from('2026-08-14');
  const b = Temporal.PlainDate.from('2026-08-10');
  assert.equal(differenceInBusinessDays(cal, a, b), -4);
});

test('differenceInBusinessDays: zero when a and b are the same date', () => {
  const cal = createBusinessCalendar();
  const a = Temporal.PlainDate.from('2026-08-10');
  assert.equal(differenceInBusinessDays(cal, a, a), 0);
});

test('differenceInBusinessDays: counts business days even when b is a weekend', () => {
  const cal = createBusinessCalendar();
  const a = Temporal.PlainDate.from('2026-08-10'); // Monday
  const b = Temporal.PlainDate.from('2026-08-15'); // Saturday
  assert.equal(differenceInBusinessDays(cal, a, b), 4);
});

test('addBusinessDays: rejects non-integer and oversized counts', () => {
  const cal = createBusinessCalendar();
  const d = Temporal.PlainDate.from('2026-08-10');
  assert.throws(() => addBusinessDays(cal, d, 1.5), /business-day count must be a finite safe integer/);
  assert.throws(() => addBusinessDays(cal, d, Infinity), /business-day count must be a finite safe integer/);
  assert.throws(() => addBusinessDays(cal, d, 100001), /exceeded the 100000-day limit/);
});

test('differenceInBusinessDays: rejects traversal beyond the safety limit', () => {
  const cal = createBusinessCalendar();
  const a = Temporal.PlainDate.from('1900-01-01');
  const b = a.add({ days: 100001 });
  assert.throws(
    () => differenceInBusinessDays(cal, a, b),
    /differenceInBusinessDays\(\) exceeded the 100000-day traversal limit/,
  );
});

test('isBusinessDay: derives weekday from year/month/day on a plain field bag lacking dayOfWeek', () => {
  const cal = createBusinessCalendar();
  // A plain object (not a real Temporal instance) with no dayOfWeek field --
  // exercises the Date.UTC-based fallback rather than trusting a cached value.
  assert.ok(isBusinessDay(cal, { year: 2026, month: 8, day: 4 })); // Tuesday
  assert.ok(!isBusinessDay(cal, { year: 2026, month: 8, day: 8 })); // Saturday
});

test('isBusinessDay: throws when the value has neither dayOfWeek nor year/month/day', () => {
  const cal = createBusinessCalendar();
  assert.throws(
    () => isBusinessDay(cal, {}),
    /needs a value with dayOfWeek/,
  );
});

test('createBusinessCalendar: default workingHours gives 8 for weekdays and 0 for the weekend', () => {
  const cal = createBusinessCalendar();
  assert.equal(cal.workingHours[1], 8); // Monday
  assert.equal(cal.workingHours[6], 0); // Saturday
  assert.equal(cal.workingHours[7], 0); // Sunday
});

test('createBusinessCalendar: an explicit workingHours entry is respected over the default', () => {
  const cal = createBusinessCalendar({ workingHours: { 5: 4 } }); // short Friday
  assert.equal(cal.workingHours[5], 4);
  assert.equal(cal.workingHours[1], 8); // untouched days still get the default
});

test('createBusinessCalendar: halfDays option is stored as a Set', () => {
  const cal = createBusinessCalendar({ halfDays: [5] });
  assert.ok(cal.halfDays.has(5));
  assert.ok(!cal.halfDays.has(1));
});

test('createBusinessCalendar: defaults to Sat/Sun weekend', () => {
  const cal = createBusinessCalendar();
  // Tuesday (Aug 4, 2026) is a business day.
  assert.ok(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-04')));
  // Saturday is not.
  assert.ok(!isBusinessDay(cal, Temporal.PlainDate.from('2026-08-08')));
});

test('nextBusinessDay: skips weekend', () => {
  const cal = createBusinessCalendar();
  const friday = Temporal.PlainDate.from('2026-08-07');
  const next = nextBusinessDay(cal, friday);
  // Friday Aug 7 2026 → next business day is Monday Aug 10 (Aug 8/9 are weekend).
  // next is a field bag, not PlainDate; check the date fields.
  assert.equal(`${next.year}-${String(next.month).padStart(2,'0')}-${String(next.day).padStart(2,'0')}`, '2026-08-10');
});

test('addBusinessDays: adds business days only', () => {
  const cal = createBusinessCalendar();
  const friday = Temporal.PlainDate.from('2026-08-07');
  // Friday + 1 business day → Monday.
  const r = addBusinessDays(cal, friday, 1);
  assert.equal(`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`, '2026-08-10');
  // Friday + 3 business days → Wednesday next week.
  const r2 = addBusinessDays(cal, friday, 3);
  assert.equal(`${r2.year}-${String(r2.month).padStart(2,'0')}-${String(r2.day).padStart(2,'0')}`, '2026-08-12');
});

test('subtractBusinessDays: subtracts business days only', () => {
  const cal = createBusinessCalendar();
  const monday = Temporal.PlainDate.from('2026-08-10');
  const r = subtractBusinessDays(cal, monday, 1);
  // Monday - 1 business day → Friday.
  assert.equal(`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`, '2026-08-07');
});

test('createBusinessCalendar: custom weekend (Sun-only)', () => {
  const cal = createBusinessCalendar({ weekend: [7] });
  // Saturday is now a business day.
  assert.ok(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-08')));
});
