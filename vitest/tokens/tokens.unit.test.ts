import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { pad, DEFAULT_LOCALE, fieldOf, type TemporalLike } from '../../src/tokens/tokens.js';
import { format } from '../../src/format/format.js';
import { registerLocaleVocab } from '../../src/locale/localeVocab.js';
import { FormatSyntaxError, InvalidLocaleError } from '../../src/core/errors.js';

setTemporal(Temporal);

// node --test only ever sees pad() indirectly, through format() output
// on the dist build. These call it directly, so a broken sign or
// padding case shows up as a pad() failure, not a wrong date string
// three layers up.
describe('pad', () => {
  it('left-pads positive numbers with zeros to the given length', () => {
    expect(pad(5, 2)).toBe('05');
    expect(pad(45, 2)).toBe('45');
  });

  it('does not truncate when the number already exceeds the target length', () => {
    expect(pad(12345, 2)).toBe('12345');
  });

  it('keeps the sign outside the padded digits for negative numbers', () => {
    // len applies to the digit string itself, not the total output —
    // the sign is prepended after padding, so it adds to the width
    // rather than eating into it
    expect(pad(-45, 4)).toBe('-0045');
    expect(pad(-5, 2)).toBe('-05');
  });

  it('pads zero as a plain positive value, no sign', () => {
    expect(pad(0, 3)).toBe('000');
  });

  it('handles length 0 as a no-op pad', () => {
    expect(pad(7, 0)).toBe('7');
  });
});

describe('DEFAULT_LOCALE', () => {
  it('is en-US', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
  });
});

// ---------------------------------------------------------------------------
// Helper/infrastructure coverage additions (task 2-a1c). Cases above are
// untouched; everything below drives the non-TOKENS-table helpers in
// src/tokens.ts (monthOf, fieldOf, getFormatter, the 1582 cutover guard,
// intlPart's input arms, dayPeriodPart/localeAwareName custom vocabs,
// formatOffset) through format() or their exported entry points.
// ---------------------------------------------------------------------------

describe('fieldOf / monthOf (monthCode resolution)', () => {
  it('reads the numeric month directly when present', () => {
    expect(fieldOf({ month: 5, calendarId: 'iso8601' }, 'month')).toBe(5);
  });

  it('resolves an iso8601/gregory monthCode like "M12" to its month number', () => {
    expect(fieldOf({ monthCode: 'M12', calendarId: 'iso8601' }, 'month')).toBe(12);
    expect(fieldOf({ monthCode: 'M12', calendarId: 'gregory' }, 'month')).toBe(12);
  });

  it('returns undefined for a non-ISO calendar monthCode or a non-matching code', () => {
    // PlainMonthDay-style object carrying a non-iso8601/gregory calendar:
    // monthCode is calendar-specific there, so it must not be trusted.
    expect(fieldOf({ monthCode: 'M05', calendarId: 'hebrew' }, 'month')).toBeUndefined();
    // leap-month-style code doesn't match ^M(\d{2})$ even under iso8601
    expect(fieldOf({ monthCode: 'M05L', calendarId: 'iso8601' }, 'month')).toBeUndefined();
  });

  it('answers non-month fields straight off the object', () => {
    expect(fieldOf({ year: 2026 }, 'year')).toBe(2026);
  });

  it('resolves a real PlainMonthDay monthCode through format()', () => {
    expect(format(Temporal.PlainMonthDay.from('05-15'), 'M')).toBe('5');
  });

  it('surfaces the missing month through format() for a non-ISO monthCode bag', () => {
    // monthOf() yields undefined, so format()'s precheck throws its usual
    // missing-field error instead of feeding undefined into the math.
    expect(() => format({ monthCode: 'M05', calendarId: 'hebrew' }, 'MM')).toThrow(FormatSyntaxError);
  });
});

describe('pad.fraction (S…SSSSSSSSS tokens)', () => {
  it('slices the 9-digit nanosecond-of-second value to the token width', () => {
    const pdt = Temporal.PlainDateTime.from('2026-08-04T15:45:30.123456789');
    expect(format(pdt, 'S')).toBe('1');
    expect(format(pdt, 'SSS')).toBe('123');
    expect(format(pdt, 'SSSSSSSSS')).toBe('123456789');
  });

  it('treats missing micro/nanosecond fields as zero', () => {
    // a bag with only millisecond exercises both `?? 0` fallbacks
    expect(format({ millisecond: 5 }, 'S')).toBe('0');
    expect(format({ millisecond: 5 }, 'SSS')).toBe('005');
  });
});

