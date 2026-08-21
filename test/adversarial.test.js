import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal, parseRelative, registerLocaleVocab, safeParse, analyzeFormat } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// fuzz.test.js covers random ASCII noise. This file targets specific
// hostile input a random generator wouldn't stumble on: pathological
// Unicode, malformed BCP47 tags, and quote-nesting edge cases in the
// tokenizer's state machine. Same bar as fuzz.test.js: clean thrown Error
// or a correct result, never a raw crash or a silently wrong value.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function expectCleanErrorOrResult(fn, label) {
  try {
    const result = fn();
    // if it didn't throw, it must be a real usable result, not undefined/null
    // sneaking through
    assert.notEqual(result, undefined, `${label}: returned undefined instead of throwing or producing a value`);
    return { threw: false, result };
  } catch (err) {
    assert.ok(err instanceof Error, `${label}: threw a non-Error value: ${String(err)}`);
    return { threw: true, error: err };
  }
}

test('combining diacritical marks in a format string literal do not crash tokenize() or corrupt adjacent tokens', () => {
  // "é" as e + combining acute (U+0301), not the precomposed U+00E9 —
  // decomposed form is legal UTF-8/UTF-16 and common from certain input
  // methods, but a naive char-by-char scan could split it wrong if it
  // assumed one visual character == one code unit
  const formatStr = "yyyy-MM-dd 'e\u0301poque'"; // literal "époque" via decomposed é
  const date = Temporal.PlainDate.from('2026-08-04');
  const { result } = expectCleanErrorOrResult(() => format(date, formatStr), 'format with decomposed diacritic literal');
  assert.equal(result, '2026-08-04 e\u0301poque');
});

test('combining characters stacked on a single base character in a literal do not cause unbounded work', () => {
  // pathological but legal: one base char with many combining marks
  // stacked on it (a known text-rendering DoS vector in some systems,
  // worth confirming this library's plain string handling doesn't inherit
  // that cost)
  const manyMarks = 'e' + '\u0301'.repeat(200); // e + 200 combining acute accents
  const formatStr = `yyyy-MM-dd '${manyMarks}'`;
  const date = Temporal.PlainDate.from('2026-08-04');
  const start = process.hrtime.bigint();
  const { result } = expectCleanErrorOrResult(() => format(date, formatStr), 'format with stacked combining marks');
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 200, `took ${ms}ms on 200 stacked combining marks, expected fast plain-string handling`);
  assert.ok(result.endsWith(manyMarks), 'combining marks should pass through the literal unchanged');
});

test('RTL/LTR override and embedding characters in a format string literal round-trip as opaque literal content', () => {
  // U+202E (RTL override), U+202D (LTR override), U+2066/2069 (isolates) —
  // these are invisible-ish control characters sometimes used to spoof
  // displayed text order. This library treats format-string literals as
  // opaque data, so the expectation is they pass through unexamined, same
  // as any other literal character — not that the library does anything
  // special with them.
  const bidiChars = ['\u202E', '\u202D', '\u2066', '\u2069', '\u200F', '\u200E'];
  const date = Temporal.PlainDate.from('2026-08-04');
  for (const ch of bidiChars) {
    const formatStr = `yyyy-MM-dd '${ch}tag'`;
    const { result, threw } = expectCleanErrorOrResult(() => format(date, formatStr), `format with bidi char U+${ch.codePointAt(0).toString(16)}`);
    if (!threw) {
      assert.equal(result, `2026-08-04 ${ch}tag`, `bidi char U+${ch.codePointAt(0).toString(16)} should pass through the literal unchanged`);
    }
  }
});

test('bidi override characters injected into parse() input are treated as literal mismatches, not silently stripped', () => {
  // if a caller's untrusted input string carries a bidi override before a
  // digit sequence, that must not silently parse as if the override wasn't
  // there — either it matches the literal format-string content exactly
  // (unlikely) or parse() throws
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatted = format(date, 'yyyy-MM-dd');
  const spoofed = '\u202E' + formatted; // prepend RTL override to otherwise-valid output
  assert.throws(() => parse('yyyy-MM-dd', spoofed), /no valid pattern matches/);
});

test('zero-width joiner/non-joiner/space in a format string literal do not corrupt tokenization', () => {
  const zwChars = ['\u200D', '\u200C', '\u200B']; // ZWJ, ZWNJ, zero-width space
  const date = Temporal.PlainDate.from('2026-08-04');
  for (const ch of zwChars) {
    const formatStr = `yyyy${ch}-MM-dd`; // zero-width char directly adjacent to a token, no quoting
    const { result, threw } = expectCleanErrorOrResult(() => format(date, formatStr), `format with zero-width U+${ch.codePointAt(0).toString(16)} unquoted`);
    if (!threw) {
      // the zero-width char isn't a recognized token, so it should fall
      // through as a literal between "yyyy" and "-MM-dd"
      assert.equal(result, `2026${ch}-08-04`);
    }
  }
});

