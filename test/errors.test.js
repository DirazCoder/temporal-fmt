import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AmbiguousInputError, FormatSyntaxError, InvalidDateError, InvalidDurationError, InvalidLocaleError, InvalidOffsetError, InvalidTimeZoneError, ParseMismatchError, TemporalFmtError, UnknownTokenError, format, registerLocale, safeParse, setTemporal } from '../dist/index.js';
import { Temporal } from 'temporal-polyfill/full';

setTemporal(Temporal);

// Most of errors.ts's classes are already exercised indirectly by the
// files that throw them (duration.ts, serialization.ts, localeRegistry.ts,
// numbering.ts all construct their own typed errors directly). This file
// fills in what's left: each class's default message template (as
// opposed to the caller-supplied `message` override those files usually
// pass), toJSON(), and safeParse's typed-error pass-through path.
//
// Three of the eleven exported error classes are never constructed
// anywhere in this package: InvalidTimeError, InvalidTimeZoneError, and
// InvalidCalendarError. wrapUntypedError's own time-zone branch requires
// a message matching both /time ?zone/i and /no valid pattern/i, and
// nothing in the codebase throws that combination — parse()'s timezone
// validation errors don't go through the "no valid pattern" message.
// InvalidCalendarError has no producer at all, not even inside
// wrapUntypedError. These are real gaps in the library's error surface,
// not gaps in this test file, so they're left uncovered rather than
// constructed directly just to move a percentage.

test('TemporalFmtError: base class carries structured fields and toJSON', () => {
  const err = new TemporalFmtError('custom message', {
    code: 'PARSE_MISMATCH', input: 'in', format: 'fmt', reason: 'why',
  });
  assert.equal(err.message, 'custom message');
  assert.equal(err.name, 'TemporalFmtError');
  assert.equal(err.code, 'PARSE_MISMATCH');
  assert(err instanceof Error);
  const json = err.toJSON();
  assert.equal(json.name, 'TemporalFmtError');
  assert.equal(json.input, 'in');
  assert.equal(json.token, undefined);
});

test('FormatSyntaxError: default message includes format and reason', () => {
  const err = new FormatSyntaxError({ format: 'yyyy-MM', reason: 'bad token' });
  assert.match(err.message, /format string "yyyy-MM" has a syntax error: bad token\./);
  assert.equal(err.name, 'FormatSyntaxError');
  assert.equal(err.code, 'FORMAT_SYNTAX_ERROR');
});

test('FormatSyntaxError: default message with no reason omits the colon clause', () => {
  const err = new FormatSyntaxError({ format: 'yyyy' });
  assert.equal(err.message, 'format string "yyyy" has a syntax error.');
});

test('UnknownTokenError: default message with and without a format string', () => {
  // wrapUntypedError does construct this class for real (see the
  // "overlong token run" test below) — this test just covers the
  // constructor's own message-default branches directly.
  const withFormat = new UnknownTokenError({ token: 'ZZZ', format: 'yyyy-ZZZ' });
  assert.match(withFormat.message, /token "ZZZ" is not a recognized temporal-fmt token in format string "yyyy-ZZZ"\./);
  const withoutFormat = new UnknownTokenError({ token: 'ZZZ' });
  assert.match(withoutFormat.message, /token "ZZZ" is not a recognized temporal-fmt token\./);
  assert.equal(withoutFormat.code, 'UNKNOWN_TOKEN');
});

test('ParseMismatchError: default message with no reason omits the colon clause', () => {
  const err = new ParseMismatchError({ input: 'x', format: 'yyyy' });
  assert.equal(err.message, 'input "x" does not match format "yyyy".');
});

test('InvalidOffsetError: default message with no reason', () => {
  const err = new InvalidOffsetError({ actual: '+99:00' });
  assert.equal(err.message, 'offset "+99:00" is invalid.');
});

