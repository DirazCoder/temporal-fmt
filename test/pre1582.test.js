import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Locale-aware month/weekday names for pre-1582 dates. ICU's gregory
// calendar applies a Julian cutover at October 15, 1582 — dates before
// it get silently reinterpreted under Julian-calendar rules by
// Intl.DateTimeFormat, even though Temporal itself is proleptic
// Gregorian throughout (see tc39/ecma402#1003). tokens.ts routes
// pre-cutover month/weekday lookups through safe modern reference dates
// instead of handing the historical date to Intl; these tests pin the
// proleptic-Gregorian-correct answers.
//
// The witness dates are chosen so a Julian-reinterpreting engine fails
// them loudly: the Julian calendar ran ~10 days behind proleptic
// Gregorian in 1500 (offset hit 10 days after the Julian leap day of
// 1500-02-28), so 1500-07-05 proleptic Gregorian is 1500-06-25 Julian —
// "June"/a weekday 3 slots off (10 mod 7). On engines whose Intl never
// shows the cutover (this suite's polyfill runtime, V8's plain-Date
// path) both the old and new code produce these same strings, so these
// assertions are regression pins, not before/after diffs.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const d1500 = Temporal.PlainDate.from('1500-07-05');

test('MMMM/MMM render the proleptic-Gregorian month for a pre-1582 date', () => {
  // Julian reading of this instant would be June 25 — the assertions
  // would say "June" if the cutover bug were present.
  assert.equal(format(d1500, 'MMMM'), 'July');
  assert.equal(format(d1500, 'MMM'), 'Jul');
});

test('EEEE/EEE render the proleptic-Gregorian weekday for a pre-1582 date', () => {
  // 1500-07-05 is a Thursday proleptic Gregorian (dayOfWeek 4); the
  // Julian reading is 10 days earlier = a Monday.
  assert.equal(format(d1500, 'EEEE'), 'Thursday');
  assert.equal(format(d1500, 'EEE'), 'Thu');
});

test('pre-1582 locale-aware names work in a non-default locale', () => {
  assert.equal(format(d1500, 'MMMM', { locale: 'fr-FR' }), 'juillet');
  assert.equal(format(d1500, 'EEEE', { locale: 'fr-FR' }), 'jeudi');
});

test('stand-alone forms LLLL/cccc route through the same pre-cutover lookup', () => {
  // LLLL/ccc share localeAwareName with MMMM/EEEE, so the fix covers
  // them too — pin that they agree with the format forms pre-1582.
  assert.equal(format(d1500, 'LLLL'), 'July');
  assert.equal(format(d1500, 'cccc'), 'Thursday');
});

test('BCE dates take the pre-cutover path too (negative years)', () => {
  // year -44 < 1582 by any comparison; month/weekday still come off the
  // object's own proleptic fields. -000044-03-15 is a Thursday.
  const bce = Temporal.PlainDate.from('-000044-03-15');
  assert.equal(format(bce, 'MMMM EEEE'), 'March Thursday');
});

test('the cutover boundary: 1582-10-04 is the last pre-cutover day, 1582-10-15 the first Gregorian one', () => {
  // Both are Octobers either way — the point is that the gate switches
  // paths between them without the output flickering. 1582-10-14 exists
  // in proleptic Gregorian (it's simply a date history skipped over) and
  // is pre-cutover; 1582-10-15 is the first post-cutover day.
  assert.equal(format(Temporal.PlainDate.from('1582-10-04'), 'MMMM EEEE'), 'October Monday');
  assert.equal(format(Temporal.PlainDate.from('1582-10-14'), 'MMMM EEEE'), 'October Thursday');
  assert.equal(format(Temporal.PlainDate.from('1582-10-15'), 'MMMM EEEE'), 'October Friday');
});

test('1582 dates well before and after October keep their own months', () => {
  assert.equal(format(Temporal.PlainDate.from('1582-06-15'), 'MMMM'), 'June');
  assert.equal(format(Temporal.PlainDate.from('1582-12-25'), 'MMMM'), 'December');
});

test('ZonedDateTime pre-1582 names use the local calendar date', () => {
  // Europe/London in 1500 carried a sub-minute LMT offset; the month/
  // weekday must come from the local date fields, not from any instant
  // math Intl might do with the zone.
  const zdt = Temporal.ZonedDateTime.from('1500-07-05T12:00:00[Europe/London]');
  assert.equal(format(zdt, 'MMMM EEEE'), 'July Thursday');
});

test('a non-Gregorian calendar object keeps its own path pre-1582', () => {
  // 1500-07-05 in the Hebrew calendar is month 10 ("Tamuz"), year 5260.
  // The cutover gate must NOT feed a hebrew-calendar month number into
  // a gregory-calendar reference lookup — ICU's non-Gregorian calendars
  // don't apply the Julian cutover, so the direct path was already
  // correct and stays untouched.
  const hebrew = d1500.withCalendar('hebrew');
  assert.equal(format(hebrew, 'MMMM'), 'Tamuz');
  assert.equal(format(hebrew, 'EEEE'), 'Thursday');
});

test('era tokens keep their existing path for pre-1582 dates', () => {
  // GGGG is not a month/weekday part, so the cutover fix must leave it
  // alone. On the polyfill runtime toLocaleString can't isolate one
  // field and returns the joined date + era; on native-Intl runtimes the
  // isolated era part comes back alone. Match loosely so both are valid.
  assert.match(format(d1500, 'GGGG'), /Anno Domini|AD/);
});

test('format/parse round-trip a pre-1582 date through month and weekday names', () => {
  // The pre-cutover reference dates are the same ones getLocaleVocab()
  // builds the parse vocabulary from, so format() output must parse
  // straight back — including the weekday cross-check parse() performs
  // against the constructed date.
  const fmt = 'EEEE, MMMM d, yyyy';
  const formatted = format(d1500, fmt);
  assert.equal(formatted, 'Thursday, July 5, 1500');
  assert.equal(parse(fmt, formatted).toString(), '1500-07-05');
});
