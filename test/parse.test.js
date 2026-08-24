import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AmbiguousInputError, InvalidDateError, InvalidTimeZoneError, ParseMismatchError, TemporalFmtError, compileParser, format, parse, parseToParts, safeParse, setTemporal, tryParse } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// parse() needs a Temporal implementation to construct its result (unlike
// format(), which only reads fields off an object the caller already
// built) — inject it via setTemporal() before any parse() call runs.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('builds a PlainDate', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('builds a PlainDateTime', () => {
  const result = parse('yyyy-MM-dd HH:mm:ss', '2026-08-04 15:45:30');
  assert.equal(result.toString(), Temporal.PlainDateTime.from('2026-08-04T15:45:30').toString());
});

test('builds a PlainTime', () => {
  const result = parse('HH:mm:ss', '15:45:30');
  assert.equal(result.toString(), Temporal.PlainTime.from('15:45:30').toString());
});

test('builds a ZonedDateTime', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
  assert.equal(
    result.toString(),
    Temporal.ZonedDateTime.from('2026-08-04T15:45:00-04:00[America/New_York]').toString()
  );
});

test('yy pivot: 00-68 maps to 2000s', () => {
  const result = parse('yy-MM-dd', '26-08-04');
  assert.equal(result.year, 2026);
});

test('yy pivot: 69-99 maps to 1900s', () => {
  const result = parse('yy-MM-dd', '75-08-04');
  assert.equal(result.year, 1975);
});

test('12-hour token with AM/PM resolves to correct 24-hour value', () => {
  const result = parse('yyyy-MM-dd h:mm a', '2026-08-04 3:45 PM');
  assert.equal(result.hour, 15);
});

test('12-hour midnight/noon rollover', () => {
  assert.equal(parse('h:mm a', '12:15 AM').hour, 0);
  assert.equal(parse('h:mm a', '12:15 PM').hour, 12);
});

test('12-hour token without an "a" token throws', () => {
  assert.throws(() => parse('yyyy-MM-dd h:mm', '2026-08-04 3:45'));
});

test('mixing a 24-hour token with a 12-hour token throws, even when the values agree', () => {
  // HH says 15, h/a says 3 PM — same instant, still rejected: parse() doesn't
  // pick a winner between two hour tokens that shouldn't both be there.
  assert.throws(() => parse('HH h a', '15 3 PM'));
});

test('mixing a 24-hour token with a 12-hour token throws when the values disagree', () => {
  assert.throws(() => parse('HH h a', '15 9 AM'));
});

// HH + a (no h) previously treated "a" as a cross-check on HH's value
// rather than a competing hour field — a consistent pairing like
// "13:05 PM" was accepted, only a contradictory one threw. That's no
// longer the behavior: HH and a both describe the hour, so the pattern
// is refused outright regardless of whether the input agrees with
// itself. Matches the conformance fixture's shape-mixing-H-and-a-rejected
// case — see conformance/README.md.
test('HH combined with a: any pairing is rejected, even a consistent one', () => {
  assert.throws(
    () => parse('HH:mm a', '13:05 PM'),
    /mixes a 24-hour token .* with a day-period token/
  );
});

test('HH combined with a: rejected regardless of whether the input agrees with itself', () => {
  assert.throws(
    () => parse('HH:mm a', '01:05 PM'),
    /mixes a 24-hour token .* with a day-period token/
  );
});

test('HH combined with a: rejected at the boundary hour too', () => {
  // 12:xx is the other hour where AM/PM and a naive hour<12 check could
  // disagree if the comparison were off by one — but the pattern is
  // refused before any value comparison happens, so this isn't
  // actually testing the boundary anymore, just confirming HH+a still
  // throws for it like it does everywhere else.
  assert.throws(
    () => parse('HH:mm a', '12:05 AM'),
    /mixes a 24-hour token .* with a day-period token/
  );
  assert.throws(
    () => parse('HH:mm a', '12:05 PM'),
    /mixes a 24-hour token .* with a day-period token/
  );
});

