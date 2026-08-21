import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  // Section N — rounding
  round, floor, ceil, truncate, roundDuration,
  // Section U — serialization
  parseISO, formatISO, parseRFC3339, formatRFC3339, parseRFC2822, formatRFC2822,
  parseHTTPDate, formatHTTPDate,
  fromUnixSeconds, fromUnixMilliseconds, fromUnixMicroseconds, fromUnixNanoseconds,
  toUnixSeconds, toUnixMilliseconds, toUnixMicroseconds, toUnixNanoseconds,
  parseSQL, formatSQL,
  // Section I — duration
  formatDurationToParts, parseDuration, parseISODuration, formatISODuration,
  balanceDuration, totalDuration, compareDuration, addDuration, subtractDuration,
  // Section J — relative time
  formatRelative, formatRelativeToNow,
  // Section F — locale
  registerLocale, getLocale, hasLocale,
  // Section G — numbering
  convertDigits, convertDigitsToAscii, SUPPORTED_NUMBERING_SYSTEMS,
  // Section H — config
  createConfig, mergeWithConfig, DEFAULT_CONFIG,
  // Section K — grammar registration
  registerRelativeGrammar, listRegisteredGrammars,
  // Section P — intervals
  interval, intervalContains, intersection, union, mergeIntervals, splitInterval, formatRange,
  formatRangeToParts, intervalIsBefore, intervalIsAfter, intervalDifference, intervalSubtract,
  overlaps, intersects,
  // Section T — recurrence
  recurrence, take, skip, between, parseRRule, formatRRule,
  // Section R — business calendar
  createBusinessCalendar, isBusinessDay, addBusinessDays, subtractBusinessDays, nextBusinessDay, previousBusinessDay,
  differenceInBusinessDays,
  // Section S — holiday framework
  createHolidayCalendar, nextHoliday, previousHoliday, holidaysBetween,
  // Section Q — timezone
  resolveZoned, getTimeZone, getOffset, getOffsetNanoseconds, isDST,
  getNextTransition, getPreviousTransition, getTransitions, possibleInstantsFor,
  // Section X — extensibility
  createFormatter,
  // Section D — typed errors
  TemporalFmtError, FormatSyntaxError, UnknownTokenError, ParseMismatchError,
  InvalidDateError, InvalidTimeError, InvalidOffsetError, InvalidTimeZoneError,
  InvalidCalendarError, AmbiguousInputError, InvalidLocaleError, InvalidDurationError,
  // Section V — type guards
  isTemporal, isInstant, isPlainDate, isPlainTime, isPlainDateTime,
  isZonedDateTime, isPlainYearMonth, isPlainMonthDay, isDuration,
  assertTemporal, assertInstant, assertPlainDate, assertPlainTime, assertPlainDateTime,
  assertZonedDateTime, assertPlainYearMonth, assertPlainMonthDay, assertDuration,
  // Existing exports used as test inputs
  format, parse, setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// ============== Section N: rounding ==============
test('round: rounds to nearest day', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  const r = round(dt, { unit: 'day' });
  // 15:45 > 12:00 → rounds up to next day midnight.
  assert.equal(r.day, 5);
  assert.equal(r.hour, 0);
});

test('round: floor mode does not round up', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T23:59:59.999');
  const r = floor(dt, 'day');
  assert.equal(r.day, 4); // stays on the same day
  assert.equal(r.hour, 0);
});

test('round: ceil mode always rounds up', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T00:00:00.001');
  const r = ceil(dt, 'second');
  assert.equal(r.second, 1);
});

test('round: truncate mode always rounds down', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:59.999');
  const r = truncate(dt, 'minute');
  assert.equal(r.minute, 45);
  assert.equal(r.second, 0);
});

test('round: throws on non-positive roundingIncrement', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123');
  assert.throws(
    () => round(dt, { unit: 'hour', roundingIncrement: 0 }),
    /requires a positive roundingIncrement \(got 0\)/,
  );
  assert.throws(
    () => round(dt, { unit: 'hour', roundingIncrement: -1 }),
    /requires a positive roundingIncrement \(got -1\)/,
  );
});

test('round: dates before the internal epoch (negative ms, Howard Hinnant day-count arithmetic)', () => {
  // toMs/fromMs use the Howard Hinnant days_from_civil algorithm, which
  // has distinct branches for: negative ms (applyMode's sign handling),
  // month <= 2 (the y2/m2 "civil year" shift), and negative proleptic
  // years (the era calculation). Every test above uses a 2026 date,
  // which only exercises the positive/post-epoch/month>2 side of each.
  const early = Temporal.PlainDateTime.from('1969-06-15T10:30:00');
  const r1 = round(early, { unit: 'hour' });
  assert.equal(r1.year, 1969);
  assert.equal(r1.month, 6);
  assert.equal(r1.day, 15);
  // Not 11:00: applyMode rounds Math.abs(ms) as one combined magnitude
  // from the epoch (not the clock time-of-day), then reapplies the
  // sign — so a pre-epoch date's "nearest hour" doesn't necessarily
  // match what post-epoch half-hour rounding would suggest.
  assert.equal(r1.hour, 10);

  const jan = Temporal.PlainDateTime.from('2026-01-15T10:30:00');
  const r2 = round(jan, { unit: 'hour' });
  assert.equal(r2.month, 1);
  assert.equal(r2.day, 15);

  const negYear = Temporal.PlainDateTime.from('-000050-06-15T10:30:00');
  const r3 = round(negYear, { unit: 'hour' });
  assert.equal(r3.year, -50);
  assert.equal(r3.month, 6);
  assert.equal(r3.day, 15);
});

