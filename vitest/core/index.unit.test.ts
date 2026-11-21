import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import * as fmt from '../../src/index.js';

setTemporal(Temporal);

// The public barrel (src/index.ts) is nothing but re-export statements, so
// this file's job is to (a) force the barrel module to evaluate and (b)
// reference/call every value export through the namespace so each
// re-export binding is proven live, not just present at compile time.

const d = Temporal.PlainDate.from('2026-08-04');
const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
const tm = Temporal.PlainTime.from('15:45:30');
const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[America/New_York]');
const zdtUtc = Temporal.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]');
const ym = Temporal.PlainYearMonth.from('2026-08');
const md = Temporal.PlainMonthDay.from('08-04');
const dur = Temporal.Duration.from({ hours: 1, minutes: 30 });
const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');

const bag = fmt as unknown as Record<string, unknown>;

// Every value export in src/index.ts, grouped the way the barrel groups
// them. Type-only exports (FormattedPart, LocaleVocab, ...) have no runtime
// binding and are intentionally absent.
const FUNCTION_EXPORTS = [
  // format/parse family
  'format', 'formatToParts', 'compileFormat',
  'parse', 'safeParse', 'tryParse', 'parseToParts', 'compileParser',
  // legacy wrappers
  'legacyFormat', 'legacyFormatToParts', 'legacyCompileFormat',
  'legacyParse', 'legacySafeParse', 'legacyTryParse', 'legacyParseToParts',
  'legacyCompileParser', 'matchesFormat', 'legacyMatchesFormat',
  // provider / distance / duration
  'setTemporal', 'formatDuration', 'formatDistance', 'formatDistanceToNow',
  // vocab registration
  'registerLocaleVocab',
  // type guards
  'isTemporal', 'isInstant', 'isPlainDate', 'isPlainTime', 'isPlainDateTime',
  'isZonedDateTime', 'isPlainYearMonth', 'isPlainMonthDay', 'isDuration',
  'assertTemporal', 'assertInstant', 'assertPlainDate', 'assertPlainTime',
  'assertPlainDateTime', 'assertZonedDateTime', 'assertPlainYearMonth',
  'assertPlainMonthDay', 'assertDuration',
  // analyze
  'analyzeFormat', 'explainFormat', 'tokenizeFormat', 'listTokens',
  'tokenInfo', 'isValidFormat', 'validateFormat', 'fieldForToken',
  // calendarUtils
  'daysInMonth', 'daysInYear', 'dayOfYear', 'getQuarter', 'startOf', 'endOf',
  'asDateFieldView', 'monthsInYear', 'isLeapYear', 'isLeapMonth',
  'weekOfYear', 'weekYear', 'getMonth', 'getWeekday',
  // arithmetic
  'add', 'subtract', 'difference',
  'addYears', 'addMonths', 'addWeeks', 'addDays', 'addHours', 'addMinutes',
  'addSeconds', 'addMilliseconds',
  'subtractYears', 'subtractMonths', 'subtractWeeks', 'subtractDays',
  'subtractHours', 'subtractMinutes', 'subtractSeconds', 'subtractMilliseconds',
  'differenceInYears', 'differenceInMonths', 'differenceInWeeks',
  'differenceInDays', 'differenceInHours', 'differenceInMinutes',
  'differenceInSeconds', 'differenceInMilliseconds',
  // comparison
  'compare', 'min', 'max', 'isWeekend', 'isEqual', 'isBefore', 'isAfter',
  'clamp', 'isBetween', 'isToday', 'isTomorrow', 'isYesterday', 'isSameDay',
  'isSameWeek', 'isSameMonth', 'isSameQuarter', 'isSameYear', 'isWeekday',
  // rounding
  'round', 'roundDuration', 'floor', 'ceil', 'truncate', 'roundDurationAlias',
  // serialization
  'parseISO', 'formatISO', 'formatRFC2822', 'formatHTTPDate',
  'fromUnixSeconds', 'fromUnixMilliseconds', 'parseRFC3339', 'formatRFC3339',
  'parseRFC2822', 'parseHTTPDate', 'fromUnixMicroseconds',
  'fromUnixNanoseconds', 'toUnixSeconds', 'toUnixMilliseconds',
  'toUnixMicroseconds', 'toUnixNanoseconds', 'parseSQL', 'formatSQL',
  // duration
  'totalDuration', 'addDuration', 'formatDurationToParts', 'parseDuration',
  'parseISODuration', 'formatISODuration', 'balanceDuration',
  'compareDuration', 'subtractDuration',
  // relative time
  'formatRelative', 'formatRelativeToNow', 'parseRelative',
  // locale registry
  'registerLocale', 'getLocale', 'hasLocale',
  // numbering
  'convertDigits', 'convertDigitsToAscii', 'applyNumbering', 'applyParseNumbering',
  // config
  'createConfig', 'mergeWithConfig',
  // relative grammar
  'registerRelativeGrammar', 'listRegisteredGrammars',
  // interval
  'intervalContains', 'intersects', 'intervalIsBefore', 'intervalIsAfter',
  'intervalDifference', 'intervalSubtract', 'splitInterval', 'formatRange',
  'interval', 'overlaps', 'intersection', 'union', 'mergeIntervals',
  'formatRangeToParts',
  // recurrence
  'recurrence', 'take', 'skip', 'between', 'parseRRule', 'formatRRule',
  // business calendar / holidays
  'isBusinessDay', 'addBusinessDays', 'differenceInBusinessDays',
  'nextBusinessDay', 'previousBusinessDay', 'createBusinessCalendar',
  'subtractBusinessDays', 'createHolidayCalendar', 'holidaysBetween',
  'nextHoliday', 'previousHoliday',
  // timezone
  'getTimeZone', 'getOffset', 'getOffsetNanoseconds', 'isDST',
  'getTransitions', 'resolveZoned', 'getNextTransition', 'getPreviousTransition',
  'possibleInstantsFor',
  // extensibility / ideData / codemod
  'createFormatter', 'getAutocompleteData', 'getHoverDocs',
  'getInlineDiagnostics', 'previewFormat', 'getDocUrl',
  'translateDayjsFormatString', 'translateDateFnsFormatString',
] as const;