describe('requireFields (ww/RRRR/D/DD/DDD deep field precheck)', () => {
  it('formats ww/RRRR when year, month, day and dayOfWeek are all present', () => {
    const d = Temporal.PlainDate.from('2026-01-01'); // ISO week 1 of 2026
    expect(format(d, 'ww')).toBe('01');
    expect(format(d, 'RRRR')).toBe('2026');
  });

  it('throws when a field beyond the TOKENS-table entry is missing', () => {
    // first required field missing (year) — dayOfWeek-only / day-only bags
    expect(() => format({ dayOfWeek: 4 }, 'ww')).toThrow(/token "ww" requires "year"/);
    expect(() => format({ day: 1 }, 'D')).toThrow(/token "D" requires "year"/);
    // second required field missing (month) — the loop continues past year
    expect(() => format({ year: 2026, day: 1, dayOfWeek: 4 }, 'RRRR')).toThrow(/token "RRRR" requires "month"/);
    expect(() => format({ year: 2026, day: 1 }, 'DD')).toThrow(/token "DD" requires "month"/);
  });

  it('formats day-of-year tokens at all three widths', () => {
    const d = Temporal.PlainDate.from('2026-01-01'); // day 1 of the year
    expect(format(d, 'D')).toBe('1');
    expect(format(d, 'DD')).toBe('01');
    expect(format(d, 'DDD')).toBe('001');
  });
});

describe('getFormatter (Intl formatter cache)', () => {
  it('returns the cached formatter on a repeat call', () => {
    const pm = Temporal.PlainTime.from('15:00');
    expect(format(pm, 'a')).toBe('PM');
    expect(format(pm, 'a')).toBe('PM'); // same locale + options → cache hit
  });

  it('throws InvalidLocaleError for a malformed locale tag', () => {
    // reached via dayPeriodPart ('a'): getFormatter converts Intl's bare
    // RangeError into the library's typed error
    expect(() => format(Temporal.PlainTime.from('03:00'), 'a', { locale: 'not a locale!' })).toThrow(InvalidLocaleError);
  });

  it('evicts the oldest entry once the cache passes 500 formatters', () => {
    const am = Temporal.PlainTime.from('03:00');
    // 520 syntactically-valid distinct tags (3-digit numeric regions),
    // one formatter cache entry each — pushes the map past MAX_CACHE_SIZE
    // (500), so the oldest-insertion eviction path runs on every insert
    // past the cap. Each tag's ICU fallback renders the day period
    // differently ('AM' / 'am' / 'a.m.'), so only assert non-empty output —
    // the cache behavior is the point, not any particular locale's string.
    for (let i = 0; i < 520; i++) {
      expect(format(am, 'a', { locale: `en-${100 + i}` })).toMatch(/^\S+$/);
    }
    // the earliest keys were evicted along the way; re-formatting one
    // rebuilds its entry and still produces correct output
    expect(format(am, 'a', { locale: 'en-100' })).toMatch(/^\S+$/);
  });
});

describe('pre-1582 cutover guard (isBeforeGregorianCutover)', () => {
  it('routes pre-cutover month names through the safe reference lookup', () => {
    const d = Temporal.PlainDate.from('1500-06-01'); // year < 1582
    expect(format(d, 'MMMM')).toBe('June');
    expect(format(d, 'MMMM')).toBe('June'); // second call: formatter cache hit
  });

  it('routes pre-cutover weekday names through the safe reference lookup', () => {
    // 1500-06-01 is dayOfWeek 5 (Friday); the name comes from the
    // 2024-01-01-anchored reference week, not from ICU's Julian date math
    expect(format(Temporal.PlainDate.from('1500-06-01'), 'EEEE')).toBe('Friday');
  });

  it('formats post-cutover dates through Intl directly', () => {
    expect(format(Temporal.PlainDate.from('1600-06-01'), 'MMMM')).toBe('June'); // year > 1582
  });

  it('compares month within year 1582', () => {
    expect(format(Temporal.PlainDate.from('1582-09-10'), 'MMMM')).toBe('September'); // month < 10 → pre-cutover
    expect(format(Temporal.PlainDate.from('1582-11-10'), 'MMMM')).toBe('November'); // month > 10 → post-cutover
  });

  it('compares day within October 1582', () => {
    expect(format(Temporal.PlainDate.from('1582-10-14'), 'MMMM')).toBe('October'); // day < 15 → pre-cutover
    expect(format(Temporal.PlainDate.from('1582-10-15'), 'MMMM')).toBe('October'); // day >= 15 → post-cutover
  });
});

