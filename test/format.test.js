import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFormat, format, formatToParts, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Use native Temporal when available (Node 26+), polyfill otherwise —
// format() goes through Temporal.prototype.toLocaleString(), which works
// the same either way.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('PlainDate: basic yyyy-MM-dd', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('PlainDate: 2-digit year and unpadded month/day', () => {
  const date = Temporal.PlainDate.from('2026-01-05');
  assert.equal(format(date, 'yy-M-d'), '26-1-5');
});

test('PlainDate: long month and weekday names', () => {
  // 2026-08-04 is a Tuesday
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEEE, MMMM d, yyyy'), 'Tuesday, August 4, 2026');
});

test('PlainDate: short month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEE, MMM d'), 'Tue, Aug 4');
});

test('PlainDateTime: 24-hour time with seconds', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, 'yyyy-MM-dd HH:mm:ss'), '2026-08-04 15:45:30');
});

test('PlainDateTime: 12-hour time with AM/PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, 'h:mm a'), '3:45 PM');
});

test('PlainDateTime: midnight rolls to 12, not 0', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T00:15:00');
  assert.equal(format(dt, 'h:mm a'), '12:15 AM');
});

test('PlainDateTime: milliseconds', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.007');
  assert.equal(format(dt, 'ss.SSS'), '30.007');
});

test('ZonedDateTime: includes IANA time zone id', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'yyyy-MM-dd HH:mm zzz'), '2026-08-04 15:45 America/New_York');
});

test('quoted literal text passes through unparsed', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, "MMM d, yyyy 'at' h:mm a"), 'Aug 4, 2026 at 3:45 PM');
});

test('doubled quote inside a quoted span is a literal quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy 'it''s here'"), "2026 it's here");
});

test('doubled quote at top level is a standalone literal quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''"), "2026'");
});

test('bare punctuation passes through as literal', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy/MM/dd'), '2026/08/04');
});

test('MMMM is not read as four M tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
});

test('throws when a token needs a field the input type does not have', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'HH:mm'), /requires "hour"/);
});

test('throws on unterminated quote', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "yyyy 'oops"), /unterminated quote/);
});

test('PlainTime: works without date fields', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.equal(format(time, 'HH:mm:ss'), '15:45:30');
});

test('locale defaults to en-US', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM d, yyyy'), 'August 4, 2026');
});

test('fr-FR: localized month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'EEEE d MMMM yyyy', { locale: 'fr-FR' }), 'mardi 4 août 2026');
});

test('ar-EG: RTL script month and weekday names', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const result = format(date, 'EEEE d MMMM yyyy', { locale: 'ar-EG' });
  assert.equal(result, 'الثلاثاء 4 أغسطس 2026');
});

test('ar-EG: locale-native day period, not hardcoded AM/PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'h:mm a', { locale: 'ar-EG' }), '3:45 م');
});

test('ja-JP: day period renders in Japanese', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.equal(format(dt, 'a', { locale: 'ja-JP' }), '午後');
});

test('numeric tokens stay Western digits regardless of locale', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd', { locale: 'ar-EG' }), '2026-08-04');
});

test('ZonedDateTime: locale month works alongside zzz', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'MMMM d, yyyy zzz'), 'August 4, 2026 America/New_York');
});

test('ZonedDateTime: locale weekday in a non-English locale', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(zdt, 'EEEE', { locale: 'fr-FR' }), 'mardi');
});

test('Hebrew calendar date reads its own calendar off the object', () => {
  const date = Temporal.PlainDate.from('2026-08-04').withCalendar('hebrew');
  // not pinning exact numerals long-term, just that it doesn't throw and
  // uses the Hebrew month
  const result = format(date, 'MMMM d, yyyy');
  assert.equal(result, 'Av 21, 5786');
});

test('month-only query on iso8601 does not drop the token', () => {
  // regression — see the iso8601 skip in tokens.ts intlPart()
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
  assert.equal(format(date, 'EEEE'), 'Tuesday');
});

test('empty format string returns empty string', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, ''), '');
});

test('single-letter tokens (h, d, a, m, s, M, y) inside an unquoted literal word get read as fields, not text', () => {
  // "hello world" contains a bare "h" — read as the 12-hour token, which
  // throws on a PlainDate since it has no .hour field. Quote literal text
  // that might contain these letters.
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'hello world'), /requires "hour"/);
});

test('literal text free of token letters passes through unquoted', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy () [] # / -- !!'), '2026 () [] # / -- !!');
});

test('format string that is only a quoted literal', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "'just text'"), 'just text');
});