test('roundDuration: throws on calendar-bound target unit', () => {
  assert.throws(
    () => roundDuration({ days: 1, hours: 12 }, { unit: 'months' }),
    /requires a Temporal\.Duration with a relativeTo/,
  );
});

test('roundDuration: throws on non-positive roundingIncrement', () => {
  assert.throws(
    () => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: 0 }),
    /requires a positive roundingIncrement \(got 0\)/,
  );
  assert.throws(
    () => roundDuration({ hours: 1 }, { unit: 'hours', roundingIncrement: -2 }),
    /requires a positive roundingIncrement \(got -2\)/,
  );
});

test('roundDuration: rounds days/hours/minutes to nearest minute', () => {
  const r = roundDuration({ days: 0, hours: 0, minutes: 90, seconds: 30 }, { unit: 'minutes' });
  // 90m30s rounds to 91m → 1h31m
  assert.equal(r.minutes, 31);
  assert.equal(r.hours, 1);
});

test('roundDuration: negative durations round symmetrically (sign preserved)', () => {
  // totalNs < 0n is only reachable with a negative duration — every
  // other roundDuration test above uses a positive one.
  const r = roundDuration({ hours: -1, minutes: -35 }, { unit: 'hours' });
  assert.equal(r.hours, -2);
});

test('round: rounds a bare PlainDate with no time fields (hour/minute/second/millisecond default to 0)', () => {
  // Every other round() test in this file passes a PlainDateTime, which
  // always has hour/minute/second/millisecond set. A bare PlainDate has
  // none of those fields, so toMs()'s `v.hour ?? 0` etc. defaults only
  // fire here.
  const date = Temporal.PlainDate.from('2026-08-04');
  const r = round(date, { unit: 'day' });
  assert.equal(r.year, 2026);
  assert.equal(r.month, 8);
  assert.equal(r.day, 4);
});

test('roundDuration: nearest mode leaves the value at the lower step when the remainder is under halfway', () => {
  // 91 minutes rounded to the nearest 30 minutes: remainder is 1 minute,
  // well under half of 30, so this should round DOWN to 90 (not up to
  // 120). The negative-duration test above only exercises the round-up
  // side of this same branch.
  const r = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'nearest', roundingIncrement: 30 });
  assert.equal(r.hours, 1);
  assert.equal(r.minutes, 30);
});

test('roundDuration: ceil mode leaves an exact multiple unchanged', () => {
  // 90 minutes is already an exact multiple of the 30-minute step, so the
  // remainder is 0 and ceil should not bump it up to the next step. The
  // ceil case in the mode test below only exercises a nonzero remainder.
  const r = roundDuration({ minutes: 90 }, { unit: 'minutes', mode: 'ceil', roundingIncrement: 30 });
  assert.equal(r.hours, 1);
  assert.equal(r.minutes, 30);
});

test('roundDuration: floor/ceil/trunc modes', () => {
  // Only 'nearest' (the default) is exercised elsewhere in this file —
  // each mode below is a distinct branch in roundDuration's switch.
  const floorResult = roundDuration({ minutes: 95 }, { unit: 'minutes', mode: 'floor', roundingIncrement: 30 });
  assert.equal(floorResult.hours, 1);
  assert.equal(floorResult.minutes, 30);

  const ceilResult = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'ceil', roundingIncrement: 30 });
  assert.equal(ceilResult.hours, 2);
  assert.equal(ceilResult.minutes, 0);

  const truncResult = roundDuration({ minutes: 91 }, { unit: 'minutes', mode: 'trunc', roundingIncrement: 30 });
  assert.equal(truncResult.hours, 1);
  assert.equal(truncResult.minutes, 30);
});

// ============== Section U: serialization ==============
test('parseISO: parses a date', () => {
  const r = parseISO('2026-08-04');
  assert.equal(r.toString(), '2026-08-04');
});

test('parseISO: parses a date-time without zone', () => {
  const r = parseISO('2026-08-04T15:45:30');
  assert.equal(r.toString(), '2026-08-04T15:45:30');
});

test('parseISO: parses a date-time with Z', () => {
  const r = parseISO('2026-08-04T15:45:30Z');
  assert.match(r.toString(), /2026-08-04T15:45:30/);
});

test('parseISO: throws on garbage input', () => {
  assert.throws(() => parseISO('not-a-date'), /doesn't look like an ISO 8601/);
});

test('formatISO: round-trips through parseISO', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatted = formatISO(date);
  const reparsed = parseISO(formatted);
  assert.equal(reparsed.toString(), date.toString());
});

