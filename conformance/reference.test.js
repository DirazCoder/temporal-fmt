import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  format,
  formatHTTPDate,
  formatISODuration,
  formatRFC2822,
  formatRFC3339,
  formatRRule,
  getOffset,
  isDST,
  parse,
  parseHTTPDate,
  parseISODuration,
  parseRFC2822,
  parseRFC3339,
  parseRelative,
  parseRRule,
  possibleInstantsFor,
  recurrence,
  resolveZoned,
  setTemporal,
  take,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function ymd(value) {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function occurrences(start, rule, count) {
  return take(
    recurrence(Temporal.PlainDate.from(start), parseRRule(rule)),
    count,
  ).map(ymd);
}

test('date-fns-compatible token reference vectors', async (t) => {
  const value = Temporal.PlainDateTime.from('2020-02-29T16:05:09.123');
  const vectors = [
    ['year-unpadded', 'y', '2020'],
    ['year-two-digit', 'yy', '20'],
    ['year-four-digit', 'yyyy', '2020'],
    ['month-numeric', 'M', '2'],
    ['month-two-digit', 'MM', '02'],
    ['month-abbreviated', 'MMM', 'Feb'],
    ['month-wide', 'MMMM', 'February'],
    ['day-numeric', 'd', '29'],
    ['day-two-digit', 'dd', '29'],
    ['day-ordinal', 'do', '29th'],
    ['weekday-abbreviated', 'EEE', 'Sat'],
    ['weekday-wide', 'EEEE', 'Saturday'],
    ['day-of-year', 'D', '60'],
    ['day-of-year-three-digit', 'DDD', '060'],
    ['quarter-number', 'Q', '1'],
    ['quarter-abbreviated', 'QQQ', 'Q1'],
    ['iso-week', 'ww', '09'],
    ['iso-week-year', 'RRRR', '2020'],
    ['era-abbreviated', 'G', 'AD'],
    ['hour-24-unpadded', 'H', '16'],
    ['hour-24-padded', 'HH', '16'],
    ['hour-12-unpadded', 'h', '4'],
    ['hour-12-padded', 'hh', '04'],
    ['minute-padded', 'mm', '05'],
    ['second-padded', 'ss', '09'],
    ['fraction-one-digit', 'S', '1'],
    ['fraction-three-digits', 'SSS', '123'],
    ['fraction-nine-digits', 'SSSSSSSSS', '123000000'],
    ['day-period', 'a', 'PM'],
    ['standalone-month-wide', 'LLLL', 'February'],
    ['standalone-weekday-wide', 'cccc', 'Saturday'],
  ];

  for (const [id, pattern, expected] of vectors) {
    await t.test(id, () => {
      assert.equal(format(value, pattern), expected);
    });
  }
});

test('CLDR-backed Intl locale and numbering reference vectors', async (t) => {
  const date = Temporal.PlainDate.from('2024-02-29');
  const referenceDate = new Date(Date.UTC(2024, 1, 29, 12));
  const locales = ['en-US', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP', 'ar-EG', 'th-TH', 'he-IL'];

  for (const locale of locales) {
    await t.test(`${locale}: month and weekday names follow Intl`, () => {
      const month = new Intl.DateTimeFormat(locale, {
        month: 'long',
        timeZone: 'UTC',
      }).format(referenceDate);
      const weekday = new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(referenceDate);
      assert.equal(format(date, 'MMMM', { locale }), month);
      assert.equal(format(date, 'EEEE', { locale }), weekday);
    });
  }

  await t.test('Arabic digits match the numbering-system mapping', () => {
    assert.equal(
      format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' }),
      '٢٠٢٤-٠٢-٢٩',
    );
  });

  await t.test('Hebrew leap-month names follow the Hebrew calendar in Intl', () => {
    const isoDate = Temporal.PlainDate.from('2024-03-11');
    const hebrewDate = isoDate.withCalendar('hebrew');
    const locale = 'he-IL-u-ca-hebrew';
    const expected = new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 2, 11, 12)));
    assert.equal(hebrewDate.monthsInYear, 13);
    assert.equal(format(hebrewDate, 'MMMM', { locale }), expected);
  });
});