test('AmbiguousInputError: default message with no reason', () => {
  const err = new AmbiguousInputError({ input: '121' });
  assert.equal(err.message, 'input "121" is ambiguous.');
});

test('InvalidTimeZoneError: default message with and without a reason', () => {
  const withReason = new InvalidTimeZoneError({ actual: 'Not/A_Zone', reason: 'unknown' });
  assert.equal(withReason.message, 'time zone "Not/A_Zone" is not a recognized IANA time zone or fixed offset: unknown.');
  const withoutReason = new InvalidTimeZoneError({ actual: 'Not/A_Zone' });
  assert.equal(withoutReason.message, 'time zone "Not/A_Zone" is not a recognized IANA time zone or fixed offset.');
});

test('ParseMismatchError: default message includes input, format, and reason', () => {
  const err = new ParseMismatchError({ input: 'x', format: 'yyyy', reason: 'why' });
  assert.equal(err.message, 'input "x" does not match format "yyyy": why.');
  assert.equal(err.code, 'PARSE_MISMATCH');
});

test('InvalidDateError: default message with and without a reason', () => {
  const withReason = new InvalidDateError({ input: 'x', reason: 'not real' });
  assert.equal(withReason.message, 'input "x" does not describe a valid date: not real.');
  const withoutReason = new InvalidDateError({ input: 'x' });
  assert.equal(withoutReason.message, 'input "x" does not describe a valid date.');
});

test('InvalidOffsetError: default message uses actual, not input', () => {
  const err = new InvalidOffsetError({ actual: '+99:00', reason: 'out of range' });
  assert.equal(err.message, 'offset "+99:00" is invalid: out of range.');
  assert.equal(err.code, 'INVALID_OFFSET');
});

test('AmbiguousInputError: default message', () => {
  const err = new AmbiguousInputError({ input: '121', reason: 'two valid readings' });
  assert.equal(err.message, 'input "121" is ambiguous: two valid readings.');
});

test('InvalidLocaleError: default message uses actual', () => {
  const err = new InvalidLocaleError({ actual: 'xx-yy', reason: 'not BCP-47' });
  assert.equal(err.message, 'locale "xx-yy" is not a valid BCP-47 tag: not BCP-47.');
});

test('InvalidDurationError: default message with no input/actual fields at all', () => {
  const err = new InvalidDurationError({ reason: 'no fields' });
  assert.equal(err.message, 'duration is invalid: no fields.');
  const bare = new InvalidDurationError({});
  assert.equal(bare.message, 'duration is invalid.');
});

// wrapUntypedError is no longer what these run through — as of the
// 0.9.0 migration, parse() throws each of these as a typed
// TemporalFmtError directly, so safeParse's `instanceof TemporalFmtError`
// pass-through is what returns them, not the regex classifier. Kept as
// safeParse-level tests (rather than moved to unit-construct each class)
// because they're still the most direct way to confirm the real
// production call path produces the right code end to end. Each case
// below is a real message an actual parse() call throws, not a
// synthetic string built to match a regex.

test('safeParse: incomplete date classifies as InvalidDateError', () => {
  const r = safeParse('yyyy-MM', '2026-08');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_DATE');
});

test('safeParse: ambiguous glued numeric run classifies as AmbiguousInputError', () => {
  const r = safeParse('Md', '121');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'AMBIGUOUS_INPUT');
});

test('safeParse: offset out of range classifies as InvalidOffsetError', () => {
  const r = safeParse('yyyy-MM-ddXXX', '2026-08-04+99:99');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_OFFSET');
});

test('safeParse: format string with no tokens falls through to ParseMismatchError', () => {
  // "has no tokens" is thrown directly as ParseMismatchError from
  // parse.ts now, matching the same code wrapUntypedError's fallback
  // used to assign it before the migration. Not a FormatSyntaxError
  // despite the name suggesting a format-string problem — this class
  // was chosen deliberately to match the pre-existing classifier
  // contract this test already pinned down (see CHANGELOG 0.9.0).
  const r = safeParse('literal only', 'literal only');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_MISMATCH');
});