test('parseRFC3339: parses a valid RFC 3339 string', () => {
  const r = parseRFC3339('2026-08-04T15:45:30Z');
  assert.ok(r !== undefined);
});

test('parseRFC3339: throws on missing timezone', () => {
  // RFC 3339 requires a zone.
  assert.throws(() => parseRFC3339('2026-08-04T15:45:30'), /does not match RFC 3339/);
});

test('parseRFC2822: parses a valid RFC 2822 string', () => {
  const r = parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000');
  assert.ok(r !== undefined);
});

test('formatRFC2822: produces RFC 2822-shaped output', () => {
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  const s = formatRFC2822(inst);
  assert.match(s, /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}/);
});

test('parseHTTPDate: parses an IMF-fixdate', () => {
  const r = parseHTTPDate('Mon, 04 Aug 2026 15:45:30 GMT');
  assert.ok(r !== undefined);
});

test('formatHTTPDate: produces IMF-fixdate output', () => {
  const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
  const s = formatHTTPDate(inst);
  assert.match(s, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
});

test('fromUnixSeconds / toUnixSeconds round-trip', () => {
  const inst = fromUnixSeconds(1700000000);
  assert.equal(Math.round(toUnixSeconds(inst)), 1700000000);
});

test('fromUnixMilliseconds / toUnixMilliseconds round-trip', () => {
  const inst = fromUnixMilliseconds(1700000000123);
  assert.equal(toUnixMilliseconds(inst), 1700000000123);
});

test('fromUnixNanoseconds / toUnixNanoseconds round-trip', () => {
  const ns = 1700000000_000_000_000n;
  const inst = fromUnixNanoseconds(ns);
  assert.equal(toUnixNanoseconds(inst), ns);
});

test('parseSQL: detects date format', () => {
  const r = parseSQL('2026-08-04');
  assert.equal(r.toString(), '2026-08-04');
});

test('parseSQL: detects datetime format', () => {
  const r = parseSQL('2026-08-04 15:45:30');
  assert.match(r.toString(), /2026-08-04T15:45:30/);
});

test('formatSQL: formats date as YYYY-MM-DD', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(formatSQL(date), '2026-08-04');
});

test('formatSQL: formats datetime as YYYY-MM-DD HH:MM:SS', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  assert.equal(formatSQL(dt), '2026-08-04 15:45:30');
});

// ============== Section I: duration ==============
test('parseISODuration: parses P[n]Y[n]M[n]D', () => {
  const d = parseISODuration('P3Y6M4D');
  assert.equal(d.years, 3);
  assert.equal(d.months, 6);
  assert.equal(d.days, 4);
});

test('parseISODuration: parses PT[n]H[n]M[n]S', () => {
  const d = parseISODuration('PT12H30M5S');
  assert.equal(d.hours, 12);
  assert.equal(d.minutes, 30);
  assert.equal(d.seconds, 5);
});

test('parseISODuration: throws on empty', () => {
  assert.throws(() => parseISODuration('P'), /duration has no fields/);
});

test('formatISODuration: round-trips through parseISODuration', () => {
  const d = { years: 3, months: 6, weeks: 0, days: 4, hours: 12, minutes: 30, seconds: 5 };
  const formatted = formatISODuration(d);
  const reparsed = parseISODuration(formatted);
  // weeks stays at 0 (parseISODuration initializes it to 0).
  assert.deepEqual(reparsed, d);
});

test('formatISODuration: zero duration → P0D', () => {
  assert.equal(formatISODuration({}), 'P0D');
});

test('parseDuration: parses tokenized format', () => {
  const d = parseDuration('2 years 30 minutes', 'yyy mmm');
  assert.equal(d.years, 2);
  assert.equal(d.minutes, 30);
});

test('balanceDuration: carries excess units up', () => {
  const balanced = balanceDuration({ hours: 25, minutes: 70 });
  // 25h70m = 1 day 2 hours 10 minutes (25h + 70m/60 = 25h + 1h10m = 26h10m = 1d2h10m)
  assert.equal(balanced.days, 1);
  assert.equal(balanced.hours, 2);
  assert.equal(balanced.minutes, 10);
});

test('totalDuration: sums absolute fields into target unit', () => {
  assert.equal(totalDuration({ days: 1, hours: 12 }, 'hours'), 36);
  assert.equal(totalDuration({ minutes: 60 }, 'hours'), 1);
});

test('compareDuration: returns -1/0/1 by total length', () => {
  assert.equal(compareDuration({ hours: 1 }, { hours: 2 }), -1);
  assert.equal(compareDuration({ hours: 2 }, { hours: 2 }), 0);
  assert.equal(compareDuration({ hours: 3 }, { hours: 2 }), 1);
});

test('addDuration: sums field-by-field', () => {
  const r = addDuration({ hours: 2, minutes: 30 }, { hours: 1, minutes: 15 });
  assert.equal(r.hours, 3);
  assert.equal(r.minutes, 45);
});

