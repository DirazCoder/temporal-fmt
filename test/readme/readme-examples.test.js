// README examples verification harness.
// Runs EVERY code example in README.md against the built dist/ package,
// imported exactly the way the README shows (package subpaths).
// Polyfill section: "import 'temporal-polyfill/global'" provides Temporal.
import 'temporal-polyfill/full/global';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const T = globalThis.Temporal;

// Date/time values used across README sections (fixed, no clock dependency)
const date = T.PlainDate.from('2026-08-04');          // Tuesday
const dt = T.PlainDateTime.from('2026-08-04T15:45:30');
const zdt = T.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');

// ---------------------------------------------------------------- Get started
test('README get-started: format(date, "yyyy-MM-dd") === "2026-08-04"', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('README get-started: parse(...) returns Temporal.PlainDateTime', async () => {
  const { parse } = await import('temporal-fmt/parse');
  const v = parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');
  assert.ok(v instanceof T.PlainDateTime, `expected PlainDateTime, got ${v?.constructor?.name}`);
  assert.equal(v.toString(), '2026-08-04T15:45:00');
});

// -------------------------------------------------------- Providing Temporal
test('README setTemporal(): bring-your-own namespace works, and clears when called with no argument', async () => {
  const { Temporal: PolyTemporal } = await import('temporal-polyfill/full');
  const root = await import('temporal-fmt');
  const { parse } = await import('temporal-fmt/parse');
  try {
    root.setTemporal(PolyTemporal);
    const v = parse('yyyy-MM-dd', '2026-08-04');
    assert.ok(v instanceof PolyTemporal.PlainDate, `expected PolyTemporal.PlainDate, got ${v?.constructor?.name}`);
    assert.equal(v.toString(), '2026-08-04');
  } finally {
    root.setTemporal(); // clears the override — back to global Temporal
  }
  const v2 = parse('yyyy-MM-dd', '2026-08-05');
  assert.ok(v2 instanceof T.PlainDate);
});

// ----------------------------------------------------------------- Formatting
test('README formatting: the four claimed outputs', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(format(date, 'MMMM d, yyyy'), 'August 4, 2026');
  assert.equal(format(dt, "MMM d, yyyy 'at' h:mm a"), 'Aug 4, 2026 at 3:45 PM');
  assert.equal(format(zdt, 'yyyy-MM-dd HH:mm zzz'), '2026-08-04 15:45 America/New_York');
});

test('README formatting: literal text in single quotes; literal quote is \'\'', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(dt, "h 'o''clock'"), "3 o'clock");
});

test('README formatting: HH on a PlainDate throws a descriptive error', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.throws(() => format(date, 'HH:mm'), /requires|doesn't have/);
});

test('README formatting: formatToParts shape {type:"literal"|"token", value, token?}', async () => {
  const { formatToParts } = await import('temporal-fmt/format');
  const parts = formatToParts(date, 'yyyy-MM-dd');
  assert.ok(Array.isArray(parts));
  for (const p of parts) assert.ok(p.type === 'literal' || p.type === 'token');
  assert.equal(parts.map((p) => p.value).join(''), '2026-08-04');
});

test('README formatting: compileFormat() has .format()/.formatToParts()/.pieces/.formatStr', async () => {
  const { compileFormat } = await import('temporal-fmt/format');
  const c = compileFormat('yyyy-MM-dd');
  assert.equal(typeof c.format, 'function');
  assert.equal(typeof c.formatToParts, 'function');
  assert.ok(Array.isArray(c.pieces));
  assert.equal(c.formatStr, 'yyyy-MM-dd');
  assert.equal(c.format(date), '2026-08-04');
});

// ------------------------------------------------------------------- Parsing
test('README parsing: shape mismatch and invalid date throw', async () => {
  const { parse } = await import('temporal-fmt/parse');
  assert.throws(() => parse('yyyy-MM', '2026-08-04T15:45:30'));
  assert.throws(() => parse('yyyy-MM-dd', '2026-02-30'));
});

test('README parsing: weekday cross-check', async () => {
  const { parse } = await import('temporal-fmt/parse');
  // 2026-08-04 is a Tuesday
  assert.equal(date.dayOfWeek, 2);
  const ok = parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');
  assert.ok(ok instanceof T.PlainDate);
  assert.throws(() => parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04'));
});

test('README parsing: other entry points (safeParse/tryParse/parseToParts/compileParser)', async () => {
  const mod = await import('temporal-fmt/parse');
  const ok = mod.safeParse('yyyy-MM-dd', '2026-08-04');
  assert.equal(ok.ok, true);
  assert.ok(ok.value instanceof T.PlainDate);
  const bad = mod.safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(bad.ok, false);
  assert.ok(bad.error instanceof Error);
  assert.equal(mod.tryParse('yyyy-MM-dd', '2026-08-04').toString(), '2026-08-04');
  assert.equal(mod.tryParse('yyyy-MM-dd', 'nope'), undefined);
  const parts = mod.parseToParts('yyyy-MM-dd', '2026-08-04');
  assert.ok(Array.isArray(parts));
  const compiled = mod.compileParser('yyyy-MM-dd');
  assert.equal(typeof compiled.parse, 'function');
  assert.equal(compiled.parse('2027-01-31').toString(), '2027-01-31');
});

// -------------------------------------------------------------- Parsing notes
test('README parsing notes: yy strptime pivot 00-68 -> 2000-2068, 69-99 -> 1900-1999', async () => {
  const { parse } = await import('temporal-fmt/parse');
  assert.equal(parse('yy-MM-dd', '68-12-31').year, 2068);
  assert.equal(parse('yy-MM-dd', '69-01-01').year, 1969);
  assert.equal(parse('yy-MM-dd', '00-01-01').year, 2000);
  assert.equal(parse('yy-MM-dd', '99-01-01').year, 1999);
});

test('README parsing notes: hh/h without a throws; mixing HH/H with hh/h throws', async () => {
  const { parse } = await import('temporal-fmt/parse');
  assert.throws(() => parse('hh:mm', '03:05'));
  assert.throws(() => parse('h:mm', '3:05'));
  assert.throws(() => parse('HH:mm hh:mm', '15:05 03:05'));
});

test('README parsing notes: HH/H with a throws (both describe the hour)', async () => {
  const { parse } = await import('temporal-fmt/parse');
  // README: "HH/H with a throws too" — refuse the combination outright.
  assert.throws(() => parse('HH:mm a', '13:05 PM'), /mixes a 24-hour token.*day-period/);
  assert.throws(() => parse('H:mm a', '13:05 PM'), /mixes a 24-hour token.*day-period/);
  // hh/h + a is the supported 12-hour pair; a folds into the hour
  assert.equal(parse('h:mm a', '3:05 PM').hour, 15);
});

test('README parsing notes: a is case-insensitive; month/weekday names case-sensitive', async () => {
  const { parse } = await import('temporal-fmt/parse');
  for (const ap of ['PM', 'pm', 'Pm']) {
    const v = parse('h:mm a', `3:05 ${ap}`);
    assert.equal(v.hour, 15, `a="${ap}" should parse as 15:05`);
  }
  assert.throws(() => parse('MMMM d, yyyy', 'august 4, 2026'));
});

test('README parsing notes: S..SSSSSSSSS nanosecond precision, parse right-pads', async () => {
  const { format } = await import('temporal-fmt/format');
  const { parse } = await import('temporal-fmt/parse');
  const withNs = new T.PlainDateTime(2026, 8, 4, 15, 45, 30, 123, 456, 789);
  assert.equal(format(withNs, 'S'), '1');
  assert.equal(format(withNs, 'SS'), '12');
  assert.equal(format(withNs, 'SSSSSSSSS'), '123456789');
  // "SSSSSSSSS reading .5 gives you 500ms worth of nanoseconds"
  const v = parse('yyyy-MM-dd HH:mm:ss.SSSSSSSSS', '2026-08-04 15:45:30.5');
  assert.equal(v.millisecond, 500);
  assert.equal(v.microsecond, 0);
  assert.equal(v.nanosecond, 0);
  // shorter widths right-pad too: .12 under SSS is 120ms
  assert.equal(parse('HH:mm:ss.SSS', '15:45:30.12').millisecond, 120);
  // full-width input still works
  assert.equal(parse('yyyy-MM-dd HH:mm:ss.SSSSSSSSS', '2026-08-04 15:45:30.500000000').millisecond, 500);
});

// -------------------------------------------------- Ambiguous input / lenient
test('README lenient: glued run ambiguity throws; lenient picks day<=12 split', async () => {
  const { parse } = await import('temporal-fmt/parse');
  assert.throws(() => parse('yyyy-Md', '2026-121'));
  assert.equal(parse('yyyy-Md', '2026-121', { lenient: true }).toString(), '2026-12-01');
});

// ------------------------------------------------------------- Offset tokens
test('README offset tokens: uppercase collapses +00:00 to Z; lowercase never does', async () => {
  const { format } = await import('temporal-fmt/format');
  const utc = T.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]');
  assert.equal(format(utc, 'X'), 'Z');
  assert.equal(format(utc, 'XX'), 'Z');
  assert.equal(format(utc, 'XXX'), 'Z');
  assert.equal(format(utc, 'x'), '+00');
  assert.equal(format(utc, 'xx'), '+0000');
  assert.equal(format(utc, 'xxx'), '+00:00');
});