test('RFC 3339 timestamp vectors', async (t) => {
  const valid = [
    ['utc-z', '1997-07-16T19:20:30Z', '1997-07-16T19:20:30Z'],
    ['lowercase-separators', '1997-07-16t19:20:30z', '1997-07-16T19:20:30Z'],
    ['negative-offset', '1996-12-19T16:39:57-08:00', '1996-12-20T00:39:57Z'],
    ['positive-offset-and-fraction', '1937-01-01T12:00:27.87+00:20', '1937-01-01T11:40:27.87Z'],
    ['nanosecond-fraction', '2024-02-29T23:59:59.123456789Z', '2024-02-29T23:59:59.123456789Z'],
    ['leap-second-normalized-by-Temporal', '2024-02-29T12:34:60Z', '2024-02-29T12:34:59Z'],
  ];

  for (const [id, input, expected] of valid) {
    await t.test(id, () => {
      const parsed = parseRFC3339(input);
      assert.equal(parsed.toInstant().toString(), expected);
    });
  }

  for (const [id, input] of [
    ['missing-offset', '2024-02-29T12:34:56'],
    ['missing-seconds', '2024-02-29T12:34Z'],
    ['space-instead-of-T', '2024-02-29 12:34:56Z'],
    ['fraction-over-nanosecond-precision', '2024-02-29T12:34:56.1234567890Z'],
    ['invalid-calendar-date', '2023-02-29T12:34:56Z'],
  ]) {
    await t.test(`rejects ${id}`, () => {
      assert.throws(() => parseRFC3339(input), Error);
    });
  }

  await t.test('formats an Instant using the RFC 3339 UTC form', () => {
    const instant = Temporal.Instant.from('1997-07-16T19:20:30Z');
    assert.equal(formatRFC3339(instant), '1997-07-16T19:20:30Z');
  });
});

test('RFC 2822 and HTTP-date interoperability vectors', async (t) => {
  const instant = '1994-11-06T08:49:37Z';
  const httpDates = [
    ['IMF-fixdate', 'Sun, 06 Nov 1994 08:49:37 GMT'],
    ['obsolete RFC 850 form', 'Sunday, 06-Nov-94 08:49:37 GMT'],
    ['obsolete asctime form', 'Sun Nov  6 08:49:37 1994'],
  ];

  for (const [id, input] of httpDates) {
    await t.test(id, () => {
      assert.equal(parseHTTPDate(input).toString(), instant);
      assert.equal(formatHTTPDate(parseHTTPDate(input)), 'Sun, 06 Nov 1994 08:49:37 GMT');
    });
  }

  await t.test('RFC 2822 numeric offset is converted to the corresponding instant', () => {
    const parsed = parseRFC2822('Fri, 21 Nov 1997 09:55:06 -0600');
    assert.equal(parsed.toString(), '1997-11-21T15:55:06Z');
    assert.equal(formatRFC2822(parsed), 'Fri, 21 Nov 1997 15:55:06 +0000');
  });

  await t.test('RFC 2822 rejects an ISO date that Date.parse would otherwise accept', () => {
    assert.throws(() => parseRFC2822('2024-02-29'), Error);
  });

  await t.test('HTTP-date rejects a value outside its supported date grammar', () => {
    assert.throws(() => parseHTTPDate('not an HTTP date'), Error);
  });
});

test('ISO 8601 duration reference vectors', async (t) => {
  const valid = ['P0D', 'P3Y6M4DT12H30M5S', 'P1W', 'PT36H', '-PT30S', '-P2DT3H', 'PT1.5H'];
  for (const input of valid) {
    await t.test(input, () => {
      assert.equal(formatISODuration(parseISODuration(input)), input);
    });
  }

  for (const input of ['P', 'PT', 'P1M2Y', 'PT1Sx']) {
    await t.test(`rejects ${input}`, () => {
      assert.throws(() => parseISODuration(input), Error);
    });
  }

  await t.test('normalizes the parser extension P1YT', () => {
    assert.equal(formatISODuration(parseISODuration('P1YT')), 'P1Y');
  });
});