const CLASS_EXPORTS = [
  'TemporalFmtError', 'FormatSyntaxError', 'UnknownTokenError',
  'ParseMismatchError', 'InvalidDateError', 'InvalidTimeError',
  'InvalidOffsetError', 'InvalidTimeZoneError', 'InvalidCalendarError',
  'AmbiguousInputError', 'InvalidLocaleError', 'InvalidDurationError',
] as const;

const OBJECT_EXPORTS = [
  'TOKEN_METADATA', 'ALL_TOKEN_NAMES', 'FORMAT_ONLY_TOKENS',
  'SUPPORTED_NUMBERING_SYSTEMS', 'DEFAULT_CONFIG',
  'DAYJS_TO_TEMPORAL_FMT', 'DATE_FNS_TO_TEMPORAL_FMT',
] as const;

describe('index barrel: export surface', () => {
  it('re-exports every documented function', () => {
    for (const name of FUNCTION_EXPORTS) {
      expect(typeof bag[name], `export "${name}"`).toBe('function');
    }
  });

  it('re-exports every error class and data object', () => {
    for (const name of CLASS_EXPORTS) {
      expect(typeof bag[name], `class "${name}"`).toBe('function');
    }
    for (const name of OBJECT_EXPORTS) {
      expect(typeof bag[name], `object "${name}"`).toBe('object');
    }
  });
});

