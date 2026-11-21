import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  resolveZoned,
  getTimeZone,
  getOffset,
  getOffsetNanoseconds,
  isDST,
  getNextTransition,
  getPreviousTransition,
  getTransitions,
  possibleInstantsFor,
} from '../../src/calendar/timezone.js';

setTemporal(Temporal);

describe('resolveZoned', () => {
  it('constructs a ZonedDateTime, defaulting missing time fields to 0', () => {
    const r = resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC');
    expect(getOffset(r)).toBe('+00:00');
  });
});

describe('getTimeZone / getOffset / getOffsetNanoseconds', () => {
  it('reads the zone id, offset string, and offset nanoseconds', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
    expect(getTimeZone(zdt)).toBe('UTC');
    expect(getOffset(zdt)).toBe('+00:00');
    expect(getOffsetNanoseconds(zdt)).toBe(0);
  });

  it('throws on a non-ZonedDateTime value', () => {
    expect(() => getTimeZone(42)).toThrow(/expected a ZonedDateTime/);
  });
});

describe('isDST', () => {
  it('is true in summer and false in winter for a DST-observing zone', () => {
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-04T12:00[America/New_York]'))).toBe(true);
    expect(isDST(Temporal.ZonedDateTime.from('2026-01-04T12:00[America/New_York]'))).toBe(false);
  });
});

describe('getNextTransition / getTransitions', () => {
  it('UTC never transitions, so the search is exhausted and returns undefined', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]');
    expect(getNextTransition(zdt)).toBeUndefined();
  });

  it('finds the real spring-forward date in a DST-observing zone', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
    const next = getNextTransition(zdt) as Temporal.ZonedDateTime;
    expect(next.toString().slice(0, 10)).toBe('2026-03-09');
  });

  it('trims transitions that fall after the end boundary', () => {
    const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
    const end = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
    const transitions = getTransitions(start, end);
    expect(transitions).toHaveLength(1);
  });
});

