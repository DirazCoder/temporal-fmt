import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Use real native Temporal (Node 26+) when it's available — Intl only
// recognizes the engine's own Temporal classes, not a userland polyfill's
// lookalike objects, so feeding polyfilled instances to Intl.DateTimeFormat
// throws "Cannot use valueOf" even on Node 26+ where native Temporal exists
// but this file imported the polyfill instead of using it. Fall back to
// temporal-polyfill/full (which includes non-Gregorian calendar data) only
// on older Node without native Temporal — locale-aware tests will still
// fail there, since Intl can't format polyfilled objects on any Node
// version. See README's "Known limitations" for the full story.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

test('PlainDate: basic yyyy-MM-dd', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('PlainDate: 2-digit year and unpadded month/day', () => {
  const date = Temporal.PlainDate.from('2026-01-05');
  assert.equal(format(date, 'yy-M-d'), '26-1-5');
});

test('PlainDate: long month and weekday names', () => {
  // 2026-08-04 is a Tuesday
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEEE, MMMM d, yyyy'), 'Tuesday, August 4, 2026');
});

test('PlainDate: short month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEE, MMM d'), 'Tue, Aug 4');
});

test('PlainDateTime: 24-hour time with seconds', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, 'yyyy-MM-dd HH:mm:ss'), '2026-08-04 15:45:30');
});

test('PlainDateTime: 12-hour time with AM/PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, 'h:mm a'), '3:45 PM');
});

test('PlainDateTime: 12-hour midnight rolls to 12, not 0', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T00:15:00');
  assert.equal(format(dt, 'h:mm a'), '12:15 AM');
});

test('PlainDateTime: milliseconds', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.007');
  assert.equal(format(dt, 'ss.SSS'), '30.007');
});

test('ZonedDateTime: includes IANA time zone id', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'yyyy-MM-dd HH:mm zzz'), '2026-08-04 15:45 America/New_York');
});

test('quoted literal text passes through unparsed', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, "MMM d, yyyy 'at' h:mm a"), 'Aug 4, 2026 at 3:45 PM');
});

test('doubled single quote inside a quoted span is a literal quote character', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy 'it''s here'"), "2026 it's here");
});

test('doubled single quote at top level is a standalone literal quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''"), "2026'");
});

test('bare punctuation (non-token characters) passes through as literal', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy/MM/dd'), '2026/08/04');
});

test('longest-match tokenizing: MMMM is not read as four separate M tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
});

test('throws when a token needs a field the input type does not have', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'HH:mm'), /requires "hour"/);
});

test('throws on unterminated quote in format string', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "yyyy 'oops"), /unterminated quote/);
});

test('PlainTime: time-only formatting works without date fields', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.equal(format(time, 'HH:mm:ss'), '15:45:30');
});

// --- Locale support ---

test('locale defaults to en-US when not specified', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM d, yyyy'), 'August 4, 2026');
});

test('fr-FR: localized month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEEE d MMMM yyyy', { locale: 'fr-FR' }), 'mardi 4 août 2026');
});

test('ar-EG: RTL script month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const result = format(date, 'EEEE d MMMM yyyy', { locale: 'ar-EG' });
  assert.equal(result, 'الثلاثاء 4 أغسطس 2026');
});

test('ar-EG: locale-native day-period string, not hardcoded AM/PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'h:mm a', { locale: 'ar-EG' }), '3:45 م');
});

test('ja-JP: day-period renders in Japanese', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'a', { locale: 'ja-JP' }), '午後');
});

test('numeric tokens stay Western digits regardless of locale', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd', { locale: 'ar-EG' }), '2026-08-04');
});

test('ZonedDateTime: locale-aware month works alongside zzz (Instant+timeZone path)', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'MMMM d, yyyy zzz'), 'August 4, 2026 America/New_York');
});

test('ZonedDateTime: locale-aware weekday in a non-English locale', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'EEEE', { locale: 'fr-FR' }), 'mardi');
});

test('non-Gregorian calendar: Hebrew calendar date formats correctly, calendar read off the object itself', () => {
  const date = Temporal.PlainDate.from('2026-08-04').withCalendar('hebrew');
  // Not asserting the exact numerals/name long-term (calendar conversion
  // specifics could shift with CLDR data updates) — asserting it doesn't
  // throw and produces the Hebrew month name, not the Gregorian one.
  const result = format(date, 'MMMM d, yyyy');
  assert.equal(result, 'Av 21, 5786');
});

test('non-Gregorian calendar: month-only query does not silently drop the token (iso8601-vs-explicit-calendar regression)', () => {
  // Regression test — see tokens.ts's intlPart() for the full explanation
  // of the iso8601-vs-explicit-calendar Intl quirk this guards against.
  // Plain (default calendar) objects must never hit that path.
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
  assert.equal(format(date, 'EEEE'), 'Tuesday');
});