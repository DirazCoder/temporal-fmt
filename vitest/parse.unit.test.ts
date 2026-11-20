import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { parse, safeParse, tryParse, parseToParts, compileParser } from '../src/parse.js';
import { registerLocaleVocab } from '../src/localeVocab.js';
import {
  AmbiguousInputError,
  FormatSyntaxError,
  InvalidDateError,
  InvalidLocaleError,
  InvalidOffsetError,
  InvalidTimeZoneError,
  ParseMismatchError,
  UnknownTokenError,
} from '../src/errors.js';

setTemporal(Temporal);

describe('parse', () => {
  it('parses a matching input against a format string', () => {
    const result = parse('yyyy-MM-dd', '2026-08-04') as Temporal.PlainDate;
    expect(result.toString()).toBe('2026-08-04');
  });
});

describe('safeParse / tryParse', () => {
  it('safeParse returns a typed error result instead of throwing on a mismatch', () => {
    const result = safeParse('yyyy-MM-dd', 'garbage');
    expect(result.ok).toBe(false);
  });

  it('tryParse returns undefined instead of throwing on a mismatch', () => {
    expect(tryParse('yyyy-MM-dd', 'garbage')).toBeUndefined();
  });
});

describe('parseToParts', () => {
  it('reports each matched token with its raw text and position', () => {
    const parts = parseToParts('yyyy-MM-dd', '2026-08-04');
    expect(parts).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'MM', raw: '08', position: 5 },
      { token: 'dd', raw: '04', position: 8 },
    ]);
  });
});

