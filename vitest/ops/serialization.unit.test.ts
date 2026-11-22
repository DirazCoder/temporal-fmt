import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  parseISO,
  formatISO,
  parseRFC3339,
  formatRFC3339,
  parseRFC2822,
  formatRFC2822,
  parseHTTPDate,
  formatHTTPDate,
  toUnixSeconds,
  toUnixMilliseconds,
  toUnixMicroseconds,
  toUnixNanoseconds,
  fromUnixSeconds,
  fromUnixMilliseconds,
  fromUnixMicroseconds,
  fromUnixNanoseconds,
  parseSQL,
  formatSQL,
} from '../../src/ops/serialization.js';
import { FormatSyntaxError, InvalidDateError } from '../../src/core/errors.js';

setTemporal(Temporal);

describe('parseISO / formatISO', () => {
  it('parses a date and round-trips through formatISO', () => {
    const date = Temporal.PlainDate.from('2026-08-04');
    const reparsed = parseISO(formatISO(date)) as Temporal.PlainDate;
    expect(reparsed.toString()).toBe(date.toString());
  });

  it('throws on garbage input', () => {
    expect(() => parseISO('not-a-date')).toThrow(/doesn't look like an ISO 8601/);
  });
});

describe('parseRFC3339 / formatRFC3339', () => {
  it('parses a zoned RFC 3339 string and formats an Instant back to RFC 3339', () => {
    expect(parseRFC3339('2026-08-04T15:45:30Z')).toBeTruthy();
    const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
    expect(formatRFC3339(inst)).toMatch(/2026-08-04T15:45:30/);
  });

  it('throws when the input has no timezone', () => {
    expect(() => parseRFC3339('2026-08-04T15:45:30')).toThrow(/does not match RFC 3339/);
  });

  it('rejects oversized input before grammar validation', () => {
    expect(() => parseRFC3339('x'.repeat(100_001))).toThrow(/maximum length/);
  });
});

describe('parseRFC2822 / formatRFC2822', () => {
  it('parses a valid RFC 2822 string and dispatches formatting on epochMilliseconds', () => {
    expect(parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000')).toBeTruthy();
    expect(formatRFC2822({ epochMilliseconds: 1700000000000 })).toBe('Tue, 14 Nov 2023 22:13:20 +0000');
  });

  it('throws on garbage input', () => {
    expect(() => parseRFC2822('not a valid date string')).toThrow(/not a valid RFC 2822 date/);
  });

  it('rejects oversized input before grammar validation', () => {
    expect(() => parseRFC2822('x'.repeat(100_001))).toThrow(/maximum length/);
  });
});

describe('parseHTTPDate / formatHTTPDate', () => {
  it('parses an IMF-fixdate and formats a ZonedDateTime back to one', () => {
    expect(parseHTTPDate('Mon, 04 Aug 2026 15:45:30 GMT')).toBeTruthy();
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]');
    expect(formatHTTPDate(zdt)).toBe('Tue, 04 Aug 2026 15:45:30 GMT');
  });
});

describe('toUnixSeconds', () => {
  it('throws when the value exposes no epoch-derivable shape', () => {
    expect(() => toUnixSeconds({})).toThrow(/expected an Instant or ZonedDateTime/);
  });
});

describe('parseSQL', () => {
  it('detects the ISO-T datetime format and throws on an unrecognized one', () => {
    const r = parseSQL('2026-08-04T15:45:30') as Temporal.PlainDateTime;
    expect(r.toString()).toMatch(/2026-08-04T15:45:30/);
    expect(() => parseSQL('garbage')).toThrow(/not a recognized SQL date\/time format/);
  });
});

/* ------------------------------------------------------------------
 * Coverage additions: every dispatch branch of parseISO, all RFC 3339
 * grammar variants (fractional seconds, offsets, lowercase t/z),
 * RFC 2822 optional parts + obsolete zone names + the
 * shape-valid-but-unparseable case, every epoch-ms source shape of
 * formatRFC2822/formatHTTPDate/getInstant, negative + sub-second unix
 * conversions in both directions, the SQL date/datetime arms of
 * parseSQL/formatSQL, and every typed-error throw branch.
 * ------------------------------------------------------------------ */

describe('parseISO (dispatch branches)', () => {
  it('parses a local PlainDateTime (time component, no zone)', () => {
    const r = parseISO('2026-08-04T15:45:30') as Temporal.PlainDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30');
  });

  it('expands a trailing Z into a UTC ZonedDateTime', () => {
    const r = parseISO('2026-08-04T15:45:30Z') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30+00:00[UTC]');
  });

  it('accepts a lowercase z terminator', () => {
    const r = parseISO('2026-08-04T15:45:30z') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30+00:00[UTC]');
  });

  it('keeps a numeric offset as the zone bracket, colon or not', () => {
    const r = parseISO('2026-08-04T15:45:30+05:30') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30+05:30[+05:30]');
    const compact = parseISO('2026-08-04T15:45:30+0530') as Temporal.ZonedDateTime;
    expect(compact.toString()).toBe('2026-08-04T15:45:30+05:30[+05:30]');
  });

  it('parses a bare PlainTime', () => {
    expect((parseISO('15:45') as Temporal.PlainTime).toString()).toBe('15:45:00');
  });

  it('rejects a T-prefixed time with no date part (second time-detection alternative)', () => {
    expect(() => parseISO('T15:45')).toThrow(InvalidDateError);
  });

  it('wraps Temporal construction failures in InvalidDateError', () => {
    expect(() => parseISO('2026-02-30T10:00:00Z')).toThrow(/does not describe a valid date/); // Feb 30
    expect(() => parseISO('2026-13-01T00:00:00')).toThrow(InvalidDateError); // month 13
  });

  it('rejects non-string and oversized ISO inputs', () => {
    expect(() => parseISO(42 as unknown as string)).toThrow(/expects a string/);
    expect(() => parseISO('x'.repeat(100_001))).toThrow(/maximum length/);
  });

  it('rejects second-precision offsets and malformed suffixes', () => {
    expect(() => parseISO('2026-08-04T15:45:30+05:30:30')).toThrow(InvalidDateError);
    expect(() => parseISO('2026-08-04T15:45:30+053030')).toThrow(InvalidDateError);
    expect(() => parseISO('2026-08-04T15:45:30+053x')).toThrow(InvalidDateError);
    expect(() => parseISO('2026-08-04T15:45:30+05:3x')).toThrow(InvalidDateError);
    expect(() => parseISO('2026-08-04T15:45:30+X5:30')).toThrow(InvalidDateError);
  });
});

describe('formatISO (guard branch)', () => {
  it('throws for values with no toString()', () => {
    expect(() => formatISO(null)).toThrow(FormatSyntaxError);
    expect(() => formatISO(undefined)).toThrow(/expects a Temporal value with toString/);
  });
});

describe('parseRFC3339 (grammar variants)', () => {
  it('accepts fractional seconds and numeric offsets', () => {
    const r = parseRFC3339('2026-08-04T15:45:30.123+05:30') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30.123+05:30[+05:30]');
  });

  it('accepts lowercase t and z', () => {
    const r = parseRFC3339('2026-08-04t15:45:30z') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30+00:00[+00:00]');
  });

  it('rejects non-grammar shapes (single-digit fields, space separator)', () => {
    expect(() => parseRFC3339('2026-8-4T15:45:30Z')).toThrow(/does not match RFC 3339/);
    expect(() => parseRFC3339('2026-08-04 15:45:30Z')).toThrow(/does not match RFC 3339/);
  });

  it('rejects invalid fractional precision and non-string input', () => {
    expect(() => parseRFC3339('2026-08-04T15:45:30.1234567890Z')).toThrow(/nanosecond precision/);
    expect(() => parseRFC3339('2026-08-04T15:45:30.xZ')).toThrow(/nanosecond precision/);
    expect(() => parseRFC3339(42 as unknown as string)).toThrow(/expects a string/);
  });
});

describe('formatRFC3339 (validation branch)', () => {
  it('formats negative numeric offsets', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-08:00[-08:00]');
    expect(formatRFC3339(zdt)).toBe('2026-08-04T15:45:30-08:00');
  });

  it('rejects values whose toString() is not RFC 3339 shaped', () => {
    // PlainDate: no time or offset.
    expect(() => formatRFC3339(Temporal.PlainDate.from('2026-08-04'))).toThrow(/did not produce RFC 3339/);
    // PlainDateTime: no offset.
    expect(() => formatRFC3339(Temporal.PlainDateTime.from('2026-08-04T15:45:30'))).toThrow(FormatSyntaxError);
    // A ZonedDateTime's toString() carries a trailing [Zone] bracket —
    // legal ISO 8601, not RFC 3339. The bracket is now stripped before
    // validation, so the natural input type formats instead of always
    // throwing; a value with no offset at all still fails.
    expect(formatRFC3339(Temporal.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]'))).toBe('2026-08-04T15:45:30+00:00');
    expect(formatRFC3339(Temporal.ZonedDateTime.from('2026-08-04T15:45:30+05:30[Asia/Kolkata]'))).toBe('2026-08-04T15:45:30+05:30');
  });

  it('passes an Instant with fractional seconds straight through', () => {
    expect(formatRFC3339(Temporal.Instant.from('2026-08-04T15:45:30.123Z'))).toBe('2026-08-04T15:45:30.123Z');
  });

  it('rejects malformed strings returned by a duck-typed value', () => {
    expect(() => formatRFC3339({ toString: () => '2026-08-04T15:45:30.XZ' })).toThrow(/did not produce RFC 3339/);
    expect(() => formatRFC3339({ toString: () => 'not-a-rfc3339-date' })).toThrow(/did not produce RFC 3339/);
  });
});

describe('parseRFC2822 (optional parts and zone forms)', () => {
  it('accepts input without a day-of-week and without seconds', () => {
    expect(parseRFC2822('04 Aug 2026 15:45:30 +0000')).toBeTruthy();
    expect(parseRFC2822('Mon, 04 Aug 2026 15:45 +0000')).toBeTruthy();
  });

  it('resolves obsolete zone names and numeric offsets to the right instant', () => {
    expect((parseRFC2822('Tue, 14 Nov 2023 22:13:20 +0000') as Temporal.Instant).epochMilliseconds).toBe(1700000000000);
    expect((parseRFC2822('Mon, 04 Aug 2026 15:45:30 GMT') as Temporal.Instant).epochMilliseconds).toBe(1785858330000);
    expect((parseRFC2822('Mon, 04 Aug 2026 15:45:30 UT') as Temporal.Instant).epochMilliseconds).toBe(1785858330000);
    // EST is fixed UTC-5 (no DST in the obsolete-zone table).
    expect((parseRFC2822('Mon, 04 Aug 2026 15:45:30 EST') as Temporal.Instant).epochMilliseconds).toBe(1785876330000);
    expect((parseRFC2822('Mon, 04 Aug 2026 15:45:30 -0700') as Temporal.Instant).epochMilliseconds).toBe(1785883530000);
  });

  it('rejects shape-valid input that Date.parse cannot resolve (NaN branch)', () => {
    expect(() => parseRFC2822('Sun, 99 Aug 2026 15:45:30 +0000')).toThrow(/not a valid RFC 2822 date/);
    expect(() => parseRFC2822('Mon, 04 Aug 2026 15:45:30 QQQQQ')).toThrow(/not a valid RFC 2822 date/);
  });

  it('rejects malformed day names, times, zones, and types', () => {
    expect(() => parseRFC2822('Xxx, 04 Aug 2026 15:45:30 +0000')).toThrow(/not a valid RFC 2822/);
    expect(() => parseRFC2822('Mon, 4x Aug 2026 15:45:30 +0000')).toThrow(/not a valid RFC 2822/);
    expect(() => parseRFC2822('Mon, 04 Aug 2026 xx:45:30 +0000')).toThrow(/not a valid RFC 2822/);
    expect(() => parseRFC2822('Mon, 04 Aug 2026 15:45:30 +X000')).toThrow(/not a valid RFC 2822/);
    expect(() => parseRFC2822(42 as unknown as string)).toThrow(/expects a string/);
  });
});

describe('formatRFC2822 (epoch-source dispatch)', () => {
  it('prefers a toEpochMilliseconds() method when present', () => {
    expect(formatRFC2822({ toEpochMilliseconds: () => 1700000000000 })).toBe('Tue, 14 Nov 2023 22:13:20 +0000');
  });

  it('follows toInstant() for ZonedDateTime values', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30+00:00[UTC]');
    expect(formatRFC2822(zdt)).toBe('Tue, 04 Aug 2026 15:45:30 +0000');
  });

  it('reads epochMilliseconds off a toInstant() result when the value itself has none', () => {
    // Covers the toInstant() branch whose result carries a numeric
    // epochMilliseconds (a plain duck-typed shape; the polyfill's
    // ZonedDateTime hits the direct epochMilliseconds property instead).
    expect(formatRFC2822({ toInstant: () => ({ epochMilliseconds: 1700000000000 }) })).toBe('Tue, 14 Nov 2023 22:13:20 +0000');
  });

  it('throws when no epoch source is available (undefined-ms branch)', () => {
    expect(() => formatRFC2822({})).toThrow(/expects a value with epochMilliseconds/);
    expect(() => formatRFC2822({ toInstant: () => ({}) })).toThrow(/expects a value with epochMilliseconds/);
  });
});