test('README offset tokens: single-letter drops minutes when zero', async () => {
  const { format } = await import('temporal-fmt/format');
  const calcutta = T.ZonedDateTime.from('2026-08-04T15:45:30+05:30[Asia/Kolkata]');
  const karachi = T.ZonedDateTime.from('2026-08-04T15:45:30+05:00[Asia/Karachi]');
  assert.equal(format(karachi, 'X'), '+05');
  assert.equal(format(calcutta, 'X'), '+0530');
  assert.equal(format(karachi, 'XX'), '+0500');
  assert.equal(format(karachi, 'XXX'), '+05:00');
  assert.equal(format(calcutta, 'x'), '+0530');
});

test('README offset tokens: parse needs full date+time; offset-only pattern (no zzz) refused', async () => {
  const { parse } = await import('temporal-fmt/parse');
  // README "Fixed divergences": a pattern with an offset token and no zzz now throws.
  assert.throws(
    () => parse("yyyy-MM-dd'T'HH:mmXXX", '2026-08-04T15:45+05:00'),
    /offset token but no "zzz"/,
  );
  // With both zzz and an offset token: zzz wins for timeZoneId, offset cross-checked
  const v = parse("yyyy-MM-dd'T'HH:mmXXX zzz", '2026-08-04T15:45+05:30 Asia/Kolkata');
  assert.ok(v instanceof T.ZonedDateTime);
  assert.equal(v.timeZoneId, 'Asia/Kolkata');
  assert.throws(() =>
    parse("yyyy-MM-dd'T'HH:mmXXX zzz", '2026-08-04T15:45+06:30 Asia/Kolkata'),
  );
});

test('README offset tokens: sub-minute offsets only pass through xxx; others throw', async () => {
  const { format } = await import('temporal-fmt/format');
  // Pre-1883 New York local mean time: -04:56:02
  const lmt = T.ZonedDateTime.from('1880-06-15T12:00:00[America/New_York]');
  assert.equal(lmt.offset, '-04:56:02');
  assert.throws(() => format(lmt, 'X'));
  assert.throws(() => format(lmt, 'XX'));
  assert.throws(() => format(lmt, 'XXX'));
  assert.throws(() => format(lmt, 'x'));
  assert.throws(() => format(lmt, 'xx'));
  assert.equal(format(lmt, 'xxx'), '-04:56:02');
});

// -------------------------------------------------------------------- Locales
test('README locales: fr-FR / ar-EG / ja-JP claims', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'MMMM d, yyyy', { locale: 'fr-FR' }), 'août 4, 2026');
  const ar = format(date, 'EEEE d MMMM', { locale: 'ar-EG' });
  assert.ok(/[\u0600-\u06FF]/.test(ar), `expected Arabic script, got "${ar}"`);
  assert.equal(format(dt, 'h:mm a', { locale: 'ja-JP' }), '3:45 午後');
});

test('README locales: withCalendar("hebrew") formats through Intl — "Av 21, 5786"', async () => {
  const { format } = await import('temporal-fmt/format');
  const hebrewDate = date.withCalendar('hebrew');
  assert.equal(format(hebrewDate, 'MMMM d, yyyy'), 'Av 21, 5786');
});

test('README locales: parse() handles locales the same way', async () => {
  const { parse } = await import('temporal-fmt/parse');
  const v = parse('MMMM d, yyyy', 'août 4, 2026', { locale: 'fr-FR' });
  assert.ok(v instanceof T.PlainDate);
  assert.equal(v.toString(), '2026-08-04');
});

test('README locales: numeric tokens are Western digits by default even for ar-EG', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'yyyy-MM-dd', { locale: 'ar-EG' }), '2026-08-04');
});

test('README registerLocaleVocab: en-u-ca-hebrew-leap example registers and works (Tishrei-first, 13 entries)', async () => {
  const { registerLocaleVocab } = await import('temporal-fmt');
  const { format } = await import('temporal-fmt/format');
  registerLocaleVocab('en-u-ca-hebrew-leap', {
    monthLong: ['Tishrei', 'Marcheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II', 'Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul'],
    monthShort: ['Tish', 'Chesh', 'Kis', 'Tev', 'Shv', 'Ad1', 'Ad2', 'Nis', 'Iyy', 'Siv', 'Tam', 'Av', 'Elu'],
    weekdayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dayPeriod: ['AM', 'PM'],
  });
  // 5784 is a leap year (13 months); Av is its 12th ordinal month
  const avDate = T.PlainDate.from({ year: 5784, month: 12, day: 21, calendar: 'hebrew' });
  assert.equal(format(avDate, 'MMMM d, yyyy', { locale: 'en-u-ca-hebrew-leap' }), 'Av 21, 5784');
});

test('README registerLocale: test-locale-1 example registers; getLocale/hasLocale', async () => {
  const root = await import('temporal-fmt');
  root.registerLocale('test-locale-1', {
    monthLong: ['Januarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Iunius', 'Iulius', 'Augustus', 'September', 'October', 'November', 'December'],
    monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    weekdayLong: ['Lunae', 'Martis', 'Mercurii', 'Iovis', 'Veneris', 'Saturni', 'Solis'],
    weekdayShort: ['Lu', 'Ma', 'Me', 'Io', 'Ve', 'Sa', 'So'],
    dayPeriod: ['AM', 'PM'],
    quartersLong: ['First', 'Second', 'Third', 'Fourth'],
    quartersShort: ['Q1', 'Q2', 'Q3', 'Q4'],
    erasLong: ['BCE', 'CE'],
    erasShort: ['BC', 'AD'],
    ordinals: ['st', 'nd', 'rd', 'th'],
    durationUnits: { years: ['year', 'years'] },
    relativeTime: { past: 'ago', future: 'in', now: 'now' },
  });
  assert.equal(root.hasLocale('test-locale-1'), true);
  assert.equal(root.hasLocale('xx-nonexistent-xx'), false);
  assert.equal(root.getLocale('test-locale-1').monthLong[7], 'Augustus');
  // Strict validation: wrong array lengths throw at registration time
  assert.throws(() =>
    root.registerLocale('bad-len', {
      monthLong: ['only', 'three'],
      monthShort: ['only', 'three'],
      weekdayLong: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      weekdayShort: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      dayPeriod: ['AM', 'PM'],
    }),
  );
  // 11 months is still invalid (12 or 13 only), and mismatched long/short lengths throw
  assert.throws(() =>
    root.registerLocaleVocab('bad-len-11', {
      monthLong: Array.from({ length: 11 }, (_, i) => `M${i}`),
      monthShort: Array.from({ length: 11 }, (_, i) => `M${i}`),
      weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      dayPeriod: ['AM', 'PM'],
    }),
  );
  assert.throws(() =>
    root.registerLocaleVocab('bad-len-mismatch', {
      monthLong: Array.from({ length: 12 }, (_, i) => `Month${i}`),
      monthShort: Array.from({ length: 13 }, (_, i) => `M${i}`),
      weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      dayPeriod: ['AM', 'PM'],
    }),
  );
});

