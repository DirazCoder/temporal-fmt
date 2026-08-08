import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// parse() needs a Temporal implementation to construct its result (unlike
// format(), which only reads fields off an object the caller already
// built) — inject it via setTemporal() before any parse() call runs.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('builds a PlainDate', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('builds a PlainDateTime', () => {
  const result = parse('yyyy-MM-dd HH:mm:ss', '2026-08-04 15:45:30');
  assert.equal(result.toString(), Temporal.PlainDateTime.from('2026-08-04T15:45:30').toString());
});

test('builds a PlainTime', () => {
  const result = parse('HH:mm:ss', '15:45:30');
  assert.equal(result.toString(), Temporal.PlainTime.from('15:45:30').toString());
});

test('builds a ZonedDateTime', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
  assert.equal(
    result.toString(),
    Temporal.ZonedDateTime.from('2026-08-04T15:45:00-04:00[America/New_York]').toString()
  );
});

test('yy pivot: 00-68 maps to 2000s', () => {
  const result = parse('yy-MM-dd', '26-08-04');
  assert.equal(result.year, 2026);
});

test('yy pivot: 69-99 maps to 1900s', () => {
  const result = parse('yy-MM-dd', '75-08-04');
  assert.equal(result.year, 1975);
});

test('12-hour token with AM/PM resolves to correct 24-hour value', () => {
  const result = parse('yyyy-MM-dd h:mm a', '2026-08-04 3:45 PM');
  assert.equal(result.hour, 15);
});

test('12-hour midnight/noon rollover', () => {
  assert.equal(parse('h:mm a', '12:15 AM').hour, 0);
  assert.equal(parse('h:mm a', '12:15 PM').hour, 12);
});

test('12-hour token without an "a" token throws', () => {
  assert.throws(() => parse('yyyy-MM-dd h:mm', '2026-08-04 3:45'));
});

test('mixing a 24-hour token with a 12-hour token throws, even when the values agree', () => {
  // HH says 15, h/a says 3 PM — same instant, still rejected: parse() doesn't
  // pick a winner between two hour tokens that shouldn't both be there.
  assert.throws(() => parse('HH h a', '15 3 PM'));
});

test('mixing a 24-hour token with a 12-hour token throws when the values disagree', () => {
  assert.throws(() => parse('HH h a', '15 9 AM'));
});

test('locale month name reverse lookup, default en-US', () => {
  const result = parse('MMMM d, yyyy', 'August 4, 2026');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('locale month name reverse lookup with a locale option', () => {
  const result = parse('MMMM d, yyyy', 'août 4, 2026', { locale: 'fr-FR' });
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('shape mismatch throws', () => {
  assert.throws(() => parse('yyyy-MM', '2026-08-04T15:45:30'));
});

test('impossible date throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-02-30'));
});

test('weekday token matching the actual date succeeds', () => {
  // 2026-08-04 is a Tuesday
  const result = parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('weekday token mismatched with the actual date throws', () => {
  assert.throws(() => parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04'));
});

test('quoted literal text is matched but not captured', () => {
  const result = parse("'at' h:mm a", 'at 3:45 PM');
  assert.equal(result.hour, 15);
  assert.equal(result.minute, 45);
});

test('locale option selects a non-Gregorian calendar for construction', () => {
  const gregorian = Temporal.PlainDate.from('2026-08-04');
  const hebrew = gregorian.withCalendar('hebrew');
  const input = `${hebrew.year}-${String(hebrew.month).padStart(2, '0')}-${String(hebrew.day).padStart(2, '0')}`;
  const result = parse('yyyy-MM-dd', input, { locale: 'en-u-ca-hebrew' });
  assert.equal(result.calendarId, 'hebrew');
  assert.equal(result.withCalendar('iso8601').toString(), gregorian.toString());
});

test('no locale option still builds a plain ISO 8601 result', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.calendarId, 'iso8601');
});

test('setTemporal injection works even without a global Temporal', () => {
  const savedGlobal = globalThis.Temporal;
  delete globalThis.Temporal;
  setTemporal(PolyfillTemporal);
  try {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  } finally {
    if (savedGlobal !== undefined) globalThis.Temporal = savedGlobal;
    setTemporal(Temporal); // restore for the rest of this file's tests
  }
});
