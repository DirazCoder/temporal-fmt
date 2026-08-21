import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
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
  parseSQL,
} from '../src/serialization.js';

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
});

describe('parseRFC2822 / formatRFC2822', () => {
  it('parses a valid RFC 2822 string and dispatches formatting on epochMilliseconds', () => {
    expect(parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000')).toBeTruthy();
    expect(formatRFC2822({ epochMilliseconds: 1700000000000 })).toBe('Tue, 14 Nov 2023 22:13:20 +0000');
  });

  it('throws on garbage input', () => {
    expect(() => parseRFC2822('not a valid date string')).toThrow(/not a valid RFC 2822 date/);
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