test('safeParse: unterminated quote classifies as FormatSyntaxError', () => {
  // tokenize.ts throws FormatSyntaxError directly for this now (see
  // the 0.9.0 migration) — safeParse passes it through unchanged rather
  // than reclassifying it via wrapUntypedError.
  const r = safeParse("yyyy-'MM-dd", '2026-08-04');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'FORMAT_SYNTAX_ERROR');
});

test('safeParse: unmatched shape classifies as ParseMismatchError', () => {
  const r = safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_MISMATCH');
});

test('safeParse: quarter token mismatch classifies as InvalidDateError', () => {
  // Aug 2026 is Q3; claiming Q1 disagrees with the parsed month.
  const r = safeParse('QQQ yyyy-MM-dd', 'Q1 2026-08-05');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_DATE');
});

test('InvalidLocaleError: default message with no reason', () => {
  const err = new InvalidLocaleError({ actual: 'xx' });
  assert.equal(err.message, 'locale "xx" is not a valid BCP-47 tag.');
});

test('safeParse: exceeds max format length classifies as FormatSyntaxError', () => {
  const r = safeParse('yyyy-'.repeat(300), '2026-08-04');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'FORMAT_SYNTAX_ERROR');
});

test('safeParse: exceeds max input length classifies as FormatSyntaxError', () => {
  const r = safeParse('yyyy-MM-dd', '2'.repeat(100_001));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'FORMAT_SYNTAX_ERROR');
});

test('safeParse: format string with no tokens at all falls through to ParseMismatchError', () => {
  // A quoted, purely-literal format string compiles to zero capture
  // groups. parse.ts throws this directly as ParseMismatchError,
  // matching the classification wrapUntypedError assigned before the
  // 0.9.0 migration (this exact case is the one that caught a wrong
  // classification attempt during that migration — see CHANGELOG).
  const r = safeParse("'hello world'", 'hello world');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_MISMATCH');
  assert.match(r.error.reason, /has no tokens/);
});
test('safeParse: overlong token run classifies as UnknownTokenError', () => {
  // HH is the longest registered H-token; one more H forms a run that
  // isn't itself a valid token (tokenize.ts treats this as "did you
  // mean HH?" rather than splicing HH + a stray literal H onto the
  // match). tokenize.ts throws UnknownTokenError directly for this now.
  const r = safeParse('HHH', '01');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'UNKNOWN_TOKEN');
});

test('ParseMismatchError: default message falls back to empty string when input/format omitted', () => {
  const err = new ParseMismatchError({ reason: 'why' });
  assert.equal(err.message, 'input "" does not match format "": why.');
});

test('InvalidDateError: default message falls back to empty string when input omitted', () => {
  const err = new InvalidDateError({ reason: 'why' });
  assert.equal(err.message, 'input "" does not describe a valid date: why.');
});

test('InvalidTimeZoneError: default message falls back to empty string when actual omitted', () => {
  const err = new InvalidTimeZoneError({ reason: 'why' });
  assert.equal(err.message, 'time zone "" is not a recognized IANA time zone or fixed offset: why.');
});

test('AmbiguousInputError: default message falls back to empty string when input omitted', () => {
  const err = new AmbiguousInputError({ reason: 'why' });
  assert.equal(err.message, 'input "" is ambiguous: why.');
});

test('InvalidLocaleError: default message falls back to empty string when actual omitted', () => {
  const err = new InvalidLocaleError({ reason: 'why' });
  assert.equal(err.message, 'locale "" is not a valid BCP-47 tag: why.');
});

test('UnknownTokenError: default message falls back to empty string when token omitted', () => {
  const err = new UnknownTokenError({ reason: 'why' });
  assert.equal(err.message, 'token "" is not a recognized temporal-fmt token.');
});

