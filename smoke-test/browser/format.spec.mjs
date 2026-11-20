import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entryPoint = fileURLToPath(new URL('./browser-entry.mjs', import.meta.url));
let bundle;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  bundle = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle });
});

test('formats and parses Temporal values in the browser runtime', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Temporal, format, parse } = globalThis.temporalFmtBrowserSmoke;
    const date = Temporal.PlainDate.from('2026-08-04');
    return {
      formatted: format(date, 'yyyy-MM-dd'),
      month: format(date, 'MMMM', { locale: 'en-US' }),
      parsed: parse('yyyy-MM-dd', '2026-08-04').toString(),
    };
  });

  expect(result).toEqual({
    formatted: '2026-08-04',
    month: 'August',
    parsed: '2026-08-04',
  });
});

test('resolves a DST overlap consistently with Temporal in the browser', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { getOffset, possibleInstantsFor, resolveZoned } = globalThis.temporalFmtBrowserSmoke;
    const fields = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
    const instants = possibleInstantsFor({ ...fields, second: 0, millisecond: 0 }, 'America/New_York');
    const later = resolveZoned(fields, 'America/New_York', { disambiguation: 'later' });
    return { count: instants.length, offset: getOffset(later) };
  });

  expect(result).toEqual({ count: 2, offset: '-05:00' });
});

test('formats every supported Temporal date and time shape', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Temporal, format } = globalThis.temporalFmtBrowserSmoke;
    return {
      date: format(Temporal.PlainDate.from('2026-08-04'), 'yyyy-MM-dd'),
      time: format(Temporal.PlainTime.from('15:45:30'), 'HH:mm:ss'),
      dateTime: format(Temporal.PlainDateTime.from('2026-08-04T15:45:30'), 'yyyy-MM-dd HH:mm:ss'),
      yearMonth: format(Temporal.PlainYearMonth.from('2026-08'), 'MMMM'),
      monthDay: format(Temporal.PlainMonthDay.from('08-04'), 'MMMM'),
      zoned: format(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]'), 'XXX'),
    };
  });

  expect(result).toEqual({
    date: '2026-08-04',
    time: '15:45:30',
    dateTime: '2026-08-04 15:45:30',
    yearMonth: 'August',
    monthDay: 'August',
    zoned: 'Z',
  });
});

test('formats parts, compiled formats, and custom tokens', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { Temporal, compileFormat, createFormatter, formatToParts } = globalThis.temporalFmtBrowserSmoke;
    const date = Temporal.PlainDate.from('2026-08-04');
    const formatter = createFormatter({
      tokens: [{ name: 'YYYYYY', handler: (value) => String(value.year).padStart(6, '0'), field: 'year' }],
    });
    return {
      parts: formatToParts(date, 'yyyy-MM').map(({ type, value }) => [type, value]),
      compiled: compileFormat('yyyy-MM-dd').format(date),
      custom: formatter.format(date, 'YYYYYY'),
    };
  });

  expect(result).toEqual({
    parts: [['token', '2026'], ['literal', '-'], ['token', '08']],
    compiled: '2026-08-04',
    custom: '002026',
  });
});

test('parses date/time forms and exposes safe, compiled, and parts APIs', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { compileParser, parse, parseToParts, safeParse, Temporal, tryParse } = globalThis.temporalFmtBrowserSmoke;
    return {
      date: parse('yyyy-MM-dd', '2026-08-04').toString(),
      time: parse('HH:mm', '15:45').toString(),
      dateTime: parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45').toString(),
      compiled: compileParser('yyyy-MM-dd').parse('2026-08-04').toString(),
      safe: safeParse('yyyy-MM-dd', '2026-08-04').ok,
      failedSafe: safeParse('yyyy-MM-dd', 'invalid').ok,
      failedTry: tryParse('yyyy-MM-dd', 'invalid') === undefined,
      parts: parseToParts('yyyy-MM-dd', '2026-08-04').length,
      plainDate: Temporal.PlainDate.from('2026-08-04').toString(),
    };
  });

  expect(result).toEqual({
    date: '2026-08-04',
    time: '15:45:00',
    dateTime: '2026-08-04T15:45:00',
    compiled: '2026-08-04',
    safe: true,
    failedSafe: false,
    failedTry: true,
    parts: 3,
    plainDate: '2026-08-04',
  });
});

test('calendar, arithmetic, comparison, and rounding APIs work in browser', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    const { Temporal } = api;
    const date = Temporal.PlainDate.from('2024-02-29');
    const rounded = api.round(Temporal.PlainDateTime.from('2026-08-04T15:45:00'), { unit: 'hour' });
    return {
      daysInMonth: api.daysInMonth(date),
      leapYear: api.isLeapYear(date),
      dayOfYear: api.dayOfYear(Temporal.PlainDate.from('2026-01-01')),
      added: api.addDays(Temporal.PlainDate.from('2026-08-04'), 1).day,
      compare: api.compare(date, Temporal.PlainDate.from('2024-03-01')),
      roundedHour: rounded.hour,
    };
  });

  expect(result).toEqual({
    daysInMonth: 29,
    leapYear: true,
    dayOfYear: 1,
    added: 5,
    compare: -1,
    roundedHour: 16,
  });
});