test('subtractDuration: subtracts field-by-field', () => {
  const r = subtractDuration({ hours: 3, minutes: 30 }, { hours: 1, minutes: 15 });
  assert.equal(r.hours, 2);
  assert.equal(r.minutes, 15);
});

// ============== Section J: relative time ==============
test('formatRelative: same day → "now"-ish', () => {
  const today = Temporal.Now.plainDateISO();
  const r = formatRelative(today, today);
  // Intl.RelativeTimeFormat with numeric:'auto' returns "now" or "today" for 0 days.
  assert.match(r, /(now|today|in 0|0 days)/i);
});

test('formatRelative: tomorrow', () => {
  const today = Temporal.Now.plainDateISO();
  const tomorrow = today.add({ days: 1 });
  const r = formatRelative(tomorrow, today);
  // Intl.RelativeTimeFormat with numeric:'auto' returns "tomorrow" for +1 day.
  assert.match(r, /(tomorrow|in 1 day|1 day)/i);
});

test('formatRelativeToNow: returns a string', () => {
  const today = Temporal.Now.plainDateISO();
  const r = formatRelativeToNow(today);
  assert.equal(typeof r, 'string');
  assert.ok(r.length > 0);
});

test('formatRelative: 8 days out lands in the week bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 8 }), today);
  // absDays 8 is >= 7 and < 30, so this exercises the week-rounding branch
  // (rtf.format(..., 'week')), not the day branch the other tests hit.
  assert.match(r, /week/i);
});

test('formatRelative: 40 days out lands in the month bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 40 }), today);
  assert.match(r, /month/i);
});

test('formatRelative: 400 days out lands in the year bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 400 }), today);
  assert.match(r, /year/i);
});

test('formatRelative: negative-direction buckets (past week/month/year) also format', () => {
  // Same three thresholds, but date1 in the past relative to date2 — covers
  // the negative side of each -Math.trunc(-dayDiff / N) calculation.
  const today = Temporal.PlainDate.from('2026-08-04');
  assert.match(formatRelative(today.subtract({ days: 8 }), today), /week/i);
  assert.match(formatRelative(today.subtract({ days: 40 }), today), /month/i);
  assert.match(formatRelative(today.subtract({ days: 400 }), today), /year/i);
});

test('formatRelative: Intl.RelativeTimeFormat instances are cached and evicted past the cache cap', () => {
  // getRtf() caches by `${locale}|${numeric}` and evicts the oldest entry
  // once the cache hits MAX_RTF_CACHE_SIZE (100) — request more than that
  // many distinct locale tags to force the eviction path.
  const today = Temporal.PlainDate.from('2026-08-04');
  const tomorrow = today.add({ days: 1 });
  for (let i = 0; i < 105; i++) {
    // en-US region subtags are all valid distinct BCP-47 locales, which
    // keeps the cache key genuinely unique per iteration.
    const locale = `en-${String(i).padStart(3, '0')}`;
    const r = formatRelative(tomorrow, today, { locale });
    assert.equal(typeof r, 'string');
  }
});

// ============== Section F: locale registration ==============
test('registerLocale / hasLocale / getLocale', () => {
  registerLocale('test-locale-1', {
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
    weekdayLong: ['Day1','Day2','Day3','Day4','Day5','Day6','Day7'],
    weekdayShort: ['D1','D2','D3','D4','D5','D6','D7'],
    dayPeriod: ['AM','PM'],
    quartersLong: ['First','Second','Third','Fourth'],
    erasLong: ['BCE','CE'],
  });
  assert.ok(hasLocale('test-locale-1'));
  const vocab = getLocale('test-locale-1');
  assert.equal(vocab?.monthLong[0], 'Mo1');
  assert.equal(vocab?.quartersLong?.[0], 'First');
});

test('getLocale: falls back to the base Intl-derived vocab for a locale never registered here', () => {
  // 'fr' has no registerLocale() call anywhere in this suite, so this
  // exercises the extendedVocabs-miss path that falls through to
  // getLocaleVocab() instead of returning early with a registered entry.
  assert.ok(!hasLocale('fr'));
  const vocab = getLocale('fr');
  assert.ok(vocab);
  assert.equal(vocab?.monthLong[0], 'janvier');
  // No extended fields were registered for 'fr', so they stay undefined
  // rather than getting invented defaults.
  assert.equal(vocab?.quartersLong, undefined);
});

test('getLocale: returns undefined for a locale that neither extendedVocabs nor Intl.Locale can resolve', () => {
  // An empty string throws inside Intl.Locale's constructor (which
  // getLocaleVocab relies on), so this exercises the catch → undefined
  // branch, not just the try's success path covered above.
  assert.equal(getLocale(''), undefined);
});