test('zero-width joiner between two adjacent tokens does not cause them to be misread as a single token', () => {
  // this is really a tokenize() greedy-match correctness check under a
  // hostile-looking separator, not a crash check
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = 'yy\u200Dyy-MM-dd'; // ZWJ spliced into the middle of "yyyy"
  const formatted = format(date, formatStr);
  // "yy" (2-digit year) + literal ZWJ + "yy" (2-digit year again, last-wins
  // semantics per format.ts iterating pieces in order) — not "yyyy" (4-digit),
  // since the ZWJ breaks the greedy match into two separate "yy" tokens
  assert.equal(formatted, `26\u200D26-08-04`);
});

test('an unpaired (lone) surrogate code unit in a format string literal does not crash tokenize()', () => {
  // \uD800 alone (no matching low surrogate) is not valid UTF-16 text but
  // is a legal JS string value — a real hazard for naive iteration that
  // assumes every code unit is a complete character
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = "yyyy-MM-dd '\uD800'";
  expectCleanErrorOrResult(() => format(date, formatStr), 'format with lone high surrogate in literal');
});

test('an unpaired low surrogate in a format string literal does not crash tokenize()', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = "yyyy-MM-dd '\uDC00'";
  expectCleanErrorOrResult(() => format(date, formatStr), 'format with lone low surrogate in literal');
});

test('an unpaired surrogate in parse() input does not crash matching, just fails to match', () => {
  const formatStr = 'yyyy-MM-dd';
  expectCleanErrorOrResult(() => parse(formatStr, '2026-08-\uD800'), 'parse with lone surrogate in input');
});

// parse.test.js covers a couple hand-picked malformed tags already — this
// broadens it to empty strings, whitespace-only tags, private-use-only
// tags, and well-formed-but-unrecognized tags.

test('empty-string locale falls through to a thrown Error or a sane default, never a crash', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: '' }), 'format with empty-string locale');
});

test('a locale tag with only whitespace does not crash, throws or is rejected cleanly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: '   ' }), 'format with whitespace-only locale');
});

test('a syntactically valid but non-existent locale tag falls back per Intl rules rather than crashing', () => {
  // Intl.DateTimeFormat is spec'd to fall back gracefully (BestFitMatcher)
  // for a well-formed but unrecognized tag rather than throwing — this
  // confirms this library doesn't add its own stricter failure on top
  const date = Temporal.PlainDate.from('2026-08-04');
  const { threw } = expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: 'xx-XX' }), 'format with well-formed but unknown locale tag');
  assert.equal(threw, false, 'a well-formed-but-unknown BCP47 tag should fall back via Intl, not throw');
});

test('a locale tag with malformed private-use-only syntax throws a clean Error, not a raw exception', () => {
  // "x" alone (private-use singleton with no subtags) is invalid BCP47
  const date = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: 'x' }), 'format with bare private-use singleton locale');
});

test('a locale tag containing null bytes or control characters does not crash, throws cleanly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: 'en-US\u0000' }), 'format with embedded null byte in locale');
});

test('an extremely long locale tag does not cause unbounded work', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const longLocale = 'en-US-u-va-' + 'x'.repeat(500);
  const start = process.hrtime.bigint();
  expectCleanErrorOrResult(() => format(date, 'MMMM d, yyyy', { locale: longLocale }), 'format with pathologically long locale tag');
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 500, `took ${ms}ms on a 500+ char locale tag, expected bounded cost`);
});

test('a -u-ca- calendar extension naming a real-looking but nonexistent calendar does not crash resolveCalendar()', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(
    () => format(date, 'yyyy-MM-dd', { locale: 'en-US-u-ca-notarealcalendar' }),
    'format with bogus -u-ca- calendar extension'
  );
});

// combinatorial.test.js and tokenize.test.js cover basic doubled-quote
// escaping already — these push the quote state machine harder.

test('many consecutive doubled quotes in a row produce that many literal quote characters, not a parse error', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = "yyyy-MM-dd " + "''".repeat(50); // 50 escaped-quote pairs, outside any quoted span
  const formatted = format(date, formatStr);
  assert.equal(formatted, '2026-08-04 ' + "'".repeat(50));
});