describe('parseHTTPDate (variants and rejection)', () => {
  it('rejects unparseable input (NaN branch)', () => {
    expect(() => parseHTTPDate('definitely not a date')).toThrow(/not a valid HTTP-date/);
  });

  it('rejects oversized and non-string input', () => {
    expect(() => parseHTTPDate('x'.repeat(100_001))).toThrow(/maximum length/);
    expect(() => parseHTTPDate(42 as unknown as string)).toThrow(/expects a string/);
  });

  it('accepts the RFC 850 and asctime formats too', () => {
    expect((parseHTTPDate('Sunday, 09-Nov-26 08:49:37 GMT') as Temporal.Instant).epochMilliseconds).toBe(1794214177000);
    expect((parseHTTPDate('Sun Nov  6 08:49:37 1994') as Temporal.Instant).epochMilliseconds).toBe(784111777000);
  });
});

describe('formatHTTPDate (shape dispatch)', () => {
  it('formats a bare Instant via its epochMilliseconds property', () => {
    expect(formatHTTPDate(Temporal.Instant.from('1994-11-06T08:49:37Z'))).toBe('Sun, 06 Nov 1994 08:49:37 GMT');
  });

  it('throws for values with no instant shape (all guard branches)', () => {
    expect(() => formatHTTPDate(null)).toThrow(FormatSyntaxError); // instant === null
    expect(() => formatHTTPDate({})).toThrow(/expects an Instant or ZonedDateTime/); // no epochMilliseconds key
    expect(() => formatHTTPDate(42)).toThrow(FormatSyntaxError); // not an object at all
  });
});