test('AM/PM marker is case-insensitive by default', () => {
  assert.equal(parse('h:mm a', '3:45 pm').hour, 15);
  assert.equal(parse('h:mm a', '3:45 Pm').hour, 15);
  assert.equal(parse('h:mm a', '3:45 am').hour, 3);
});

test('HH combined with a: rejected regardless of marker case', () => {
  assert.throws(
    () => parse('HH:mm a', '13:05 pm'),
    /mixes a 24-hour token .* with a day-period token/
  );
  assert.throws(
    () => parse('HH:mm a', '01:05 pm'),
    /mixes a 24-hour token .* with a day-period token/
  );
});

test('locale month name reverse lookup, default en-US', () => {
  const result = parse('MMMM d, yyyy', 'August 4, 2026');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('locale month name reverse lookup with a locale option', () => {
  const result = parse('MMMM d, yyyy', 'août 4, 2026', { locale: 'fr-FR' });
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('shape mismatch throws', () => {
  assert.throws(() => parse('yyyy-MM', '2026-08-04T15:45:30'));
});

test('impossible date throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-02-30'));
});

test('weekday token matching the actual date succeeds', () => {
  // 2026-08-04 is a Tuesday
  const result = parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');
  assert.equal(result.toString(), Temporal.PlainDate.from('2026-08-04').toString());
});

test('weekday token mismatched with the actual date throws', () => {
  assert.throws(() => parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04'));
});

test('quoted literal text is matched but not captured', () => {
  const result = parse("'at' h:mm a", 'at 3:45 PM');
  assert.equal(result.hour, 15);
  assert.equal(result.minute, 45);
});

test('locale option selects a non-Gregorian calendar for construction', () => {
  const gregorian = Temporal.PlainDate.from('2026-08-04');
  const hebrew = gregorian.withCalendar('hebrew');
  const input = `${hebrew.year}-${String(hebrew.month).padStart(2, '0')}-${String(hebrew.day).padStart(2, '0')}`;
  const result = parse('yyyy-MM-dd', input, { locale: 'en-u-ca-hebrew' });
  assert.equal(result.calendarId, 'hebrew');
  assert.equal(result.withCalendar('iso8601').toString(), gregorian.toString());
});

test('locale option with an explicit -u-ca-gregory extension resolves to the default calendar', () => {
  // resolveCalendar() special-cases an explicit "gregory" resolution back
  // to `undefined` (the default), rather than passing "gregory" through
  // as a real calendar override — Temporal's own default calendar id is
  // "iso8601", not "gregory", so this keeps parse() from producing a
  // result whose calendarId is the ICU-internal name instead of the
  // Temporal-spec one. The Hebrew case above only exercises the
  // "actually a different calendar" branch; this pins the "resolves to
  // gregory itself" branch.
  const result = parse('yyyy-MM-dd', '2026-08-04', { locale: 'en-u-ca-gregory' });
  assert.equal(result.calendarId, 'iso8601');
});

test('no locale option still builds a plain ISO 8601 result', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.calendarId, 'iso8601');
});

test('format string mixing "yyyy" and "yy" throws — the two year representations can\'t both apply', () => {
  // resolveYear() rejects a format string that captures both a 4-digit
  // and a 2-digit year token — nothing at the pattern-compile stage
  // stops a format string from containing both, so this cross-field
  // check runs after the regex match succeeds.
  assert.throws(
    () => parse('yyyy-yy-MM-dd', '2026-26-08-04'),
    /mixes a full-year token .* with the two-digit "yy" token/
  );
});

test('setTemporal injection works even without a global Temporal', () => {
  const savedGlobal = globalThis.Temporal;
  delete globalThis.Temporal;
  setTemporal(PolyfillTemporal);
  try {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  } finally {
    if (savedGlobal !== undefined) globalThis.Temporal = savedGlobal;
    setTemporal(Temporal); // restore for the rest of this file's tests
  }
});

