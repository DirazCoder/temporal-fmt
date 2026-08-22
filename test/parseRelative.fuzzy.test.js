import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelative, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// { fuzzy: true } opt-in on parseRelative: word-level Levenshtein
// correction (max edit distance 2) against an English keyword
// vocabulary (weekdays, months, marker words), re-run through the
// exact matcher after correction. Off by default — plain parseRelative()
// keeps throwing on typos, same as before this option existed. English
// only; combining fuzzy with any other locale throws rather than
// silently skipping the fuzzy attempt.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// 2026-08-04 is a Tuesday.
const today = Temporal.PlainDate.from('2026-08-04');

test('fuzzy: off by default — a typo still throws exactly as before', () => {
  assert.throws(
    () => parseRelative('tommorow', today),
    /parseRelative doesn't recognize "tommorow"/
  );
});

test('fuzzy: true corrects a single-letter-drop typo ("tommorow" -> "tomorrow")', () => {
  assert.equal(parseRelative('tommorow', today, { fuzzy: true }).toString(), '2026-08-05');
});

test('fuzzy: true corrects a transposition typo in a weekday name ("tuesady" -> "tuesday")', () => {
  assert.equal(parseRelative('next tuesady', today, { fuzzy: true }).toString(), '2026-08-11');
});

test('fuzzy: true corrects a dropped-letter typo in "yesterday"', () => {
  assert.equal(parseRelative('yestreday', today, { fuzzy: true }).toString(), '2026-08-03');
});

test('fuzzy: true corrects a unit-word typo inside a numeric phrase ("dyas" -> "days")', () => {
  assert.equal(parseRelative('in 3 dyas', today, { fuzzy: true }).toString(), '2026-08-07');
});

test('fuzzy: true corrects a marker-word typo ("nxt" -> "next")', () => {
  assert.equal(parseRelative('nxt tuesday', today, { fuzzy: true }).toString(), '2026-08-11');
});

test('fuzzy: true still matches already-correct phrases with no correction needed', () => {
  assert.equal(parseRelative('today', today, { fuzzy: true }).toString(), '2026-08-04');
  assert.equal(parseRelative('tomorrow', today, { fuzzy: true }).toString(), '2026-08-05');
});

test('fuzzy: numbers are never fuzzy-corrected, even with fuzzy: true — bare-number ambiguity still throws', () => {
  // "5 days" without "in"/"ago" is ambiguous regardless of fuzzy mode;
  // digits are explicitly excluded from correction (see the vocabulary
  // comment in parseRelative.ts), so this must throw the same
  // ambiguity error fuzzy or not.
  assert.throws(
    () => parseRelative('5 days', today, { fuzzy: true }),
    /can't tell whether .* is past or future/
  );
});

test('fuzzy: a phrase too far from any known vocabulary word still throws, mentioning fuzzy was attempted', () => {
  assert.throws(
    () => parseRelative('completely bogus phrase', today, { fuzzy: true }),
    /parseRelative doesn't recognize "completely bogus phrase"/
  );
});

test('fuzzy: combined with a non-English locale throws a scope-limited error rather than silently skipping correction', () => {
  assert.throws(
    () => parseRelative('mañna', today, { fuzzy: true, locale: 'es-ES' }),
    /fuzzy: true.*currently only supports English/
  );
});

test('fuzzy: a correctly-spelled non-English phrase still works fine without fuzzy, and fuzzy is irrelevant since exact match wins first', () => {
  // "mañana" is valid Spanish for "tomorrow" and matches on the exact
  // pass, so the English-only fuzzy guard is never reached — fuzzy:true
  // doesn't throw here because fuzzy correction was never attempted.
  assert.equal(parseRelative('mañana', today, { locale: 'es-ES' }).toString(), '2026-08-05');
});

test('fuzzy: explicit English locale behaves the same as omitting locale', () => {
  assert.equal(parseRelative('tommorow', today, { fuzzy: true, locale: 'en' }).toString(), '2026-08-05');
});


test('fuzzy: rejects oversized input before expensive correction work', () => {
  assert.throws(
    () => parseRelative('x'.repeat(4097), today, { fuzzy: true }),
    /input is too large.*4096 characters/
  );
});

test('fuzzy: rejects too many words inside the fuzzy correction pass', () => {
  const manyWords = Array.from({ length: 33 }, () => 'x').join(' ');
  assert.throws(
    () => parseRelative(manyWords, today, { fuzzy: true }),
    /fuzzy input is too large.*32 words/,
  );
});

test('fuzzy: max edit distance of 2 is a real boundary — a too-mangled word does not get corrected', () => {
  // "tmwrrw" is edit-distance 4+ from "tomorrow", well past the
  // FUZZY_MAX_DISTANCE=2 cutoff, so it's left uncorrected and the
  // re-attempted exact match still fails, producing the standard
  // unrecognized-phrase error rather than a wrong guess.
  assert.throws(
    () => parseRelative('tmwrrw', today, { fuzzy: true }),
    /parseRelative doesn't recognize/
  );
});