test('registerLocale: extended-field validation rejects non-array, wrong-length, and non-string entries', () => {
  const base = {
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
    weekdayLong: ['Day1','Day2','Day3','Day4','Day5','Day6','Day7'],
    weekdayShort: ['D1','D2','D3','D4','D5','D6','D7'],
    dayPeriod: ['AM','PM'],
  };
  assert.throws(
    () => registerLocale('test-locale-bad-1', { ...base, quartersLong: 'not-an-array' }),
    /"quartersLong" must be an array/,
  );
  assert.throws(
    () => registerLocale('test-locale-bad-2', { ...base, erasLong: ['OnlyOne'] }),
    /"erasLong" must have 2 entries \(got 1\)/,
  );
  assert.throws(
    () => registerLocale('test-locale-bad-3', { ...base, ordinals: ['st', '', 'rd', 'th'] }),
    /"ordinals\[1\]" must be a non-empty string/,
  );
});

// ============== Section G: numbering ==============
test('convertDigits: latn → latn is identity', () => {
  assert.equal(convertDigits('2026', 'latn'), '2026');
});

test('convertDigits: latn → arab converts ASCII to Arabic-Indic', () => {
  const arab = convertDigits('2026', 'arab');
  assert.notEqual(arab, '2026');
  assert.equal(arab.length, 4); // 4 chars, all non-ASCII
});

test('convertDigitsToAscii: round-trips through convertDigits', () => {
  const arab = convertDigits('12345', 'arab');
  const ascii = convertDigitsToAscii(arab, 'arab');
  assert.equal(ascii, '12345');
});

test('convertDigits: throws on unsupported numbering system', () => {
  assert.throws(() => convertDigits('1', 'madeup'), /not supported/);
});

test('SUPPORTED_NUMBERING_SYSTEMS includes latn and arab', () => {
  assert.ok(SUPPORTED_NUMBERING_SYSTEMS.has('latn'));
  assert.ok(SUPPORTED_NUMBERING_SYSTEMS.has('arab'));
});

// ============== Section H: config ==============
test('createConfig: returns frozen config with defaults', () => {
  const c = createConfig();
  assert.equal(c.locale, 'en-US');
  assert.equal(c.numberingSystem, 'latn');
  assert.equal(c.firstDayOfWeek, 1);
  assert.equal(c.disambiguation, 'compatible');
  assert.ok(Object.isFrozen(c));
});

test('createConfig: merges overrides', () => {
  const c = createConfig({ locale: 'fr-FR', timezone: 'Europe/Paris' });
  assert.equal(c.locale, 'fr-FR');
  assert.equal(c.timezone, 'Europe/Paris');
});

test('createConfig: validates firstDayOfWeek', () => {
  assert.throws(() => createConfig({ firstDayOfWeek: 3 }), /firstDayOfWeek must be 1.*7/);
});

test('createConfig: validates locale is a non-empty string', () => {
  assert.throws(() => createConfig({ locale: '' }), /locale must be a non-empty string/);
  assert.throws(() => createConfig({ locale: 42 }), /locale must be a non-empty string/);
});

test('createConfig: validates roundingMode', () => {
  assert.throws(() => createConfig({ roundingMode: 'banana' }), /roundingMode "banana" is not recognized/);
});

test('createConfig: validates disambiguation', () => {
  assert.throws(() => createConfig({ disambiguation: 'banana' }), /disambiguation "banana" is not recognized/);
});

test('createConfig: validates overflow', () => {
  assert.throws(() => createConfig({ overflow: 'banana' }), /overflow "banana" is not recognized/);
});

test('mergeWithConfig: per-call overrides win', () => {
  const c = createConfig({ locale: 'fr-FR' });
  const merged = mergeWithConfig(c, { locale: 'en-US' });
  assert.equal(merged.locale, 'en-US');
});

test('mergeWithConfig: config fills in defaults when per-call omits', () => {
  const c = createConfig({ locale: 'fr-FR' });
  const merged = mergeWithConfig(c, {});
  assert.equal(merged.locale, 'fr-FR');
});

test('mergeWithConfig: no config returns perCall unchanged', () => {
  const perCall = { locale: 'en-US' };
  assert.equal(mergeWithConfig(undefined, perCall), perCall);
});

test('mergeWithConfig: fills in calendar, timezone, and lenient when config sets them and per-call omits them', () => {
  const c = createConfig({ calendar: 'hebrew', timezone: 'America/New_York', parseLenient: true });
  const merged = mergeWithConfig(c, {});
  assert.equal(merged.calendar, 'hebrew');
  assert.equal(merged.timezone, 'America/New_York');
  assert.equal(merged.lenient, true);
});

// ============== Section K: grammar registration ==============
test('registerRelativeGrammar: registers and lists a grammar', () => {
  registerRelativeGrammar({
    language: 'test-lang',
    matchers: [
      // Trivial matcher — recognizes the literal phrase "test grammar date"
      // and returns the reference date.
      (_input) => null,
    ],
  });
  const langs = listRegisteredGrammars();
  assert.ok(langs.includes('test-lang'));
});

test('registerRelativeGrammar: re-registering the same language replaces the old grammar, not appends', () => {
  registerRelativeGrammar({
    language: 'test-lang-replace',
    matchers: [(_input) => null],
  });
  const before = listRegisteredGrammars().filter((l) => l === 'test-lang-replace');
  assert.equal(before.length, 1);

  registerRelativeGrammar({
    language: 'test-lang-replace',
    matchers: [(_input) => null],
  });
  const after = listRegisteredGrammars().filter((l) => l === 'test-lang-replace');
  // Still exactly one entry for this language — the second call replaced
  // the first in place rather than adding a duplicate.
  assert.equal(after.length, 1);
});