test('format string at exactly the max length succeeds', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // alternating token + separator so the length cap is what's under
  // test, not the tokenizer's overlong-same-letter-run guard
  const formatStr = 'd-'.repeat(500);
  assert.doesNotThrow(() => format(date, formatStr));
});

test('format string exceeding max length throws', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = 'x'.repeat(1001);
  assert.throws(() => format(date, formatStr), /exceeds maximum length/);
});

test('PlainDate: zzz throws (no timeZoneId field)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'zzz'), /requires "timeZoneId"/);
});

test('PlainDate: SSS throws (no millisecond field)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'SSS'), /requires "millisecond"/);
});

test('PlainDate: "a" throws (no hour field)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'a'), /requires "hour"/);
});

test('PlainTime: yyyy throws (no year field)', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => format(time, 'yyyy'), /requires "year"/);
});

test('PlainTime: MMMM throws (no month field)', () => {
  const time = Temporal.PlainTime.from('15:45:30');
  assert.throws(() => format(time, 'MMMM'), /requires "month"/);
});

test('PlainDateTime: zzz throws (no timeZoneId field)', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.throws(() => format(dt, 'zzz'), /requires "timeZoneId"/);
});

test('ZonedDateTime: all field categories succeed together', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30.007-04:00[America/New_York]');
  assert.equal(
    format(zdt, 'yyyy-MM-dd HH:mm:ss.SSS zzz'),
    '2026-08-04 15:45:30.007 America/New_York'
  );
});

test('hour 0 (midnight) as h/hh is 12, not 0', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T00:00:00');
  assert.equal(format(dt, 'h'), '12');
  assert.equal(format(dt, 'hh'), '12');
  assert.equal(format(dt, 'a'), 'AM');
});

test('hour 12 (noon) as h/hh is 12, and is PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T12:00:00');
  assert.equal(format(dt, 'h'), '12');
  assert.equal(format(dt, 'hh'), '12');
  assert.equal(format(dt, 'a'), 'PM');
});

test('hour 23 as h/hh is 11 PM', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T23:00:00');
  assert.equal(format(dt, 'h'), '11');
  assert.equal(format(dt, 'a'), 'PM');
});

test('hour 1 as H/HH is unpadded/padded 1', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T01:00:00');
  assert.equal(format(dt, 'H'), '1');
  assert.equal(format(dt, 'HH'), '01');
});

test('single-digit values pad correctly across all 2-digit tokens', () => {
  const dt = Temporal.PlainDateTime.from('2026-01-02T03:04:05');
  assert.equal(format(dt, 'yyyy-MM-dd HH:mm:ss'), '2026-01-02 03:04:05');
});

test('SSS pads milliseconds to 3 digits including zero', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(format(dt, 'SSS'), '000');
});

test('SSS pads single-digit milliseconds', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.005');
  assert.equal(format(dt, 'SSS'), '005');
});

// Fractional-second tokens beyond SSS (S through SSSSSSSSS) expose
// microsecond/nanosecond precision — see tokens.ts's formatFraction.
test('fractional-second tokens truncate a 9-digit value to each width', () => {
  const t = Temporal.PlainTime.from('09:30:00.123456789');
  assert.equal(format(t, 'S'), '1');
  assert.equal(format(t, 'SS'), '12');
  assert.equal(format(t, 'SSS'), '123');
  assert.equal(format(t, 'SSSS'), '1234');
  assert.equal(format(t, 'SSSSS'), '12345');
  assert.equal(format(t, 'SSSSSS'), '123456');
  assert.equal(format(t, 'SSSSSSS'), '1234567');
  assert.equal(format(t, 'SSSSSSSS'), '12345678');
  assert.equal(format(t, 'SSSSSSSSS'), '123456789');
});

test('fractional-second tokens pad a short value out to each width, not just repeat the digit', () => {
  // half a second is 500000000ns, not 5ns — SSSSSSSSS has to zero-pad on
  // the right, the same direction format() pads everywhere else it's
  // asked for more digits than the value has.
  const t = Temporal.PlainTime.from('09:30:00.5');
  assert.equal(format(t, 'S'), '5');
  assert.equal(format(t, 'SSS'), '500');
  assert.equal(format(t, 'SSSSSSSSS'), '500000000');
});

test('fractional-second tokens are all zero for a whole-second value', () => {
  const t = Temporal.PlainTime.from('09:30:00');
  assert.equal(format(t, 'SSSSSSSSS'), '000000000');
});

