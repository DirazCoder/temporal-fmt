import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setTemporal } from '../dist/index.js';
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

test('no locale option still builds a plain ISO 8601 result', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.calendarId, 'iso8601');
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

test('zzz with an unrecognized zone id is rejected by the token pattern (built from Intl.supportedValuesOf)', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone'),
    /no valid pattern matches/
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

test('AM/PM marker is case-sensitive — lowercase "pm" does not match default en-US vocab', () => {
  assert.throws(() => parse('h:mm a', '3:45 pm'), /no valid pattern matches/);
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