import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { format } from '../dist/index.js';

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