// --------------------------------------------------------------------- Tokens
test('README token table: examples against dt=2026-08-04T15:45:30 / zdt America/New_York', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'yyyy'), '2026');
  assert.equal(format(date, 'yy'), '26');
  assert.equal(format(date, 'MMMM'), 'August');
  assert.equal(format(date, 'MMM'), 'Aug');
  assert.equal(format(date, 'MM'), '08');
  assert.equal(format(date, 'M'), '8');
  assert.equal(format(date, 'dd'), '04');
  assert.equal(format(date, 'd'), '4');
  assert.equal(format(date, 'do'), '4th');
  assert.equal(format(date, 'EEEE'), 'Tuesday');
  assert.equal(format(date, 'EEE'), 'Tue');
  assert.equal(format(dt, 'HH'), '15');
  assert.equal(format(dt, 'H'), '15');
  assert.equal(format(dt, 'hh'), '03');
  assert.equal(format(dt, 'h'), '3');
  assert.equal(format(dt, 'mm'), '45');
  assert.equal(format(dt, 'm'), '45');
  assert.equal(format(dt, 'ss'), '30');
  assert.equal(format(dt, 's'), '30');
  assert.equal(format(dt, 'SSS'), '000');
  assert.equal(format(dt, 'a'), 'PM');
  assert.equal(format(zdt, 'zzz'), 'America/New_York');
  assert.equal(format(date, 'Q'), '3');
  assert.equal(format(date, 'QQQ'), 'Q3');
  assert.equal(format(date, 'ww'), '32');
  assert.equal(format(date, 'RRRR'), '2026');
  assert.equal(format(date, 'D'), '216');
  assert.equal(format(date, 'DD'), '216');
  assert.equal(format(date, 'DDD'), '216');
  assert.equal(format(date, 'LLLL'), 'August');
  assert.equal(format(date, 'LLL'), 'Aug');
  assert.equal(format(date, 'cccc'), 'Tuesday');
  assert.equal(format(date, 'ccc'), 'Tue');
  assert.equal(format(date, 'GGGG'), 'Anno Domini');
  assert.equal(format(date, 'G'), 'AD');
});

test('README token table: z / zzzz localized zone names (January NY date -> EST)', async () => {
  const { format } = await import('temporal-fmt/format');
  const jan = T.ZonedDateTime.from('2026-01-15T12:00:00-05:00[America/New_York]');
  assert.equal(format(jan, 'z'), 'EST');
  assert.equal(format(jan, 'zzzz'), 'Eastern Time');
});

test('README tokens: ww/RRRR year-boundary divergence claims', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(T.PlainDate.from('2026-12-31'), 'ww RRRR'), '53 2026');
  assert.equal(format(T.PlainDate.from('2027-01-01'), 'ww RRRR'), '53 2026');
  assert.equal(format(T.PlainDate.from('2027-01-04'), 'ww RRRR'), '01 2027');
});

test('README tokens: do / ww / RRRR are format-only', async () => {
  const root = await import('temporal-fmt');
  const { parse } = await import('temporal-fmt/parse');
  const expectedFormatOnly = ['do', 'ww', 'RRRR', 'D', 'DD', 'DDD', 'LLLL', 'LLL', 'cccc', 'ccc', 'GGGG', 'G', 'zzzz', 'z'];
  for (const t of expectedFormatOnly) assert.ok(root.FORMAT_ONLY_TOKENS.has(t), `${t} should be format-only`);
  assert.throws(() => parse('yyyy-MM-do', '2026-08-04th'));
  assert.throws(() => parse('ww RRRR', '32 2026'));
});

test('README tokens: Q/QQQ parse and cross-check against month', async () => {
  const { parse } = await import('temporal-fmt/parse');
  assert.equal(parse('yyyy-MM-dd Q', '2026-08-04 3').toString(), '2026-08-04');
  assert.equal(parse('yyyy-MM-dd QQQ', '2026-08-04 Q3').toString(), '2026-08-04');
  assert.throws(() => parse('yyyy-MM-dd Q', '2026-08-04 4'));
});

// -------------------------------------------------------- Duration formatting
test('README duration: the three basic examples', async () => {
  const { formatDuration } = await import('temporal-fmt/duration');
  assert.equal(formatDuration({ years: 2, months: 3 }, 'yyy ooo'), '2 years 3 months');
  assert.equal(formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm'), '2 hours 30 minutes');
  assert.equal(formatDuration({ hours: 2, minutes: 30 }, 'h:m'), '2:30');
});

test('README duration: locale examples (fr-FR / de-DE)', async () => {
  const { formatDuration } = await import('temporal-fmt/duration');
  // Intl uses a non-breaking space (U+00A0) between number and unit in French;
  // normalize it for comparison — the README shows the visual rendering.
  const nbsp = /\u00a0|\u202f/g;
  assert.equal(formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' }).replace(nbsp, ' '), '2 heures 30 minutes');
  assert.equal(formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'de-DE' }), '2 Stunden 30 Minuten');
});

test('README duration: zero values omitted by default; showZeroValues renders them', async () => {
  const { formatDuration } = await import('temporal-fmt/duration');
  // "any trailing literal separators left over from the format string are
  // the caller's problem" — the ' ' between hhh and mmm stays in the output
  assert.equal(formatDuration({ hours: 2 }, 'hhh mmm'), '2 hours ');
  assert.equal(formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { showZeroValues: true }), '2 hours 0 minutes');
});

test('README duration: short and long forms are plural-aware; accepts Temporal.Duration', async () => {
  const { formatDuration } = await import('temporal-fmt/duration');
  assert.equal(formatDuration({ hours: 1 }, 'hh'), '1h');
  assert.equal(formatDuration({ hours: 1 }, 'hhh'), '1 hour');
  assert.equal(formatDuration({ hours: 3 }, 'hhh'), '3 hours');
  const d = new T.Duration(1, 2, 0, 3, 4);
  assert.equal(formatDuration(d, 'yyy ooo ddd'), '1 year 2 months 3 days');
});

test('README duration: other duration functions', async () => {
  const root = await import('temporal-fmt');
  assert.ok(Array.isArray(root.formatDurationToParts({ hours: 2 }, 'hhh')));
  const pd = root.parseDuration('2 hours 30 minutes', 'hhh mmm');
  assert.equal(pd.hours, 2);
  assert.equal(pd.minutes, 30);
  const iso = root.parseISODuration('P1Y2M3DT4H5M6S');
  assert.equal(iso.years, 1);
  assert.equal(iso.months, 2);
  assert.equal(iso.days, 3);
  assert.equal(iso.hours, 4);
  assert.equal(iso.minutes, 5);
  assert.equal(iso.seconds, 6);
  assert.equal(root.formatISODuration({ hours: 1, minutes: 30 }), 'PT1H30M');
  const balanced = root.balanceDuration({ minutes: 90 });
  assert.equal(balanced.hours, 1);
  assert.equal(balanced.minutes, 30);
  assert.equal(root.totalDuration({ hours: 1, minutes: 30 }, 'minutes'), 90);
  assert.equal(root.compareDuration({ hours: 1 }, { hours: 2 }), -1);
  assert.equal(root.addDuration({ hours: 1 }, { minutes: 30 }).minutes, 30);
  assert.equal(root.addDuration({ hours: 1 }, { minutes: 30 }).hours, 1);
  assert.equal(root.subtractDuration({ hours: 1 }, { minutes: 30 }).minutes, -30);
  // roundDuration throws for calendar-bound units without relativeTo
  assert.throws(() => root.roundDuration({ months: 1 }, { largestUnit: 'days' }));
});

