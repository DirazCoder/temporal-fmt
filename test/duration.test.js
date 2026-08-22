import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDurationToParts, parseISODuration, formatISODuration, parseDuration,
  balanceDuration, totalDuration, compareDuration, addDuration, subtractDuration,
} from '../dist/index.js';

// Covers formatDurationToParts, the ISO-duration grammar's
// weeks/fractional/all-unit paths, parseDuration's short/long forms
// and error branches, and totalDuration's unsupported-unit throw.

test('formatDurationToParts: splits a simple token/literal format into parts', () => {
  // 'h' is numeric hours, 'mm' is minutes in short-suffix form (a duration
  // token, not a date/time padding token — 'mm' here means "value + 'm'").
  const parts = formatDurationToParts({ hours: 5, minutes: 30 }, 'h:mm');
  assert.deepEqual(parts, [
    { type: 'token', value: '5', token: 'h' },
    { type: 'literal', value: ':' },
    { type: 'token', value: '30m', token: 'mm' },
  ]);
});

test('formatDurationToParts: a token as the last piece runs to the end of the string', () => {
  const parts = formatDurationToParts({ years: 2 }, 'yyy');
  assert.deepEqual(parts, [{ type: 'token', value: '2 years', token: 'yyy' }]);
});

test('formatDurationToParts: quoted literal text passes through as a literal part', () => {
  const parts = formatDurationToParts({ hours: 3 }, "h 'hours left'");
  assert.deepEqual(parts, [
    { type: 'token', value: '3', token: 'h' },
    { type: 'literal', value: ' hours left' },
  ]);
});

test('formatDurationToParts: a zero-value unit still resolves its surrounding literal correctly', () => {
  // formatDuration() only omits a skipped token's own contribution to
  // the output — surrounding literals are always emitted unconditionally,
  // whether or not the adjacent token was suppressed. So the "literal
  // text missing from full" branch in the else-arm below (duration.ts,
  // the appendLiteral "not found" case) is unreachable via the public
  // API: every literal formatDurationToParts looks for really is there.
  // This test documents that the zero-value token contributes an empty
  // string while its literal neighbors stay intact, rather than
  // asserting on a branch that can't fire.
  const parts = formatDurationToParts({ hours: 0, minutes: 30 }, "h 'and' mm");
  assert.deepEqual(parts, [
    { type: 'token', value: '', token: 'h' },
    { type: 'literal', value: ' and ' },
    { type: 'token', value: '30m', token: 'mm' },
  ]);
});

test('parseISODuration: parses weeks (the ISO 8601-2 extension)', () => {
  const d = parseISODuration('P2W');
  assert.equal(d.weeks, 2);
});

test('parseISODuration: parses fractional values', () => {
  const d = parseISODuration('P1.5D');
  assert.equal(d.days, 1.5);
});

test('parseISODuration: parses every field at once', () => {
  const d = parseISODuration('P3Y6M2W4DT12H30M5S');
  assert.equal(d.years, 3);
  assert.equal(d.months, 6);
  assert.equal(d.weeks, 2);
  assert.equal(d.days, 4);
  assert.equal(d.hours, 12);
  assert.equal(d.minutes, 30);
  assert.equal(d.seconds, 5);
});

test('parseISODuration: PT-only (time fields with no date fields) parses correctly', () => {
  const d = parseISODuration('PT1H30M');
  assert.equal(d.hours, 1);
  assert.equal(d.minutes, 30);
  assert.equal(d.years, 0);
});

test('parseISODuration: throws on a string that does not match the grammar at all', () => {
  assert.throws(() => parseISODuration('not-a-duration'), /does not match ISO 8601 duration grammar/);
});

test('parseISODuration: throws on a bare "P" with no T section either', () => {
  assert.throws(() => parseISODuration('P'), /duration has no fields/);
});

test('formatISODuration: includes every field when all are present', () => {
  const formatted = formatISODuration({ years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7 });
  assert.equal(formatted, 'P1Y2M3W4DT5H6M7S');
});

test('formatISODuration: omits the T section entirely when no time fields are set', () => {
  const formatted = formatISODuration({ years: 1, days: 2 });
  assert.equal(formatted, 'P1Y2D');
});

test('formatISODuration: a single nonzero time field still gets a T section', () => {
  const formatted = formatISODuration({ seconds: 45 });
  assert.equal(formatted, 'PT45S');
});

test('parseDuration: short form captures the number and discards trailing unit text', () => {
  const d = parseDuration('5hrs', 'hh');
  assert.equal(d.hours, 5);
});

test('parseDuration: long form captures the number and discards trailing unit words', () => {
  const d = parseDuration('12 hours', 'hhh');
  assert.equal(d.hours, 12);
});

test('parseDuration: numeric form allows a negative sign', () => {
  const d = parseDuration('-5', 'h');
  assert.equal(d.hours, -5);
});

test('parseDuration: literal characters in the format are escaped and matched literally', () => {
  // 'h' (numeric) captures only digits, so the literal '.' in the format
  // must show up as an actual '.' in the input — not an 'h' character,
  // which 'h' the token never consumes.
  const d = parseDuration('3.30m', 'h.mm');
  assert.equal(d.hours, 3);
  assert.equal(d.minutes, 30);
});