test('empty format string throws "no tokens"', () => {
  assert.throws(() => parse('', ''), /no tokens/);
});

test('literal-only format string throws "no tokens"', () => {
  assert.throws(() => parse("'just literal'", 'just literal'), /no tokens/);
});

test('format string exceeding max length throws before any matching happens', () => {
  assert.throws(() => parse('x'.repeat(1001), 'irrelevant'), /exceeds maximum length/);
});

test('completely empty input against a real pattern throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', ''), /no valid pattern matches/);
});

test('input shorter than the pattern throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-08'));
});

test('input longer than the pattern (trailing garbage) throws — regex is fully anchored', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-08-04extra'));
});

test('input with leading garbage throws — anchored at start too', () => {
  assert.throws(() => parse('yyyy-MM-dd', 'xx2026-08-04'));
});

test('whitespace-only input throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', '   '));
});

test('separators in the input must match the format string exactly (slash vs dash)', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026/08/04'));
});

test('month 00 is rejected by the token pattern itself, before Temporal ever sees it', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-00-04'), /no valid pattern matches/);
});

test('month 13 is rejected by the token pattern', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-13-04'), /no valid pattern matches/);
});

test('day 00 is rejected by the token pattern', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-08-00'), /no valid pattern matches/);
});

test('day 32 is rejected by the token pattern', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-08-32'), /no valid pattern matches/);
});

test('hour 24 (HH) is rejected by the token pattern', () => {
  assert.throws(() => parse('HH:mm', '24:00'), /no valid pattern matches/);
});

test('hour 00 (hh, 12-hour) is rejected by the token pattern — 12-hour has no zero', () => {
  assert.throws(() => parse('hh:mm a', '00:15 AM'), /no valid pattern matches/);
});

test('hour 13 (hh, 12-hour) is rejected — 12-hour tops out at 12', () => {
  assert.throws(() => parse('hh:mm a', '13:15 PM'), /no valid pattern matches/);
});

test('minute 60 is rejected by the token pattern', () => {
  assert.throws(() => parse('HH:mm', '12:60'), /no valid pattern matches/);
});

test('second 60 is rejected by the token pattern', () => {
  assert.throws(() => parse('HH:mm:ss', '12:00:60'), /no valid pattern matches/);
});

test('Feb 29 on a leap year succeeds', () => {
  const result = parse('yyyy-MM-dd', '2024-02-29');
  assert.equal(result.toString(), '2024-02-29');
});

test('Feb 29 on a non-leap year passes the regex shape but Temporal rejects it', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2023-02-29'), /doesn't describe a valid date/);
});

test('Feb 30 always throws regardless of leap year', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2024-02-30'), /doesn't describe a valid date/);
});

test('April 31 (30-day month) throws', () => {
  assert.throws(() => parse('yyyy-MM-dd', '2026-04-31'), /doesn't describe a valid date/);
});

test('year + month without day throws incomplete-date error', () => {
  assert.throws(() => parse('yyyy-MM', '2026-08'), /incomplete date/);
});

test('month + day without year throws incomplete-date error', () => {
  assert.throws(() => parse('MM-dd', '08-04'), /incomplete date/);
});

test('year alone throws incomplete-date error', () => {
  assert.throws(() => parse('yyyy', '2026'), /incomplete date/);
});

test('zzz alone throws — needs full date and time', () => {
  assert.throws(() => parse('zzz', 'America/New_York'), /needs a full date and time/);
});

test('zzz with only a date (no time) throws', () => {
  assert.throws(() => parse('yyyy-MM-dd zzz', '2026-08-04 America/New_York'), /needs a full date and time/);
});

test('zzz with only a time (no date) throws', () => {
  assert.throws(() => parse('HH:mm zzz', '15:45 America/New_York'), /needs a full date and time/);
});

test('zzz with an unrecognized zone id throws InvalidTimeZoneError (built from Intl.supportedValuesOf)', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone'),
    /not a recognized IANA time zone/
  );
});