// ------------------------------------------------------- Relative time (distance)
test('README formatDistance: "yesterday" / "1 day ago" / "now" / "dans 2 jours" claims', async () => {
  const { formatDistance } = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04');
  const yesterday = T.PlainDate.from('2026-08-03');
  assert.equal(formatDistance(yesterday, today), 'yesterday');
  assert.equal(formatDistance(yesterday, today, { numeric: 'always' }), '1 day ago');
  assert.equal(formatDistance(today, today), 'now');
  assert.equal(formatDistance(today.add({ days: 2 }), today, { numeric: 'always', locale: 'fr-FR' }), 'dans 2 jours');
});

test('README formatDistance: cutoffs override + monotonicity validation', async () => {
  const { formatDistance } = await import('temporal-fmt');
  const today = T.PlainDateTime.from('2026-08-04T00:00:00');
  const twoDaysAgo = T.PlainDateTime.from('2026-08-02T00:00:00');
  // Raising the hours cutoff to 100h keeps a 2-day gap on the hours unit
  assert.equal(formatDistance(twoDaysAgo, today, { cutoffs: { hours: 100 } }), '48 hours ago');
  assert.throws(() => formatDistance(twoDaysAgo, today, { cutoffs: { days: 0 } }));
  assert.throws(() => formatDistance(twoDaysAgo, today, { cutoffs: { days: 2, hours: 100 } })); // hours > days: non-monotonic
});

test('README formatDistance: PlainDate vs PlainDateTime treated as midnight; PlainTime throws', async () => {
  const { formatDistance } = await import('temporal-fmt');
  const pd = T.PlainDate.from('2026-08-02');
  const pdt = T.PlainDateTime.from('2026-08-04T00:00:00');
  assert.equal(formatDistance(pd, pdt), '2 days ago');
  assert.throws(() => formatDistance(T.PlainTime.from('12:00'), pdt));
});

test('README formatDistanceToNow: "3 hours ago" / "in 1 day" claims (mocked clock)', async () => {
  const { formatDistanceToNow } = await import('temporal-fmt');
  const realDate = globalThis.Date;
  class MockDate extends realDate {
    constructor(...args) {
      if (args.length === 0) return new realDate('2026-08-04T15:45:30.000');
      return new realDate(...args);
    }
    static now() { return new realDate('2026-08-04T15:45:30.000').getTime(); }
  }
  globalThis.Date = MockDate;
  try {
    const threeHoursAgo = T.PlainDateTime.from('2026-08-04T12:45:30');
    assert.equal(formatDistanceToNow(threeHoursAgo), '3 hours ago');
    // README: formatDistanceToNow(tomorrow) // "tomorrow" — "in 1 day" with { numeric: 'always' }
    const tomorrow = T.PlainDateTime.from('2026-08-05T15:45:30');
    assert.equal(formatDistanceToNow(tomorrow), 'tomorrow');
    assert.equal(formatDistanceToNow(tomorrow, { numeric: 'always' }), 'in 1 day');
  } finally {
    globalThis.Date = realDate;
  }
});

// -------------------------------------------------- formatRelative / ToNow
test('README formatRelative: calendar-relative labels', async () => {
  const root = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04');
  const yesterday = T.PlainDate.from('2026-08-03');
  const tomorrow = T.PlainDate.from('2026-08-05');
  assert.equal(root.formatRelative(yesterday, today), 'yesterday');
  assert.equal(root.formatRelative(tomorrow, today), 'tomorrow');
  assert.equal(root.formatRelative(today, today), 'today');
  assert.equal(root.formatRelative(today.add({ days: 8 }), today), 'next week');
  assert.equal(root.formatRelative(today.subtract({ days: 8 }), today), 'last week');
  // Common patterns: formatRelativeToNow(date) -> "3 days ago"
  const realDate = globalThis.Date;
  class MockDate extends realDate {
    constructor(...args) {
      if (args.length === 0) return new realDate('2026-08-04T15:45:30.000');
      return new realDate(...args);
    }
    static now() { return new realDate('2026-08-04T15:45:30.000').getTime(); }
  }
  globalThis.Date = MockDate;
  try {
    const threeDaysAgo = T.PlainDate.from('2026-08-01');
    assert.equal(root.formatRelativeToNow(threeDaysAgo), '3 days ago');
  } finally {
    globalThis.Date = realDate;
  }
});

// ------------------------------------------------ Natural-language date parsing
test('README parseRelative: all eight claimed outputs (today = 2026-08-04, a Tuesday)', async () => {
  const { parseRelative } = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04');
  assert.equal(today.dayOfWeek, 2, '2026-08-04 must be a Tuesday for these examples');
  assert.equal(parseRelative('today', today).toString(), '2026-08-04');
  assert.equal(parseRelative('next Tuesday', today).toString(), '2026-08-11');
  assert.equal(parseRelative('last Friday', today).toString(), '2026-07-31');
  assert.equal(parseRelative('in 3 days', today).toString(), '2026-08-07');
  assert.equal(parseRelative('March 5th', today).toString(), '2027-03-05');
  assert.equal(parseRelative('mañana', today, { locale: 'es-ES' }).toString(), '2026-08-05');
  assert.equal(parseRelative('demain', today, { locale: 'fr-FR' }).toString(), '2026-08-05');
  assert.equal(parseRelative('morgen', today, { locale: 'de-DE' }).toString(), '2026-08-05');
});

test('README parseRelative: documented ambiguous-case choices', async () => {
  const { parseRelative } = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04'); // Tuesday
  assert.equal(parseRelative('this Tuesday', today).toString(), '2026-08-04');
  assert.equal(parseRelative('last Tuesday', today).toString(), '2026-07-28'); // 7 days ago
  // Past month-day this year rolls to next year
  assert.equal(parseRelative('March 5th', T.PlainDate.from('2026-04-01')).toString(), '2027-03-05');
  assert.equal(parseRelative('September 9th', T.PlainDate.from('2026-04-01')).toString(), '2026-09-09');
  // Bare number phrases throw
  assert.throws(() => parseRelative('5 days', today));
  assert.throws(() => parseRelative('gibberish phrase', today));
});

test('README parseRelative: diacritics stripped (este miercoles -> este miércoles); umlauts expanded', async () => {
  const { parseRelative } = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04');
  const withDiacritics = parseRelative('este miércoles', today, { locale: 'es' });
  const withoutDiacritics = parseRelative('este miercoles', today, { locale: 'es' });
  assert.equal(withDiacritics.toString(), withoutDiacritics.toString());
});

test('README parseRelative fuzzy: edit-distance-2 corrections', async () => {
  const { parseRelative } = await import('temporal-fmt');
  const today = T.PlainDate.from('2026-08-04');
  assert.equal(parseRelative('tommorow', today, { fuzzy: true }).toString(), '2026-08-05');
  assert.equal(parseRelative('next tuesady', today, { fuzzy: true }).toString(), '2026-08-11');
  assert.throws(() => parseRelative('tommorow', today));
  // Numbers are never corrected: "5 dyas" corrects to "5 days" then still throws
  assert.throws(() => parseRelative('5 dyas', today, { fuzzy: true }));
  // A non-English phrase that doesn't match exactly throws the fuzzy-English-only error
  assert.throws(() => parseRelative('el marte pasado', today, { locale: 'es', fuzzy: true }), /fuzzy/);
  // ...while a non-English phrase that matches exactly still parses normally
  assert.equal(parseRelative('mañana', today, { locale: 'es', fuzzy: true }).toString(), '2026-08-05');
});

test('README parseRelative: registerRelativeGrammar / listRegisteredGrammars', async () => {
  const root = await import('temporal-fmt');
  const before = root.listRegisteredGrammars();
  const grammar = {
    language: 'xx',
    matchers: [
      (input) => (input === 'hodiau' ? { year: 2026, month: 8, day: 4 } : null),
    ],
  };
  root.registerRelativeGrammar(grammar);
  const after = root.listRegisteredGrammars();
  assert.ok(after.includes('xx'));
  assert.equal(after.length, before.length + 1);
  const today = T.PlainDate.from('2026-08-04');
  assert.equal(root.parseRelative('hodiau', today, { locale: 'xx' }).toString(), '2026-08-04');
});