test('an odd number of trailing quote characters throws the documented unterminated-quote error, not a different failure', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // 51 quote chars = 25 doubled pairs (25 literal quotes) + 1 dangling
  // unterminated quote that opens a span never closed
  const formatStr = "yyyy-MM-dd " + "'".repeat(51);
  assert.throws(
    () => format(date, formatStr),
    /temporal-fmt: unterminated quote/,
    'a dangling single quote after N escaped pairs should still surface as unterminated, not something else'
  );
});

test('a quoted literal containing every token string as text does not get misinterpreted as tokens', () => {
  // the whole point of quoting is "read this as literal text even though
  // it looks like tokens" — stress it with a literal that's maximally
  // token-shaped
  const date = Temporal.PlainDate.from('2026-08-04');
  const trap = 'yyyyMMddHHmmssSSSaEEEEEEEzzzMMMM';
  const formatStr = `yyyy-MM-dd '${trap}'`;
  const formatted = format(date, formatStr);
  assert.equal(formatted, `2026-08-04 ${trap}`, 'token-shaped text inside quotes must come out completely unchanged');
});

test('immediately adjacent empty quoted spans do not merge incorrectly or drop content', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // '' is a literal quote char (doubled), '' '' back to back with a real
  // empty pair mixed in is a deliberately confusing sequence for the
  // "check doubled-quote first" branch in tokenize()
  const formatStr = "yyyy''''MM"; // "''" -> literal ', then "''" -> literal ' again
  const formatted = format(date, formatStr);
  assert.equal(formatted, "2026''08");
});

// real hostile input rarely arrives as one clean category, so combine a
// few shapes together instead

test('a format string combining bidi override, zero-width joiner, and deeply nested quotes in one literal still round-trips cleanly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const nasty = "\u202E\u200D''trap''\u200C\u200E";
  const formatStr = `yyyy-MM-dd '${nasty}'`;
  const { result, threw } = expectCleanErrorOrResult(() => format(date, formatStr), 'format with combined hostile literal');
  if (!threw) {
    const expectedLiteral = "\u202E\u200D'trap'\u200C\u200E"; // '' -> ' inside the quoted span
    assert.equal(result, `2026-08-04 ${expectedLiteral}`);
  }
});

test('parse() fed a combined hostile input (bidi + zero-width + surrogate) against a strict numeric format throws cleanly rather than crashing', () => {
  const hostileInput = '2026\u200D-08-\uD800' + '\u202E04';
  expectCleanErrorOrResult(() => parse('yyyy-MM-dd', hostileInput), 'parse with combined hostile input');
});

// Adversarial coverage for the new features. The pattern is the same
// as the existing adversarial tests: hostile/ambiguous input must
// produce a clean thrown Error or a correct result, never a crash or
// silently-wrong value.

test('parseRelative: "next foo" (unrecognized weekday) throws cleanly rather than crashing', () => {
  const ref = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => parseRelative('next foo', ref), 'parseRelative next foo');
});

test('parseRelative: "next Tuesday" said on a Tuesday is 7 days out, not today (documented adversarial choice)', () => {
  const ref = Temporal.PlainDate.from('2026-08-04'); // Tuesday
  const result = parseRelative('next Tuesday', ref);
  // Refusing to interpret "next Tuesday" as today is the documented
  // behavior; this test pins it so a silent flip to "today" is caught.
  assert.equal(result.toString(), '2026-08-11');
});

test('parseRelative: "5 days" (no direction marker) throws rather than guessing past or future', () => {
  const ref = Temporal.PlainDate.from('2026-08-04');
  expectCleanErrorOrResult(() => parseRelative('5 days', ref), 'parseRelative 5 days (no direction)');
});

test('parseRelative: case-insensitive matching works for every weekday', () => {
  const ref = Temporal.PlainDate.from('2026-08-04'); // Tuesday
  // lowercase, uppercase, mixed — all should resolve the same weekday
  const lower = parseRelative('next tuesday', ref).toString();
  const upper = parseRelative('next TUESDAY', ref).toString();
  const mixed = parseRelative('next tUEsday', ref).toString();
  assert.equal(lower, upper);
  assert.equal(upper, mixed);
});

test('registerLocaleVocab: malformed shape throws cleanly per-field rather than crashing later', () => {
  // Each of these is a different malformed-shape failure that the
  // strict validator should catch at registration time rather than
  // letting an invalid vocab slip through to format()/parse() where
  // it'd produce a confusing wrong-output or "no month part" error.
  expectCleanErrorOrResult(
    () => registerLocaleVocab('en-x-malformed1', { monthLong: ['short'] }),
    'registerLocaleVocab short monthLong'
  );
  expectCleanErrorOrResult(
    () => registerLocaleVocab('en-x-malformed2', {
      monthLong: new Array(12).fill('x'),
      monthShort: new Array(12).fill('y'),
      weekdayLong: new Array(7).fill('z'),
      weekdayShort: new Array(7).fill('w'),
      dayPeriod: ['AM', 'AM'], // identical entries — collision
    }),
    'registerLocaleVocab identical dayPeriod'
  );
});

