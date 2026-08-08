import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Use native Temporal when available (Node 26+), polyfill otherwise —
// format() goes through Temporal.prototype.toLocaleString(), which works
// the same either way.
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

test('PlainDateTime: midnight rolls to 12, not 0', () => {
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

test('doubled quote inside a quoted span is a literal quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy 'it''s here'"), "2026 it's here");
});

test('doubled quote at top level is a standalone literal quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''"), "2026'");
});

test('bare punctuation passes through as literal', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy/MM/dd'), '2026/08/04');
});

test('MMMM is not read as four M tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
});

test('throws when a token needs a field the input type does not have', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'HH:mm'), /requires "hour"/);
});

test('throws on unterminated quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "yyyy 'oops"), /unterminated quote/);
});

test('PlainTime: works without date fields', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.equal(format(time, 'HH:mm:ss'), '15:45:30');
});

test('locale defaults to en-US', () => {
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

test('ar-EG: locale-native day period, not hardcoded AM/PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'h:mm a', { locale: 'ar-EG' }), '3:45 م');
});

test('ja-JP: day period renders in Japanese', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'a', { locale: 'ja-JP' }), '午後');
});

test('numeric tokens stay Western digits regardless of locale', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd', { locale: 'ar-EG' }), '2026-08-04');
});

test('ZonedDateTime: locale month works alongside zzz', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'MMMM d, yyyy zzz'), 'August 4, 2026 America/New_York');
});

test('ZonedDateTime: locale weekday in a non-English locale', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'EEEE', { locale: 'fr-FR' }), 'mardi');
});

test('Hebrew calendar date reads its own calendar off the object', () => {
  const date = Temporal.PlainDate.from('2026-08-04').withCalendar('hebrew');
  // not pinning exact numerals long-term, just that it doesn't throw and
  // uses the Hebrew month
  const result = format(date, 'MMMM d, yyyy');
  assert.equal(result, 'Av 21, 5786');
});

test('month-only query on iso8601 does not drop the token', () => {
  // regression — see the iso8601 skip in tokens.ts intlPart()
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
  assert.equal(format(date, 'EEEE'), 'Tuesday');
});