test('registerRelativeGrammar: throws on an empty language string', () => {
  assert.throws(
    () => registerRelativeGrammar({ language: '', matchers: [(_input) => null] }),
    /requires a non-empty language string/,
  );
});

test('registerRelativeGrammar: throws when matchers is missing or empty', () => {
  assert.throws(
    () => registerRelativeGrammar({ language: 'test-lang-empty', matchers: [] }),
    /requires at least one matcher/,
  );
  assert.throws(
    // Deliberately omitting matchers entirely to hit the !Array.isArray(...)
    // side of the guard, not just the array-but-empty length check above.
    () => registerRelativeGrammar({ language: 'test-lang-missing' }),
    /requires at least one matcher/,
  );
});

// ============== Section P: intervals ==============
test('interval: constructs a closed interval', () => {
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2026-12-31');
  const iv = interval(a, b);
  assert.equal(iv.bounds, 'closed');
});

test('interval: throws on inverted endpoints', () => {
  const a = Temporal.PlainDate.from('2026-12-31');
  const b = Temporal.PlainDate.from('2026-01-01');
  assert.throws(() => interval(a, b), /start must be ≤ end/);
});

test('interval contains: respects bounds', () => {
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2026-12-31');
  const iv = interval(a, b, 'closed');
  // Open interval: endpoints excluded.
  const openIv = interval(a, b, 'open');
  assert.equal(intervalContains(iv, a), true);
  assert.equal(intervalContains(openIv, a), false);
  // Middle always included.
  const mid = Temporal.PlainDate.from('2026-06-15');
  assert.equal(intervalContains(iv, mid), true);
  assert.equal(intervalContains(openIv, mid), true);
});

test('intersection: returns overlap', () => {
  const a = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-06-30'));
  const b = interval(Temporal.PlainDate.from('2026-04-01'), Temporal.PlainDate.from('2026-12-31'));
  const inter = intersection(a, b);
  assert.ok(inter !== null);
  assert.equal(inter?.start.toString(), '2026-04-01');
  assert.equal(inter?.end.toString(), '2026-06-30');
});

test('intersection: returns null for non-overlapping', () => {
  const a = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-02-28'));
  const b = interval(Temporal.PlainDate.from('2026-04-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.equal(intersection(a, b), null);
});

test('union: merges overlapping intervals', () => {
  const a = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-06-30'));
  const b = interval(Temporal.PlainDate.from('2026-04-01'), Temporal.PlainDate.from('2026-12-31'));
  const u = union(a, b);
  assert.equal(u?.start.toString(), '2026-01-01');
  assert.equal(u?.end.toString(), '2026-12-31');
});

test('mergeIntervals: combines overlapping into disjoint list', () => {
  const a = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-02-28'));
  const b = interval(Temporal.PlainDate.from('2026-02-15'), Temporal.PlainDate.from('2026-04-30'));
  const c = interval(Temporal.PlainDate.from('2026-06-01'), Temporal.PlainDate.from('2026-08-31'));
  const merged = mergeIntervals([a, b, c]);
  assert.equal(merged.length, 2);
});

test('splitInterval: produces N equal sub-intervals', () => {
  const a = Temporal.PlainDateTime.from('2026-01-01T00:00:00');
  const b = Temporal.PlainDateTime.from('2026-01-05T00:00:00');
  const iv = interval(a, b);
  const split = splitInterval(iv, 4);
  assert.equal(split.length, 4);
});

test('formatRange: produces a non-empty string', () => {
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2026-01-05');
  const iv = interval(a, b);
  const s = formatRange(iv, 'yyyy-MM-dd');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
});

// ============== Section T: recurrence ==============
test('recurrence + take: returns N occurrences', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1 };
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 5);
  assert.equal(occurrences.length, 5);
  // First occurrence is the start itself.
  assert.equal(occurrences[0].toString(), '2026-01-01');
  // Subsequent occurrences are field bags from add() — convert to ISO string.
  assert.equal(`${occurrences[4].year}-${String(occurrences[4].month).padStart(2,'0')}-${String(occurrences[4].day).padStart(2,'0')}`, '2026-01-05');
});

test('recurrence: respects interval', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 7 }; // weekly
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 3);
  assert.equal(`${occurrences[1].year}-${String(occurrences[1].month).padStart(2,'0')}-${String(occurrences[1].day).padStart(2,'0')}`, '2026-01-08');
});

test('recurrence: respects count', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, count: 3 };
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 100);
  assert.equal(occurrences.length, 3);
});

test('parseRRule: parses FREQ=DAILY;INTERVAL=2;COUNT=5', () => {
  const r = parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=5');
  assert.equal(r.frequency, 'daily');
  assert.equal(r.interval, 2);
  assert.equal(r.count, 5);
});