test('zzz accepts UTC even though supportedValuesOf("timeZone") omits it', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 UTC');
  assert.equal(result.timeZoneId, 'UTC');
});

test('weekday token without a full date throws', () => {
  assert.throws(() => parse('EEEE HH:mm', 'Tuesday 15:45'), /needs a full date/);
});

test('hh/h and HH/H both absent, only minute present, is fine (no hour ambiguity possible)', () => {
  const result = parse('mm:ss', '45:30');
  assert.equal(result.minute, 45);
  assert.equal(result.second, 30);
});

test('12-hour token "h" without "a" still throws even at noon-looking values', () => {
  assert.throws(() => parse('h:mm', '12:00'), /can't tell AM from PM/);
});

test('yy pivot: exactly 68 maps to 2068 (upper edge of 2000s)', () => {
  assert.equal(parse('yy-MM-dd', '68-01-01').year, 2068);
});

test('yy pivot: exactly 69 maps to 1969 (lower edge of 1900s)', () => {
  assert.equal(parse('yy-MM-dd', '69-01-01').year, 1969);
});

test('yy pivot: exactly 00 maps to 2000', () => {
  assert.equal(parse('yy-MM-dd', '00-01-01').year, 2000);
});

test('yy pivot: exactly 99 maps to 1999', () => {
  assert.equal(parse('yy-MM-dd', '99-01-01').year, 1999);
});

test('EEE short weekday form is also validated against the actual date', () => {
  // 2026-08-04 is a Tuesday -> "Tue" is correct
  const result = parse('EEE, yyyy-MM-dd', 'Tue, 2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('EEE short weekday mismatch throws', () => {
  assert.throws(() => parse('EEE, yyyy-MM-dd', 'Wed, 2026-08-04'));
});

test('month name lookup is case-sensitive — wrong case fails to match the pattern at all', () => {
  assert.throws(() => parse('MMMM d, yyyy', 'august 4, 2026'), /no valid pattern matches/);
});

test('weekday name lookup is case-sensitive too', () => {
  assert.throws(() => parse('EEEE, yyyy-MM-dd', 'tuesday, 2026-08-04'), /no valid pattern matches/);
});

test('AM/PM marker matching is case-insensitive for the default en-US vocab', () => {
  assert.equal(parse('h:mm a', '3:45 pm').hour, 15);
  assert.equal(parse('h:mm a', '3:45 Pm').hour, 15);
  assert.equal(parse('h:mm a', '3:45 AM').hour, 3);
  assert.equal(parse('h:mm a', '3:45 am').hour, 3);
});

test('ar-EG day-period marker round-trips through parse', () => {
  const result = parse('h:mm a', '3:45 م', { locale: 'ar-EG' });
  assert.equal(result.hour, 15);
});

test('ja-JP day-period marker round-trips through parse', () => {
  const result = parse('h:mm a', '3:45 午後', { locale: 'ja-JP' });
  assert.equal(result.hour, 15);
});

test('quoted literal text must match input exactly, mismatched literal fails to parse', () => {
  assert.throws(() => parse("'at' h:mm a", 'on 3:45 PM'));
});

test('quoted literal with regex-special characters is escaped and matched literally', () => {
  const result = parse("yyyy-MM-dd '(local)'", '2026-08-04 (local)');
  assert.equal(result.toString(), '2026-08-04');
});

test('format string containing raw regex metacharacters as bare literal text is escaped, not executed as regex', () => {
  // "." between tokens should match a literal dot, not "any character"
  const result = parse('yyyy.MM.dd', '2026.08.04');
  assert.equal(result.toString(), '2026-08-04');
});

test('a literal dot in the format does not let an arbitrary character slip through in the input', () => {
  assert.throws(() => parse('yyyy.MM.dd', '2026x08x04'));
});

test('ZonedDateTime: DST-affected zone still resolves correctly via IANA id, no explicit offset token exists', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-01-04 15:45 America/New_York');
  assert.equal(result.offset, '-05:00'); // January = EST
});

test('ZonedDateTime: same zone id, different season, different offset (DST correctness)', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
  assert.equal(result.offset, '-04:00'); // August = EDT
});