describe('index barrel: format/parse family is callable', () => {
  it('format / formatToParts / compileFormat', () => {
    expect(fmt.format(d, 'yyyy-MM-dd')).toBe('2026-08-04');
    // 3 tokens + 2 literal separators = 5 parts
    expect(fmt.formatToParts(d, 'yyyy-MM-dd')).toHaveLength(5);
    const compiled = fmt.compileFormat('yyyy-MM-dd');
    expect(compiled.format(d)).toBe('2026-08-04');
    expect(compiled.formatToParts(d)).toHaveLength(5);
  });

  it('parse / safeParse / tryParse / parseToParts / compileParser', () => {
    expect(String(fmt.parse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(fmt.safeParse('yyyy-MM-dd', '2026-08-04')).toMatchObject({ ok: true });
    expect(fmt.safeParse('yyyy-MM-dd', 'nope')).toMatchObject({ ok: false });
    expect(String(fmt.tryParse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(fmt.tryParse('yyyy-MM-dd', 'nope')).toBeUndefined();
    expect(fmt.parseToParts('yyyy-MM-dd', '2026-08-04')).toHaveLength(3);
    const parser = fmt.compileParser('yyyy-MM-dd');
    expect(String(parser.parse('2026-08-04'))).toBe('2026-08-04');
    expect(parser.safeParse('2026-08-04')).toMatchObject({ ok: true });
    expect(String(parser.tryParse('2026-08-04'))).toBe('2026-08-04');
    expect(parser.parseToParts('2026-08-04')).toHaveLength(3);
  });

  it('legacy aliases behave like their typed counterparts', () => {
    expect(fmt.legacyFormat(d, 'yyyy-MM-dd')).toBe('2026-08-04');
    expect(fmt.legacyFormatToParts(d, 'yyyy-MM-dd')).toHaveLength(5);
    expect(fmt.legacyCompileFormat('yyyy-MM-dd').format(d)).toBe('2026-08-04');
    expect(String(fmt.legacyParse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(fmt.legacySafeParse('yyyy-MM-dd', '2026-08-04')).toMatchObject({ ok: true });
    expect(String(fmt.legacyTryParse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(fmt.legacyTryParse('yyyy-MM-dd', 'nope')).toBeUndefined();
    expect(fmt.legacyParseToParts('yyyy-MM-dd', '2026-08-04')).toHaveLength(3);
    expect(String(fmt.legacyCompileParser('yyyy-MM-dd').parse('2026-08-04'))).toBe('2026-08-04');
    expect(fmt.matchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
    expect(fmt.legacyMatchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
  });

  it('setTemporal is the same injector the rest of the suite uses', () => {
    expect(() => fmt.setTemporal(Temporal)).not.toThrow();
  });
});

describe('index barrel: type guards and error classes are callable', () => {
  it('is* guards accept the right Temporal types', () => {
    expect(fmt.isTemporal(d)).toBe(true);
    expect(fmt.isInstant(inst)).toBe(true);
    expect(fmt.isPlainDate(d)).toBe(true);
    expect(fmt.isPlainTime(tm)).toBe(true);
    expect(fmt.isPlainDateTime(dt)).toBe(true);
    expect(fmt.isZonedDateTime(zdt)).toBe(true);
    expect(fmt.isPlainYearMonth(ym)).toBe(true);
    expect(fmt.isPlainMonthDay(md)).toBe(true);
    expect(fmt.isDuration(dur)).toBe(true);
  });

  it('assert* guards pass on the right Temporal types', () => {
    expect(() => fmt.assertTemporal(d)).not.toThrow();
    expect(() => fmt.assertInstant(inst)).not.toThrow();
    expect(() => fmt.assertPlainDate(d)).not.toThrow();
    expect(() => fmt.assertPlainTime(tm)).not.toThrow();
    expect(() => fmt.assertPlainDateTime(dt)).not.toThrow();
    expect(() => fmt.assertZonedDateTime(zdt)).not.toThrow();
    expect(() => fmt.assertPlainYearMonth(ym)).not.toThrow();
    expect(() => fmt.assertPlainMonthDay(md)).not.toThrow();
    expect(() => fmt.assertDuration(dur)).not.toThrow();
  });

  it('error classes construct typed TemporalFmtError subclasses', () => {
    const base = new fmt.TemporalFmtError('boom', { code: 'UNKNOWN_TOKEN' });
    expect(base).toBeInstanceOf(Error);
    expect(new fmt.FormatSyntaxError({ format: 'x' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.UnknownTokenError({ token: 'x' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.ParseMismatchError({ input: 'a', format: 'b' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidDateError({ input: 'a' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidTimeError({ input: 'a' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidOffsetError({ actual: '+99' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidTimeZoneError({ actual: 'Bad/Zone' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidCalendarError({ actual: 'mars' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.AmbiguousInputError({ input: 'a' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidLocaleError({ actual: 'a' })).toBeInstanceOf(fmt.TemporalFmtError);
    expect(new fmt.InvalidDurationError({})).toBeInstanceOf(fmt.TemporalFmtError);
  });
});

describe('index barrel: analyze + metadata', () => {
  it('analyzeFormat / explainFormat / tokenizeFormat / fieldForToken', () => {
    expect(fmt.analyzeFormat('yyyy-MM-dd').tokens).toHaveLength(3);
    expect(fmt.explainFormat('yyyy')).toContain('Format string');
    expect(fmt.tokenizeFormat('yyyy-MM')).toHaveLength(3);
    expect(fmt.fieldForToken('yyyy')).toBe('year');
  });

  it('listTokens / tokenInfo / isValidFormat / validateFormat', () => {
    expect(fmt.listTokens().length).toBeGreaterThan(50);
    expect(fmt.tokenInfo('yyyy')?.meaning).toBeTruthy();
    expect(fmt.isValidFormat('yyyy-MM-dd')).toBe(true);
    expect(fmt.validateFormat('yyyy').tokens).toHaveLength(1);
  });

  it('token metadata objects', () => {
    expect(fmt.TOKEN_METADATA['yyyy']!.meaning).toBeTruthy();
    expect(fmt.ALL_TOKEN_NAMES).toContain('yyyy');
    expect(fmt.FORMAT_ONLY_TOKENS.has('do')).toBe(true);
  });
});

describe('index barrel: calendar / arithmetic / comparison / rounding', () => {
  it('calendarUtils', () => {
    expect(fmt.daysInMonth(d)).toBe(31);
    expect(fmt.daysInYear(d)).toBe(365);
    expect(fmt.monthsInYear(d)).toBe(12);
    expect(fmt.isLeapYear(d)).toBe(false);
    expect(fmt.isLeapYear(Temporal.PlainDate.from('2024-02-01'))).toBe(true);
    expect(fmt.isLeapMonth(d)).toBe(false);
    expect(fmt.dayOfYear(d)).toBe(216);
    expect(fmt.weekOfYear(d)).toBeGreaterThanOrEqual(1);
    expect(fmt.weekYear(d)).toBe(2026);
    expect(fmt.getQuarter(d)).toBe(3);
    expect(fmt.getMonth(d)).toBe(8);
    expect(fmt.getWeekday(d)).toBe(2); // Tuesday, ISO numbering
    expect(fmt.startOf(dt, 'month')).toMatchObject({ year: 2026, month: 8, day: 1 });
    expect(fmt.endOf(dt, 'day')).toMatchObject({ year: 2026, month: 8, day: 4 });
    expect(fmt.asDateFieldView(d)).toMatchObject({ year: 2026, month: 8, day: 4 });
  });

  it('arithmetic add/subtract family', () => {
    expect(fmt.add(d, 1, 'days')).toMatchObject({ day: 5 });
    expect(fmt.subtract(d, 1, 'days')).toMatchObject({ day: 3 });
    expect(fmt.addYears(d, 1)).toMatchObject({ year: 2027 });
    expect(fmt.addMonths(d, 1)).toMatchObject({ month: 9 });
    expect(fmt.addWeeks(d, 1)).toMatchObject({ day: 11 });
    expect(fmt.addDays(d, 1)).toMatchObject({ day: 5 });
    expect(fmt.addHours(dt, 1)).toMatchObject({ hour: 16 });
    expect(fmt.addMinutes(dt, 1)).toMatchObject({ minute: 46 });
    expect(fmt.addSeconds(dt, 1)).toMatchObject({ second: 31 });
    expect(fmt.addMilliseconds(dt, 1)).toMatchObject({ millisecond: 1 });
    expect(fmt.subtractYears(d, 1)).toMatchObject({ year: 2025 });
    expect(fmt.subtractMonths(d, 1)).toMatchObject({ month: 7 });
    expect(fmt.subtractWeeks(d, 1)).toMatchObject({ day: 28 });
    expect(fmt.subtractDays(d, 1)).toMatchObject({ day: 3 });
    expect(fmt.subtractHours(dt, 1)).toMatchObject({ hour: 14 });
    expect(fmt.subtractMinutes(dt, 1)).toMatchObject({ minute: 44 });
    expect(fmt.subtractSeconds(dt, 1)).toMatchObject({ second: 29 });
    // dt's ms field is 0, so subtracting 1ms borrows back into 29.999
    expect(fmt.subtractMilliseconds(dt, 1)).toMatchObject({ second: 29, millisecond: 999 });
  });

  it('arithmetic difference family', () => {
    // difference(a, b) measures b − a
    const noon = Temporal.PlainDateTime.from('2026-08-04T12:00:00');
    const evening = Temporal.PlainDateTime.from('2026-08-04T18:00:00');
    expect(fmt.difference(noon, evening, 'hours')).toBe(6);
    expect(fmt.difference(evening, noon, 'hours')).toBe(-6);
    expect(fmt.differenceInHours(noon, evening)).toBe(6);
    expect(fmt.differenceInMinutes(noon, evening)).toBe(360);
    expect(fmt.differenceInSeconds(noon, evening)).toBe(21600);
    expect(fmt.differenceInMilliseconds(noon, evening)).toBe(21600000);
    expect(fmt.differenceInDays(Temporal.PlainDate.from('2026-08-01'), d)).toBe(3);
    expect(fmt.differenceInWeeks(d, Temporal.PlainDate.from('2026-08-18'))).toBe(2);
    expect(fmt.differenceInMonths(Temporal.PlainDate.from('2026-05-04'), d)).toBe(3);
    expect(fmt.differenceInYears(Temporal.PlainDate.from('2020-08-04'), d)).toBe(6);
  });

  it('comparison family', () => {
    const later = Temporal.PlainDate.from('2026-08-14');
    expect(fmt.compare(d, later)).toBeLessThan(0);
    expect(fmt.compare(d, d)).toBe(0);
    expect(fmt.isEqual(d, d)).toBe(true);
    expect(fmt.isBefore(d, later)).toBe(true);
    expect(fmt.isAfter(later, d)).toBe(true);
    expect((fmt.min([d, later]) as { day: number }).day).toBe(4);
    expect((fmt.max([d, later]) as { day: number }).day).toBe(14);
    expect((fmt.clamp(Temporal.PlainDate.from('2026-08-10'), d, later) as { day: number }).day).toBe(10);
    expect(fmt.isBetween(Temporal.PlainDate.from('2026-08-10'), d, later)).toBe(true);
    expect(fmt.isSameDay(dt, d)).toBe(true);
    expect(fmt.isSameWeek(Temporal.PlainDate.from('2026-08-05'), d)).toBe(true);
    expect(fmt.isSameMonth(Temporal.PlainDate.from('2026-08-20'), d)).toBe(true);
    expect(fmt.isSameQuarter(Temporal.PlainDate.from('2026-09-01'), d)).toBe(true);
    expect(fmt.isSameYear(Temporal.PlainDate.from('2026-02-01'), d)).toBe(true);
    expect(fmt.isWeekend(Temporal.PlainDate.from('2026-08-08'))).toBe(true);
    expect(fmt.isWeekday(d)).toBe(true);
    // clock-relative guards: deterministic assertion is on the result type
    expect(typeof fmt.isToday(d)).toBe('boolean');
    expect(typeof fmt.isTomorrow(d)).toBe('boolean');
    expect(typeof fmt.isYesterday(d)).toBe('boolean');
  });

  it('rounding family', () => {
    expect(fmt.round(dt, { unit: 'hour' })).toMatchObject({ hour: 16, minute: 0 });
    expect(fmt.floor(dt, 'hour')).toMatchObject({ hour: 15, minute: 0 });
    expect(fmt.ceil(dt, 'hour')).toMatchObject({ hour: 16, minute: 0 });
    expect(fmt.truncate(dt, 'hour')).toMatchObject({ hour: 15, minute: 0 });
    expect(fmt.roundDuration({ hours: 2, minutes: 30 }, { unit: 'hours' })).toMatchObject({ hours: 3, minutes: 0 });
    expect(fmt.roundDurationAlias({ hours: 2, minutes: 10 }, { unit: 'hours' })).toMatchObject({ hours: 2, minutes: 0 });
  });
});

describe('index barrel: serialization', () => {
  it('ISO / RFC families', () => {
    expect(fmt.parseISO('2026-08-04')).toBeTruthy();
    expect(fmt.formatISO(d)).toBe('2026-08-04');
    expect(fmt.parseRFC3339('2026-08-04T15:45:30Z')).toBeTruthy();
    expect(fmt.formatRFC3339(inst)).toMatch(/2026-08-04T15:45:30/);
    expect(fmt.parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000')).toBeTruthy();
    expect(fmt.formatRFC2822({ epochMilliseconds: 1700000000000 })).toBe('Tue, 14 Nov 2023 22:13:20 +0000');
    expect(fmt.parseHTTPDate('Tue, 04 Aug 2026 15:45:30 GMT')).toBeTruthy();
    expect(fmt.formatHTTPDate(zdtUtc)).toBe('Tue, 04 Aug 2026 15:45:30 GMT');
  });

  it('unix epoch family round-trips', () => {
    expect(fmt.toUnixSeconds(fmt.fromUnixSeconds(123))).toBe(123);
    expect(fmt.toUnixMilliseconds(fmt.fromUnixMilliseconds(456))).toBe(456);
    expect(fmt.toUnixMicroseconds(fmt.fromUnixMicroseconds(789))).toBe(789);
    expect(fmt.toUnixNanoseconds(fmt.fromUnixNanoseconds(101112n))).toBe(101112n);
  });

  it('SQL family', () => {
    expect(fmt.parseSQL('2026-08-04T15:45:30')).toBeTruthy();
    expect(fmt.formatSQL(dt)).toMatch(/2026-08-04/);
  });
});

describe('index barrel: duration', () => {
  it('duration helpers', () => {
    expect(fmt.totalDuration({ hours: 1, minutes: 30 }, 'hours')).toBe(1.5);
    expect(fmt.addDuration({ hours: 1 }, { minutes: 30 })).toMatchObject({ hours: 1, minutes: 30 });
    expect(fmt.formatDurationToParts({ hours: 2, minutes: 30 }, 'hhh mmm')).toBeTruthy();
    expect(fmt.parseDuration('2:30', 'h:m')).toMatchObject({ hours: 2, minutes: 30 });
    expect(fmt.parseISODuration('PT1H30M')).toMatchObject({ hours: 1, minutes: 30 });
    expect(fmt.formatISODuration({ years: 1, days: 3 })).toMatch(/P1Y3D/);
    expect(fmt.balanceDuration({ minutes: 90 })).toMatchObject({ hours: 1, minutes: 30 });
    expect(fmt.compareDuration({ hours: 1 }, { hours: 1 })).toBe(0);
    expect(fmt.subtractDuration({ hours: 2 }, { hours: 1 })).toMatchObject({ hours: 1 });
    expect(fmt.formatDuration({ hours: 2 }, 'h')).toBe('2');
  });
});

describe('index barrel: relative time, locales, numbering, config', () => {
  it('formatRelative / formatRelativeToNow / parseRelative', () => {
    expect(fmt.formatRelative(d, d)).toBe('today');
    expect(typeof fmt.formatRelativeToNow(d)).toBe('string');
    expect(String(fmt.parseRelative('tomorrow', d))).toBe('2026-08-05');
  });

  it('formatDistance / formatDistanceToNow', () => {
    expect(fmt.formatDistance(d, d)).toBe('now');
    expect(fmt.formatDistance(Temporal.PlainDate.from('2026-08-14'), d, { numeric: 'always' })).toBe('in 10 days');
    expect(typeof fmt.formatDistanceToNow(d)).toBe('string');
  });

  it('locale registry', () => {
    const baseVocab = {
      monthLong: Array.from({ length: 12 }, (_, i) => `BMo${i + 1}`),
      monthShort: Array.from({ length: 12 }, (_, i) => `BM${i + 1}`),
      weekdayLong: Array.from({ length: 7 }, (_, i) => `BDay${i + 1}`),
      weekdayShort: Array.from({ length: 7 }, (_, i) => `BD${i + 1}`),
      dayPeriod: ['BAM', 'BPM'],
    };
    fmt.registerLocale('barrel-locale-x', { ...baseVocab, quartersLong: ['First', 'Second', 'Third', 'Fourth'] });
    expect(fmt.hasLocale('barrel-locale-x')).toBe(true);
    expect(fmt.getLocale('barrel-locale-x')?.quartersLong?.[0]).toBe('First');
    expect(fmt.hasLocale('fr')).toBe(false);
  });

  it('registerLocaleVocab accepts a custom-vocab locale tag', () => {
    const vocab = {
      monthLong: ['VJan', 'VFeb', 'VMar', 'VApr', 'VMay', 'VJun', 'VJul', 'VAug', 'VSep', 'VOct', 'VNov', 'VDec'],
      monthShort: ['VJa', 'VFe', 'VMr', 'VAp', 'VMa', 'VJu', 'VJl', 'VAu', 'VSe', 'VOc', 'VNo', 'VDe'],
      weekdayLong: ['VMonday', 'VTuesday', 'VWednesday', 'VThursday', 'VFriday', 'VSaturday', 'VSunday'],
      weekdayShort: ['VMo', 'VTu', 'VWe', 'VTh', 'VFr', 'VSa', 'VSu'],
      dayPeriod: ['V_AM', 'V_PM'],
    };
    expect(() => fmt.registerLocaleVocab('barrel-vocab-x', vocab)).not.toThrow();
  });

  it('numbering', () => {
    expect(fmt.convertDigitsToAscii(fmt.convertDigits('123', 'arab'), 'arab')).toBe('123');
    expect(fmt.applyNumbering('123', {})).toBe('123');
    expect(fmt.applyParseNumbering('123', {})).toBe('123');
    expect(fmt.SUPPORTED_NUMBERING_SYSTEMS.has('latn')).toBe(true);
  });

  it('config', () => {
    expect(fmt.DEFAULT_CONFIG).toBeTypeOf('object');
    expect(fmt.createConfig({ locale: 'de-DE' })).toMatchObject({ locale: 'de-DE' });
    expect(fmt.mergeWithConfig(fmt.DEFAULT_CONFIG, { locale: 'de-DE' })).toMatchObject({ locale: 'de-DE' });
  });

  it('relative grammar', () => {
    fmt.registerRelativeGrammar({ language: 'barrel-lang-x', matchers: [() => null] });
    expect(fmt.listRegisteredGrammars()).toContain('barrel-lang-x');
  });
});

describe('index barrel: interval / recurrence / business + holiday calendars', () => {
  const mid = Temporal.PlainDate.from('2026-08-10');
  const later = Temporal.PlainDate.from('2026-08-14');
  const far = Temporal.PlainDate.from('2026-08-20');

  it('interval family', () => {
    const iv = fmt.interval(d, later); // [Aug 4, Aug 14]
    const iv2 = fmt.interval(mid, far); // [Aug 10, Aug 20] — overlaps iv
    const iv3 = fmt.interval(far, Temporal.PlainDate.from('2026-08-30')); // disjoint, after iv
    expect(fmt.intervalContains(iv, mid)).toBe(true);
    expect(fmt.overlaps(iv, iv2)).toBe(true);
    expect(fmt.intersects(iv, iv2)).toBe(true);
    expect(fmt.intervalIsBefore(iv, iv3)).toBe(true);
    expect(fmt.intervalIsAfter(iv3, iv)).toBe(true);
    expect(fmt.intersection(iv, iv2)).toBeTruthy();
    expect(fmt.union(iv, iv2)).toBeTruthy();
    expect(Array.isArray(fmt.intervalDifference(iv, iv2))).toBe(true);
    expect(Array.isArray(fmt.intervalSubtract(iv, iv2))).toBe(true);
    expect(fmt.mergeIntervals([iv, iv2])).toBeTruthy();
    expect(fmt.splitInterval(iv, 2)).toHaveLength(2);
    expect(fmt.formatRange(iv, 'yyyy-MM-dd')).toBe('2026-08-04 \u2013 2026-08-14');
    expect(Array.isArray(fmt.formatRangeToParts(iv, 'yyyy-MM-dd'))).toBe(true);
  });

  it('recurrence family', () => {
    const rule = fmt.parseRRule('FREQ=DAILY;COUNT=3');
    expect(fmt.formatRRule(rule)).toContain('DAILY');
    expect(fmt.take(fmt.recurrence(d, rule), 3)).toHaveLength(3);
    expect(Array.isArray(fmt.skip(fmt.recurrence(d, rule), 1))).toBe(true);
    expect(Array.isArray(fmt.between(d, rule, d, later))).toBe(true);
  });

  it('business calendar family', () => {
    const cal = fmt.createBusinessCalendar();
    expect(fmt.isBusinessDay(cal, d)).toBe(true); // Tuesday
    expect((fmt.nextBusinessDay(cal, d) as { day: number }).day).toBe(5);
    expect((fmt.previousBusinessDay(cal, d) as { day: number }).day).toBe(3);
    expect((fmt.addBusinessDays(cal, d, 1) as { day: number }).day).toBe(5);
    expect((fmt.subtractBusinessDays(cal, d, 1) as { day: number }).day).toBe(3);
    // measures b − a in business days, same direction as difference()
    expect(fmt.differenceInBusinessDays(cal, d, Temporal.PlainDate.from('2026-08-05'))).toBe(1);
  });

  it('holiday calendar family', () => {
    const cal = fmt.createHolidayCalendar([{ month: 7, day: 4, name: 'Independence Day' }]);
    expect(fmt.holidaysBetween(cal, Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-12-31'))).toHaveLength(1);
    expect(fmt.nextHoliday(cal, d)).toBeTruthy();
    expect(fmt.previousHoliday(cal, d)).toBeTruthy();
  });
});

describe('index barrel: timezone / extensibility / ideData / codemod', () => {
  it('timezone family', () => {
    expect(fmt.getTimeZone(zdt)).toBe('America/New_York');
    expect(fmt.getOffset(zdt)).toBe('-04:00');
    expect(fmt.getOffsetNanoseconds(zdt)).toBe(-14_400_000_000_000);
    expect(fmt.isDST(zdt)).toBe(true);
    expect(fmt.isDST(Temporal.ZonedDateTime.from('2026-01-04T12:00[America/New_York]'))).toBe(false);
    const jan = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
    const jun = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
    expect(fmt.getTransitions(jan, jun)).toHaveLength(1);
    expect(String(fmt.getNextTransition(jan)).slice(0, 10)).toBe('2026-03-09');
    expect(fmt.getPreviousTransition(zdt)).toBeTruthy();
    expect(fmt.resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC')).toBeTruthy();
    expect(fmt.possibleInstantsFor(
      { year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 },
      'America/New_York',
    )).toHaveLength(1);
  });

  it('createFormatter', () => {
    expect(fmt.createFormatter().format(d, 'yyyy-MM-dd')).toBe('2026-08-04');
  });

  it('ideData exports', () => {
    expect(fmt.getAutocompleteData().length).toBeGreaterThan(50);
    expect(fmt.getHoverDocs()['yyyy']!.summary).toBeTruthy();
    expect(fmt.getInlineDiagnostics('yyyy-MM-dd')).toEqual([]);
    expect(fmt.previewFormat('yyyy-MM-dd')).toBe('2026-08-04');
    expect(fmt.getDocUrl('yyyy')).toBe('README.md#token-reference');
    expect(fmt.DAYJS_TO_TEMPORAL_FMT.find((e) => e.from === 'YYYY')).toMatchObject({ to: 'yyyy' });
    expect(fmt.DATE_FNS_TO_TEMPORAL_FMT.find((e) => e.from === 'dd')).toMatchObject({ to: 'dd' });
  });

  it('codemod translators', () => {
    expect(fmt.translateDayjsFormatString('YYYY-MM-DD')).toBe('yyyy-MM-dd');
    expect(fmt.translateDateFnsFormatString('yyyy-MM-dd')).toBe('yyyy-MM-dd');
  });
});