describe('intlPart input arms', () => {
  it('formats a PlainYearMonth by rendering its toPlainDate({ day: 1 })', () => {
    // year but no day + iso8601 calendar + toPlainDate → convert to the
    // first of the month, which Intl accepts with the forced gregory
    expect(format(Temporal.PlainYearMonth.from('2020-05'), 'MMMM')).toBe('May');
  });

  it('formats a PlainMonthDay month name without a year (isMonthDay → reference lookup)', () => {
    // no year → NaN-tolerant cutover check says "not before", but the
    // isMonthDay arm routes it to the reference lookup anyway
    expect(format(Temporal.PlainMonthDay.from('05-15'), 'MMMM')).toBe('May');
  });

  it('passes a non-ISO calendar through to Intl instead of forcing gregory', () => {
    const hebrew = Temporal.PlainDate.from('2020-05-01').withCalendar('hebrew');
    expect(format(hebrew, 'MMMM')).toBe('Iyar');
  });

  it('forces gregory for a duck-typed object with no calendarId', () => {
    // calendarId undefined → `calendar && …` falls to 'gregory'
    const mock: TemporalLike = { year: 2020, month: 5, dayOfWeek: 2, toLocaleString: () => 'MockMonth' };
    expect(format(mock, 'MMMM')).toBe('MockMonth');
  });

  it('skips the PlainYearMonth conversion when toPlainDate is absent', () => {
    // iso8601 + year + no day, but no toPlainDate function → duck-typing
    // fails and the object goes through as-is
    const mock: TemporalLike = { calendarId: 'iso8601', year: 2020, month: 5, toLocaleString: () => 'MockYearMonth' };
    expect(format(mock, 'MMMM')).toBe('MockYearMonth');
  });

  it('throws a descriptive error for a field bag (no toLocaleString)', () => {
    expect(() => format({ year: 2020, month: 5, day: 1 }, 'MMMM')).toThrow(
      /needs a value that implements toLocaleString/
    );
  });

  it('throws the same error when toLocaleString is Object.prototype\'s', () => {
    // a plain bag inherits Object.prototype.toLocaleString, which would
    // silently return "[object Object]" — the guard rejects it by identity
    const bag: TemporalLike = { year: 2020, month: 5, day: 1, toLocaleString: Object.prototype.toLocaleString };
    expect(() => format(bag, 'MMMM')).toThrow(/needs a value that implements toLocaleString/);
  });

  it('throws when Intl returns no requested part for a ZonedDateTime', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    const zoned = Temporal.ZonedDateTime.from('2026-08-04T00:00[UTC]');
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      value: class {
        formatToParts() { return []; }
      },
    });
    try {
      expect(() => format(zoned, 'MMMM', { locale: 'en-US-x-no-parts' }))
        .toThrow(/produced no "month" part/);
    } finally {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        writable: true,
        value: originalDateTimeFormat,
      });
    }
  });

  it('extracts month names from ZonedDateTime Intl parts', () => {
    const zoned = Temporal.ZonedDateTime.from('2026-08-04T00:00[UTC]');
    expect(format(zoned, 'MMMM', { locale: 'en-US' })).toBe('August');
    expect(format(zoned, 'MMMM', { locale: 'ja-JP' })).toBe('8月');
  });

  it('merges a non-whitespace literal before a ZonedDateTime part', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    const zoned = Temporal.ZonedDateTime.from('2026-08-04T00:00[UTC]');
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      value: class {
        formatToParts() {
          return [
            { type: 'literal', value: 'prefix' },
            { type: 'month', value: '8' },
          ];
        }
      },
    });
    try {
      expect(format(zoned, 'MMMM', { locale: 'en-US-x-prefix' })).toBe('prefix8');
    } finally {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        writable: true,
        value: originalDateTimeFormat,
      });
    }
  });

  it('rethrows a RangeError from toLocaleString after ruling the locale out', () => {
    // toLocaleString threw a RangeError, but the locale is fine, so the
    // original error is rethrown rather than blamed on the locale
    const mock: TemporalLike = {
      year: 2020, month: 5, dayOfWeek: 2,
      toLocaleString: () => { throw new RangeError('boom'); },
    };
    expect(() => format(mock, 'MMMM')).toThrow(RangeError);
  });

  it('rethrows non-RangeErrors from toLocaleString unchanged', () => {
    const mock: TemporalLike = {
      year: 2020, month: 5, dayOfWeek: 2,
      toLocaleString: () => { throw new TypeError('boom'); },
    };
    expect(() => format(mock, 'MMMM')).toThrow(new TypeError('boom'));
  });

  it('era parts skip the month/weekday cutover guard entirely', () => {
    // on this runtime the polyfill's toLocaleString can't isolate the era
    // part, so the whole locale string comes back — the era name being
    // present at all is the point (the cutover guard is month/weekday only)
    expect(format(Temporal.PlainDate.from('2020-05-01'), 'GGGG')).toContain('Anno Domini');
    expect(format(Temporal.PlainDate.from('2020-05-01'), 'G')).toContain('AD');
  });
});