test('serialization and duration APIs round-trip standards-shaped values', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    const { Temporal } = api;
    const instant = Temporal.Instant.from('2026-08-04T15:45:30Z');
    const duration = api.parseISODuration('P1Y2M3DT4H');
    return {
      iso: api.formatISO(Temporal.PlainDate.from('2026-08-04')),
      parsedIso: api.parseISO('2026-08-04').toString(),
      rfc3339: api.formatRFC3339(instant),
      sql: api.formatSQL(Temporal.PlainDateTime.from('2026-08-04T15:45:30')),
      duration: api.formatISODuration(duration),
      formattedDuration: api.formatDuration({ hours: 2 }, 'hh'),
    };
  });

  expect(result).toEqual({
    iso: '2026-08-04',
    parsedIso: '2026-08-04',
    rfc3339: '2026-08-04T15:45:30Z',
    sql: '2026-08-04 15:45:30',
    duration: 'P1Y2M3DT4H',
    formattedDuration: '2h',
  });
});

test('interval and recurrence APIs operate on browser Temporal values', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    const start = api.Temporal.PlainDate.from('2026-01-01');
    const range = api.interval(start, api.Temporal.PlainDate.from('2026-01-05'));
    const rule = api.parseRRule('FREQ=DAILY;COUNT=3');
    return {
      contains: api.intervalContains(range, api.Temporal.PlainDate.from('2026-01-03')),
      recurrence: api.take(api.recurrence(start, rule), 3).map((value) =>
        `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`),
      rule: api.formatRRule(rule),
    };
  });

  expect(result).toEqual({
    contains: true,
    recurrence: ['2026-01-01', '2026-01-02', '2026-01-03'],
    rule: 'FREQ=DAILY;COUNT=3',
  });
});

test('time-zone, business-calendar, and holiday APIs work in browser', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    const Temporal = api.Temporal;
    const holidays = api.createHolidayCalendar([{ month: 8, day: 5, name: 'Smoke holiday' }]);
    const calendar = api.createBusinessCalendar({ holidays });
    const date = Temporal.PlainDate.from('2026-08-04');
    const zoned = api.resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC');
    return {
      offset: api.getOffset(zoned),
      validZone: api.getTimeZone(zoned),
      businessDay: api.isBusinessDay(calendar, date),
      nextBusinessDay: api.addBusinessDays(calendar, date, 1).day,
      holidayCount: api.holidaysBetween(holidays, date, Temporal.PlainDate.from('2026-08-06')).length,
    };
  });

  expect(result).toEqual({
    offset: '+00:00',
    validZone: 'UTC',
    businessDay: true,
    nextBusinessDay: 6,
    holidayCount: 1,
  });
});

test('locale, relative-time, configuration, and IDE APIs run in browser', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    const today = api.Temporal.PlainDate.from('2026-08-04');
    const config = api.createConfig({ locale: 'fr-FR' });
    return {
      convertedDigits: api.convertDigits('2026', 'arab'),
      distance: api.formatDistance(today.add({ days: 1 }), today),
      relative: api.parseRelative('in 3 days', today).toString(),
      locale: config.locale,
      preview: api.previewFormat('yyyy-MM-dd'),
      translated: api.translateDayjsFormatString('YYYY-MM-DD'),
      autocomplete: api.getAutocompleteData().some((entry) => entry.label === 'yyyy'),
    };
  });

  expect(result).toEqual({
    convertedDigits: '٢٠٢٦',
    distance: 'tomorrow',
    relative: '2026-08-07',
    locale: 'fr-FR',
    preview: '2026-08-04',
    translated: 'yyyy-MM-dd',
    autocomplete: true,
  });
});

test('errors and format analysis are surfaced in browser without uncaught failures', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = globalThis.temporalFmtBrowserSmoke;
    let error;
    try {
      api.format(api.Temporal.PlainDate.from('2026-08-04'), 'MMMMM');
    } catch (caught) {
      error = caught;
    }
    return {
      isTypedError: error instanceof api.TemporalFmtError,
      errorCode: error?.code,
      parseable: api.analyzeFormat('yyyy-MM-dd').parseable,
      validPattern: api.isValidFormat('yyyy-MM-dd'),
      invalidPattern: api.isValidFormat("yyyy 'unterminated"),
      isDate: api.isPlainDate(api.Temporal.PlainDate.from('2026-08-04')),
    };
  });

  expect(result).toEqual({
    isTypedError: true,
    errorCode: 'UNKNOWN_TOKEN',
    parseable: true,
    validPattern: true,
    invalidPattern: false,
    isDate: true,
  });
});
