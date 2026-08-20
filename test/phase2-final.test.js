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

test('roundDuration: throws on calendar-bound target unit', () => {
  assert.throws(
    () => roundDuration({ days: 1, hours: 12 }, { unit: 'months' }),
    /requires a Temporal\.Duration with a relativeTo/,
  );
});

test('roundDuration: rounds days/hours/minutes to nearest minute', () => {
  const r = roundDuration({ days: 0, hours: 0, minutes: 90, seconds: 30 }, { unit: 'minutes' });
  // 90m30s rounds to 91m → 1h31m
  assert.equal(r.minutes, 31);
  assert.equal(r.hours, 1);
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

test('holidaysBetween: enumerates holidays in range', () => {
  const cal = createHolidayCalendar([
    { month: 1, day: 1 },
    { month: 7, day: 4 },
    { month: 12, day: 25 },
  ]);
  const list = cal.holidaysBetween(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'));
  assert.equal(list.length, 3);
});

test('nextHoliday: finds next holiday', () => {
  const cal = createHolidayCalendar([{ month: 7, day: 4 }]);
  const r = nextHoliday(cal, Temporal.PlainDate.from('2026-06-15'));
  assert.ok(r !== undefined);
  const d = r;
  assert.equal(d.month, 7);
  assert.equal(d.day, 4);
});

// ============== Section Q: timezone ==============
test('resolveZoned: constructs a ZonedDateTime', () => {
  const r = resolveZoned({ year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30 }, 'UTC');
  assert.ok(r !== undefined);
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