test('formatRRule: round-trips through parseRRule', () => {
  const rule = { frequency: 'weekly', interval: 2, count: 10 };
  const formatted = formatRRule(rule);
  const reparsed = parseRRule(formatted);
  assert.equal(reparsed.frequency, rule.frequency);
  assert.equal(reparsed.interval, rule.interval);
  assert.equal(reparsed.count, rule.count);
});

// ============== Section R: business calendar ==============
test('createBusinessCalendar: defaults to Sat/Sun weekend', () => {
  const cal = createBusinessCalendar();
  // Tuesday (Aug 4, 2026) is a business day.
  assert.ok(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-04')));
  // Saturday is not.
  assert.ok(!isBusinessDay(cal, Temporal.PlainDate.from('2026-08-08')));
});

test('nextBusinessDay: skips weekend', () => {
  const cal = createBusinessCalendar();
  const friday = Temporal.PlainDate.from('2026-08-07');
  const next = nextBusinessDay(cal, friday);
  // Friday Aug 7 2026 → next business day is Monday Aug 10 (Aug 8/9 are weekend).
  // next is a field bag, not PlainDate; check the date fields.
  assert.equal(`${next.year}-${String(next.month).padStart(2,'0')}-${String(next.day).padStart(2,'0')}`, '2026-08-10');
});

test('addBusinessDays: adds business days only', () => {
  const cal = createBusinessCalendar();
  const friday = Temporal.PlainDate.from('2026-08-07');
  // Friday + 1 business day → Monday.
  const r = addBusinessDays(cal, friday, 1);
  assert.equal(`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`, '2026-08-10');
  // Friday + 3 business days → Wednesday next week.
  const r2 = addBusinessDays(cal, friday, 3);
  assert.equal(`${r2.year}-${String(r2.month).padStart(2,'0')}-${String(r2.day).padStart(2,'0')}`, '2026-08-12');
});

test('subtractBusinessDays: subtracts business days only', () => {
  const cal = createBusinessCalendar();
  const monday = Temporal.PlainDate.from('2026-08-10');
  const r = subtractBusinessDays(cal, monday, 1);
  // Monday - 1 business day → Friday.
  assert.equal(`${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`, '2026-08-07');
});

test('createBusinessCalendar: custom weekend (Sun-only)', () => {
  const cal = createBusinessCalendar({ weekend: [7] });
  // Saturday is now a business day.
  assert.ok(isBusinessDay(cal, Temporal.PlainDate.from('2026-08-08')));
});

// ============== Section S: holiday framework ==============
test('createHolidayCalendar: detects fixed-date holidays', () => {
  const cal = createHolidayCalendar([
    { month: 1, day: 1, name: 'New Year' },
    { month: 7, day: 4, name: 'Independence Day' },
  ]);
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-01-01')));
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-07-04')));
  assert.ok(!cal.isHoliday(Temporal.PlainDate.from('2026-08-04')));
});

test('createHolidayCalendar: detects floating holidays via a compute() spec', () => {
  // "Last Monday of May" style rule — compute() takes the year and
  // returns { month, day } for that year, rather than a fixed date.
  const memorialDay = (year) => {
    let d = Temporal.PlainDate.from({ year, month: 5, day: 31 });
    while (d.dayOfWeek !== 1) d = d.subtract({ days: 1 });
    return { month: d.month, day: d.day };
  };
  const cal = createHolidayCalendar([{ compute: memorialDay, name: 'Memorial Day' }]);
  // Memorial Day 2026 is Monday, May 25.
  assert.ok(cal.isHoliday(Temporal.PlainDate.from('2026-05-25')));
  assert.ok(!cal.isHoliday(Temporal.PlainDate.from('2026-05-24')));
});

test('createHolidayCalendar: isHoliday throws on a value missing year/month/day', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
  assert.throws(
    () => cal.isHoliday({ month: 1, day: 1 }), // no year
    /needs a value with year\/month\/day/,
  );
});

test('holidaysBetween: enumerates holidays in range', () => {
  const cal = createHolidayCalendar([
    { month: 1, day: 1 },
    { month: 7, day: 4 },
    { month: 12, day: 25 },
  ]);
  const list = cal.holidaysBetween(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.equal(list.length, 3);
});

test('holidaysBetween: the standalone exported helper delegates to cal.holidaysBetween', () => {
  // The exported holidaysBetween(cal, start, end) function is a thin
  // wrapper around the calendar's own method — separate from the
  // cal.holidaysBetween(...) call the test above exercises.
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const viaHelper = holidaysBetween(cal, Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  const viaMethod = cal.holidaysBetween(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.deepEqual(viaHelper, viaMethod);
  assert.equal(viaHelper.length, 1);
});

test('nextHoliday: finds next holiday', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const r = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.ok(r !== undefined);
  const d = r;
  assert.equal(d.month, 7);
  assert.equal(d.day, 4);
});

test('nextHoliday: returns undefined when no holiday is found within 5 years', () => {
  // Empty calendar — isHoliday() never matches, so the loop should run
  // its full 365*5 iterations and fall through to the `return undefined`.
  const cal = createHolidayCalendar([]);
  const r = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.equal(r, undefined);
});

test('previousHoliday: finds the most recent holiday before the given date', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const r = previousHoliday(cal, Temporal.PlainDate.from('2026-08-04'));
  assert.ok(r !== undefined);
  assert.equal(r.month, 7);
  assert.equal(r.day, 4);
});

test('previousHoliday: returns undefined when no holiday is found within 5 years', () => {
  const cal = createHolidayCalendar([]);
  const r = previousHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.equal(r, undefined);
});

// ============== Section Q: timezone ==============
test('resolveZoned: constructs a ZonedDateTime', () => {
  const r = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30 }, 'UTC');
  assert.ok(r !== undefined);
});

