import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { formatDistance, formatDistanceToNow } from '../../src/format/formatDistance.js';
import { InvalidDateError, InvalidLocaleError } from '../../src/core/errors.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

// node --test exercises formatDistance end-to-end at the public-API
// level. These go straight at the source so a wrong unit-selection
// cutoff or bad rounding surfaces as a formatDistance failure rather
// than as a wrong string three layers up.

function date(year: number, month: number, day: number) {
  return Temporal.PlainDate.from({ year, month, day });
}
function dateTime(year: number, month: number, day: number, hour: number, minute = 0, second = 0, millisecond = 0) {
  return Temporal.PlainDateTime.from({ year, month, day, hour, minute, second, millisecond });
}

describe('formatDistance: numeric auto', () => {
  it('returns "now" for equal dates', () => {
    expect(formatDistance(date(2026, 8, 4), date(2026, 8, 4))).toBe('now');
  });

  it('returns "yesterday"/"tomorrow" for ±1 day with numeric:auto', () => {
    const today = date(2026, 8, 4);
    expect(formatDistance(date(2026, 8, 5), today)).toBe('tomorrow');
    expect(formatDistance(date(2026, 8, 3), today)).toBe('yesterday');
  });
});

describe('formatDistance: numeric always', () => {
  it('forces "in 0 seconds" for equal dates', () => {
    expect(formatDistance(date(2026, 8, 4), date(2026, 8, 4), { numeric: 'always' })).toBe('in 0 seconds');
  });

  it('forces "in 1 day" / "1 day ago" for ±1 day', () => {
    const today = date(2026, 8, 4);
    expect(formatDistance(date(2026, 8, 5), today, { numeric: 'always' })).toBe('in 1 day');
    expect(formatDistance(date(2026, 8, 3), today, { numeric: 'always' })).toBe('1 day ago');
  });
});