test('parseDuration: throws when input does not match the compiled format pattern', () => {
  assert.throws(() => parseDuration('not a duration', 'h:mm'), /does not match duration format/);
});

test('balanceDuration: carries seconds up through minutes, hours, and days', () => {
  const balanced = balanceDuration({ seconds: 90_000 });
  // 90000s = 25h = 1d1h
  assert.equal(balanced.days, 1);
  assert.equal(balanced.hours, 1);
  assert.equal(balanced.minutes, 0);
  assert.equal(balanced.seconds, 0);
});

test('balanceDuration: handles microseconds and nanoseconds fields too', () => {
  const balanced = balanceDuration({ microseconds: 2500 });
  assert.equal(balanced.milliseconds, 2);
  assert.equal(balanced.microseconds, 500);
});

test('balanceDuration: leaves calendar-bound fields (years/months/weeks) untouched', () => {
  const balanced = balanceDuration({ years: 1, months: 2, hours: 25 });
  assert.equal(balanced.years, 1);
  assert.equal(balanced.months, 2);
  assert.equal(balanced.days, 1);
  assert.equal(balanced.hours, 1);
});

test('totalDuration: supports every absolute unit, not just hours', () => {
  const d = { days: 1 };
  assert.equal(totalDuration(d, 'days'), 1);
  assert.equal(totalDuration(d, 'minutes'), 1440);
  assert.equal(totalDuration(d, 'seconds'), 86400);
  assert.equal(totalDuration(d, 'milliseconds'), 86_400_000);
  assert.equal(totalDuration(d, 'microseconds'), 86_400_000_000);
  assert.equal(totalDuration(d, 'nanoseconds'), 86_400_000_000_000);
});

test('totalDuration: throws for a calendar-bound unit like "years"', () => {
  assert.throws(() => totalDuration({ days: 1 }, 'years'), /does not support unit "years"/);
});

test('compareDuration: compares across mixed units, not just matching ones', () => {
  assert.equal(compareDuration({ hours: 25 }, { days: 1 }), 1);
  assert.equal(compareDuration({ minutes: 60 }, { hours: 1 }), 0);
});

test('addDuration: fields absent from either input default to zero rather than NaN', () => {
  const r = addDuration({ hours: 2 }, { minutes: 15 });
  assert.equal(r.hours, 2);
  assert.equal(r.minutes, 15);
  assert.equal(r.seconds, 0);
});

test('subtractDuration: can produce negative fields when b is larger than a', () => {
  const r = subtractDuration({ hours: 1 }, { hours: 3 });
  assert.equal(r.hours, -2);
});

test('parseDuration: seconds and milliseconds tokens map to the right fields', () => {
  // Covers the s/S branches of the unit-letter-to-field mapping, which
  // the earlier hours/minutes-only tests never touched.
  const d = parseDuration('45', 's');
  assert.equal(d.seconds, 45);
  const d2 = parseDuration('999', 'S');
  assert.equal(d2.milliseconds, 999);
});

test('parseDuration: a captured number too large to represent throws rather than returning Infinity', () => {
  const hugeDigits = '9'.repeat(400);
  assert.throws(
    () => parseDuration(hugeDigits, 'y'),
    /isn't a finite number/,
  );
});

test('tokenizeDurationFormat (via formatDurationToParts): a doubled quote outside a quoted span is a literal single quote', () => {
  // '' at top level (not inside an open '...' span) is the same
  // escape-for-a-literal-quote-character convention as tokenize.ts uses
  // for date/time formats.
  const parts = formatDurationToParts({ hours: 2 }, "h''h");
  assert.deepEqual(parts, [
    { type: 'token', value: '2', token: 'h' },
    { type: 'literal', value: "'" },
    { type: 'token', value: '2', token: 'h' },
  ]);
});

test('tokenizeDurationFormat (via formatDurationToParts): a doubled quote inside a quoted span is an escaped literal quote', () => {
  const parts = formatDurationToParts({ hours: 3 }, "h 'it''s here'");
  assert.deepEqual(parts, [
    { type: 'token', value: '3', token: 'h' },
    { type: 'literal', value: " it's here" },
  ]);
});
test('parseDuration: throws for an unterminated quote in the format string', () => {
  // The tokenizer's quote-scanning loop hits end-of-string before finding
  // the closing quote, tripping the `!closed` guard.
  assert.throws(() => parseDuration('3h', "'unterminated"), /unterminated quote/);
});

test('negateDuration (via subtractDuration): a field explicitly set to undefined negates to 0, not NaN', () => {
  // negateDuration does `-(d[k] ?? 0)` per key of its argument, which is
  // subtractDuration's *second* argument (b), not the first. If b has a
  // key present but set to undefined (rather than omitted), the ??
  // fallback keeps -undefined from producing NaN.
  const result = subtractDuration({ hours: 3 }, { hours: 1, minutes: undefined });
  assert.equal(result.hours, 2);
  assert.equal(result.minutes, 0);
});