test('fractional-second tokens default missing microsecond/nanosecond to 0 for a hand-built field bag', () => {
  // Every other fraction-token test above uses a real Temporal.PlainTime,
  // which always has microsecond/nanosecond set (even if 0). A plain
  // object missing those fields entirely — like what a caller could
  // build by hand, or get back from a helper that only sets millisecond
  // precision — exercises formatFraction's `?? 0` fallbacks instead.
  const fakeTime = { millisecond: 500, hour: 9, minute: 30, second: 0, calendarId: 'iso8601' };
  assert.equal(format(fakeTime, 'SSSSSSSSS'), '500000000');
});

test('nanosecond round-trip through a ZonedDateTime survives format -> parse at full precision', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-07-13T09:30:00.123456789-04:00[America/New_York]');
  const p = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS'['zzz']'";
  const formatted = format(zdt, p);
  assert.equal(formatted, '2026-07-13T09:30:00.123456789[America/New_York]');
  const back = parse(p, formatted);
  assert.equal(back.nanosecond, zdt.nanosecond);
  assert.equal(back.microsecond, zdt.microsecond);
  assert.equal(back.millisecond, zdt.millisecond);
  assert.equal(back.timeZoneId, zdt.timeZoneId);
  assert.equal(back.epochNanoseconds, zdt.epochNanoseconds);
});

test('SSS keeps meaning exactly 3-digit milliseconds — unaffected by the wider tokens existing', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123456789');
  assert.equal(format(dt, 'SSS'), '123');
  assert.equal(parse('HH:mm:ss.SSS', '15:45:30.123').millisecond, 123);
});

test('yy pads single digit year-mod-100', () => {
  const date = Temporal.PlainDate.from('2005-01-01');
  assert.equal(format(date, 'yy'), '05');
});

test('yy on year 2000 is "00"', () => {
  const date = Temporal.PlainDate.from('2000-06-15');
  assert.equal(format(date, 'yy'), '00');
});

test('yyyy on a large year still pads at minimum 4 digits, no truncation', () => {
  const date = Temporal.PlainDate.from({ year: 9999, month: 1, day: 1 });
  assert.equal(format(date, 'yyyy'), '9999');
});

test('yy throws on negative (BCE-ish) year', () => {
  const date = Temporal.PlainDate.from({ year: -45, month: 1, day: 1 });
  assert.throws(() => format(date, 'yy'), /doesn't support negative years/);
});

test('yyyy on a negative year puts the sign before the padded digits', () => {
  const date = Temporal.PlainDate.from({ year: -45, month: 1, day: 1 });
  assert.equal(format(date, 'yyyy'), '-0045');
});

test('two single quotes mid-string is the doubled-quote escape, not an empty span', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''MM"), "2026'08");
});

test('a genuine empty span (quote, immediate close, quote) contributes nothing extra', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy'''x'MM"), "2026'x08");
});

test('adjacent literal runs merge into one piece (no observable difference, but check content)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy---MM'), '2026---08');
});

test('quote containing a token-like substring is not tokenized', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy 'yyyy'"), '2026 yyyy');
});

test('triple-doubled quote resolves as two literal-quote escapes back to back', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''''"), "2026''");
});

test('unterminated quote at very start of string throws', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "'unterminated"), /unterminated quote/);
});

test('lone single quote followed by nothing throws (unterminated)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "yyyy'"), /unterminated quote/);
});

test('non-token letters pass through literally (e.g. "Y", "T")', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'Y-T-yyyy'), 'Y-T-2026');
});

test('emoji and unicode literal text passes through', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy 📅 MM'), '2026 📅 08');
});

test('MMMM is greedily preferred over MMM/MM/M when 4 Ms appear', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM'), 'August');
});

test('exactly MMM (3 Ms) resolves to short month, not M+MM or MM+M', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMM'), 'Aug');
});

test('five Ms in a row: throws instead of splicing MMMM + the leftover M onto each other', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'MMMMM'), /isn't a recognized token/);
});

test('adjacent same-field tokens with no separator: yyyyMMdd', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyyMMdd'), '20260804');
});

test('back-to-back distinct tokens with no literal separator: HHmmss', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T05:06:07');
  assert.equal(format(dt, 'HHmmss'), '050607');
});

test('unrecognized BCP47 locale falls back without throwing', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.doesNotThrow(() => format(date, 'MMMM', { locale: 'xx-XX' }));
});

test('malformed locale tag throws instead of being silently ignored', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'MMMM', { locale: 'not_a_locale!!' }));
});