describe('unix epoch conversions', () => {
  it('toUnixSeconds reads epochMilliseconds from every accepted shape', () => {
    expect(toUnixSeconds(Temporal.Instant.from('2023-11-14T22:13:20Z'))).toBe(1700000000);
    expect(toUnixSeconds({ epochMilliseconds: 1700000000123 })).toBe(1700000000.123);
    expect(toUnixSeconds(Temporal.ZonedDateTime.from('2023-11-14T22:13:20+00:00[UTC]'))).toBe(1700000000);
    // toInstant() result carrying only epochMilliseconds: ns derived by scaling ms.
    expect(toUnixSeconds({ toInstant: () => ({ epochMilliseconds: 1700000000000 }) })).toBe(1700000000);
  });

  it('toUnixMilliseconds/Microseconds/Nanoseconds preserve sub-ms precision via epochNanoseconds', () => {
    const inst = Temporal.Instant.from('2023-11-14T22:13:20.123456789Z');
    expect(toUnixMilliseconds(inst)).toBe(1700000000123);
    expect(toUnixMicroseconds(inst)).toBe(1700000000123456); // ns truncated to microseconds
    expect(toUnixNanoseconds(inst)).toBe(1700000000123456789n);
    // Field bags taking the epochNanoseconds / epochMilliseconds paths.
    expect(toUnixMilliseconds({ epochNanoseconds: 1700000000123456789n })).toBe(1700000000123);
    expect(toUnixNanoseconds({ epochMilliseconds: 1700000000000 })).toBe(1700000000000000000n);
  });

  it('fromUnixSeconds/Milliseconds/Microseconds/Nanoseconds build Instants, negative epochs included', () => {
    expect((fromUnixSeconds(1700000000) as Temporal.Instant).toString()).toBe('2023-11-14T22:13:20Z');
    expect((fromUnixSeconds(-1) as Temporal.Instant).toString()).toBe('1969-12-31T23:59:59Z');
    expect((fromUnixSeconds(-1.5) as Temporal.Instant).toString()).toBe('1969-12-31T23:59:58.5Z');
    expect((fromUnixMilliseconds(1700000000123) as Temporal.Instant).toString()).toBe('2023-11-14T22:13:20.123Z');
    expect((fromUnixMilliseconds(-1234) as Temporal.Instant).toString()).toBe('1969-12-31T23:59:58.766Z');
    expect((fromUnixMicroseconds(1700000000123456) as Temporal.Instant).toString()).toBe('2023-11-14T22:13:20.123456Z');
    expect((fromUnixMicroseconds(-1700000000123456) as Temporal.Instant).toString()).toBe('1916-02-18T01:46:39.876544Z');
    expect((fromUnixNanoseconds(1700000000123456789n) as Temporal.Instant).toString()).toBe('2023-11-14T22:13:20.123456789Z');
    expect((fromUnixNanoseconds(-1700000000123456789n) as Temporal.Instant).toString()).toBe('1916-02-18T01:46:39.876543211Z');
  });

  it('throws when the active Temporal implementation has no Instant', () => {
    // requireInstant()'s guard: a namespace without Instant must throw.
    const namespaceWithoutInstant = {
      PlainDate: Temporal.PlainDate,
      PlainTime: Temporal.PlainTime,
      PlainDateTime: Temporal.PlainDateTime,
      ZonedDateTime: Temporal.ZonedDateTime,
    };
    setTemporal(namespaceWithoutInstant);
    try {
      expect(() => fromUnixSeconds(0)).toThrow(/Temporal.Instant is not available/);
    } finally {
      setTemporal(Temporal); // restore for the rest of the suite
    }
  });
});

describe('parseSQL (format variants)', () => {
  it('parses the DATE and space-separated DATETIME forms', () => {
    expect((parseSQL('2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((parseSQL('2026-08-04 15:45:30') as Temporal.PlainDateTime).toString()).toBe('2026-08-04T15:45:30');
  });

  it('routes the T-separated form with a zone through parseISO', () => {
    const r = parseSQL('2026-08-04T15:45:30Z') as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-08-04T15:45:30+00:00[UTC]');
  });

  it('trims surrounding whitespace before dispatching', () => {
    expect((parseSQL('  2026-08-04  ') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('rejects a space-separated time without seconds', () => {
    expect(() => parseSQL('2026-08-04 15:45')).toThrow(/not a recognized SQL date\/time format/);
  });
});

describe('formatSQL', () => {
  it('renders datetimes with a space separator and dates without a time part', () => {
    expect(formatSQL(Temporal.PlainDateTime.from('2026-08-04T15:45:30'))).toBe('2026-08-04 15:45:30');
    expect(formatSQL(Temporal.PlainDate.from('2026-08-04'))).toBe('2026-08-04');
  });
});