test('RFC 5545 recurrence vectors for the supported RRULE subset', async (t) => {
  const vectors = [
    {
      id: 'daily-weekdays',
      start: '1997-09-02',
      rule: 'FREQ=DAILY;COUNT=5;BYDAY=MO,TU,WE,TH,FR',
      expected: ['1997-09-02', '1997-09-03', '1997-09-04', '1997-09-05', '1997-09-08'],
    },
    {
      id: 'alternate-weeks-on-tuesday-and-thursday',
      start: '1997-09-02',
      rule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=5;BYDAY=TU,TH',
      expected: ['1997-09-02', '1997-09-04', '1997-09-16', '1997-09-18', '1997-09-30'],
    },
    {
      id: 'first-friday-of-month',
      start: '1997-09-01',
      rule: 'FREQ=MONTHLY;COUNT=4;BYDAY=1FR',
      expected: ['1997-09-05', '1997-10-03', '1997-11-07', '1997-12-05'],
    },
    {
      id: 'last-friday-of-month',
      start: '2026-01-01',
      rule: 'FREQ=MONTHLY;COUNT=4;BYDAY=-1FR',
      expected: ['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24'],
    },
    {
      id: 'twentieth-monday-of-year',
      start: '2026-01-01',
      rule: 'FREQ=YEARLY;COUNT=2;BYDAY=20MO',
      expected: ['2026-05-18', '2027-05-17'],
    },
    {
      id: 'plain-and-ordinal-byday-union',
      start: '2026-01-01',
      rule: 'FREQ=MONTHLY;COUNT=8;BYDAY=MO,2FR',
      expected: ['2026-01-05', '2026-01-09', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-13'],
    },
    {
      id: 'last-day-of-month',
      start: '2026-01-01',
      rule: 'FREQ=MONTHLY;COUNT=5;BYMONTHDAY=-1',
      expected: ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'],
    },
    {
      id: 'leap-day-yearly',
      start: '2024-02-29',
      rule: 'FREQ=YEARLY;COUNT=3;BYMONTH=2;BYMONTHDAY=29',
      expected: ['2024-02-29', '2028-02-29', '2032-02-29'],
    },
  ];

  for (const vector of vectors) {
    await t.test(vector.id, () => {
      assert.deepEqual(
        occurrences(vector.start, vector.rule, vector.expected.length),
        vector.expected,
      );
    });
  }

  await t.test('UNTIL date is inclusive', () => {
    assert.deepEqual(
      occurrences('2026-01-01', 'FREQ=DAILY;UNTIL=20260103', 10),
      ['2026-01-01', '2026-01-02', '2026-01-03'],
    );
  });

  await t.test('EXDATE removes a matching recurrence occurrence', () => {
    const start = Temporal.PlainDate.from('2026-01-01');
    const rule = {
      ...parseRRule('FREQ=DAILY'),
      exDates: [Temporal.PlainDate.from('2026-01-02')],
    };
    assert.deepEqual(
      take(recurrence(start, rule), 4).map(ymd),
      ['2026-01-01', '2026-01-03', '2026-01-04', '2026-01-05'],
    );
  });

  await t.test('canonical serialization preserves the supported RFC rule fields', () => {
    const parsed = parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=MO,2FR;COUNT=6;BYMONTH=1,7');
    assert.equal(
      formatRRule(parsed),
      'FREQ=MONTHLY;INTERVAL=2;COUNT=6;BYDAY=MO,2FR;BYMONTH=1,7',
    );
  });
});

test('IANA tzdb transition reference vectors', async (t) => {
  const nyGap = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };
  const nyOverlap = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };

  await t.test('New York spring gap has no possible instant', () => {
    assert.equal(possibleInstantsFor({ ...nyGap, second: 0, millisecond: 0 }, 'America/New_York').length, 0);
    assert.equal(
      resolveZoned(nyGap, 'America/New_York', { disambiguation: 'earlier' }).toString(),
      '2026-03-08T01:30:00-05:00[America/New_York]',
    );
    assert.equal(
      resolveZoned(nyGap, 'America/New_York', { disambiguation: 'later' }).toString(),
      '2026-03-08T03:30:00-04:00[America/New_York]',
    );
  });

  await t.test('New York fall overlap has two distinct instants', () => {
    const possible = possibleInstantsFor({ ...nyOverlap, second: 0, millisecond: 0 }, 'America/New_York');
    assert.equal(possible.length, 2);
    assert.deepEqual(possible.map(getOffset), ['-04:00', '-05:00']);
  });

  await t.test('Lord Howe spring transition advances by thirty minutes', () => {
    assert.equal(
      resolveZoned(
        { year: 2026, month: 10, day: 4, hour: 2, minute: 15 },
        'Australia/Lord_Howe',
        { disambiguation: 'later' },
      ).toString(),
      '2026-10-04T02:45:00+11:00[Australia/Lord_Howe]',
    );
  });

  await t.test('Sydney seasonal offsets identify southern-hemisphere DST', () => {
    const summer = Temporal.ZonedDateTime.from('2026-01-15T12:00[Australia/Sydney]');
    const winter = Temporal.ZonedDateTime.from('2026-07-15T12:00[Australia/Sydney]');
    assert.equal(getOffset(summer), '+11:00');
    assert.equal(isDST(summer), true);
    assert.equal(getOffset(winter), '+10:00');
    assert.equal(isDST(winter), false);
  });

  await t.test('Apia skipped civil date has no possible instant', () => {
    assert.equal(
      possibleInstantsFor(
        { year: 2011, month: 12, day: 30, hour: 12, minute: 0, second: 0, millisecond: 0 },
        'Pacific/Apia',
      ).length,
      0,
    );
  });

  await t.test('historical New York local mean time retains offset seconds', () => {
    const historical = Temporal.ZonedDateTime.from('1880-01-01T12:00[America/New_York]');
    assert.equal(getOffset(historical), '-04:56:02');
  });
});

