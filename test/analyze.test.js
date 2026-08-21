import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFormat,
  explainFormat,
  format,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// analyzeFormat: the central introspection surface.
test('analyzeFormat: lists tokens with position and metadata', () => {
  const analysis = analyzeFormat('yyyy-MM-dd');
  assert.equal(analysis.tokens.length, 3);
  assert.equal(analysis.tokens[0].name, 'yyyy');
  assert.equal(analysis.tokens[0].position, 0);
  assert.equal(analysis.tokens[1].name, 'MM');
  assert.equal(analysis.tokens[1].position, 5); // after "yyyy-"
  assert.equal(analysis.tokens[2].name, 'dd');
  assert.equal(analysis.tokens[2].position, 8); // after "yyyy-MM-"
});

test('analyzeFormat: requiredFields aggregates across tokens', () => {
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm');
  assert.deepEqual(analysis.requiredFields, ['day', 'hour', 'minute', 'month', 'year']);
});

test('analyzeFormat: compatibleTypes is the intersection across tokens', () => {
  // yyyy + MM + dd + HH + mm — needs year, month, day, hour, minute.
  // Only PlainDateTime and ZonedDateTime carry all of those.
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm');
  assert.deepEqual(analysis.compatibleTypes, ['PlainDateTime', 'ZonedDateTime']);
});

test('analyzeFormat: date-only format is compatible with PlainDate, PlainDateTime, ZonedDateTime', () => {
  const analysis = analyzeFormat('yyyy-MM-dd');
  assert.deepEqual(analysis.compatibleTypes, ['PlainDate', 'PlainDateTime', 'ZonedDateTime']);
});

test('analyzeFormat: time-only format is compatible with PlainTime, PlainDateTime, ZonedDateTime, Instant', () => {
  const analysis = analyzeFormat('HH:mm:ss');
  assert.deepEqual(analysis.compatibleTypes, ['Instant', 'PlainDateTime', 'PlainTime', 'ZonedDateTime']);
});

test('analyzeFormat: parseable is false for format-only tokens (do, ww, RRRR)', () => {
  assert.equal(analyzeFormat('yyyy-MM-do').parseable, false);
  assert.equal(analyzeFormat('ww-RRRR').parseable, false);
  assert.equal(analyzeFormat('yyyy-MM-dd').parseable, true);
});

test('analyzeFormat: localeSensitive flags MMMM/MMM/EEEE/EEE/a but not numeric tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-dd').localeSensitive, false);
  assert.equal(analyzeFormat('MMMM d, yyyy').localeSensitive, true);
  assert.equal(analyzeFormat('EEE, MMM d').localeSensitive, true);
  assert.equal(analyzeFormat('h:mm a').localeSensitive, true);
});

test('analyzeFormat: timezoneSensitive flags zzz and offset tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-dd').timezoneSensitive, false);
  assert.equal(analyzeFormat('yyyy-MM-dd HH:mm zzz').timezoneSensitive, true);
  assert.equal(analyzeFormat('yyyy-MM-dd HH:mm XXX').timezoneSensitive, true);
});

test('analyzeFormat: ambiguous flags adjacent unpadded numeric runs', () => {
  assert.equal(analyzeFormat('Md').ambiguous, true);
  assert.equal(analyzeFormat('M-d').ambiguous, false); // literal separator breaks the run
  assert.equal(analyzeFormat('MMMd').ambiguous, false); // MMM is not unpadded-numeric
  assert.equal(analyzeFormat('yyyy-MM-dd').ambiguous, false);
});

test('analyzeFormat: roundTripSafe is false for format-only tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-do').roundTripSafe, false);
  assert.equal(analyzeFormat('yyyy-MM-dd').roundTripSafe, true);
});

test('analyzeFormat: warns on 12-hour token without "a"', () => {
  const analysis = analyzeFormat('h:mm');
  assert.ok(analysis.warnings.some((w) => w.code === 'TWELVE_HOUR_WITHOUT_A'));
});

test('analyzeFormat: warns on mixing 12-hour and 24-hour tokens', () => {
  const analysis = analyzeFormat('h:mm HH');
  assert.ok(analysis.warnings.some((w) => w.code === 'MIXED_12_AND_24_HOUR'));
});

test('analyzeFormat: warns on zzz + offset token combo', () => {
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm zzz XXX');
  assert.ok(analysis.warnings.some((w) => w.code === 'ZZZ_WITH_OFFSET_TOKEN'));
});

test('analyzeFormat: warns on offset token without full date', () => {
  const analysis = analyzeFormat('HH:mm XXX');
  assert.ok(analysis.warnings.some((w) => w.code === 'OFFSET_WITHOUT_FULL_DATE'));
});

// explainFormat: human-readable rendering of analyzeFormat.
test('explainFormat: produces a multi-line string with all the analysis fields', () => {
  const explained = explainFormat('yyyy-MM-dd HH:mm');
  assert.match(explained, /Format string: "yyyy-MM-dd HH:mm"/);
  assert.match(explained, /Tokens \(5\):/);
  assert.match(explained, /yyyy @0/);
  // requiredFields are sorted alphabetically (see analyze.ts).
  assert.match(explained, /Required fields: day, hour, minute, month, year/);
  assert.match(explained, /Parseable: yes/);
});

test('explainFormat: renders "no" for locale/calendar/timezone/ambiguous flags and omits the Warnings section when there are none', () => {
  // "MM" alone is parseable, calendar-sensitive, round-trip safe, and
  // produces no warnings — but locale-sensitive, timezone-sensitive, and
  // ambiguous are all false. The baseline test above only ever hits the
  // "yes"/has-warnings sides of these lines.
  const explainedMM = explainFormat('MM');
  assert.match(explainedMM, /Locale-sensitive: no/);
  assert.match(explainedMM, /Timezone-sensitive: no/);
  assert.match(explainedMM, /Ambiguous: no/);
  assert.match(explainedMM, /Round-trip safe: yes/);
  assert.doesNotMatch(explainedMM, /Warnings:/);

  // "zzz" is the mirror case for calendar-sensitive: it's timezone-
  // sensitive but NOT calendar-sensitive, closing the one flag "MM"
  // above can't (MM is always calendar-sensitive).
  const explainedZzz = explainFormat('zzz');
  assert.match(explainedZzz, /Calendar-sensitive: no/);
});

test('explainFormat: renders "yes" for locale-sensitive and ambiguous flags', () => {
  // "EEEE" (locale-aware weekday name) is locale-sensitive; every other
  // format string in this file's explainFormat tests is not, so this
  // closes out the true side of that line.
  const explainedEEEE = explainFormat('EEEE');
  assert.match(explainedEEEE, /Locale-sensitive: yes/);

  // "Mdyyyy" has an unpadded M/d run with no separator, which
  // analyzeFormat flags as ambiguous — closing the true side of that
  // line too.
  const explainedAmbiguous = explainFormat('Mdyyyy');
  assert.match(explainedAmbiguous, /Ambiguous: yes/);
});

test('explainFormat: renders "no" for parseable/round-trip-safe and includes the Warnings section when a warning fires', () => {
  // "do" is format-only (not parseable, not round-trip safe) and
  // triggers a FORMAT_ONLY_TOKEN warning, closing out the flip side of
  // the ternaries above plus the warnings.length > 0 branch.
  const explained = explainFormat('do');
  assert.match(explained, /Parseable: no/);
  assert.match(explained, /Round-trip safe: no/);
  assert.match(explained, /Warnings:/);
  assert.match(explained, /\[FORMAT_ONLY_TOKEN\]/);
});