describe('compileParser', () => {
  it('produces a reusable parser that matches the one-shot parse() output', () => {
    const compiled = compileParser('yyyy-MM-dd');
    expect((compiled.parse('2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });
});

// ---------------------------------------------------------------------
// year tokens: yyyy / y / yy (+ two-digit pivot, negative years, and the
// yyyy+yy contradiction branch in resolveYear)
// ---------------------------------------------------------------------

describe('parse: year tokens', () => {
  it('parses yyyy including negative years', () => {
    // YYYY_EXTENDED fragment keeps the leading "-" for BCE years
    const neg = parse('yyyy-MM-dd', '-0044-03-15') as Temporal.PlainDate;
    expect(neg.year).toBe(-44);
    expect(neg.month).toBe(3);
    expect(neg.day).toBe(15);
  });

  it('parses the unpadded y token (any width, positive and negative)', () => {
    // Y_FRAGMENT '-?\d+' — unpadded sibling of yyyy
    const five = parse('y-M-d', '12345-3-15') as Temporal.PlainDate;
    expect(five.year).toBe(12345);
    const neg = parse('y-M-d', '-44-3-15') as Temporal.PlainDate;
    expect(neg.year).toBe(-44);
    expect((parse('y-M-d', '2026-8-4') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('pivots yy via the strptime rule: 00-68 -> 20xx, 69-99 -> 19xx', () => {
    expect((parse('yy-MM-dd', '68-05-01') as Temporal.PlainDate).toString()).toBe('2068-05-01');
    expect((parse('yy-MM-dd', '69-01-02') as Temporal.PlainDate).toString()).toBe('1969-01-02');
    expect((parse('yy-MM-dd', '00-01-01') as Temporal.PlainDate).toString()).toBe('2000-01-01');
    expect((parse('yy-MM-dd', '99-01-02') as Temporal.PlainDate).toString()).toBe('1999-01-02');
  });

  it('rejects a format that mixes a full-year token with yy', () => {
    // resolveYear: both fields present -> FormatSyntaxError (format's fault)
    expect(() => parse('yyyy yy', '2026 26')).toThrow(FormatSyntaxError);
    expect(() => parse('yyyy yy', '2026 26')).toThrow(/mixes a full-year token/);
    expect(() => parse('y yy', '2026 26')).toThrow(FormatSyntaxError);
  });
});

// ---------------------------------------------------------------------
// month tokens: M/MM numeric, MMMM/MMM names (Intl vocab + custom locale)
// ---------------------------------------------------------------------

describe('parse: month tokens', () => {
  it('parses padded and unpadded numeric months', () => {
    expect((parse('MM/dd/yyyy', '08/04/2026') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parse('yyyy-M-d', '2026-8-4') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('parses MMMM and MMM month names against the locale vocab', () => {
    expect((parse('MMMM d, yyyy', 'August 4, 2026') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parse('MMM d, yyyy', 'Aug 4, 2026') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    // month names are matched case-sensitively (only 'a' folds case)
    expect(() => parse('MMMM d, yyyy', 'august 4, 2026')).toThrow(ParseMismatchError);
  });

  it('parses month names in a non-default locale', () => {
    // options.locale ?? DEFAULT_LOCALE branch + vocab for a real locale
    expect((parse('d MMMM yyyy', '4 Januar 2026', { locale: 'de-DE' }) as Temporal.PlainDate).toString()).toBe('2026-01-04');
  });

  it('rejects month 13 and month 0 as shape mismatches', () => {
    // MM/M regex fragments only accept 01-12, so out-of-range months fail at
    // the regex stage with ParseMismatchError, not InvalidDateError
    expect(() => parse('yyyy-MM-dd', '2026-13-01')).toThrow(ParseMismatchError);
    expect(() => parse('yyyy-M-d', '2026-0-4')).toThrow(ParseMismatchError);
  });
});

// ---------------------------------------------------------------------
// day tokens: d/dd + invalid calendar dates (Feb 30, Apr 31) + hour 24
// ---------------------------------------------------------------------

describe('parse: day tokens and invalid dates', () => {
  it('parses padded and unpadded days', () => {
    expect((parse('yyyy-MM-dd', '2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parse('yyyy-M-d', '2026-8-4') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it("wraps Temporal overflow 'reject' errors as InvalidDateError", () => {
    // catch around the construction calls rethrows InvalidDateError
    expect(() => parse('yyyy-MM-dd', '2026-02-30')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM-dd', '2026-02-30')).toThrow(/doesn't describe a valid date\/time/);
    expect(() => parse('yyyy-MM-dd', '2026-04-31')).toThrow(InvalidDateError); // 31st in a 30-day month
    expect(() => parse('yyyy-MM-dd', '2026-02-29')).toThrow(InvalidDateError); // non-leap year
  });

  it('rejects hour 24 as a shape mismatch (HH caps at 23 in the regex)', () => {
    expect(() => parse('HH:mm', '24:00')).toThrow(ParseMismatchError);
  });

  it('rejects an incomplete date (any date part requires year+month+day)', () => {
    expect(() => parse('yyyy-MM', '2026-08')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM', '2026-08')).toThrow(/incomplete date/);
    expect(() => parse('MM', '08')).toThrow(InvalidDateError); // month-only
    expect(() => parse('dd', '04')).toThrow(InvalidDateError); // day-only
  });

  it('rejects format-only tokens with UnknownTokenError', () => {
    // do (ordinal day) and D (day of year) exist on the format side only
    expect(() => parse('do MMMM', '4th August')).toThrow(UnknownTokenError);
    expect(() => parse('yyyy-DDD', '2026-216')).toThrow(UnknownTokenError);
  });
});

// ---------------------------------------------------------------------
// weekday tokens: EEEE/EEE cross-check against the parsed date
// ---------------------------------------------------------------------

describe('parse: weekday tokens', () => {
  it('parses EEEE/EEE and validates them against the actual date', () => {
    // 2026-08-04 is a Tuesday
    expect((parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parse('yyyy-MM-dd EEE', '2026-08-04 Tue') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('throws InvalidDateError when the weekday name contradicts the date', () => {
    expect(() => parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04')).toThrow(InvalidDateError);
    expect(() => parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04')).toThrow(
      /doesn't match the actual weekday \(Tuesday\)/,
    );
    expect(() => parse('yyyy-MM-dd EEE', '2026-08-04 Mon')).toThrow(InvalidDateError);
  });

  it('requires a full date to validate a weekday token against', () => {
    // weekday token + time only: no date to cross-check -> FormatSyntaxError
    expect(() => parse('EEE HH:mm', 'Tue 15:45')).toThrow(FormatSyntaxError);
    expect(() => parse('EEE HH:mm', 'Tue 15:45')).toThrow(/needs a full date/);
  });
});

// ---------------------------------------------------------------------
// quarter tokens: Q (digit) and QQQ ("Q" + digit), cross-checked vs month
// ---------------------------------------------------------------------

describe('parse: quarter tokens', () => {
  it('parses Q and QQQ and accepts them when they agree with the month', () => {
    // month 8 -> Q3
    expect((parse('yyyy-MM-dd Q', '2026-08-04 3') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parse('yyyy-MM-dd QQQ', '2026-08-04 Q3') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('throws InvalidDateError when the quarter disagrees with the month', () => {
    expect(() => parse('yyyy-MM-dd Q', '2026-08-04 2')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM-dd Q', '2026-08-04 2')).toThrow(/Q2\) disagrees/);
    expect(() => parse('yyyy-MM-dd QQQ', '2026-08-04 Q2')).toThrow(InvalidDateError);
  });

  it('ignores a quarter token when no month was parsed', () => {
    // quarter + time only: no month to compare against, still a valid time
    expect((parse('HH:mm Q', '15:45 3') as Temporal.PlainTime).toString()).toBe('15:45:00');
  });

  it('rejects a quarter-only format (no date or time tokens at all)', () => {
    expect(() => parse('Q', '3')).toThrow(FormatSyntaxError);
    expect(() => parse('Q', '3')).toThrow(/has no date or time tokens/);
    expect(() => parse('QQQ', 'Q3')).toThrow(FormatSyntaxError);
  });
});

// ---------------------------------------------------------------------
// hour/minute/second: H/HH, h/hh (+a), m/mm, s/ss and all resolveHour
// contradiction branches
// ---------------------------------------------------------------------

describe('parse: hour, minute and second tokens', () => {
  it('parses 24-hour H/HH and unpadded m/s', () => {
    expect((parse('HH:mm', '15:45') as Temporal.PlainTime).toString()).toBe('15:45:00');
    expect((parse('H:m:s', '9:5:3') as Temporal.PlainTime).toString()).toBe('09:05:03');
    // single-field parses: every ?? 0 default in timeFields
    expect((parse('HH', '15') as Temporal.PlainTime).toString()).toBe('15:00:00');
    expect((parse('mm', '05') as Temporal.PlainTime).toString()).toBe('00:05:00');
    expect((parse('ss', '30') as Temporal.PlainTime).toString()).toBe('00:00:30');
  });

  it('parses 12-hour hh/h with the a day-period token (case-insensitive)', () => {
    expect((parse('hh:mm a', '07:30 PM') as Temporal.PlainTime).toString()).toBe('19:30:00');
    expect((parse('hh:mm a', '07:30 am') as Temporal.PlainTime).toString()).toBe('07:30:00');
    expect((parse('hh:mm a', '12:05 AM') as Temporal.PlainTime).toString()).toBe('00:05:00');
    expect((parse('hh:mm a', '12:15 pm') as Temporal.PlainTime).toString()).toBe('12:15:00');
  });

  it('rejects a 12-hour token without a day-period token', () => {
    // resolveHour: hour12 set, isPM missing -> can't tell AM from PM
    expect(() => parse('hh:mm', '07:30')).toThrow(FormatSyntaxError);
    expect(() => parse('hh:mm', '07:30')).toThrow(/can't tell AM from PM/);
  });

  it('rejects mixing 24-hour tokens with a day-period token', () => {
    expect(() => parse('HH:mm a', '15:45 PM')).toThrow(FormatSyntaxError);
    expect(() => parse('HH:mm a', '15:45 PM')).toThrow(/with a day-period token/);
  });

  it('rejects mixing 24-hour and 12-hour tokens in one format', () => {
    expect(() => parse('HH:mm hh:mm a', '15:45 03:45 PM')).toThrow(FormatSyntaxError);
    expect(() => parse('HH:mm hh:mm a', '15:45 03:45 PM')).toThrow(/with a 12-hour token/);
  });

  it('parses a full datetime as PlainDateTime', () => {
    const r = parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');
    expect(r instanceof Temporal.PlainDateTime).toBe(true);
    expect((r as Temporal.PlainDateTime).toString()).toBe('2026-08-04T15:45:00');
  });
});

// ---------------------------------------------------------------------
// fractional seconds: every S..SSSSSSSSS width (right-padded to 9 digits)
// ---------------------------------------------------------------------

describe('parse: fractional-second tokens', () => {
  it('treats the captured digits as leading digits of a nanosecond count', () => {
    // "5" under S means 500ms, not 5ns — padEnd(9, '0') before splitting
    expect((parse('HH:mm:ss.S', '15:45:30.5') as Temporal.PlainTime).toString()).toBe('15:45:30.5');
    expect((parse('HH:mm:ss.SSS', '15:45:30.123') as Temporal.PlainTime).toString()).toBe('15:45:30.123');
    expect((parse('HH:mm:ss.SSSSSS', '15:45:30.123456') as Temporal.PlainTime).toString()).toBe('15:45:30.123456');
    expect((parse('S', '5') as Temporal.PlainTime).toString()).toBe('00:00:00.5');
  });

  it('supports every S-token width S through SSSSSSSSS', () => {
    for (let w = 1; w <= 9; w++) {
      const fmt = 'HH:mm:ss.' + 'S'.repeat(w);
      const digits = '123456789'.slice(0, w);
      const r = parse(fmt, `15:45:30.${digits}`) as Temporal.PlainTime;
      expect(r.toString()).toBe(`15:45:30.${digits}`);
    }
  });
});

// ---------------------------------------------------------------------
// offset tokens X/XX/XXX/x/xx/xxx: parseOffsetString normalization, range
// checks and the zzz+offset cross-checks
// ---------------------------------------------------------------------

describe('parse: offset tokens', () => {
  it('parses Z for the uppercase variants as +00:00', () => {
    const r = parse('yyyy-MM-dd HH:mm:ss zzz X', '2026-08-04 15:45:30 UTC Z');
    expect((r as Temporal.ZonedDateTime).toString()).toBe('2026-08-04T15:45:30+00:00[UTC]');
  });

  it('parses +HH (two-digit body) for X and x', () => {
    expect((parse('yyyy-MM-dd HH:mm zzz X', '2026-08-04 15:45 Asia/Karachi +05') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+05:00[Asia/Karachi]',
    );
    expect((parse('yyyy-MM-dd HH:mm zzz x', '2026-08-04 15:45 Asia/Karachi +05') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+05:00[Asia/Karachi]',
    );
  });

  it('parses +HHMM (four-digit body) for X, x, XX and xx', () => {
    expect((parse('yyyy-MM-dd HH:mm zzz X', '2026-08-04 15:45 Asia/Calcutta +0530') as Temporal.ZonedDateTime).offset).toBe('+05:30');
    expect((parse('yyyy-MM-dd HH:mm zzz x', '2026-08-04 15:45 Asia/Calcutta +0530') as Temporal.ZonedDateTime).offset).toBe('+05:30');
    expect((parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 Asia/Calcutta +0530') as Temporal.ZonedDateTime).offset).toBe('+05:30');
    expect((parse('yyyy-MM-dd HH:mm zzz xx', '2026-08-04 15:45 Asia/Calcutta +0530') as Temporal.ZonedDateTime).offset).toBe('+05:30');
  });

  it('parses +HH:MM (colon body) for XXX and xxx', () => {
    expect((parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 Asia/Calcutta +05:30') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+05:30[Asia/Calcutta]',
    );
    expect((parse('yyyy-MM-dd HH:mm zzz xxx', '2026-08-04 15:45 Asia/Calcutta +05:30') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+05:30[Asia/Calcutta]',
    );
  });

  it('accepts the exact +14:00 and -12:00 boundary offsets', () => {
    expect((parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 Etc/GMT-14 +1400') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+14:00[Etc/GMT-14]',
    );
    expect((parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 Etc/GMT+12 -1200') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00-12:00[Etc/GMT+12]',
    );
    // -11:00 exercises the negative side without hitting the -12 boundary
    expect((parse('yyyy-MM-dd HH:mm zzz x', '2026-08-04 15:45 Etc/GMT+11 -1100') as Temporal.ZonedDateTime).offset).toBe('-11:00');
  });

  it('throws InvalidOffsetError for out-of-range offset pieces', () => {
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +1500')).toThrow(InvalidOffsetError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +1500')).toThrow(/hours 15 .* out of range/);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +0599')).toThrow(InvalidOffsetError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +0599')).toThrow(/minutes 99 .* out of range/);
  });

  it('throws InvalidOffsetError past the +14:00 / -12:00 boundary', () => {
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +1401')).toThrow(InvalidOffsetError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC +1401')).toThrow(/exceeds the maximum supported UTC offset/);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC -1201')).toThrow(InvalidOffsetError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XX', '2026-08-04 15:45 UTC -1201')).toThrow(
      /exceeds the maximum supported negative UTC offset/,
    );
  });

  it('resolves a DST fall-back overlap to the occurrence the offset picks', () => {
    // 2026-11-01 01:30 happens twice in New York; -04:00 = second (EDT)
    const r = parse('yyyy-MM-dd HH:mm zzz XXX', '2026-11-01 01:30 America/New_York -04:00') as Temporal.ZonedDateTime;
    expect(r.offset).toBe('-04:00');
    expect(r.epochNanoseconds).toBe(1793511000000000000n);
  });

  it('throws InvalidDateError when the wall-clock time falls in a DST gap', () => {
    // 2026-03-08 02:30 never happened in New York (spring forward)
    expect(() => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-03-08 02:30 America/New_York -05:00')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-03-08 02:30 America/New_York -05:00')).toThrow(/DST gap/);
  });

  it('throws when the offset token disagrees with the zone\'s actual offset', () => {
    // New York is -04:00 in August; +05:00 is not a NY offset. 'prefer'
    // silently falls back to the real offset, so the cross-check fires.
    expect(() => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 America/New_York +05:00')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 America/New_York +05:00')).toThrow(
      /actual offset at this date\/time is -04:00, not \+05:00/,
    );
  });

  it('rejects an offset token with no zzz zone token', () => {
    // an offset alone doesn't identify a zone — rewrapped InvalidDateError
    expect(() => parse('yyyy-MM-dd HH:mm XXX', '2026-08-04 15:45 +05:30')).toThrow(InvalidDateError);
    expect(() => parse('yyyy-MM-dd HH:mm XXX', '2026-08-04 15:45 +05:30')).toThrow(/has an offset token but no "zzz" zone token/);
  });

  it('rejects an offset token unless a full date and time are present', () => {
    expect(() => parse('HH:mm X', '15:45 Z')).toThrow(FormatSyntaxError);
    expect(() => parse('HH:mm X', '15:45 Z')).toThrow(/has an offset token .* but needs a full date and time/);
  });
});

// ---------------------------------------------------------------------
// zzz time-zone token: IANA ids, UTC, fixed offsets, invalid ids
// ---------------------------------------------------------------------

describe('parse: zzz time-zone token', () => {
  it('builds a ZonedDateTime from a full date+time+zone', () => {
    const r = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
    expect(r instanceof Temporal.ZonedDateTime).toBe(true);
    expect((r as Temporal.ZonedDateTime).toString()).toBe('2026-08-04T15:45:00-04:00[America/New_York]');
    expect((parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 UTC') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+00:00[UTC]',
    );
  });

  it('accepts a fixed-offset string as the zone id', () => {
    expect((parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 +05:30') as Temporal.ZonedDateTime).toString()).toBe(
      '2026-08-04T15:45:00+05:30[+05:30]',
    );
  });

  it('throws InvalidTimeZoneError for a zone-shaped but unknown id', () => {
    // the zzz regex only pins the *shape*; validity is checked post-match
    expect(() => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/AZone')).toThrow(InvalidTimeZoneError);
    expect(() => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/AZone')).toThrow(/not a recognized IANA time zone/);
  });

  it('requires a full date and time to build a ZonedDateTime', () => {
    expect(() => parse('yyyy-MM-dd zzz', '2026-08-04 UTC')).toThrow(FormatSyntaxError);
    expect(() => parse('yyyy-MM-dd zzz', '2026-08-04 UTC')).toThrow(/has a "zzz" token but needs a full date and time/);
    expect(() => parse('HH:mm zzz', '15:45 UTC')).toThrow(FormatSyntaxError);
  });
});

// ---------------------------------------------------------------------
// glued unpadded-numeric runs ("Md", "Hms"...): unique split, strict
// ambiguity, lenient heuristic, and zero-valid-splits
// ---------------------------------------------------------------------

describe('parse: glued unpadded token runs', () => {
  it('resolves a run with a unique valid split', () => {
    // '1212' for Md only reads as M=12, d=12
    expect((parse('yyyyMd', '20261212') as Temporal.PlainDate).toString()).toBe('2026-12-12');
  });

  it('throws AmbiguousInputError on a 2-way ambiguous run in strict mode', () => {
    // '121' for Md reads as (1,21) and (12,1) — both valid
    expect(() => parse('yyyyMd', '2026121')).toThrow(AmbiguousInputError);
    expect(() => parse('yyyyMd', '2026121')).toThrow(/is ambiguous/);
    expect(() => parse('Hms', '1234')).toThrow(AmbiguousInputError);
  });

  it('lenient mode picks the small-day split for runs containing d', () => {
    // heuristic: prefer the reading where day <= 12 -> Dec 1, not Jan 21
    expect((parse('yyyyMd', '2026121', { lenient: true }) as Temporal.PlainDate).toString()).toBe('2026-12-01');
  });

  it('lenient mode falls back to the first valid split for runs without d', () => {
    // '1234' for Hms: no day token -> first enumerated split (1,2,34)
    expect((parse('Hms', '1234', { lenient: true }) as Temporal.PlainTime).toString()).toBe('01:02:34');
  });

  it('lenient mode falls back to the first split when every split has a big day', () => {
    // '15920' for Hmd reads (1,59,20) and (15,9,20) — both d=20 > 12, so the
    // day heuristic can't narrow it; splits[0] is picked, then the incomplete
    // date (no year/month) still rejects the result.
    expect(() => parse('Hmd', '15920', { lenient: true })).toThrow(InvalidDateError);
    expect(() => parse('Hmd', '15920', { lenient: true })).toThrow(/incomplete date/);
  });

  it('throws ParseMismatchError when a matched run has zero valid splits', () => {
    // '00' matches the run's \d{2,4} window but no token can take '0...'
    expect(() => parse('Md', '00')).toThrow(ParseMismatchError);
    expect(() => parse('Md', '00')).toThrow(/no valid pattern matches/);
  });
});

// ---------------------------------------------------------------------
// shape mismatches: empty input, wrong literal, wrong length
// ---------------------------------------------------------------------

describe('parse: shape mismatches', () => {
  it('rejects empty input', () => {
    expect(() => parse('yyyy-MM-dd', '')).toThrow(ParseMismatchError);
  });

  it('rejects a literal mismatch mid-string', () => {
    expect(() => parse('yyyy-MM-dd', '2026/08/04')).toThrow(ParseMismatchError);
  });

  it('rejects input longer or shorter than the format describes', () => {
    expect(() => parse('yyyy-MM-dd', '2026-08-04 12:00')).toThrow(ParseMismatchError);
    expect(() => parse('yyyy-MM-dd HH:mm', '2026-08-04')).toThrow(ParseMismatchError);
  });

  it('rejects a token-free format string that still matches the input', () => {
    // matches the literal exactly, but there is nothing to parse into
    expect(() => parse('1234', '1234')).toThrow(ParseMismatchError);
    expect(() => parse('1234', '1234')).toThrow(/has no tokens/);
    expect(() => parse('1234', '5678')).toThrow(ParseMismatchError); // no-match, no-tokens
  });
});

// ---------------------------------------------------------------------
// options: locale calendars (-u-ca-...), invalid locales, numbering
// ---------------------------------------------------------------------

describe('parse: options', () => {
  it('derives a non-Gregorian calendar from a -u-ca- locale extension', () => {
    const r = parse('yyyy-MM-dd', '2026-08-04', { locale: 'en-u-ca-hebrew' }) as Temporal.PlainDate;
    expect(r.calendarId).toBe('hebrew');
  });

  it('treats -u-ca-gregory as no calendar (plain ISO 8601)', () => {
    const r = parse('yyyy-MM-dd', '2026-08-04', { locale: 'en-u-ca-gregory' }) as Temporal.PlainDate;
    expect(r.calendarId).toBe('iso8601');
  });

  it('ignores a -u- extension that carries no calendar keyword', () => {
    // 'ca' key with no value, and a 'va' key instead of 'ca'
    expect((parse('yyyy-MM-dd', '2026-08-04', { locale: 'en-u-ca' }) as Temporal.PlainDate).calendarId).toBe('iso8601');
    expect((parse('yyyy-MM-dd', '2026-08-04', { locale: 'en-u-va-posix' }) as Temporal.PlainDate).calendarId).toBe('iso8601');
  });

  it('throws InvalidLocaleError for a malformed locale tag', () => {
    expect(() => parse('yyyy-MM-dd', '2026-08-04', { locale: 'not a locale!' })).toThrow(InvalidLocaleError);
  });

  it('transliterates non-ASCII digits when parseNumberingSystem is set', () => {
    // arabic-indic numerals: ٢٠٢٦-٠٨-٠٤ -> 2026-08-04
    expect((parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' }) as Temporal.PlainDate).toString()).toBe(
      '2026-08-04',
    );
    // 'auto' derives the system from the call's locale (ar-EG -> arab)
    expect(
      (parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { locale: 'ar-EG', parseNumberingSystem: 'auto' }) as Temporal.PlainDate).toString(),
    ).toBe('2026-08-04');
  });
});

// ---------------------------------------------------------------------
// input/format length limits
// ---------------------------------------------------------------------

describe('parse: length limits', () => {
  it('rejects format strings over MAX_FORMAT_LENGTH', () => {
    expect(() => parse('f'.repeat(1001), 'x')).toThrow(FormatSyntaxError);
    expect(() => parse('f'.repeat(1001), 'x')).toThrow(/format string exceeds maximum length of 1000/);
  });

  it('rejects input over MAX_INPUT_LENGTH', () => {
    expect(() => parse('yyyy-MM-dd', 'x'.repeat(100_001))).toThrow(FormatSyntaxError);
    expect(() => parse('yyyy-MM-dd', 'x'.repeat(100_001))).toThrow(/input exceeds maximum length of 100000/);
  });
});

// ---------------------------------------------------------------------
// caches: pattern-cache eviction, calendar-cache eviction, vocab-change
// invalidation
// ---------------------------------------------------------------------

describe('parse: internal caches', () => {
  it('evicts the oldest compiled pattern once the cache hits its cap', () => {
    // 600 distinct format strings on one locale: patternCache (cap 500)
    // crosses its size limit and must evict. None of these match, which is
    // fine — the pattern is built and cached before the regex runs.
    for (let i = 0; i < 600; i++) {
      expect(tryParse('yyyy-MM-dd' + 'f'.repeat(i + 1), '2026-08-04')).toBeUndefined();
    }
    // and parsing still works after all the evictions
    expect((tryParse('yyyy-MM-dd', '2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('evicts the oldest calendar resolution once that cache hits its cap', () => {
    // 600 distinct locales for one format: calendarCache (cap 500) crosses
    // its size limit. Input never matches, so no vocab work happens.
    for (let i = 0; i < 600; i++) {
      expect(tryParse('yyyy-MM-dd', 'x', { locale: `en-x-${i}` })).toBeUndefined();
    }
    expect((tryParse('yyyy-MM-dd', '2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('clears compiled patterns when a locale vocab is re-registered', () => {
    // prime the pattern cache with the Intl-derived en-GB vocab
    expect((parse('d MMMM yyyy', '4 January 2026', { locale: 'en-GB' }) as Temporal.PlainDate).toString()).toBe(
      '2026-01-04',
    );
    // registering a custom vocab fires patternCache.clear() — otherwise the
    // stale cached pattern would keep matching the old month names
    registerLocaleVocab('en-GB', {
      monthLong: ['Month01', 'Month02', 'Month03', 'Month04', 'Month05', 'Month06', 'Month07', 'Month08', 'Month09', 'Month10', 'Month11', 'Month12'],
      monthShort: ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12'],
      weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
      weekdayShort: ['Dy1', 'Dy2', 'Dy3', 'Dy4', 'Dy5', 'Dy6', 'Dy7'],
      dayPeriod: ['AM', 'PM'],
    });
    // the rebuilt pattern matches the new vocab
    expect((parse('d MMMM yyyy', '4 Month08 2026', { locale: 'en-GB' }) as Temporal.PlainDate).toString()).toBe(
      '2026-08-04',
    );
    // ...and the old Intl names no longer parse for this locale
    expect(() => parse('d MMMM yyyy', '4 January 2026', { locale: 'en-GB' })).toThrow(ParseMismatchError);
    // weekday cross-check against the custom vocab: 2026-08-04 is a Tuesday
    expect((parse('EEEE d MMMM yyyy', 'Day2 4 Month08 2026', { locale: 'en-GB' }) as Temporal.PlainDate).toString()).toBe(
      '2026-08-04',
    );
    expect(() => parse('EEEE d MMMM yyyy', 'Day3 4 Month08 2026', { locale: 'en-GB' })).toThrow(/actual weekday \(Day2\)/);
  });
});

// ---------------------------------------------------------------------
// safeParse / tryParse: full result shapes
// ---------------------------------------------------------------------

describe('safeParse / tryParse (result shapes)', () => {
  it('safeParse returns { ok: true, value } on success', () => {
    const r = safeParse('yyyy-MM-dd', '2026-08-04');
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('safeParse passes typed errors through unchanged', () => {
    const r = safeParse('yyyy-MM-dd', 'garbage');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ParseMismatchError);
      expect(r.error.code).toBe('PARSE_MISMATCH');
      expect(r.error.reason).toBe('no valid pattern matches the format string and input shape');
    }
    const syn = safeParse('yyyy yy', '2026 26');
    expect(syn.ok).toBe(false);
    if (!syn.ok) expect(syn.error).toBeInstanceOf(FormatSyntaxError);
  });

  it('tryParse returns the parsed value on success', () => {
    expect((tryParse('HH:mm', '15:45') as Temporal.PlainTime).toString()).toBe('15:45:00');
  });
});

// ---------------------------------------------------------------------
// parseToParts: positions, runs, errors, limits, numbering
// ---------------------------------------------------------------------

describe('parseToParts (extended)', () => {
  it('reports positions from the regex match indices when literals separate tokens', () => {
    expect(parseToParts('HH:mm:ss', '15:45:30')).toEqual([
      { token: 'HH', raw: '15', position: 0 },
      { token: 'mm', raw: '45', position: 3 },
      { token: 'ss', raw: '30', position: 6 },
    ]); 
  });

  it('resolves glued-run members with cumulative fallback positions', () => {
    // run members have no regex group of their own, so positions come from
    // the cumulative-raw-length heuristic instead of match.indices
    expect(parseToParts('yyyyMd', '20261212')).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'M', raw: '12', position: 4 },
      { token: 'd', raw: '12', position: 6 },
    ]);
    expect(parseToParts('Hms', '1234', { lenient: true })).toEqual([
      { token: 'H', raw: '1', position: 0 },
      { token: 'm', raw: '2', position: 1 },
      { token: 's', raw: '34', position: 2 },
    ]);
    expect(parseToParts('yyyyMd', '2026121', { lenient: true })).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'M', raw: '12', position: 4 },
      { token: 'd', raw: '1', position: 6 },
    ]);
  });

  it('throws the same ambiguity and mismatch errors parse() throws', () => {
    expect(() => parseToParts('yyyyMd', '2026121')).toThrow(AmbiguousInputError);
    expect(() => parseToParts('Md', '00')).toThrow(ParseMismatchError);
    expect(() => parseToParts('yyyy-MM-dd', 'garbage')).toThrow(ParseMismatchError);
  });

  it('throws InvalidTimeZoneError for a bogus zzz group', () => {
    expect(() => parseToParts('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/AZone')).toThrow(InvalidTimeZoneError);
  });

  it('rejects a token-free format string', () => {
    expect(() => parseToParts('1234', '1234')).toThrow(ParseMismatchError);
    expect(() => parseToParts('1234', '1234')).toThrow(/has no tokens/);
  });

  it('enforces the same length limits as parse()', () => {
    expect(() => parseToParts('f'.repeat(1001), 'x')).toThrow(FormatSyntaxError);
    expect(() => parseToParts('yyyy-MM-dd', 'x'.repeat(100_001))).toThrow(FormatSyntaxError);
  });

  it('transliterates input digits before matching', () => {
    expect(parseToParts('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' })).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'MM', raw: '08', position: 5 },
      { token: 'dd', raw: '04', position: 8 },
    ]);
  });
});

// ---------------------------------------------------------------------
// compileParser: all four methods, locale pinning, option pass-through
// ---------------------------------------------------------------------

describe('compileParser (extended)', () => {
  it('exposes the format string and the precompiled pattern', () => {
    const compiled = compileParser('yyyy-MM-dd');
    expect(compiled.formatStr).toBe('yyyy-MM-dd');
    expect(compiled.pattern.regex).toBeInstanceOf(RegExp);
  });

  it('supports parse/safeParse/tryParse/parseToParts reuse across calls', () => {
    const compiled = compileParser('yyyyMd');
    // strict via parse()
    expect(() => compiled.parse('2026121')).toThrow(AmbiguousInputError);
    // options pass through per call
    expect((compiled.parse('2026121', { lenient: true }) as Temporal.PlainDate).toString()).toBe('2026-12-01');
    expect((compiled.parse('20261212') as Temporal.PlainDate).toString()).toBe('2026-12-12');
    // safeParse both ways
    const ok = compiled.safeParse('20261212');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.value as Temporal.PlainDate).toString()).toBe('2026-12-12');
    const bad = compiled.safeParse('2026121');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBeInstanceOf(AmbiguousInputError);
    // tryParse both ways
    expect((compiled.tryParse('20261212') as Temporal.PlainDate).toString()).toBe('2026-12-12');
    expect(compiled.tryParse('2026121')).toBeUndefined();
    // parseToParts
    expect(compiled.parseToParts('20261212')).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'M', raw: '12', position: 4 },
      { token: 'd', raw: '12', position: 6 },
    ]);
  });

  it('pins the locale the parser was compiled with', () => {
    const de = compileParser('d MMMM yyyy', { locale: 'de-DE' });
    expect((de.parse('4 Januar 2026') as Temporal.PlainDate).toString()).toBe('2026-01-04');
  });

  it('rejects format strings over MAX_FORMAT_LENGTH', () => {
    expect(() => compileParser('f'.repeat(1001))).toThrow(FormatSyntaxError);
  });
});