test('chrono-node-style relative date phrases in supported locales', async (t) => {
  const reference = Temporal.PlainDate.from('2026-08-04');
  const vectors = [
    ['en', 'tomorrow', '2026-08-05'],
    ['en', 'in 3 days', '2026-08-07'],
    ['en', '2 weeks ago', '2026-07-21'],
    ['en', 'next Friday', '2026-08-07'],
    ['en', 'March 5th', '2027-03-05'],
    ['es', 'hace 2 semanas', '2026-07-21'],
    ['es', 'el próximo viernes', '2026-08-07'],
    ['fr', 'dans 3 jours', '2026-08-07'],
    ['fr', 'vendredi prochain', '2026-08-07'],
    ['de', 'in 3 Tagen', '2026-08-07'],
    ['de', 'nächsten Freitag', '2026-08-07'],
  ];

  for (const [locale, phrase, expected] of vectors) {
    await t.test(`${locale}: ${phrase}`, () => {
      assert.equal(parseRelative(phrase, reference, { locale }).toString(), expected);
    });
  }
});

test('Test262-relevant Temporal boundary behavior at the library API', async (t) => {
  const dates = [
    ['Gregorian leap day 2000', '2000-02-29', '2000-02-29'],
    ['century year 1900 is not leap', '1900-03-01', '1900-03-01'],
    ['year zero', '0000-01-01', '0000-01-01'],
  ];

  for (const [id, input, expected] of dates) {
    await t.test(id, () => {
      const value = Temporal.PlainDate.from(input);
      assert.equal(format(value, 'yyyy-MM-dd'), expected);
      assert.equal(format(parse('yyyy-MM-dd', expected), 'yyyy-MM-dd'), expected);
    });
  }
});