// A custom vocab for a locale Intl doesn't cover — registered once at
// module scope; every test below reads it back through format().
registerLocaleVocab('xx-XX', {
  monthLong: ['Month01', 'Month02', 'Month03', 'Month04', 'Month05', 'Month06',
    'Month07', 'Month08', 'Month09', 'Month10', 'Month11', 'Month12'],
  monthShort: ['Mo01', 'Mo02', 'Mo03', 'Mo04', 'Mo05', 'Mo06',
    'Mo07', 'Mo08', 'Mo09', 'Mo10', 'Mo11', 'Mo12'],
  weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
  weekdayShort: ['Dy1', 'Dy2', 'Dy3', 'Dy4', 'Dy5', 'Dy6', 'Dy7'],
  dayPeriod: ['ante meridiem', 'post meridiem'],
});

describe('dayPeriodPart with a custom vocab', () => {
  it('reads the registered AM entry before noon', () => {
    expect(format(Temporal.PlainTime.from('03:00'), 'a', { locale: 'xx-XX' })).toBe('ante meridiem');
  });

  it('reads the registered PM entry from noon on', () => {
    expect(format(Temporal.PlainTime.from('15:00'), 'a', { locale: 'xx-XX' })).toBe('post meridiem');
  });
});

describe('localeAwareName with a custom vocab', () => {
  it('reads the registered month array for MMMM', () => {
    expect(format(Temporal.PlainDate.from('2026-08-04'), 'MMMM', { locale: 'xx-XX' })).toBe('Month08');
  });

  it('reads the registered weekday array for EEEE', () => {
    // 2026-08-04 is a Tuesday → dayOfWeek 2 → weekdayLong[1]
    expect(format(Temporal.PlainDate.from('2026-08-04'), 'EEEE', { locale: 'xx-XX' })).toBe('Day2');
  });

  it('falls back to intlPart when the month index is outside the array', () => {
    // month 13 → index 12, past the end of the 12-entry monthLong array
    const beyond: TemporalLike = { year: 2020, month: 13, dayOfWeek: 2, toLocaleString: () => 'Beyond' };
    expect(format(beyond, 'MMMM', { locale: 'xx-XX' })).toBe('Beyond');
    // month 0 → index -1, below the start of the array
    const below: TemporalLike = { year: 2020, month: 0, dayOfWeek: 2, toLocaleString: () => 'Below' };
    expect(format(below, 'MMMM', { locale: 'xx-XX' })).toBe('Below');
  });
});

describe('formatOffset (X/XX/XXX/x/xx/xxx tokens)', () => {
  const utc = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  const ny = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[America/New_York]');

  it('collapses a zero offset to Z for the uppercase variants', () => {
    expect(format(utc, 'X')).toBe('Z');
    expect(format(utc, 'XX')).toBe('Z');
    expect(format(utc, 'XXX')).toBe('Z');
  });

  it('keeps a zero offset numeric for the lowercase variants', () => {
    expect(format(utc, 'x')).toBe('+00'); // minutes are 00 → omitted
    expect(format(utc, 'xx')).toBe('+0000');
    expect(format(utc, 'xxx')).toBe('+00:00');
  });

  it('formats a non-zero offset at every width', () => {
    expect(format(ny, 'X')).toBe('-04'); // minutes 00 → omitted
    expect(format(ny, 'XX')).toBe('-0400');
    expect(format(ny, 'XXX')).toBe('-04:00');
    expect(format(ny, 'x')).toBe('-04');
    expect(format(ny, 'xx')).toBe('-0400');
    expect(format(ny, 'xxx')).toBe('-04:00');
  });

  it('keeps non-zero minutes on a single X/x', () => {
    const kolkata = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[Asia/Calcutta]');
    expect(format(kolkata, 'X')).toBe('+0530');
  });

  it('passes a seconds-carrying LMT offset through on xxx but throws on X', () => {
    // pre-1883 America/New_York surfaces a ±HH:MM:SS local-mean-time offset
    const lmt = Temporal.ZonedDateTime.from('1880-06-01T12:00[America/New_York]');
    expect(format(lmt, 'xxx')).toBe('-04:56:02');
    expect(() => format(lmt, 'X')).toThrow(/seconds component/);
  });
});