test('InvalidOffsetError: default message falls back to empty string when actual omitted', () => {
  const err = new InvalidOffsetError({ reason: 'why' });
  assert.equal(err.message, 'offset "" is invalid: why.');
});

test('registerLocale: empty tag throws InvalidLocaleError', () => {
  // registerLocaleVocab (the lower-level function) throws a plain
  // Error — it predates the typed-error surface and isn't migrated
  // (see the module header). registerLocale, the newer wrapper, is
  // what actually constructs InvalidLocaleError, and it does so
  // directly rather than through safeParse's catch-and-classify path.
  assert.throws(
    () => registerLocale('', { monthLong: [] }),
    (err) => err instanceof InvalidLocaleError && err.code === 'INVALID_LOCALE',
  );
});

// Typed errors — the structured diagnostic surface.
test('TemporalFmtError: base class carries all structured fields', () => {
  const err = new TemporalFmtError('test message', {
    code: 'PARSE_MISMATCH',
    input: 'foo',
    format: 'yyyy',
    token: 'yyyy',
    position: 0,
    expected: '4 digits',
    actual: 'foo',
    reason: 'no match',
  });
  assert.equal(err.message, 'test message');
  assert.equal(err.code, 'PARSE_MISMATCH');
  assert.equal(err.input, 'foo');
  assert.equal(err.format, 'yyyy');
  assert.equal(err.token, 'yyyy');
  assert.equal(err.position, 0);
  assert.equal(err.expected, '4 digits');
  assert.equal(err.actual, 'foo');
  assert.equal(err.reason, 'no match');
  assert.equal(err.name, 'TemporalFmtError');
});

test('TemporalFmtError: toJSON serializes all fields', () => {
  const err = new TemporalFmtError('test', { code: 'PARSE_MISMATCH', input: 'foo' });
  const json = err.toJSON();
  assert.equal(json.code, 'PARSE_MISMATCH');
  assert.equal(json.input, 'foo');
  assert.equal(json.message, 'test');
  assert.equal(json.name, 'TemporalFmtError');
});

test('FormatSyntaxError: subclass fixes the code', () => {
  const err = new FormatSyntaxError({ format: 'yyyy-MM-', reason: 'unterminated' });
  assert.equal(err.code, 'FORMAT_SYNTAX_ERROR');
  assert.equal(err.format, 'yyyy-MM-');
  assert.equal(err.reason, 'unterminated');
  assert.ok(err instanceof TemporalFmtError);
  assert.match(err.message, /syntax error/);
});

test('UnknownTokenError: subclass fixes the code', () => {
  const err = new UnknownTokenError({ token: 'YYYY', format: 'YYYY-MM-dd' });
  assert.equal(err.code, 'UNKNOWN_TOKEN');
  assert.equal(err.token, 'YYYY');
  assert.ok(err instanceof TemporalFmtError);
  assert.match(err.message, /token "YYYY"/);
});

test('ParseMismatchError: subclass fixes the code', () => {
  const err = new ParseMismatchError({ input: 'foo', format: 'yyyy' });
  assert.equal(err.code, 'PARSE_MISMATCH');
  assert.equal(err.input, 'foo');
});

test('InvalidDateError: subclass fixes the code', () => {
  const err = new InvalidDateError({ input: '2026-02-30', reason: 'Feb 30 does not exist' });
  assert.equal(err.code, 'INVALID_DATE');
  assert.equal(err.input, '2026-02-30');
});

test('InvalidOffsetError: subclass fixes the code', () => {
  const err = new InvalidOffsetError({ actual: '+99:99', reason: 'out of range' });
  assert.equal(err.code, 'INVALID_OFFSET');
  assert.equal(err.actual, '+99:99');
});

test('AmbiguousInputError: subclass fixes the code', () => {
  const err = new AmbiguousInputError({ input: '121', format: 'Md' });
  assert.equal(err.code, 'AMBIGUOUS_INPUT');
  assert.equal(err.input, '121');
  assert.equal(err.format, 'Md');
});