test('locale option is ignored entirely for pure-numeric format strings', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(
    format(date, 'yyyy-MM-dd', { locale: 'ja-JP' }),
    format(date, 'yyyy-MM-dd', { locale: 'en-US' })
  );
});

test('repeated calls with different locales do not cross-contaminate cache', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const en = format(date, 'MMMM', { locale: 'en-US' });
  const fr = format(date, 'MMMM', { locale: 'fr-FR' });
  const enAgain = format(date, 'MMMM', { locale: 'en-US' });
  assert.equal(en, 'August');
  assert.equal(fr, 'août');
  assert.equal(enAgain, 'August');
});

test('_getPieces: exposes the shared tokenization cache via the format.js subpath', async () => {
  const { _getPieces } = await import('../dist/format.js');
  assert.equal(typeof _getPieces, 'function');
  const pieces = _getPieces('yyyy-MM-dd');
  assert.deepEqual(pieces, [
    { kind: 'token', value: 'yyyy' },
    { kind: 'literal', value: '-' },
    { kind: 'token', value: 'MM' },
    { kind: 'literal', value: '-' },
    { kind: 'token', value: 'dd' },
  ]);
});

// formatToParts mirrors Intl.DateTimeFormat.formatToParts. Each entry
// is either a literal (carrying no token info) or a token piece with
// the token string and the formatted value.
test('formatToParts: basic date splits into literal+token+literal+...', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const parts = formatToParts(date, 'yyyy-MM-dd');
  assert.deepEqual(parts, [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '08', token: 'MM' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '04', token: 'dd' },
  ]);
});

test('formatToParts: adjacent literals collapse into one literal piece', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // The "at " and " " are two adjacent literals between MMM and d — they
  // should collapse into one literal entry, mirroring how format() walks
  // pieces internally.
  const parts = formatToParts(date, "MMM 'at' d");
  assert.deepEqual(parts, [
    { type: 'token', value: 'Aug', token: 'MMM' },
    { type: 'literal', value: ' at ' },
    { type: 'token', value: '4', token: 'd' },
  ]);
});

test('formatToParts: throws on missing field the same way format() does', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // PlainDate has no hour field — formatToParts should throw with the same
  // shape of message format() throws, so callers switching between them
  // get consistent errors.
  assert.throws(
    () => formatToParts(date, 'HH:mm'),
    /token "HH" requires "hour"/,
  );
});

// compileFormat: pre-tokenizes once, exposes a tiny object with format()
// and formatToParts() methods. Useful for callers who want to hold the
// compiled form explicitly.
test('compileFormat: returned object has format, formatToParts, pieces, formatStr', () => {
  const compiled = compileFormat('yyyy-MM-dd');
  assert.equal(compiled.formatStr, 'yyyy-MM-dd');
  assert.equal(typeof compiled.format, 'function');
  assert.equal(typeof compiled.formatToParts, 'function');
  assert.ok(Array.isArray(compiled.pieces));
  assert.equal(compiled.pieces.length, 5); // yyyy, '-', MM, '-', dd
});

test('compileFormat: format() output matches format() directly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.equal(compiled.format(date), format(date, 'yyyy-MM-dd'));
  assert.equal(compiled.format(date), '2026-08-04');
});

test('compileFormat: formatToParts() output matches formatToParts() directly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.deepEqual(compiled.formatToParts(date), formatToParts(date, 'yyyy-MM-dd'));
});

test('compileFormat: validates the format string at compile time, not lazily', () => {
  // Unterminated quote — surfaces at compileFormat, not at first format() call.
  // This is the point of compiling up front: fail fast on bad input.
  assert.throws(() => compileFormat("yyyy-MM-dd 'at HH:mm"), /unterminated quote/);
  assert.throws(() => compileFormat('x'.repeat(1001)), /exceeds maximum length/);
});

test('formatToParts: format string over the max length throws', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => formatToParts(date, 'y'.repeat(1001)), /exceeds maximum length/);
});

test('compileFormat: format() throws on missing field the same way format() does', () => {
  const time = Temporal.PlainTime.from('10:30:00');
  const compiled = compileFormat('yyyy-MM-dd');
  // PlainTime has no year/month/day fields — compileFormat's own format()
  // closure duplicates the field check rather than delegating to the
  // top-level format(), so it needs its own coverage of the same throw.
  assert.throws(() => compiled.format(time), /token "yyyy" requires "year"/);
});

test('compileFormat: formatToParts() throws on missing field the same way formatToParts() does', () => {
  const time = Temporal.PlainTime.from('10:30:00');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.throws(() => compiled.formatToParts(time), /token "yyyy" requires "year"/);
});