describe('possibleInstantsFor', () => {
  it('returns 1 instant for a normal time, 0 for a spring-forward gap, 2 for a fall-back overlap', () => {
    expect(possibleInstantsFor({ year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(1);
    expect(possibleInstantsFor({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(0);
    expect(possibleInstantsFor({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0, millisecond: 0 }, 'America/New_York')).toHaveLength(2);
  });
});

describe('resolveZoned (disambiguation, options, error paths)', () => {
  // NY fall-back: 2026-11-01 01:30 happens twice (-04:00 then -05:00).
  const ambiguous = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
  // NY spring-forward: 2026-03-08 02:30 never happens.
  const skipped = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };

  it('resolves an ambiguous (fall-back) wall-clock time per disambiguation mode', () => {
    expect(getOffset(resolveZoned(ambiguous, 'America/New_York', { disambiguation: 'compatible' }))).toBe('-04:00');
    expect(getOffset(resolveZoned(ambiguous, 'America/New_York', { disambiguation: 'earlier' }))).toBe('-04:00');
    expect(getOffset(resolveZoned(ambiguous, 'America/New_York', { disambiguation: 'later' }))).toBe('-05:00');
  });

  it('resolves a skipped (spring-forward) wall-clock time per disambiguation mode', () => {
    expect(getOffset(resolveZoned(skipped, 'America/New_York', { disambiguation: 'compatible' }))).toBe('-04:00');
    expect(getOffset(resolveZoned(skipped, 'America/New_York', { disambiguation: 'earlier' }))).toBe('-05:00');
    expect(getOffset(resolveZoned(skipped, 'America/New_York', { disambiguation: 'later' }))).toBe('-04:00');
  });

  it("'reject' throws for ambiguous and skipped times, but passes unambiguous ones", () => {
    expect(() => resolveZoned(ambiguous, 'America/New_York', { disambiguation: 'reject' })).toThrow();
    expect(() => resolveZoned(skipped, 'America/New_York', { disambiguation: 'reject' })).toThrow();
    expect(getOffset(resolveZoned({ year: 2026, month: 8, day: 4, hour: 12 }, 'America/New_York', { disambiguation: 'reject' }))).toBe('-04:00');
  });

  it('forwards every time field plus the offset/overflow options', () => {
    const r = resolveZoned(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 15, millisecond: 250, microsecond: 40, nanosecond: 5 },
      'America/New_York',
      { disambiguation: 'later', overflow: 'constrain', offset: 'prefer' },
    ) as Temporal.ZonedDateTime;
    expect(r.toString()).toBe('2026-11-01T01:30:15.250040005-05:00[America/New_York]');
    // remaining offset modes are forwarded without changing the result
    expect(getOffset(resolveZoned({ year: 2026, month: 8, day: 4, hour: 1 }, 'UTC', { offset: 'use' }))).toBe('+00:00');
    expect(getOffset(resolveZoned({ year: 2026, month: 8, day: 4, hour: 1 }, 'UTC', { offset: 'ignore' }))).toBe('+00:00');
    expect(getOffset(resolveZoned({ year: 2026, month: 8, day: 4, hour: 1 }, 'UTC', { offset: 'reject' }))).toBe('+00:00');
  });

  it('rethrows underlying errors that are not DST-gap errors', () => {
    expect(() => resolveZoned({ year: 2026, month: 2, day: 30 }, 'UTC', { overflow: 'reject' })).toThrow(RangeError);
    expect(() => resolveZoned({ year: 2026, month: 1, day: 1 }, 'Mars/Olympus')).toThrow(RangeError);
  });

  it('rewrites "no such wall-clock time" gap errors from a rejecting implementation', () => {
    // Other Temporal implementations (native, @js-temporal) report DST gaps as
    // "no such (wall-clock) time"; for disambiguation:'reject' resolveZoned
    // swaps in a clearer message.
    const realFrom = Temporal.ZonedDateTime.from.bind(Temporal.ZonedDateTime) as (f: unknown, o?: unknown) => unknown;
    const shim = {
      ...Temporal,
      ZonedDateTime: {
        ...Temporal.ZonedDateTime,
        from(fields: unknown, opts?: { disambiguation?: string }) {
          const d = opts?.disambiguation;
          if (d === 'reject' || d === 'earlier') throw new RangeError('no such wall-clock time');
          return realFrom(fields, opts);
        },
      },
    };
    setTemporal(shim);
    try {
      // gap + reject → the clearer temporal-fmt message
      expect(() => resolveZoned(skipped, 'America/New_York', { disambiguation: 'reject' })).toThrow(/falls in a DST gap/);
      // a "no such time" error under a non-reject mode is rethrown as-is
      expect(() => resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC', { disambiguation: 'earlier' })).toThrow(/no such wall-clock time/);
      // a date-only field bag reports its defaulted midnight in the message
      expect(() => resolveZoned({ year: 2026, month: 3, day: 8 }, 'America/New_York', { disambiguation: 'reject' }))
        .toThrow(/has no such wall-clock time on 2026-3-8T0:0/);
    } finally {
      setTemporal(Temporal);
    }
  });
});

describe('getTimeZone / getOffset / getOffsetNanoseconds (guards, offset forms)', () => {
  it('getTimeZone: named zones, fixed-offset zone ids, and reject guards', () => {
    expect(getTimeZone(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[America/New_York]'))).toBe('America/New_York');
    // fixed-offset zone ids round-trip verbatim
    expect(getTimeZone(Temporal.ZonedDateTime.from('2026-08-04T15:45:30+02:30[+02:30]'))).toBe('+02:30');
    // nullish input (optional-chain arm) and a value with no timeZoneId
    expect(() => getTimeZone(null)).toThrow(/expected a ZonedDateTime, got object/);
    expect(() => getTimeZone({ offset: '+00:00' })).toThrow(/expected a ZonedDateTime, got object/);
  });

  it('getOffset: ±HH:MM, sub-hour zones, sub-minute LMT offsets, and guards', () => {
    expect(getOffset(Temporal.ZonedDateTime.from('2026-01-15T12:00[America/New_York]'))).toBe('-05:00');
    expect(getOffset(Temporal.ZonedDateTime.from('2026-07-04T12:00[America/New_York]'))).toBe('-04:00');
    expect(getOffset(Temporal.ZonedDateTime.from('2026-07-04T12:00[Asia/Kolkata]'))).toBe('+05:30');
    expect(getOffset(Temporal.ZonedDateTime.from('2026-01-04T12:00[Australia/Eucla]'))).toBe('+08:45');
    expect(getOffset(Temporal.ZonedDateTime.from('2026-01-04T12:00[Pacific/Marquesas]'))).toBe('-09:30');
    // sub-minute LMT-era offset string
    expect(getOffset(Temporal.ZonedDateTime.from('1885-01-01T12:00[Europe/Amsterdam]'))).toBe('+00:17:30');
    expect(() => getOffset(null)).toThrow(/expected a ZonedDateTime, got object/);
    expect(() => getOffset(42)).toThrow(/expected a ZonedDateTime, got number/);
  });

  it('getOffsetNanoseconds: prefers the numeric field, else parses ±HH:MM strings', () => {
    expect(getOffsetNanoseconds(Temporal.ZonedDateTime.from('2026-01-15T12:00[America/New_York]'))).toBe(-18_000_000_000_000);
    expect(getOffsetNanoseconds(Temporal.ZonedDateTime.from('2026-07-04T12:00[Asia/Kolkata]'))).toBe(19_800_000_000_000);
    expect(getOffsetNanoseconds(Temporal.ZonedDateTime.from('2026-01-04T12:00[Pacific/Marquesas]'))).toBe(-34_200_000_000_000);
    // sub-minute LMT offset: +00:17:30 → 1050s → 1.05e12 ns
    expect(getOffsetNanoseconds(Temporal.ZonedDateTime.from('1885-01-01T12:00[Europe/Amsterdam]'))).toBe(1_050_000_000_000);
    // the numeric field wins even when the string is bogus
    expect(getOffsetNanoseconds({ offsetNanoseconds: 987_654_321, offset: 'bogus' })).toBe(987_654_321);
    // string fallback: both signs, zero, sub-hour minutes
    expect(getOffsetNanoseconds({ offset: '+05:30' })).toBe(19_800_000_000_000);
    expect(getOffsetNanoseconds({ offset: '-08:45' })).toBe(-31_500_000_000_000);
    expect(getOffsetNanoseconds({ offset: '+00:00' })).toBe(0);
  });

  it('getOffsetNanoseconds: throws on unparseable offsets and non-ZonedDateTime values', () => {
    expect(() => getOffsetNanoseconds({ offset: 'GMT+2' })).toThrow(/couldn't parse offset "GMT\+2"/);
    expect(() => getOffsetNanoseconds({})).toThrow(/expected a ZonedDateTime/);
    expect(() => getOffsetNanoseconds(null)).toThrow(/expected a ZonedDateTime, got object/);
  });
});

describe('isDST (hemispheres, LMT eras, fallbacks, guards)', () => {
  it('southern hemisphere: Sydney keeps DST in January and drops it by July', () => {
    expect(isDST(Temporal.ZonedDateTime.from('2026-01-15T12:00[Australia/Sydney]'))).toBe(true);
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-15T12:00[Australia/Sydney]'))).toBe(false);
  });

  it('zones without DST — including fixed-offset zones and LMT eras — are never in DST', () => {
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-04T12:00[Asia/Kolkata]'))).toBe(false);
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-04T12:00[Australia/Eucla]'))).toBe(false);
    expect(isDST(Temporal.ZonedDateTime.from('2026-07-04T12:00+05:30[+05:30]'))).toBe(false);
    // Amsterdam's all-LMT year: Jan and Jul offsets are equal
    expect(isDST(Temporal.ZonedDateTime.from('1885-01-01T12:00[Europe/Amsterdam]'))).toBe(false);
  });

  it('compares a seconds-tailed LMT offset against the standard offset (Paris 1911)', () => {
    // Jan 1911 = Paris Mean Time +00:09:21, Jul 1911 = +00:00, so standard
    // time is the smaller; a February date still on +00:09:21 reads as
    // offset-from-standard.
    expect(isDST(Temporal.ZonedDateTime.from('1911-02-15T12:00[Europe/Paris]'))).toBe(true);
  });

  it('accepts duck-typed field views and compares their offset strings', () => {
    expect(isDST({ timeZoneId: 'America/New_York', offset: '-04:00', year: 2026 })).toBe(true);
    expect(isDST({ timeZoneId: 'America/New_York', offset: '-05:00', year: 2026 })).toBe(false);
  });

  it('returns false when the Jan/Jul zone probes fail (invalid zone id)', () => {
    expect(isDST({ timeZoneId: 'Not/AZone', offset: '+00:00', year: 2026 })).toBe(false);
  });

  it('throws for values that are not ZonedDateTime-like', () => {
    // nullish input (optional-chain arm)…
    expect(() => isDST(null)).toThrow(/expected a ZonedDateTime, got object/);
    // …an object missing every field…
    expect(() => isDST({})).toThrow(/expected a ZonedDateTime, got object/);
    // …and an object missing only the year
    expect(() => isDST({ timeZoneId: 'UTC', offset: '+00:00' })).toThrow(/expected a ZonedDateTime, got object/);
  });

  it('falls back to parsing offset strings when the implementation lacks offsetNanoseconds', () => {
    // Strip offsetNanoseconds from the probe results so isDST parses the
    // offset strings instead — including an LMT-style "+HH:MM:SS" tail and
    // an unparseable string (parsed as 0 seconds).
    const realFrom = Temporal.ZonedDateTime.from.bind(Temporal.ZonedDateTime) as (f: unknown, o?: unknown) => unknown;
    const shim = {
      ...Temporal,
      ZonedDateTime: {
        ...Temporal.ZonedDateTime,
        from(fields: unknown, opts?: unknown) {
          const f = fields as { month?: number; timeZone?: string };
          if (f.month === 1) {
            return { offset: f.timeZone === 'Europe/Amsterdam' ? '+00:17:30' : 'not-an-offset' };
          }
          const real = realFrom(fields, opts) as { offset: string };
          return { offset: real.offset };
        },
      },
    };
    setTemporal(shim);
    try {
      // Amsterdam: jan +00:17:30 (1050s) vs real jul +01:00 (3600s) → standard
      // 1050; the value's own seconds-tailed offset equals the standard → no DST
      expect(isDST({ timeZoneId: 'Europe/Amsterdam', offset: '+00:17:30', year: 1937 })).toBe(false);
      // New York: jan's junk string parses as 0 vs real jul -04:00 → standard
      // -14400; the value's -05:00 differs → DST
      expect(isDST({ timeZoneId: 'America/New_York', offset: '-05:00', year: 2026 })).toBe(true);
    } finally {
      setTemporal(Temporal);
    }
  });
});

describe('getNextTransition / getPreviousTransition (directions, duck-typed input, bisect edges)', () => {
  it('finds the fall-back going forward and the spring-forward going backward', () => {
    const next = getNextTransition(Temporal.ZonedDateTime.from('2026-06-01T12:00[America/New_York]')) as Temporal.ZonedDateTime;
    expect(next.toString().slice(0, 10)).toBe('2026-11-01');
    expect(next.offset).toBe('-05:00');
    const prev = getPreviousTransition(Temporal.ZonedDateTime.from('2026-06-01T12:00[America/New_York]')) as Temporal.ZonedDateTime;
    expect(prev.toString().slice(0, 10)).toBe('2026-03-08');
    expect(prev.offset).toBe('-04:00');
  });

  it('finds the southern-hemisphere fall-back (Sydney, April)', () => {
    const next = getNextTransition(Temporal.ZonedDateTime.from('2026-01-15T12:00[Australia/Sydney]')) as Temporal.ZonedDateTime;
    expect(next.toString().slice(0, 10)).toBe('2026-04-05');
    expect(next.offset).toBe('+10:00');
  });

  it('fixed-offset zones never transition', () => {
    expect(getNextTransition(Temporal.ZonedDateTime.from('2026-01-01T00:00+05:30[+05:30]'))).toBeUndefined();
  });

  it('derives the start offset for duck-typed input without an offset field', () => {
    // no `offset` on the input: findTransition probes the zone itself, using
    // the input's own hour…
    const withHour = getNextTransition({ timeZoneId: 'America/New_York', year: 2026, month: 1, day: 15, hour: 12 }) as Temporal.ZonedDateTime;
    expect(withHour.toString().slice(0, 10)).toBe('2026-03-08');
    expect(withHour.offset).toBe('-04:00');
    // …and defaulting to noon when the input has no hour either (the
    // day-by-day candidates then run at midnight, so detection slips to Mar 9)
    const noHour = getNextTransition({ timeZoneId: 'America/New_York', year: 2026, month: 1, day: 15 }) as Temporal.ZonedDateTime;
    expect(noHour.toString().slice(0, 10)).toBe('2026-03-09');
  });

  it('returns undefined when the zone probe fails for a duck-typed input', () => {
    expect(getNextTransition({ timeZoneId: 'Not/AZone', year: 2026, month: 1, day: 15 })).toBeUndefined();
  });

  it('throws for non-ZonedDateTime values, naming the direction', () => {
    expect(() => getNextTransition(null)).toThrow(/getNextTransition\(\) expected a ZonedDateTime/);
    expect(() => getPreviousTransition(42)).toThrow(/getPreviousTransition\(\) expected a ZonedDateTime, got number/);
  });

  it('handles failing probes and a window-end boundary in the bisect search', () => {
    // A virtual zone whose offset only changes at wall 00:00:30 on Apr 15 and
    // whose 23:59 probes are unresolvable: every whole-minute window probe
    // stays old-side, so the boundary lands at the window's very end
    // (hi >= 1440, normalized to 23:59), and the final reconstruction of that
    // unresolvable minute throws — so the candidate day is returned instead.
    const shim = {
      ...Temporal,
      ZonedDateTime: {
        ...Temporal.ZonedDateTime,
        from(fields: unknown) {
          const f = fields as {
            year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number;
          };
          if (f.hour === 23 && f.minute === 59) throw new RangeError('virtual zone: 23:59 is unresolvable');
          const isNew = f.month === 4 && f.day === 15 && f.hour === 0 && f.minute === 0 && (f.second ?? 0) > 0;
          return {
            offset: isNew ? '-04:00' : '-05:00',
            year: f.year, month: f.month, day: f.day, hour: f.hour, minute: f.minute, second: f.second ?? 0, millisecond: 0,
          };
        },
      },
    };
    setTemporal(shim);
    try {
      // Input carries seconds, so the day-by-day candidates (00:00:30) see the
      // new offset while the minute-granular window probes (00:00, 00:01, …) do not.
      const input = { timeZoneId: 'America/New_York', year: 2026, month: 1, day: 15, hour: 0, minute: 0, second: 30, offset: '-05:00' };
      const result = getNextTransition(input);
      // the candidate day's ZonedDateTime (whose reconstruction fell back) is returned
      expect(getOffset(result)).toBe('-04:00');
    } finally {
      setTemporal(Temporal);
    }
  });
});

describe('getTransitions (guards, boundary trimming, exhaustion)', () => {
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');

  it('collects every transition in a full year', () => {
    const ts = getTransitions(start, { year: 2026, month: 12, day: 31 });
    expect(ts).toHaveLength(2);
    expect((ts[0] as Temporal.ZonedDateTime).toString().slice(0, 10)).toBe('2026-03-09');
    expect((ts[1] as Temporal.ZonedDateTime).toString().slice(0, 10)).toBe('2026-11-02');
  });

  it('trims a transition that falls in a later year than the end boundary', () => {
    expect(getTransitions(start, { year: 2025, month: 12, day: 31 })).toEqual([]);
  });

  it('trims by month and by day inside the end year', () => {
    // the March transition lands on 03-09: an end of 03-07 trims it by day,
    // an end exactly on 03-09 keeps it
    expect(getTransitions(start, { year: 2026, month: 3, day: 7 })).toEqual([]);
    expect(getTransitions(start, { year: 2026, month: 3, day: 9 })).toHaveLength(1);
  });

  it('exhausts the search window for a zone without transitions', () => {
    expect(getTransitions(Temporal.ZonedDateTime.from('2026-01-01T00:00[UTC]'), { year: 2030, month: 1, day: 1 })).toEqual([]);
  });

  it('throws for invalid start and end values', () => {
    const end = Temporal.ZonedDateTime.from('2026-06-01T00:00[America/New_York]');
    expect(() => getTransitions(null, end)).toThrow(/expected a ZonedDateTime for start, got object/);
    expect(() => getTransitions(42, end)).toThrow(/expected a ZonedDateTime for start, got number/);
    expect(() => getTransitions(start, null)).toThrow(/expected a date-carrying value for end, got object/);
    expect(() => getTransitions(start, 42)).toThrow(/expected a date-carrying value for end, got number/);
    expect(() => getTransitions(start, { year: 2026 })).toThrow(/expected a date-carrying value for end, got object/);
  });
});

describe('possibleInstantsFor (southern hemisphere, sub-hour zones)', () => {
  it('returns 0 for the Sydney spring-forward gap and 2 for its fall-back overlap', () => {
    expect(possibleInstantsFor({ year: 2026, month: 10, day: 4, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'Australia/Sydney')).toHaveLength(0);
    const overlap = possibleInstantsFor({ year: 2026, month: 4, day: 5, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'Australia/Sydney');
    expect(overlap).toHaveLength(2);
    expect(getOffset(overlap[0])).toBe('+11:00'); // earlier side (still on DST)
    expect(getOffset(overlap[1])).toBe('+10:00'); // later side (standard time)
  });

  it('returns 1 for a normal time in a sub-hour-offset zone', () => {
    expect(possibleInstantsFor({ year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'Asia/Kolkata')).toHaveLength(1);
  });
});