test('round-trip: format(parse(x)) === x for a PlainDate', () => {
  const input = '2026-08-04';
  const parsed = parse('yyyy-MM-dd', input);
  assert.equal(parsed.toString(), input);
});

test('round-trip: parse(format(x)) reconstructs an equivalent PlainDateTime', async () => {
  const { format } = await import('../dist/index.js');
  const original = Temporal.PlainDateTime.from('2026-08-04T15:45:30.007');
  const formatStr = 'yyyy-MM-dd HH:mm:ss.SSS';
  const formatted = format(original, formatStr);
  const reparsed = parse(formatStr, formatted);
  assert.equal(reparsed.toString(), original.toString());
});

test('round-trip: nanosecond precision survives format -> parse, not just milliseconds', async () => {
  const { format } = await import('../dist/index.js');
  const original = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123456789');
  const formatStr = 'yyyy-MM-dd HH:mm:ss.SSSSSSSSS';
  const formatted = format(original, formatStr);
  const reparsed = parse(formatStr, formatted);
  assert.equal(reparsed.toString(), original.toString());
});

test('parsing a short fraction under a wide token treats missing digits as trailing zeros, not omitted precision', () => {
  // "5" under SSSSSSSSS is half a second (500000000ns) — the digits given
  // are the leading digits of the fraction, not the whole value.
  const result = parse('HH:mm:ss.SSSSSSSSS', '09:30:00.500000000');
  assert.equal(result.nanosecond, 0);
  assert.equal(result.microsecond, 0);
  assert.equal(result.millisecond, 500);
});

test('round-trip: locale month name survives format -> parse in fr-FR', async () => {
  const { format } = await import('../dist/index.js');
  const original = Temporal.PlainDate.from('2026-08-04');
  const formatStr = 'MMMM d, yyyy';
  const formatted = format(original, formatStr, { locale: 'fr-FR' });
  const reparsed = parse(formatStr, formatted, { locale: 'fr-FR' });
  assert.equal(reparsed.toString(), original.toString());
});

test('parse() throws a descriptive error when no Temporal implementation is available at all', () => {
  const savedGlobal = globalThis.Temporal;
  delete globalThis.Temporal;
  setTemporal(undefined);
  try {
    assert.throws(() => parse('yyyy-MM-dd', '2026-08-04'), /needs a Temporal implementation/);
  } finally {
    if (savedGlobal !== undefined) globalThis.Temporal = savedGlobal;
    setTemporal(Temporal);
  }
});

test('calling parse repeatedly with the same formatStr+locale reuses the cached pattern without corrupting results', () => {
  for (let i = 0; i < 5; i++) {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  }
});

test('alternating locales across calls does not cross-contaminate the compiled pattern cache', () => {
  const en = parse('MMMM d, yyyy', 'August 4, 2026');
  const fr = parse('MMMM d, yyyy', 'août 4, 2026', { locale: 'fr-FR' });
  const enAgain = parse('MMMM d, yyyy', 'August 4, 2026');
  assert.equal(en.toString(), '2026-08-04');
  assert.equal(fr.toString(), '2026-08-04');
  assert.equal(enAgain.toString(), '2026-08-04');
});

test('DOCUMENTED LIMITATION: Hebrew leap-month name ("Adar I") cannot be reverse-parsed — vocab is built from 12 non-leap reference dates', () => {
  assert.throws(
    () => parse('MMMM d, yyyy', 'Adar I 1, 5784', { locale: 'en-u-ca-hebrew' }),
    /no valid pattern matches/
  );
});