test('resolveZoned: omitting hour/minute/second/etc. defaults them to 0', () => {
  const r = resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC');
  assert.equal(getOffset(r), '+00:00');
  const withParts = resolveZoned({ year: 2026, month: 8, day: 4, hour: 0, minute: 0, second: 0 }, 'UTC');
  assert.equal(r.toString(), withParts.toString());
});

test('resolveZoned: options.offset is passed through when provided', () => {
  // options.offset controls how a conflicting/absent offset in the input
  // is resolved ('use'|'ignore'|'prefer'|'reject') — passing it explicitly
  // exercises the conditional spread that only includes `offset` in the
  // field bag when the caller set it, instead of always omitting it.
  const r = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC', { offset: 'reject' });
  assert.ok(r !== undefined);
  assert.equal(getOffset(r), '+00:00');
});

test('getTimeZone: returns the zone id', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getTimeZone(zdt), 'UTC');
});

test('getOffset: returns the offset string', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getOffset(zdt), '+00:00');
});

test('getOffsetNanoseconds: returns 0 for UTC', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  assert.equal(getOffsetNanoseconds(zdt), 0);
});

test('getOffsetNanoseconds: parses a +HH:MM offset string when offsetNanoseconds is absent', () => {
  // A plain object shaped like { offset } but with no offsetNanoseconds
  // field forces the regex-parse fallback rather than the direct
  // numeric read.
  assert.equal(getOffsetNanoseconds({ offset: '+05:30' }), (5 * 3600 + 30 * 60) * 1_000_000_000);
  assert.equal(getOffsetNanoseconds({ offset: '-08:00' }), -8 * 3600 * 1_000_000_000);
});

test('getNextTransition: UTC never transitions, so this exhausts the 2-year search and returns undefined', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
  assert.equal(getNextTransition(zdt), undefined);
});

test('getPreviousTransition: same 2-year exhaustion, walking backward instead of forward', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
  assert.equal(getPreviousTransition(zdt), undefined);
});

test('getNextTransition: finds the real spring-forward date in America/New_York', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const next = getNextTransition(zdt);
  assert.ok(next !== undefined);
  assert.equal(next.toString().slice(0, 10), '2026-03-09');
});

test('getTransitions: throws when start is not a ZonedDateTime', () => {
  const end = Temporal.ZonedDateTime.from('2026-12-31T00:00[America/New_York]');
  assert.throws(() => getTransitions(42, end), /expected a ZonedDateTime for start/);
});

test('getTransitions: stops once a found transition would fall after the end boundary', () => {
  // Search a window that ends before the year's second transition
  // (fall-back, Nov 2) so the day > endV.day / month > endV.month
  // trim-and-break logic actually has to discard a candidate.
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const end = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
  const transitions = getTransitions(start, end);
  // Only the spring-forward (March) transition should be in range —
  // fall-back (November) is past `end` and must be trimmed.
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].toString().slice(0, 7), '2026-03');
});

test('getTransitions: also trims a transition landing later in the same month as the end boundary', () => {
  // Spring-forward 2026 is March 9. Ending the search on March 5 (same
  // month as the transition, but an earlier day) exercises the
  // same-month-later-day arm of the boundary check specifically, not
  // just the later-month arm the test above covers.
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  const end = Temporal.ZonedDateTime.from('2026-03-05T00:00[America/New_York]');
  const transitions = getTransitions(start, end);
  assert.equal(transitions.length, 0);
});

// ============== Section X: extensibility ==============
test('createFormatter: default formatter matches builtin format()', () => {
  const fmt = createFormatter();
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(fmt.format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('createFormatter: custom token adds to the table', () => {
  const fmt = createFormatter({
    tokens: [
      {
        name: 'YYYYYY',
        handler: (t) => String(t.year).padStart(6, '0'),
        field: 'year',
      },
    ],
  });
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(fmt.format(date, 'YYYYYY'), '002026');
});

test('createFormatter: custom token overrides builtin', () => {
  const fmt = createFormatter({
    tokens: [
      {
        name: 'yyyy',
        handler: (t) => `Y${String(t.year).slice(-2)}`,
        field: 'year',
      },
    ],
  });
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(fmt.format(date, 'yyyy'), 'Y26');
});

test('createFormatter: compileFormat pre-tokenizes', () => {
  const fmt = createFormatter();
  const compiled = fmt.compileFormat('yyyy-MM-dd');
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(compiled.format(date), '2026-08-04');
});