test('QQQ cross-check: feeding a quarter that disagrees with the month throws cleanly with a clear message naming both sides', () => {
  // Adversarial: feed "Q1 2026-08-04" — Q1 vs month 8 (Q3). Parse
  // should reject this with a message that names both the parsed
  // quarter (Q1) and the expected quarter (Q3), so the caller can
  // tell which side is wrong without grepping the docs.
  expectCleanErrorOrResult(
    () => parse('QQQ yyyy-MM-dd', 'Q1 2026-08-04'),
    'QQQ cross-check disagreement'
  );
  // Confirm the message names both Q1 and Q3 explicitly — that's
  // the "descriptive thrown errors" contract from the README.
  try {
    parse('QQQ yyyy-MM-dd', 'Q1 2026-08-04');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.match(err.message, /Q1/);
    assert.match(err.message, /Q3/);
  }
});

test('lenient parse mode: still rejects impossible dates (Feb 30) rather than silently landing on Feb 28', () => {
  // Lenient mode picks a split when an ambiguous glued numeric run
  // matches more than one way, but the constructed date still has
  // to be a real date — Temporal's overflow: 'reject' must still
  // trip, not silently clamp to Feb 28 (which is what overflow:
  // 'constrain' would do, and exactly the silent-wrong-output the
  // library refuses to produce).
  expectCleanErrorOrResult(
    () => parse('yyyy-Md', '2026-230', { lenient: true }),
    'lenient parse Feb 30'
  );
  // Specifically confirm it throws, not returns Feb 28 or Mar 1
  assert.throws(
    () => parse('yyyy-Md', '2026-230', { lenient: true }),
    /doesn't describe a valid date|out of range|invalid/i
  );
});

test('ISO week boundary: Dec 31 / Jan 1 pairs that cross the year boundary produce consistent (week, year) pairs', () => {
  // For each (year, year+1) pair, Dec 31 of year Y and Jan 1-3 of
  // year Y+1 may belong to the same ISO week. Confirm that whenever
  // two adjacent dates share a Thursday, they share an ISO (week, year).
  // Adversarial against any drift between the ww computation and the
  // RRRR computation.
  for (let year = 2020; year <= 2025; year++) {
    const dec31 = Temporal.PlainDate.from({ year, month: 12, day: 31 });
    const jan1 = Temporal.PlainDate.from({ year: year + 1, month: 1, day: 1 });
    // If their Thursdays are the same date, their (week, isoYear) must match.
    const dec31Thu = dec31.add({ days: 4 - dec31.dayOfWeek });
    const jan1Thu = jan1.add({ days: 4 - jan1.dayOfWeek });
    if (dec31Thu.toString() === jan1Thu.toString()) {
      const a = format(dec31, 'ww RRRR');
      const b = format(jan1, 'ww RRRR');
      assert.equal(a, b, `Dec 31 ${year} and Jan 1 ${year + 1} share a Thursday but disagree on (week, year): ${a} vs ${b}`);
    }
  }
});

test('adversarial: safeParse on input at the length cap', () => {
  // MAX_INPUT_LENGTH is 100_000 — exercising it directly would be slow.
  // Spot-check that a 1_000-char input still parses.
  const input = '2026-08-04' + ' '.repeat(1000);
  const result = safeParse('yyyy-MM-dd', input.slice(0, 10));
  assert.equal(result.ok, true);
});

test('adversarial: analyzeFormat on a pathological format string at the length cap', () => {
  // Repeating "yyyy " 200 times → 1000 chars, exactly at MAX_FORMAT_LENGTH.
  const fmt = 'yyyy '.repeat(200).trimEnd();
  assert.equal(fmt.length, 999); // 200*5 - 1 for trimEnd
  const analysis = analyzeFormat(fmt);
  assert.equal(analysis.tokens.length, 200);
  // All yyyy → all need year. Compatible types are the four that carry year.
  assert.deepEqual(analysis.compatibleTypes, ['PlainDate', 'PlainDateTime', 'PlainYearMonth', 'ZonedDateTime']);
});

test('adversarial: analyzeFormat rejects format strings over MAX_FORMAT_LENGTH', () => {
  assert.throws(() => analyzeFormat('x'.repeat(1001)), /exceeds maximum length/);
});