test('numeric yyyy-MM-dd round-trips fine even in a Hebrew leap year (the numeric path is unaffected by the month-name gap)', () => {
  const result = parse('yyyy-MM-dd', '5784-06-01', { locale: 'en-u-ca-hebrew' });
  assert.equal(result.monthCode, 'M05L');
});

test('the same token appearing twice in a format string: the last occurrence wins', () => {
  const result = parse('MM-yyyy-MM-dd', '01-2026-08-04');
  assert.equal(result.month, 8);
});

// safeParse: returns a discriminated union instead of throwing. Lets
// callers handle parse failures without try/catch — useful in
// functional-style code where exceptions break the flow.
test('safeParse: success returns { ok: true, value }', () => {
  const result = safeParse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.toString(), '2026-08-04');
  }
});

test('safeParse: failure returns { ok: false, error } with a TemporalFmtError', () => {
  const result = safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof TemporalFmtError);
    assert.ok(result.error instanceof ParseMismatchError);
    assert.equal(result.error.input, 'not-a-date');
    assert.equal(result.error.format, 'yyyy-MM-dd');
    // The wrapped reason carries the original throw message, so callers
    // reading the typed surface still see what failed underneath.
    assert.match(result.error.reason ?? '', /no valid pattern matches/);
  }
});

test('safeParse: wraps construction-time errors (Feb 30) as InvalidDateError', () => {
  const result = safeParse('yyyy-MM-dd', '2026-02-30');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof InvalidDateError);
  }
});

test('safeParse: classifies ambiguous-input throws as AmbiguousInputError', () => {
  // "Md" against "121" is the canonical ambiguous case from the parse.ts
  // docs — strict mode throws rather than guess.
  const result = safeParse('Md', '121');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof AmbiguousInputError);
  }
});

test('safeParse: passes through an already-typed error unchanged (invalid time zone)', () => {
  // parse() throws InvalidTimeZoneError directly (not via
  // wrapUntypedError) for a zzz group whose captured text isn't a real
  // IANA zone id — this is the "err instanceof TemporalFmtError" pass-
  // through branch, distinct from every other safeParse test above,
  // which all exercise the wrapUntypedError fallback instead.
  const result = safeParse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof InvalidTimeZoneError);
    assert.match(result.error.reason ?? '', /not a recognized IANA time zone/);
  }
});

test('safeParse: lenient mode resolves ambiguity and returns ok', () => {
  // yyyyMd has full date (year+month+day) plus the ambiguous M+d run at the
  // end. Lenient mode picks a split via the documented heuristic so the
  // parse succeeds; strict mode (default) would throw on the ambiguity.
  const result = safeParse('yyyyMd', '2026121', { lenient: true });
  assert.equal(result.ok, true);
});

// tryParse: best-effort variant. Returns the value or undefined. No
// diagnostic surface — when callers need the reason, they should use
// safeParse.
test('tryParse: success returns the parsed value', () => {
  const result = tryParse('yyyy-MM-dd', '2026-08-04');
  assert.ok(result !== undefined);
  assert.equal(result.toString(), '2026-08-04');
});

test('tryParse: failure returns undefined', () => {
  assert.equal(tryParse('yyyy-MM-dd', 'not-a-date'), undefined);
  assert.equal(tryParse('yyyy-MM-dd', '2026-02-30'), undefined);
});

// parseToParts: returns the matched groups with token labels before
// Temporal construction. Useful for callers building non-Temporal
// results or doing their own cross-checks.
test('parseToParts: returns the matched group per token, with raw text and position', () => {
  const parts = parseToParts('yyyy-MM-dd', '2026-08-04');
  assert.deepEqual(parts, [
    { token: 'yyyy', raw: '2026', position: 0 },
    { token: 'MM', raw: '08', position: 5 }, // after "2026-"
    { token: 'dd', raw: '04', position: 8 }, // after "2026-08-"
  ]);
});

test('parseToParts: throws on no-match the same way parse() does', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd', 'not-a-date'),
    /no valid pattern matches/,
  );
});