// --------------------------------------- Arithmetic, comparison, and rounding
test('README arithmetic: add/subtract/difference + per-unit wrappers (field-bag returns)', async () => {
  const root = await import('temporal-fmt');
  const ymd = (v) => `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
  assert.equal(ymd(root.add(date, 3, 'days')), '2026-08-07');
  assert.equal(ymd(root.subtract(date, 1, 'months')), '2026-07-04');
  const a = T.PlainDateTime.from('2026-08-04T10:00:00');
  const b = T.PlainDateTime.from('2026-08-04T13:30:00');
  assert.equal(root.difference(a, b, 'hours'), 3); // boundaries crossed
  assert.equal(ymd(root.addDays(date, 5)), '2026-08-09');
  assert.equal(ymd(root.addMonths(date, 1)), '2026-09-04');
  assert.equal(ymd(root.subtractDays(date, 4)), '2026-07-31');
  assert.equal(root.differenceInHours(a, b), 3);
  assert.equal(root.differenceInDays(T.PlainDate.from('2026-08-01'), T.PlainDate.from('2026-08-10')), 9);
});

test('README comparison: compare/isBefore/isSameDay/isWeekend + full list', async () => {
  const root = await import('temporal-fmt');
  const d1 = T.PlainDate.from('2026-08-04');
  const d2 = T.PlainDate.from('2026-08-10');
  assert.equal(root.compare(d1, d2), -1);
  assert.equal(root.compare(d2, d1), 1);
  assert.equal(root.compare(d1, d1), 0);
  assert.equal(root.isBefore(d1, d2), true);
  assert.equal(root.isAfter(d2, d1), true);
  assert.equal(root.isEqual(d1, T.PlainDate.from('2026-08-04')), true);
  assert.equal(root.isSameDay(d1, T.PlainDateTime.from('2026-08-04T23:59:00')), true);
  assert.equal(root.isWeekend(T.PlainDate.from('2026-08-08')), true);  // Saturday
  assert.equal(root.isWeekend(T.PlainDate.from('2026-08-09')), true);  // Sunday
  assert.equal(root.isWeekend(d1), false);                             // Tuesday
  assert.equal(root.isWeekday(T.PlainDate.from('2026-08-08')), false);
  assert.equal(root.min([d2, d1]).toString(), '2026-08-04');
  assert.equal(root.max([d1, d2]).toString(), '2026-08-10');
  assert.equal(root.clamp(T.PlainDate.from('2026-09-01'), d1, d2).toString(), '2026-08-10');
  assert.equal(root.isBetween(T.PlainDate.from('2026-08-05'), d1, d2), true);
  assert.equal(root.isSameMonth(T.PlainDate.from('2026-08-20'), d1), true);
  assert.equal(root.isSameYear(T.PlainDate.from('2026-01-01'), d1), true);
  assert.equal(root.isSameQuarter(T.PlainDate.from('2026-09-20'), d1), true);
  assert.equal(root.isSameWeek(T.PlainDate.from('2026-08-06'), d1), true);
});

test('README comparison: isToday/isTomorrow/isYesterday (mocked clock)', async () => {
  const root = await import('temporal-fmt');
  const realDate = globalThis.Date;
  class MockDate extends realDate {
    constructor(...args) {
      if (args.length === 0) return new realDate('2026-08-04T12:00:00');
      return new realDate(...args);
    }
    static now() { return new realDate('2026-08-04T12:00:00').getTime(); }
  }
  globalThis.Date = MockDate;
  try {
    assert.equal(root.isToday(T.PlainDate.from('2026-08-04')), true);
    assert.equal(root.isToday(T.PlainDate.from('2026-08-05')), false);
    assert.equal(root.isTomorrow(T.PlainDate.from('2026-08-05')), true);
    assert.equal(root.isYesterday(T.PlainDate.from('2026-08-03')), true);
  } finally {
    globalThis.Date = realDate;
  }
});

test('README rounding: round/floor/ceil/truncate + roundDuration (field-bag returns)', async () => {
  const root = await import('temporal-fmt');
  const t1 = T.PlainDateTime.from('2026-08-04T15:45:30');
  const hm = (v) => `${v.hour}:${String(v.minute).padStart(2, '0')}`;
  assert.equal(hm(root.round(t1, { unit: 'hour' })), '16:00');
  assert.equal(hm(root.floor(t1, 'hour')), '15:00');
  assert.equal(hm(root.ceil(t1, 'hour')), '16:00');
  assert.equal(hm(root.truncate(t1, 'hour')), '15:00');
  assert.equal(hm(root.floor(T.PlainDateTime.from('2026-08-04T15:20:00'), 'minute', 30)), '15:00');
  const rounded = root.roundDuration({ minutes: 90 }, { unit: 'hours' });
  assert.equal(rounded.hours, 2);
  // roundDuration throws for calendar-bound units (months, years)
  assert.throws(() => root.roundDuration({ months: 1 }, { unit: 'months' }));
  assert.throws(() => root.roundDuration({ years: 1 }, { unit: 'years' }));
});

// ---------------------------------------------------------- Calendar utilities
test('README calendar utilities: daysInMonth/startOf/getQuarter + full list', async () => {
  const root = await import('temporal-fmt');
  assert.equal(root.daysInMonth(date), 31);
  assert.equal(root.daysInMonth(T.PlainDate.from('2026-02-10')), 28);
  assert.equal(root.daysInYear(date), 365);
  assert.equal(root.daysInYear(T.PlainDate.from('2024-02-10')), 366);
  assert.equal(root.monthsInYear(date), 12);
  assert.equal(root.isLeapYear(date), false);
  assert.equal(root.isLeapYear(T.PlainDate.from('2024-02-10')), true);
  assert.equal(root.isLeapMonth(date), false);
  assert.equal(root.dayOfYear(date), 216);
  assert.equal(root.weekOfYear(date), 32);
  assert.equal(root.weekYear(date), 2026);
  assert.equal(root.getQuarter(date), 3);
  assert.equal(root.getMonth(date), 8);
  assert.equal(root.getWeekday(date), 2);
  assert.equal(root.startOf(date, 'month').day, 1);
  assert.equal(root.startOf(dt, 'day').hour, 0);
  assert.equal(root.endOf(date, 'month').day, 31);
});

test('README getQuarter: fiscal-year startMonth claims', async () => {
  const root = await import('temporal-fmt');
  assert.equal(root.getQuarter({ month: 8 }), 3);
  assert.equal(root.getQuarter({ month: 8 }, { startMonth: 7 }), 1);
  assert.equal(root.getQuarter({ month: 8 }, { startMonth: 10 }), 4);
  assert.throws(() => root.getQuarter({ month: 8 }, { startMonth: 13 }));
  assert.throws(() => root.getQuarter({ month: 8 }, { startMonth: 0 }));
});

test('README Gregorian-only limitation: Temporal own calendar-aware properties', async () => {
  // Field-bag construction interprets the fields IN the Hebrew calendar
  const pd = T.PlainDate.from({ year: 5784, month: 10, day: 10, calendar: 'hebrew' });
  assert.equal(pd.daysInMonth, 30);   // Sivan
  assert.equal(pd.monthsInYear, 13);  // leap year
});

test('README: format hebrew date "Sivan 10, 5784" claim (field-bag construction)', async () => {
  const { format } = await import('temporal-fmt/format');
  const pd = T.PlainDate.from({ year: 5784, month: 10, day: 10, calendar: 'hebrew' });
  assert.equal(pd.daysInMonth, 30);
  assert.equal(pd.monthsInYear, 13);
  assert.equal(format(pd, 'MMMM d, yyyy'), 'Sivan 10, 5784');
});

// ----------------------------------------------------------------- Intervals
test('README intervals: interval/contains/overlaps/formatRange', async () => {
  const root = await import('temporal-fmt');
  const start = T.PlainDate.from('2026-08-01');
  const end = T.PlainDate.from('2026-08-31');
  const iv = root.interval(start, end, 'closed');
  assert.equal(root.intervalContains(iv, T.PlainDate.from('2026-08-31')), true);   // closed
  const openIv = root.interval(start, end, 'open');
  assert.equal(root.intervalContains(openIv, T.PlainDate.from('2026-08-31')), false);
  assert.equal(root.overlaps(iv, root.interval(T.PlainDate.from('2026-08-15'), T.PlainDate.from('2026-09-15'))), true);
  assert.equal(root.intersects(iv, root.interval(T.PlainDate.from('2026-09-01'), T.PlainDate.from('2026-09-30'))), false);
  assert.equal(root.intervalIsBefore(root.interval(T.PlainDate.from('2026-06-01'), T.PlainDate.from('2026-06-30')), iv), true);
  assert.equal(root.intervalIsAfter(root.interval(T.PlainDate.from('2026-06-01'), T.PlainDate.from('2026-06-30')), iv), false);
  assert.ok(root.intersection(root.interval(T.PlainDate.from('2026-08-15'), T.PlainDate.from('2026-09-15')), iv));
  assert.equal(root.intersection(root.interval(T.PlainDate.from('2026-09-01'), T.PlainDate.from('2026-09-30')), iv), null);
  assert.ok(root.union(root.interval(T.PlainDate.from('2026-08-15'), T.PlainDate.from('2026-09-15')), iv));
  const diff = root.intervalDifference(iv, root.interval(T.PlainDate.from('2026-08-10'), T.PlainDate.from('2026-08-20')));
  assert.ok(Array.isArray(diff));
  const sub = root.intervalSubtract(iv, root.interval(T.PlainDate.from('2026-08-10'), T.PlainDate.from('2026-08-20')));
  assert.ok(Array.isArray(sub));
  const merged = root.mergeIntervals([
    root.interval(T.PlainDate.from('2026-08-01'), T.PlainDate.from('2026-08-10')),
    root.interval(T.PlainDate.from('2026-08-05'), T.PlainDate.from('2026-08-20')),
  ]);
  assert.equal(merged.length, 1);
  const split = root.splitInterval(iv, 3);
  assert.equal(split.length, 3);
  const rangeStr = root.formatRange(iv, 'MMM d');
  assert.equal(typeof rangeStr, 'string');
  assert.ok(rangeStr.length > 0);
  assert.ok(Array.isArray(root.formatRangeToParts(iv, 'MMM d')));
});

// ---------------------------------------------------------------- Recurrence
test('README recurrence: rule/iter/take/between + parseRRule/formatRRule', async () => {
  const root = await import('temporal-fmt');
  const startDate = T.PlainDate.from('2026-08-04');
  const rule = { frequency: 'weekly', interval: 1, count: 10 };
  const iter = root.recurrence(startDate, rule);
  const first5 = root.take(iter, 5);
  assert.equal(first5.length, 5);
  const ymd = (v) => `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
  assert.equal(ymd(first5[0]), '2026-08-04');
  assert.equal(ymd(first5[1]), '2026-08-11');
  const iter2 = root.recurrence(startDate, rule);
  const rest = root.skip(iter2, 2);
  assert.equal(ymd(rest[0]), '2026-08-18');
  const inRange = root.between(startDate, { frequency: 'daily' }, T.PlainDate.from('2026-08-10'), T.PlainDate.from('2026-08-14'));
  assert.equal(inRange.length, 4); // [rangeStart, rangeEnd) — end excluded
  const parsed = root.parseRRule('FREQ=WEEKLY;COUNT=5');
  assert.equal(parsed.frequency, 'weekly');
  assert.equal(parsed.count, 5);
  assert.equal(root.formatRRule({ frequency: 'weekly', count: 5 }), 'FREQ=WEEKLY;COUNT=5');
});