describe('formatDistance: unit selection cutoffs', () => {
  // cutoffs per README: <60s seconds, <60min minutes, <24h hours,
  // <30d days, <365d months, else years
  it('<60s resolves to seconds', () => {
    const t1 = dateTime(2026, 8, 4, 12, 0, 30);
    const t2 = dateTime(2026, 8, 4, 12, 0, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 30 seconds');
  });

  it('<60min resolves to minutes', () => {
    const t1 = dateTime(2026, 8, 4, 12, 30);
    const t2 = dateTime(2026, 8, 4, 12, 0);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 30 minutes');
  });

  it('<24h resolves to hours', () => {
    const t1 = dateTime(2026, 8, 4, 14);
    const t2 = dateTime(2026, 8, 4, 12);
    expect(formatDistance(t1, t2, { numeric: 'always' })).toBe('in 2 hours');
  });

  it('<30d resolves to days', () => {
    const today = date(2026, 8, 4);
    const in10 = date(2026, 8, 14);
    expect(formatDistance(in10, today, { numeric: 'always' })).toBe('in 10 days');
  });
});

describe('formatDistance: direction', () => {
  it('positive diff → future, negative diff → past', () => {
    const today = date(2026, 8, 4);
    const future = date(2026, 8, 7);
    const past = date(2026, 8, 1);
    expect(formatDistance(future, today)).toBe('in 3 days');
    expect(formatDistance(past, today)).toBe('3 days ago');
    // swapping flips the direction
    expect(formatDistance(today, future)).toBe('3 days ago');
    expect(formatDistance(today, past)).toBe('in 3 days');
  });
});

describe('formatDistance: locales', () => {
  it('localizes via Intl.RelativeTimeFormat', () => {
    const today = date(2026, 8, 4);
    const tomorrow = date(2026, 8, 5);
    expect(formatDistance(tomorrow, today, { locale: 'fr-FR' })).toBe('demain');
    expect(formatDistance(tomorrow, today, { locale: 'ja-JP' })).toBe('明日');
  });
});

describe('formatDistance: input validation', () => {
  it('throws on non-Temporal values', () => {
    expect(() => formatDistance(null, date(2026, 8, 4))).toThrow(/expects Temporal values/);
    expect(() => formatDistance('2026-08-04', date(2026, 8, 4))).toThrow(/expects Temporal values/);
  });

  it('throws on PlainTime (no date anchor)', () => {
    const time = Temporal.PlainTime.from('15:45:00');
    expect(() => formatDistance(time, time)).toThrow(/year\/month\/day|Temporal values/);
  });

  it('throws on partial date shape', () => {
    expect(() => formatDistance({ year: 2026 }, { year: 2026, month: 8, day: 4 })).toThrow(/partial date/);
  });
});

describe('formatDistance: mixed PlainDate + PlainDateTime', () => {
  it('treats PlainDate as midnight when diffing against PlainDateTime', () => {
    const today = date(2026, 8, 4);
    const noon = dateTime(2026, 8, 4, 12);
    expect(formatDistance(noon, today, { numeric: 'always' })).toBe('in 12 hours');
    expect(formatDistance(today, noon, { numeric: 'always' })).toBe('12 hours ago');
  });
});

// ---------------------------------------------------------------------------
// Branch-coverage additions (task 3-e). Cases above are untouched.
// ---------------------------------------------------------------------------

// readFields' range validation on untrusted field-bag input — lines 65-88.
// Real Temporal values always pass these; only hand-rolled bags can trip
// them, so each sub-condition gets its own case.
describe('formatDistance: date-field range validation', () => {
  const base = { year: 2026, month: 8, day: 4 };

  it('rejects years outside Temporal\'s representable range', () => {
    expect(() => formatDistance({ ...base, year: 300000 }, base)).toThrow(InvalidDateError);
    expect(() => formatDistance({ ...base, year: -300000 }, base))
      .toThrow(/year -300000 is outside the -271821..275760 range/);
  });

  it('rejects non-finite and non-integer years', () => {
    expect(() => formatDistance({ ...base, year: NaN }, base)).toThrow(InvalidDateError);
    expect(() => formatDistance({ ...base, year: 2026.5 }, base)).toThrow(InvalidDateError);
  });

  it('rejects months outside 1..12 and non-integer months', () => {
    expect(() => formatDistance({ ...base, month: 0 }, base)).toThrow(/month 0 is not in 1\.\.12/);
    expect(() => formatDistance({ ...base, month: 13 }, base)).toThrow(/month 13 is not in 1\.\.12/);
    expect(() => formatDistance({ ...base, month: 8.5 }, base)).toThrow(InvalidDateError);
  });

  it('rejects invalid days, including leap-year February boundaries', () => {
    // leap Feb: max 29
    expect(() => formatDistance({ year: 2024, month: 2, day: 30 }, base))
      .toThrow(/not valid for year 2024, month 2 \(max 29\)/);
    // non-leap Feb: max 28
    expect(() => formatDistance({ year: 2023, month: 2, day: 29 }, base))
      .toThrow(/not valid for year 2023, month 2 \(max 28\)/);
    // a 30-day month
    expect(() => formatDistance({ ...base, month: 4, day: 31 }, base))
      .toThrow(/not valid for year 2026, month 4 \(max 30\)/);
    expect(() => formatDistance({ ...base, day: 0 }, base)).toThrow(/day 0 is not valid/);
    expect(() => formatDistance({ ...base, day: 32 }, base)).toThrow(/day 32 is not valid/);
    expect(() => formatDistance({ ...base, day: 4.5 }, base)).toThrow(InvalidDateError);
  });

  it('validates the second operand too, and rejects every partial-date combo', () => {
    expect(() => formatDistance(base, { ...base, month: 13 })).toThrow(InvalidDateError);
    // year present, month missing (first mismatch operand true)
    expect(() => formatDistance(base, { year: 2026 })).toThrow(/partial date/);
    // month present, year+day missing (first mismatch operand true via hasYear !== hasMonth)
    expect(() => formatDistance(base, { month: 8 })).toThrow(/partial date/);
    // year+month present, day missing (falls to the hasMonth !== hasDay operand)
    expect(() => formatDistance(base, { year: 2026, month: 8 })).toThrow(/partial date/);
  });

  it('a field bag with time-only fields never reaches toEpochMs', () => {
    // PlainTime-like bag: hasYear/hasMonth/hasDay all false → passes the
    // shape check, then toEpochMs throws because year is undefined.
    expect(() => formatDistance({ hour: 15, minute: 45 }, base))
      .toThrow(/no anchor date to diff against/);
  });
});

// getRtf / canonicalLocaleKey — lines 252-269.
describe('formatDistance: locale handling', () => {
  it('malformed locale tags surface as InvalidLocaleError, not a raw RangeError', () => {
    // 'not a locale' fails Intl.Locale inside canonicalLocaleKey (catch →
    // raw key), then fails Intl.RelativeTimeFormat inside getRtf's try,
    // which converts the RangeError to InvalidLocaleError.
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { locale: 'not a locale' }))
      .toThrow(InvalidLocaleError);
    expect(() => formatDistance(date(2026, 8, 5), date(2026, 8, 4), { locale: 'not a locale' }))
      .toThrow(/not a valid BCP-47 tag/);
  });

  it('underscore-separated tags are normalized to hyphens before Intl sees them', () => {
    expect(formatDistance(date(2026, 8, 5), date(2026, 8, 4), { locale: 'en_US' })).toBe('tomorrow');
  });
});

