import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// `do` is format-only: renders a day-of-month with an English ordinal
// suffix (1st, 2nd, 3rd, 4th... 11th, 12th, 13th... 21st, 22nd, 23rd).
// Locale-aware ordinals are out of scope and documented as English-only.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('do: 1st, 2nd, 3rd, 4th', () => {
  const date = (d) => Temporal.PlainDate.from(`2026-01-${String(d).padStart(2, '0')}`);
  assert.equal(format(date(1), 'do'), '1st');
  assert.equal(format(date(2), 'do'), '2nd');
  assert.equal(format(date(3), 'do'), '3rd');
  assert.equal(format(date(4), 'do'), '4th');
});

test('do: 11, 12, 13 are always "th" (the exception case)', () => {
  const date = (d) => Temporal.PlainDate.from(`2026-01-${String(d).padStart(2, '0')}`);
  assert.equal(format(date(11), 'do'), '11th');
  assert.equal(format(date(12), 'do'), '12th');
  assert.equal(format(date(13), 'do'), '13th');
});

test('do: 21st, 22nd, 23rd, 24th... 31st', () => {
  const date = (d) => Temporal.PlainDate.from(`2026-01-${String(d).padStart(2, '0')}`);
  assert.equal(format(date(21), 'do'), '21st');
  assert.equal(format(date(22), 'do'), '22nd');
  assert.equal(format(date(23), 'do'), '23rd');
  assert.equal(format(date(24), 'do'), '24th');
  assert.equal(format(date(31), 'do'), '31st');
});

test('do: every day 1-31 across a full month', () => {
  // walk every day of January 2026 and confirm each ordinal is correct
  // — exhaustive across one month, since the rule has a small boundary
  // (11-13 exception) that a hand-picked subset could miss
  const expected = [
    '1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th',
    '11th','12th','13th','14th','15th','16th','17th','18th','19th','20th',
    '21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th','31st',
  ];
  for (let d = 1; d <= 31; d++) {
    const date = Temporal.PlainDate.from({ year: 2026, month: 1, day: d });
    assert.equal(format(date, 'do'), expected[d - 1], `day ${d} should be "${expected[d - 1]}"`);
  }
});

test('do: composes with other tokens in a format string', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "MMMM do, yyyy"), 'August 4th, 2026');
  assert.equal(format(date, "MMM do"), 'Aug 4th');
});

test('do: requires "day" field, throws on PlainTime', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => format(time, 'do'), /requires "day"/);
});

test('do: locale option has no effect — English suffixes only', () => {
  // French doesn't have "st"/"nd"/"rd" suffixes at all; if the token
  // ever started producing locale-aware output, fr-FR would shift. Pin
  // the English-only contract so a regression to locale-aware is caught.
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'do', { locale: 'fr-FR' }), '4th');
  assert.equal(format(date, 'do', { locale: 'ja-JP' }), '4th');
  assert.equal(format(date, 'do', { locale: 'ar-EG' }), '4th');
});

test('do: cannot be parsed back — pattern builder rejects it with a clear error', () => {
  // do is format-only because the "st"/"nd"/"rd"/"th" suffix isn't
  // structurally distinguishable from adjacent literal text in a parse
  // context. parse()'s regex builder throws early with a "format-only"
  // message rather than silently dropping the token.
  assert.throws(
    () => parse('do yyyy', '4th 2026'),
    /format-only/,
    'parse() should reject `do` as a format-only token, not silently accept or drop it'
  );
});