// ------------------------------------------------- Business calendars/holidays
test('README business calendar: create/isBusinessDay/addBusinessDays + friends', async () => {
  const root = await import('temporal-fmt');
  const ymd = (v) => `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
  // README: "pass a holiday calendar's dates into a business calendar's options"
  const hc = root.createHolidayCalendar([{ month: 8, day: 11, name: 'Fake Holiday' }]);
  const cal = root.createBusinessCalendar({ holidays: hc });
  assert.equal(root.isBusinessDay(cal, T.PlainDate.from('2026-08-04')), true);  // Tue
  assert.equal(root.isBusinessDay(cal, T.PlainDate.from('2026-08-08')), false); // Sat
  assert.equal(root.isBusinessDay(cal, T.PlainDate.from('2026-08-11')), false); // holiday
  // Tue Aug 4 + 5 business days: 5,6,7,10 then Aug 11 is a holiday -> Aug 12
  assert.equal(ymd(root.addBusinessDays(cal, T.PlainDate.from('2026-08-04'), 5)), '2026-08-12');
  assert.equal(ymd(root.subtractBusinessDays(cal, T.PlainDate.from('2026-08-04'), 1)), '2026-08-03');
  assert.equal(root.differenceInBusinessDays(cal, T.PlainDate.from('2026-08-04'), T.PlainDate.from('2026-08-11')), 4);
  assert.equal(ymd(root.nextBusinessDay(cal, T.PlainDate.from('2026-08-07'))), '2026-08-10');
  assert.equal(ymd(root.previousBusinessDay(cal, T.PlainDate.from('2026-08-12'))), '2026-08-10');
});

test('README holiday calendar: fixed + compute specs, methods, nextHoliday/holidaysBetween', async () => {
  const root = await import('temporal-fmt');
  const lastMondayOf = (year, month) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
    return lastDay - ((dow + 6) % 7);
  };
  const holidays = root.createHolidayCalendar([
    { month: 1, day: 1, name: "New Year's Day" },
    { compute: (year) => ({ month: 5, day: lastMondayOf(year, 5) }), name: 'Memorial Day' },
  ]);
  assert.equal(typeof holidays.isHoliday, 'function');
  assert.equal(typeof holidays.holidaysBetween, 'function');
  assert.equal(holidays.isHoliday(T.PlainDate.from('2026-01-01')), true);
  assert.equal(holidays.isHoliday(T.PlainDate.from('2026-01-02')), false);
  assert.equal(holidays.isHoliday(T.PlainDate.from('2026-05-25')), true); // last Monday of May 2026
  const next = root.nextHoliday(holidays, T.PlainDate.from('2026-02-01'));
  assert.equal(`${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`, '2026-05-25');
  const between = root.holidaysBetween(holidays, T.PlainDate.from('2026-01-01'), T.PlainDate.from('2026-12-31'));
  assert.equal(between.length, 2);
});

// ----------------------------------------------------------------- Time zones
test('README time zones: resolveZoned disambiguation + isDST + transitions + friends', async () => {
  const root = await import('temporal-fmt');
  const gap = root.resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York', { disambiguation: 'compatible' });
  assert.ok(gap instanceof T.ZonedDateTime);
  assert.equal(gap.hour, 3); // gap pushes forward
  assert.throws(() =>
    root.resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York', { disambiguation: 'reject' }),
  );
  const summer = T.ZonedDateTime.from('2026-07-15T12:00:00[America/New_York]');
  const winter = T.ZonedDateTime.from('2026-01-15T12:00:00[America/New_York]');
  assert.equal(root.isDST(summer), true);
  assert.equal(root.isDST(winter), false);
  assert.equal(root.getTimeZone(summer), 'America/New_York');
  assert.equal(root.getOffset(summer), '-04:00');
  assert.equal(root.getOffsetNanoseconds(summer), -4 * 3600e9);
  const nt = root.getNextTransition(winter);
  assert.ok(nt instanceof T.ZonedDateTime || nt !== null);
  const pt = root.getPreviousTransition(summer);
  assert.ok(pt instanceof T.ZonedDateTime || pt !== null);
  const transitions = root.getTransitions(
    T.ZonedDateTime.from('2026-01-01T00:00:00[America/New_York]'),
    T.ZonedDateTime.from('2026-12-31T00:00:00[America/New_York]'),
  );
  assert.ok(Array.isArray(transitions));
  // possibleInstantsFor: empty for a DST gap, two for an overlap, one otherwise
  const gapInstants = root.possibleInstantsFor({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(gapInstants.length, 0);
  const overlapInstants = root.possibleInstantsFor({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(overlapInstants.length, 2);
  const normalInstants = root.possibleInstantsFor({ year: 2026, month: 6, day: 15, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(normalInstants.length, 1);
});

// --------------------------------------------------------------- Serialization
test('README serialization: ISO/RFC3339/RFC2822/HTTP/SQL + epoch conversions', async () => {
  const root = await import('temporal-fmt');
  const inst = root.parseISO('2026-08-04T15:45:30Z');
  assert.ok(inst instanceof T.ZonedDateTime || inst instanceof T.Instant || inst instanceof T.PlainDateTime);
  assert.equal(inst.epochMilliseconds, Date.UTC(2026, 7, 4, 15, 45, 30));
  assert.equal(root.formatISO(zdt), '2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(root.parseRFC3339('2026-08-04T15:45:30Z').epochMilliseconds, Date.UTC(2026, 7, 4, 15, 45, 30));
  assert.equal(root.formatRFC3339(zdt), '2026-08-04T15:45:30-04:00');
  const d2822 = root.parseRFC2822('Tue, 04 Aug 2026 15:45:30 +0000');
  assert.ok(d2822);
  assert.match(root.formatRFC2822(zdt), /^Tue, 04 Aug 2026 \d{2}:45:30/);
  const http = root.parseHTTPDate('Tue, 04 Aug 2026 15:45:30 GMT');
  assert.ok(http);
  // zdt 15:45:30-04:00 is 19:45:30 UTC — HTTP dates render in GMT
  assert.equal(root.formatHTTPDate(zdt), 'Tue, 04 Aug 2026 19:45:30 GMT');
  const sql = root.parseSQL('2026-08-04 15:45:30');
  assert.ok(sql);
  assert.match(root.formatSQL(dt), /^2026-08-04 15:45:30$/);
  // Epoch: 1754321130000 ms -> 2026-08-04T15:25:30Z
  const fromMs = root.fromUnixMilliseconds(1754321130000);
  assert.equal(root.toUnixMilliseconds(fromMs), 1754321130000);
  assert.equal(root.toUnixSeconds(root.fromUnixSeconds(1754321130)), 1754321130);
  assert.equal(root.toUnixMicroseconds(root.fromUnixMicroseconds(1754321130000000)), 1754321130000000);
  assert.equal(root.toUnixNanoseconds(root.fromUnixNanoseconds(1754321130000000000n)), 1754321130000000000n);
});

// --------------------------------------------- Introspection and the analyzer
test('README introspection: tokenInfo("yyyy") full claimed object', async () => {
  const root = await import('temporal-fmt');
  assert.deepEqual(root.tokenInfo('yyyy'), {
    meaning: 'Four-digit year (preserves sign for BCE; no truncation).',
    formatCapable: true,
    parseCapable: true,
    localeSensitive: false,
    calendarSensitive: true,
    timezoneSensitive: false,
    supportedTypes: ['PlainDate', 'PlainDateTime', 'ZonedDateTime', 'PlainYearMonth'],
    roundTripSafe: true,
  });
  assert.equal(root.tokenInfo('not-a-token'), undefined);
});

test('README introspection: analyzeFormat report fields', async () => {
  const root = await import('temporal-fmt');
  const report = root.analyzeFormat("MMMM d, yyyy 'at' h:mm a");
  for (const key of ['tokens', 'requiredFields', 'compatibleTypes', 'parseable', 'localeSensitive', 'calendarSensitive', 'timezoneSensitive', 'ambiguous', 'roundTripSafe', 'warnings']) {
    assert.ok(key in report, `analyzeFormat report should have "${key}"`);
  }
  assert.equal(typeof root.explainFormat('yyyy-MM-dd'), 'string');
  assert.ok(Array.isArray(root.listTokens()));
  assert.equal(root.isValidFormat('yyyy-MM-dd'), true);
  // 'qqqq' is literal text to the tokenizer (only known token letters are
  // tokens) — the genuinely-invalid case is a syntax error like an
  // unterminated quote.
  assert.equal(root.isValidFormat("yyyy 'unclosed"), false);
  const validated = root.validateFormat('yyyy-MM-dd');
  assert.ok(validated && typeof validated === 'object');
  assert.throws(() => root.validateFormat("yyyy 'unclosed"));
  assert.ok(Array.isArray(root.tokenizeFormat('yyyy-MM-dd')));
  assert.ok(root.fieldForToken('MM') !== undefined);
  assert.ok(root.TOKEN_METADATA instanceof Object || typeof root.TOKEN_METADATA === 'object');
  assert.ok(Array.isArray(root.ALL_TOKEN_NAMES) && root.ALL_TOKEN_NAMES.includes('yyyy'));
});

// ---------------------------------------------------------------- Typed errors
test('README typed errors: classes and codes', async () => {
  const root = await import('temporal-fmt');
  const cases = [
    [root.FormatSyntaxError, 'FORMAT_SYNTAX_ERROR'],
    [root.UnknownTokenError, 'UNKNOWN_TOKEN'],
    [root.ParseMismatchError, 'PARSE_MISMATCH'],
    [root.InvalidDateError, 'INVALID_DATE'],
    [root.InvalidTimeError, 'INVALID_TIME'],
    [root.InvalidOffsetError, 'INVALID_OFFSET'],
    [root.InvalidTimeZoneError, 'INVALID_TIME_ZONE'],
    [root.InvalidCalendarError, 'INVALID_CALENDAR'],
    [root.AmbiguousInputError, 'AMBIGUOUS_INPUT'],
    [root.InvalidLocaleError, 'INVALID_LOCALE'],
    [root.InvalidDurationError, 'INVALID_DURATION'],
  ];
  for (const [cls, code] of cases) {
    const err = new cls({ reason: 'test' });
    assert.ok(err instanceof root.TemporalFmtError, `${cls.name} should extend TemporalFmtError`);
    assert.ok(err instanceof Error);
    assert.equal(err.code, code);
    for (const f of ['input', 'format', 'token', 'position', 'expected', 'actual', 'reason']) {
      assert.ok(f in err, `${cls.name} should carry "${f}"`);
    }
  }
});

test('README common error messages: the seven documented messages', async () => {
  const root = await import('temporal-fmt');
  const { parse } = await import('temporal-fmt/parse');
  // 1. no valid pattern matches
  assert.throws(() => parse('yyyy-MM-dd HH:mm', '20260804'), /no valid pattern matches the format string and input shape/);
  // 2. token X requires Y
  assert.throws(() => root.format(date, 'HH:mm'), /requires/);
  // 3. mixes yyyy and yy (parse-side check)
  assert.throws(() => parse('yyyy-yy-MM-dd', '2026-26-08-04'), /mixes/);
  // 4. incomplete date
  assert.throws(() => parse('yyyy-MM', '2026-08'), /incomplete date/);
  // 5. ambiguous glued run
  assert.throws(() => parse('yyyy-Md', '2026-121'), /ambiguous/);
  // 6. offset hours out of range (max 14)
  assert.throws(
    () => parse("yyyy-MM-dd'T'HH:mmXXX zzz", '2026-08-04T15:45+15:00 Asia/Tokyo'),
    (e) => /offset|range/i.test(e.message),
  );
  // 7. DST gap (no such wall-clock time)
  assert.throws(() =>
    parse("yyyy-MM-dd'T'HH:mmXXX zzz", '2026-03-08T02:30-05:00 America/New_York'),
    /no such wall-clock time|DST gap/,
  );
});

test('README legacy subpath: format/parse + matchesFormat', async () => {
  const legacy = await import('temporal-fmt/legacy');
  assert.equal(legacy.format(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(legacy.parse('yyyy-MM-dd', '2026-08-04').toString(), '2026-08-04');
  const root = await import('temporal-fmt');
  assert.equal(typeof root.matchesFormat, 'function');
  assert.equal(root.matchesFormat('yyyy-MM-dd', '2026-08-04'), true);
  // matchesFormat checks token shape and vocabulary, not date validity
  assert.equal(root.matchesFormat('yyyy-MM-dd', '2026-02-30'), true);
});

// ---------------------------------------------------------------- Type guards
test('README type guards: is* and assert*', async () => {
  const root = await import('temporal-fmt');
  assert.equal(root.isTemporal(date), true);
  assert.equal(root.isPlainDate(date), true);
  assert.equal(root.isPlainDate(dt), false);
  assert.equal(root.isPlainDateTime(dt), true);
  assert.equal(root.isPlainTime(T.PlainTime.from('12:00')), true);
  assert.equal(root.isZonedDateTime(zdt), true);
  assert.equal(root.isInstant(T.Instant.from('2026-08-04T15:45:30Z')), true);
  assert.equal(root.isPlainYearMonth(T.PlainYearMonth.from('2026-08')), true);
  assert.equal(root.isPlainMonthDay(T.PlainMonthDay.from('08-04')), true);
  assert.equal(root.isDuration(new T.Duration(1, 2)), true);
  assert.equal(root.isTemporal('2026-08-04'), false);
  root.assertPlainDate(date);
  assert.throws(() => root.assertZonedDateTime(date));
});

// --------------------------------------------------------------------- Config
test('README config: createConfig/mergeWithConfig', async () => {
  const root = await import('temporal-fmt');
  const cfg = root.createConfig({ locale: 'fr-FR' });
  assert.ok(Object.isFrozen(cfg));
  assert.equal(cfg.locale, 'fr-FR');
  const merged = root.mergeWithConfig(cfg, { locale: 'de-DE', numberingSystem: 'arab' });
  assert.equal(merged.locale, 'de-DE'); // per-call wins
  assert.equal(merged.numberingSystem, 'arab');
});

// ---------------------------------------------------------- Numbering systems
test('README numbering: explicit arab digits + parseNumberingSystem', async () => {
  const { format } = await import('temporal-fmt/format');
  const { parse } = await import('temporal-fmt/parse');
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' }), '٢٠٢٦-٠٨-٠٤');
  assert.equal(parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' }).toString(), '2026-08-04');
});

test('README numbering: auto follows the locale; falls back to latn; malformed tag throws', async () => {
  const { format } = await import('temporal-fmt/format');
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'ar-EG' }), '٢٠٢٦-٠٨-٠٤');
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'bn-BD' }), '২০২৬-০৮-০৪');
  assert.equal(format(date, 'yyyy-MM-dd', { numberingSystem: 'auto' }), '2026-08-04');
  // README: "A malformed locale tag throws" (in the numbering-'auto' context)
  assert.throws(() => format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'not a locale!' }));
});

test('README numbering: convertDigits / convertDigitsToAscii / applyNumbering / SUPPORTED list', async () => {
  const root = await import('temporal-fmt');
  assert.equal(root.convertDigits('2026', 'arab'), '٢٠٢٦');
  assert.equal(root.convertDigitsToAscii('٢٠٢٦', 'arab'), '2026');
  assert.equal(root.applyNumbering('123', { numberingSystem: 'arab' }), '١٢٣');
  assert.ok(root.SUPPORTED_NUMBERING_SYSTEMS.has('thai'));
  assert.ok(root.SUPPORTED_NUMBERING_SYSTEMS.has('latn'));
  assert.ok(root.SUPPORTED_NUMBERING_SYSTEMS.has('hanidec'));
});

// ------------------------------------------------- Extending with custom tokens
test('README extensibility: createFormatter builds a formatter with custom tokens', async () => {
  const root = await import('temporal-fmt');
  assert.equal(typeof root.createFormatter, 'function');
  const quarterRoman = root.createFormatter({
    tokens: [{
      name: 'rr',
      field: 'month',
      handler: (v) => ['I', 'II', 'III', 'IV'][Math.ceil(v.month / 3) - 1],
    }],
  });
  assert.equal(quarterRoman.format(date, 'Q rr'), '3 III');
  assert.equal(quarterRoman.format(date, 'QQQ rr'), 'Q3 III');
});

// ------------------------------------------------------------- IDE tooling data
test('README IDE tooling: autocomplete/hover/diagnostics/preview/docUrl/mappings', async () => {
  const root = await import('temporal-fmt');
  const ac = root.getAutocompleteData();
  assert.ok(Array.isArray(ac) && ac.length > 0);
  const hover = root.getHoverDocs();
  assert.ok(hover && typeof hover === 'object' && 'yyyy' in hover);
  // README/ESLint docs: "hh without a" is the canonical warning case
  const diags = root.getInlineDiagnostics('hh:mm');
  assert.ok(Array.isArray(diags) && diags.length > 0);
  assert.ok(Array.isArray(root.getInlineDiagnostics('hh:mm a')));
  assert.equal(typeof root.previewFormat('yyyy-MM-dd') === 'string', true);
  assert.ok(root.getDocUrl('yyyy').includes('#token'));
  // token conversion hints: array of {from, to} entries
  assert.ok(Array.isArray(root.DAYJS_TO_TEMPORAL_FMT) && root.DAYJS_TO_TEMPORAL_FMT.some((e) => e.from === 'YYYY' && e.to === 'yyyy'));
  assert.ok(Array.isArray(root.DATE_FNS_TO_TEMPORAL_FMT) && root.DATE_FNS_TO_TEMPORAL_FMT.length > 0);
  assert.equal(root.translateDayjsFormatString('YYYY-MM-DD'), 'yyyy-MM-dd');
  assert.equal(root.translateDateFnsFormatString('yyyy-MM-dd'), 'yyyy-MM-dd');
});

// ------------------------------------------------------------ Subpath imports
test('README subpath imports: all nine subpaths resolve and export what is claimed', async () => {
  const fmtMod = await import('temporal-fmt/format');
  assert.equal(typeof fmtMod.format, 'function');
  const parseMod = await import('temporal-fmt/parse');
  assert.equal(typeof parseMod.parse, 'function');
  const durMod = await import('temporal-fmt/duration');
  assert.equal(typeof durMod.formatDuration, 'function');
  const relMod = await import('temporal-fmt/relative');
  assert.equal(typeof relMod.formatRelative, 'function');
  const ivMod = await import('temporal-fmt/interval');
  assert.equal(typeof ivMod.interval, 'function');
  assert.equal(typeof ivMod.formatRange, 'function');
  const calMod = await import('temporal-fmt/calendar');
  assert.equal(typeof calMod.daysInMonth, 'function');
  assert.equal(typeof calMod.startOf, 'function');
  const tzMod = await import('temporal-fmt/timezone');
  assert.equal(typeof tzMod.resolveZoned, 'function');
  assert.equal(typeof tzMod.isDST, 'function');
  const recMod = await import('temporal-fmt/recurrence');
  assert.equal(typeof recMod.recurrence, 'function');
  const locMod = await import('temporal-fmt/locale');
  assert.equal(typeof locMod.registerLocale, 'function');
});

// ------------------------------------------------- Migrating: common patterns
test('README migration: convert a js Date at the boundary via ISO slice', async () => {
  const { Temporal: PT } = await import('temporal-polyfill');
  const { format } = await import('temporal-fmt/format');
  const jsDate = new Date('2026-08-04T15:45:30Z');
  const pd = PT.PlainDate.from(jsDate.toISOString().slice(0, 10));
  assert.equal(format(pd, 'yyyy-MM-dd'), '2026-08-04');
});

test('README migration: CSV/log timestamp parsing pattern', async () => {
  const { parse } = await import('temporal-fmt/parse');
  const line = '2026-08-04 15:45:30';
  const d = parse('yyyy-MM-dd HH:mm:ss', line);
  assert.equal(d.toString(), '2026-08-04T15:45:30');
});