// getRtf's bounded cache — lines 246-249.
describe('formatDistance: RTF cache eviction', () => {
  it('keeps working past 100 cached locale/numeric combos (evicts the oldest)', () => {
    const today = date(2026, 8, 4);
    const tomorrow = date(2026, 8, 5);
    const locales = [
      'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN', 'en-NZ', 'en-ZA', 'en-IE',
      'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH',
      'de-DE', 'de-AT', 'de-CH',
      'es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-CL',
      'it-IT', 'it-CH',
      'pt-BR', 'pt-PT',
      'nl-NL', 'nl-BE',
      'sv-SE', 'da-DK', 'nb-NO', 'fi-FI', 'is-IS',
      'pl-PL', 'cs-CZ', 'sk-SK', 'hu-HU', 'ro-RO', 'bg-BG', 'el-GR',
      'hr-HR', 'sr-RS', 'sl-SI',
      'ru-RU', 'uk-UA', 'lt-LT', 'lv-LV', 'et-EE',
      'tr-TR', 'he-IL', 'ar-EG', 'ar-SA', 'ar-AE',
      'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'ml-IN', 'kn-IN', 'mr-IN', 'gu-IN',
      'th-TH', 'vi-VN', 'id-ID', 'ms-MY',
      'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'zh-HK',
      'ca-ES', 'eu-ES', 'gl-ES', 'af-ZA', 'sw-KE', 'am-ET',
    ];
    // 2 numeric modes × 70+ locales = well over the 100-entry cap
    for (const locale of locales) {
      formatDistance(tomorrow, today, { locale, numeric: 'always' });
      formatDistance(tomorrow, today, { locale, numeric: 'auto' });
    }
    // evictions happened along the way; behavior stays correct
    expect(formatDistance(tomorrow, today, { locale: 'en-US', numeric: 'always' })).toBe('in 1 day');
    expect(formatDistance(tomorrow, today, { locale: 'en-US' })).toBe('tomorrow');
  });
});

// formatDistanceToNow — lines 372-387. There is no injectable "now", so
// fake timers pin the system clock; the expected wall-clock fields are
// derived from the faked Date() so the assertions hold in any timezone.
describe('formatDistanceToNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function localNowFields() {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      millisecond: now.getMilliseconds(),
    };
  }

  it('reads the full wall-clock time off the system clock for "now"', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 4, 12, 0, 0) });
    const local = localNowFields();
    // local "today" is Aug 4 or Aug 5 depending on the machine timezone;
    // ±3 days stays inside August either way, so the diff is exactly 3 days
    expect(formatDistanceToNow({ ...local, day: local.day + 3 })).toBe('in 3 days');
    expect(formatDistanceToNow({ ...local, day: local.day - 3 })).toBe('3 days ago');
    expect(formatDistanceToNow({ ...local })).toBe('now');
  });

  it('passes options through to formatDistance (with and without an options bag)', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 4, 12, 0, 0) });
    const local = localNowFields();
    expect(formatDistanceToNow({ ...local }, { numeric: 'always' })).toBe('in 0 seconds');
    expect(formatDistanceToNow({ ...local, day: local.day + 1 }, { locale: 'fr-FR' })).toBe('demain');
    expect(typeof formatDistanceToNow({ ...local })).toBe('string');
  });

  it('delegates input validation to formatDistance', () => {
    expect(() => formatDistanceToNow(null)).toThrow(/expects Temporal values/);
    expect(() => formatDistanceToNow('2026-08-04')).toThrow(/expects Temporal values/);
  });
});