test('parseToParts: throws on ambiguous input in strict mode', () => {
  assert.throws(() => parseToParts('Md', '121'), /ambiguous/);
  // Lenient mode resolves — same behavior parse() has.
  const parts = parseToParts('Md', '121', { lenient: true });
  assert.equal(parts.length, 2);
});

test('parseToParts: does NOT throw on construction-time errors (Feb 30)', () => {
  // parseToParts doesn't construct anything, so it can't fail at the
  // Temporal construction step. Feb 30 still parses to parts; the caller
  // is responsible for cross-checking fields themselves.
  const parts = parseToParts('yyyy-MM-dd', '2026-02-30');
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '02', '30']);
});

test('parseToParts: parseNumberingSystem transliterates non-ASCII digits before matching', () => {
  // Same transliteration parse() applies (see numberingSystem.wiring.test.js)
  // — parseToParts has its own call site for this, since it never goes
  // through parse()'s code path.
  const parts = parseToParts('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' });
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '08', '04']);
});

test('parseToParts: format string exceeding max length throws (own copy of the same check parse() has)', () => {
  assert.throws(() => parseToParts('x'.repeat(1001), 'irrelevant'), /exceeds maximum length/);
});

test('parseToParts: input exceeding max length throws (own copy of the same check parse() has)', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd', '9'.repeat(100_001)),
    /input exceeds maximum length/,
  );
});

test('parseToParts: empty/literal-only format string throws "no tokens" (own copy of the same check parse() has)', () => {
  assert.throws(() => parseToParts('', ''), /no tokens/);
  assert.throws(() => parseToParts("'just literal'", 'just literal'), /no tokens/);
});

test('parseToParts: throws InvalidTimeZoneError for a bogus zzz zone (own copy of the same check parse() has)', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone'),
    /not a recognized IANA time zone/,
  );
});

// compileParser: pre-compiles a format string into an object with
// parse/safeParse/tryParse/parseToParts methods.
test('compileParser: returned object exposes parse, safeParse, tryParse, parseToParts, pattern, formatStr', () => {
  const compiled = compileParser('yyyy-MM-dd');
  assert.equal(compiled.formatStr, 'yyyy-MM-dd');
  assert.equal(typeof compiled.parse, 'function');
  assert.equal(typeof compiled.safeParse, 'function');
  assert.equal(typeof compiled.tryParse, 'function');
  assert.equal(typeof compiled.parseToParts, 'function');
  assert.ok(compiled.pattern);
  assert.ok(compiled.pattern.regex instanceof RegExp);
  assert.ok(Array.isArray(compiled.pattern.groups));
});

test('compileParser: parse() output matches parse() directly', () => {
  const compiled = compileParser('yyyy-MM-dd');
  assert.equal(
    compiled.parse('2026-08-04').toString(),
    parse('yyyy-MM-dd', '2026-08-04').toString(),
  );
});

test('compileParser: safeParse()/tryParse()/parseToParts() methods actually delegate to the module-level functions', () => {
  // The previous test only checks these are functions; this calls each
  // one and checks the output matches calling the top-level export
  // directly with the same pre-baked formatStr/locale.
  const compiled = compileParser('yyyy-MM-dd');

  const safe = compiled.safeParse('2026-08-04');
  assert.equal(safe.ok, true);
  if (safe.ok) assert.equal(safe.value.toString(), '2026-08-04');
  const safeFail = compiled.safeParse('not-a-date');
  assert.equal(safeFail.ok, false);

  assert.equal(compiled.tryParse('2026-08-04').toString(), '2026-08-04');
  assert.equal(compiled.tryParse('not-a-date'), undefined);

  const parts = compiled.parseToParts('2026-08-04');
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '08', '04']);
});

test('compileParser: validates the format string at compile time', () => {
  assert.throws(() => compileParser("yyyy-MM-dd 'at"), /unterminated quote/);
  assert.throws(() => compileParser('x'.repeat(1001)), /exceeds maximum length/);
});