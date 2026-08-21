import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDuration,
  assertInstant,
  assertPlainDate,
  assertPlainDateTime,
  assertPlainMonthDay,
  assertPlainTime,
  assertPlainYearMonth,
  assertTemporal,
  assertZonedDateTime,
  isDuration,
  isInstant,
  isPlainDate,
  isPlainDateTime,
  isPlainMonthDay,
  isPlainTime,
  isPlainYearMonth,
  isTemporal,
  isZonedDateTime,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Type guards — duck-typed detection. PlainDate has year/month/day and
// toPlainDateTime, no hour; PlainTime has hour and toPlainDateTime, no
// year/month/day; etc.
test('isPlainDate: true for PlainDate, false for everything else', () => {
  assert.equal(isPlainDate(Temporal.PlainDate.from('2026-08-04')), true);
  assert.equal(isPlainDate(Temporal.PlainTime.from('15:45:30')), false);
  assert.equal(isPlainDate(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
  assert.equal(isPlainDate(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), false);
  assert.equal(isPlainDate({}), false);
  assert.equal(isPlainDate(null), false);
  assert.equal(isPlainDate(undefined), false);
  assert.equal(isPlainDate(42), false);
});

test('isPlainTime: true for PlainTime, false for everything else', () => {
  assert.equal(isPlainTime(Temporal.PlainTime.from('15:45:30')), true);
  assert.equal(isPlainTime(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
});

test('isPlainDateTime: true for PlainDateTime, false for everything else', () => {
  assert.equal(isPlainDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), true);
  assert.equal(isPlainDateTime(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainDateTime(Temporal.PlainTime.from('15:45:30')), false);
});

test('isZonedDateTime: true for ZonedDateTime, false for everything else', () => {
  assert.equal(isZonedDateTime(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), true);
  assert.equal(isZonedDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
  assert.equal(isZonedDateTime(Temporal.PlainDate.from('2026-08-04')), false);
});

test('isPlainYearMonth: true for PlainYearMonth, false for everything else', () => {
  assert.equal(isPlainYearMonth(Temporal.PlainYearMonth.from('2026-08')), true);
  assert.equal(isPlainYearMonth(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainYearMonth(Temporal.PlainMonthDay.from('08-04')), false);
});

test('isPlainMonthDay: true for PlainMonthDay, false for everything else', () => {
  assert.equal(isPlainMonthDay(Temporal.PlainMonthDay.from('08-04')), true);
  assert.equal(isPlainMonthDay(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainMonthDay(Temporal.PlainYearMonth.from('2026-08')), false);
});

test('isInstant: true for Instant, false for everything else', () => {
  assert.equal(isInstant(Temporal.Instant.from('2026-08-04T15:45:30Z')), true);
  assert.equal(isInstant(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isInstant(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), false);
});

test('isDuration: true for Duration, false for everything else', () => {
  assert.equal(isDuration(Temporal.Duration.from({ hours: 2, minutes: 30 })), true);
  assert.equal(isDuration(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isDuration({}), false);
});

test('isTemporal: umbrella guard catches any Temporal type', () => {
  assert.equal(isTemporal(Temporal.PlainDate.from('2026-08-04')), true);
  assert.equal(isTemporal(Temporal.PlainTime.from('15:45:30')), true);
  assert.equal(isTemporal(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), true);
  assert.equal(isTemporal(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), true);
  assert.equal(isTemporal(Temporal.Instant.from('2026-08-04T15:45:30Z')), true);
  assert.equal(isTemporal(Temporal.Duration.from({ hours: 2 })), true);
  assert.equal(isTemporal(Temporal.PlainYearMonth.from('2026-08')), true);
  assert.equal(isTemporal(Temporal.PlainMonthDay.from('08-04')), true);
  assert.equal(isTemporal({}), false);
  assert.equal(isTemporal(null), false);
  assert.equal(isTemporal(42), false);
});

test('assertTemporal: throws descriptively on non-Temporal input', () => {
  assert.throws(() => assertTemporal(42), /expected a Temporal\.object.*got number/);
  assert.throws(() => assertTemporal({}), /expected a Temporal\.object.*got plain object/);
  // Doesn't throw on actual Temporal values.
  assert.doesNotThrow(() => assertTemporal(Temporal.PlainDate.from('2026-08-04')));
});

test('assertPlainDate: throws descriptively on PlainTime (wrong type)', () => {
  assert.throws(
    () => assertPlainDate(Temporal.PlainTime.from('15:45:30')),
    /expected a Temporal\.PlainDate, got instance of PlainTime/,
  );
});

// Structural fallback — hand-built objects with no Symbol.toStringTag,
// so hasTag() can't short-circuit and each guard has to fall through to
// its duck-typed field/method checks instead.
test('isPlainDate: structural fallback matches a tag-less PlainDate shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4,
    toPlainDateTime: () => {}, withCalendar: () => {},
  };
  assert.equal(isPlainDate(fake), true);
  assert.equal(isPlainDate({ ...fake, hour: 12 }), false); // has hour -> not PlainDate
  assert.equal(isPlainDate({ ...fake, toPlainDateTime: undefined }), false); // missing method
  assert.equal(isPlainDate({ ...fake, withCalendar: undefined }), false); // missing method
});

test('isPlainTime: structural fallback matches a tag-less PlainTime shape', () => {
  const fake = { hour: 15 };
  assert.equal(isPlainTime(fake), true);
  assert.equal(isPlainTime({ ...fake, year: 2026 }), false); // has year -> not PlainTime
  assert.equal(isPlainTime({ ...fake, withCalendar: () => {} }), false);
  assert.equal(isPlainTime({ ...fake, toPlainDate: () => {} }), false);
  assert.equal(isPlainTime({ ...fake, toPlainDateTime: () => {} }), false);
});

test('isPlainDateTime: structural fallback matches a tag-less PlainDateTime shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4, hour: 15,
    withPlainTime: () => {},
  };
  assert.equal(isPlainDateTime(fake), true);
  assert.equal(isPlainDateTime({ ...fake, withPlainTime: undefined }), false);
  assert.equal(isPlainDateTime({ ...fake, toInstant: () => {} }), false); // ZonedDateTime has this too
});

test('isZonedDateTime: structural fallback matches a tag-less ZonedDateTime shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4, hour: 15,
    withTimeZone: () => {}, toInstant: () => {},
  };
  assert.equal(isZonedDateTime(fake), true);
  assert.equal(isZonedDateTime({ ...fake, withTimeZone: undefined }), false);
  assert.equal(isZonedDateTime({ ...fake, toInstant: undefined }), false);
});

test('isInstant: structural fallback matches a tag-less Instant shape', () => {
  const fake = { toZonedDateTimeISO: () => {} };
  assert.equal(isInstant(fake), true);
  assert.equal(isInstant({ ...fake, toInstant: () => {} }), false); // ZonedDateTime also has this
  assert.equal(isInstant({ ...fake, year: 2026 }), false); // Instant has no date fields
});

test('isPlainYearMonth: structural fallback matches a tag-less PlainYearMonth shape', () => {
  const fake = { year: 2026, month: 8, toPlainDate: () => {} };
  assert.equal(isPlainYearMonth(fake), true);
  assert.equal(isPlainYearMonth({ ...fake, day: 4 }), false); // has day -> not PlainYearMonth
  assert.equal(isPlainYearMonth({ ...fake, toPlainDate: undefined }), false);
});

test('isPlainMonthDay: structural fallback matches a tag-less PlainMonthDay shape', () => {
  const fake = { day: 4, monthCode: 'M08', toPlainDate: () => {} };
  assert.equal(isPlainMonthDay(fake), true);
  assert.equal(isPlainMonthDay({ ...fake, year: 2026 }), false); // has year -> not PlainMonthDay
  assert.equal(isPlainMonthDay({ ...fake, month: 8 }), false); // has numeric month -> not PlainMonthDay
  assert.equal(isPlainMonthDay({ ...fake, monthCode: undefined }), false);
  assert.equal(isPlainMonthDay({ ...fake, toPlainDate: undefined }), false);
});

test('isDuration: structural fallback matches a tag-less Duration shape', () => {
  assert.equal(isDuration({ total: () => 0 }), true);
});

test('type guards: false for non-object input (primitives, null)', () => {
  for (const bad of [42, 'x', undefined, null]) {
    assert.equal(isPlainTime(bad), false);
    assert.equal(isPlainDateTime(bad), false);
    assert.equal(isZonedDateTime(bad), false);
    assert.equal(isInstant(bad), false);
    assert.equal(isPlainYearMonth(bad), false);
    assert.equal(isPlainMonthDay(bad), false);
    assert.equal(isDuration(bad), false);
  }
});

test('isTemporal: structural fallback matches any tag-less Temporal-shaped object', () => {
  assert.equal(isTemporal({ withPlainTime: () => {} }), true);
  assert.equal(isTemporal({ total: () => 0 }), true);
  assert.equal(isTemporal({ toZonedDateTimeISO: () => {} }), true);
});

test('describeValue (via assertTemporal): describes null and array distinctly', () => {
  assert.throws(() => assertTemporal(null), /expected a Temporal\.object.*got null/);
  assert.throws(() => assertTemporal([1, 2, 3]), /expected a Temporal\.object.*got array/);
});

// Every assert* wrapper: one passing call, one throwing call, so both
// assertImpl branches and the wrapper function itself get exercised.
test('assertInstant: passes for Instant, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertInstant(Temporal.Instant.from('2026-08-04T15:45:30Z')));
  assert.throws(
    () => assertInstant(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.Instant, got instance of PlainDate/,
  );
});

test('assertPlainTime: passes for PlainTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainTime(Temporal.PlainTime.from('15:45:30')));
  assert.throws(
    () => assertPlainTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainTime, got instance of PlainDate/,
  );
});

test('assertPlainDateTime: passes for PlainDateTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')));
  assert.throws(
    () => assertPlainDateTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainDateTime, got instance of PlainDate/,
  );
});

test('assertZonedDateTime: passes for ZonedDateTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertZonedDateTime(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')));
  assert.throws(
    () => assertZonedDateTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.ZonedDateTime, got instance of PlainDate/,
  );
});

test('assertPlainYearMonth: passes for PlainYearMonth, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainYearMonth(Temporal.PlainYearMonth.from('2026-08')));
  assert.throws(
    () => assertPlainYearMonth(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainYearMonth, got instance of PlainDate/,
  );
});

test('assertPlainMonthDay: passes for PlainMonthDay, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainMonthDay(Temporal.PlainMonthDay.from('08-04')));
  assert.throws(
    () => assertPlainMonthDay(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainMonthDay, got instance of PlainDate/,
  );
});

test('assertDuration: passes for Duration, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertDuration(Temporal.Duration.from({ hours: 2 })));
  assert.throws(
    () => assertDuration(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.Duration, got instance of PlainDate/,
  );
});
