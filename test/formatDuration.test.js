import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// formatDuration takes a Temporal.Duration (or field bag) and renders
// with a duration-specific token set: y/o/w/d/h/m/s/S for each of
// years/months/weeks/days/hours/minutes/seconds/milliseconds, with
// single (numeric) / double (short, plural-aware) / triple (long,
// plural-aware) forms. Zero-value units are omitted by default.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('numeric form: single-letter token, value only', () => {
  assert.equal(formatDuration({ hours: 2 }, 'h'), '2');
  assert.equal(formatDuration({ minutes: 30 }, 'm'), '30');
  assert.equal(formatDuration({ seconds: 5 }, 's'), '5');
});

test('short form: double-letter, plural-aware suffix', () => {
  assert.equal(formatDuration({ hours: 1 }, 'hh'), '1h');
  assert.equal(formatDuration({ hours: 2 }, 'hh'), '2h');
  assert.equal(formatDuration({ minutes: 1 }, 'mm'), '1m');
  assert.equal(formatDuration({ minutes: 30 }, 'mm'), '30m');
  assert.equal(formatDuration({ years: 1 }, 'yy'), '1yr');
  assert.equal(formatDuration({ years: 2 }, 'yy'), '2yrs');
  assert.equal(formatDuration({ months: 1 }, 'oo'), '1mo');
  assert.equal(formatDuration({ months: 2 }, 'oo'), '2mos');
  assert.equal(formatDuration({ weeks: 1 }, 'ww'), '1wk');
  assert.equal(formatDuration({ weeks: 2 }, 'ww'), '2wks');
});

test('long form: triple-letter, full word with space, plural-aware', () => {
  assert.equal(formatDuration({ years: 1 }, 'yyy'), '1 year');
  assert.equal(formatDuration({ years: 2 }, 'yyy'), '2 years');
  assert.equal(formatDuration({ hours: 1 }, 'hhh'), '1 hour');
  assert.equal(formatDuration({ hours: 2 }, 'hhh'), '2 hours');
  assert.equal(formatDuration({ minutes: 30 }, 'mmm'), '30 minutes');
  assert.equal(formatDuration({ milliseconds: 5 }, 'SSS'), '5 milliseconds');
  assert.equal(formatDuration({ milliseconds: 1 }, 'SSS'), '1 millisecond');
});

test('mixed units in a single format string', () => {
  assert.equal(
    formatDuration({ years: 2, months: 3 }, 'yyy ooo'),
    '2 years 3 months'
  );
  assert.equal(
    formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm'),
    '2 hours 30 minutes'
  );
  assert.equal(
    formatDuration({ days: 1, hours: 6 }, 'ddd hhh'),
    '1 day 6 hours'
  );
});

test('singular vs plural flips correctly across all unit types', () => {
  // every unit's long form should be singular for value=1, plural for value != 1
  const cases = [
    ['y', 'yyy', 'year', 'years'],
    ['o', 'ooo', 'month', 'months'],
    ['w', 'www', 'week', 'weeks'],
    ['d', 'ddd', 'day', 'days'],
    ['h', 'hhh', 'hour', 'hours'],
    ['m', 'mmm', 'minute', 'minutes'],
    ['s', 'sss', 'second', 'seconds'],
    ['S', 'SSS', 'millisecond', 'milliseconds'],
  ];
  for (const [unit, longTok, singular, plural] of cases) {
    const field = `${singular}s`;
    assert.equal(formatDuration({ [field]: 1 }, longTok), `1 ${singular}`, `${unit} value 1 should be singular`);
    assert.equal(formatDuration({ [field]: 2 }, longTok), `2 ${plural}`, `${unit} value 2 should be plural`);
    assert.equal(formatDuration({ [field]: 0 }, longTok), '', `${unit} value 0 should be omitted by default`);
  }
});

test('zero-value units are omitted by default (no separator cleanup — caller structures the format string)', () => {
  // If only one unit has a value and the others are zero, the zero
  // units are simply not emitted. The separator literal may still
  // appear in the output if the format string puts one between tokens.
  // That's the documented behavior — the caller is responsible for
  // structuring their format string to not put separators after a unit
  // that might be zero.
  assert.equal(formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm'), '2 hours ');
  assert.equal(formatDuration({ hours: 0, minutes: 30 }, 'hhh mmm'), ' 30 minutes');
  assert.equal(formatDuration({ hours: 0, minutes: 0 }, 'hhh mmm'), ' ');
});

test('showZeroValues: true forces zero-value units to render', () => {
  assert.equal(
    formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { showZeroValues: true }),
    '2 hours 0 minutes'
  );
  assert.equal(
    formatDuration({ hours: 0, minutes: 0 }, 'hhh mmm', { showZeroValues: true }),
    '0 hours 0 minutes'
  );
});

test('Temporal.Duration object works the same as a field bag', () => {
  const dur = Temporal.Duration.from({ hours: 2, minutes: 30 });
  assert.equal(formatDuration(dur, 'hhh mmm'), '2 hours 30 minutes');
  assert.equal(formatDuration(dur, 'hh:mm'), '2h:30m');
});

test('quoted literal in format string works the same way as format()', () => {
  assert.equal(
    formatDuration({ hours: 2, minutes: 30 }, "hhh'min' mmm"),
    '2 hoursmin 30 minutes'
  );
  assert.equal(
    formatDuration({ hours: 2 }, "hh''hh"),
    "2h'2h"
  );
});

test('numeric-only format with literal separators', () => {
  assert.equal(formatDuration({ hours: 2, minutes: 30, seconds: 5 }, 'hh:mm:ss'), '2h:30m:5s');
  assert.equal(formatDuration({ hours: 2, minutes: 30, seconds: 5 }, 'hhh:mmm:sss'), '2 hours:30 minutes:5 seconds');
});

test('format string exceeding MAX_FORMAT_LENGTH throws', () => {
  assert.throws(() => formatDuration({ hours: 2 }, 'h'.repeat(1001)), /exceeds maximum length/);
});

test('negative values render with the minus sign preserved', () => {
  // Temporal.Duration can be negative (backwards); formatDuration
  // passes the value through with the sign, and the plural rule still
  // applies based on absolute value (so -1 hour → "-1 hour", -2 hours → "-2 hours").
  assert.equal(formatDuration({ hours: -1 }, 'hhh'), '-1 hour');
  assert.equal(formatDuration({ hours: -2 }, 'hhh'), '-2 hours');
});

test('non-finite values throw descriptively', () => {
  assert.throws(
    () => formatDuration({ hours: NaN }, 'hhh'),
    /not a finite number/
  );
  assert.throws(
    () => formatDuration({ hours: Infinity }, 'hhh'),
    /not a finite number/
  );
});

test('locale option is accepted but English-only (matches `do`)', () => {
  // Intl.DurationFormat exists in some engines but is still maturing;
  // for now, the unit names are hardcoded English. A caller passing
  // { locale: 'fr-FR' } shouldn't crash, but should still get English
  // unit names. Document this so a regression to locale-aware is caught.
  assert.equal(
    formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' }),
    '2 hours 30 minutes'
  );
});
