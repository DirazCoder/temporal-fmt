import { describe, expect, it } from 'vitest';
import { parseRelative } from '../src/parseRelative.js';
import { setTemporal, type TemporalNamespace } from '../src/temporalProvider.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = (globalThis.Temporal ?? PolyfillTemporal) as unknown as TemporalNamespace;
setTemporal(Temporal);

// node --test covers the public parseRelative API at the boundary cases
// the README documents (next Tuesday on Tuesday, Feb 29th, etc.).
// These go straight at the source to catch a regression in the
// internal weekdayOffset / resolveToNextOccurrence helpers without
// having to thread them through the public-API test file's fixtures.

const REFERENCE = Temporal.PlainDate.from({ year: 2026, month: 8, day: 4 }); // Tuesday

describe('parseRelative: day offsets', () => {
  it('today returns the reference date', () => {
    expect((parseRelative('today', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-04');
  });

  it('tomorrow / yesterday returns ±1 day', () => {
    expect((parseRelative('tomorrow', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-05');
    expect((parseRelative('yesterday', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-03');
  });
});

describe('parseRelative: weekday offsets', () => {
  it('next Tuesday said on Tuesday returns 7 days out (strictly future)', () => {
    expect((parseRelative('next Tuesday', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-11');
  });

  it('last Tuesday said on Tuesday returns 7 days ago (strictly past)', () => {
    expect((parseRelative('last Tuesday', REFERENCE) as { toString(): string }).toString()).toBe('2026-07-28');
  });

  it('this Wednesday returns Wednesday of the current ISO week', () => {
    expect((parseRelative('this Wednesday', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-05');
  });
});

describe('parseRelative: unit offsets', () => {
  it('in N days → +N days', () => {
    expect((parseRelative('in 3 days', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-07');
  });

  it('N weeks ago → -N weeks', () => {
    expect((parseRelative('2 weeks ago', REFERENCE) as { toString(): string }).toString()).toBe('2026-07-21');
  });

  it('in N months → +N calendar months', () => {
    expect((parseRelative('in 1 month', REFERENCE) as { toString(): string }).toString()).toBe('2026-09-04');
  });

  it('N years ago → -N calendar years', () => {
    expect((parseRelative('5 years ago', REFERENCE) as { toString(): string }).toString()).toBe('2021-08-04');
  });
});

describe('parseRelative: month-day without year', () => {
  it('resolves to next occurrence (future-leaning)', () => {
    expect((parseRelative('March 5th', REFERENCE) as { toString(): string }).toString()).toBe('2027-03-05');
  });

  it('returns today when today is the named date', () => {
    expect((parseRelative('August 4th', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-04');
  });

  it('accepts abbreviated month names', () => {
    expect((parseRelative('Aug 4', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-04');
  });

  it('handles Feb 29th on a leap-year reference', () => {
    const ref = Temporal.PlainDate.from({ year: 2024, month: 1, day: 1 });
    expect((parseRelative('Feb 29th', ref) as { toString(): string }).toString()).toBe('2024-02-29');
  });

  it('throws on Feb 29th when no valid year exists in the 2-year window', () => {
    const ref = Temporal.PlainDate.from({ year: 2025, month: 1, day: 1 });
    expect(() => parseRelative('Feb 29th', ref)).toThrow(/can't resolve month 2 day 29/);
  });
});

describe('parseRelative: adversarial / error paths', () => {
  it('throws on unrecognized phrase', () => {
    expect(() => parseRelative('the quick brown fox', REFERENCE)).toThrow(/doesn't recognize/);
  });

  it('throws on empty input', () => {
    expect(() => parseRelative('', REFERENCE)).toThrow(/empty input string/);
    expect(() => parseRelative('   ', REFERENCE)).toThrow(/empty input string/);
  });

  it('throws on bare "5 days" without direction', () => {
    expect(() => parseRelative('5 days', REFERENCE)).toThrow(/can't tell whether/);
  });

  it('case-insensitive: lowercase weekday name resolves the same', () => {
    expect((parseRelative('next tuesday', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-11');
  });

  it('case-insensitive: uppercase TOMORROW works', () => {
    expect((parseRelative('TOMORROW', REFERENCE) as { toString(): string }).toString()).toBe('2026-08-05');
  });
});

// ---------------------------------------------------------------------
// Coverage additions: reference-field guards, both weekdayOffset wrap
// directions, contradictory direction markers, input guards, the opt-in
// fuzzy layer, month-day with explicit year, and the PlainDate.compare
// capability check.

const iso = (result: unknown): string => (result as { toString(): string }).toString();

describe('parseRelative: reference-field validation', () => {
  it('throws when the reference date is missing year', () => {
    expect(() => parseRelative('today', {})).toThrow(/reference date is missing year/);
  });

  it('throws when the reference date is missing month', () => {
    expect(() => parseRelative('today', { year: 2026 })).toThrow(/reference date is missing month/);
  });

  it('throws when the reference date is missing day', () => {
    expect(() => parseRelative('today', { year: 2026, month: 8 })).toThrow(/reference date is missing day/);
  });

  it('throws when the reference date exposes no dayOfWeek (weekday phrases)', () => {
    expect(() => parseRelative('next Monday', { year: 2026, month: 8, day: 4 })).toThrow(/exposing dayOfWeek/);
  });
});

describe('parseRelative: weekdayOffset wrap directions', () => {
  it('"next Friday" from a Tuesday needs no +7 wrap', () => {
    expect(iso(parseRelative('next Friday', REFERENCE))).toBe('2026-08-07');
  });

  it('"last Monday" from a Tuesday needs no -7 wrap', () => {
    expect(iso(parseRelative('last Monday', REFERENCE))).toBe('2026-08-03');
  });
});

describe('parseRelative: contradictory direction markers', () => {
  it('throws on "in 3 days ago" (future and past markers both present)', () => {
    expect(() => parseRelative('in 3 days ago', REFERENCE)).toThrow(/contradictory direction markers/);
  });
});

describe('parseRelative: input guards', () => {
  it('throws RangeError when input exceeds 4096 characters', () => {
    expect(() => parseRelative('x'.repeat(4097), REFERENCE)).toThrow(RangeError);
    expect(() => parseRelative('x'.repeat(4097), REFERENCE)).toThrow(/maximum 4096 characters/);
  });

  it('treats nullish input as empty (nullish-coalescing fallback on input)', () => {
    expect(() => parseRelative(null as unknown as string, REFERENCE)).toThrow(/empty input string/);
    expect(() => parseRelative(undefined as unknown as string, REFERENCE)).toThrow(/empty input string/);
  });
});

describe('parseRelative: month-day with explicit year (year ignored)', () => {
  it('"March 5, 2026" still resolves to the next future occurrence', () => {
    expect(iso(parseRelative('March 5, 2026', REFERENCE))).toBe('2027-03-05');
  });
});

describe('parseRelative: fuzzy matching (opt-in)', () => {
  it('corrects a typo day offset: "tommorow" → "tomorrow"', () => {
    expect(iso(parseRelative('tommorow', REFERENCE, { fuzzy: true }))).toBe('2026-08-05');
  });

  it('corrects multiple typo words in one phrase: "nextt friyday" → "next friday"', () => {
    expect(iso(parseRelative('nextt friyday', REFERENCE, { fuzzy: true }))).toBe('2026-08-07');
  });

  it('never touches pure numbers and ordinal-suffixed numbers: "marchx 5th"', () => {
    expect(iso(parseRelative('marchx 5th', REFERENCE, { fuzzy: true }))).toBe('2027-03-05');
  });

  it('passes already-correct marker words through while correcting the unit: "in 3 dayz"', () => {
    expect(iso(parseRelative('in 3 dayz', REFERENCE, { fuzzy: true }))).toBe('2026-08-07');
  });

  it('gives up unchanged when no word is correctable: "next zzzzzz"', () => {
    expect(() => parseRelative('next zzzzzz', REFERENCE, { fuzzy: true })).toThrow(/doesn't recognize/);
  });

  it('still throws when the corrected phrase matches nothing: "nextt zzzzzz"', () => {
    expect(() => parseRelative('nextt zzzzzz', REFERENCE, { fuzzy: true })).toThrow(/doesn't recognize/);
  });

  it('throws RangeError when the fuzzy input exceeds 32 words', () => {
    expect(() => parseRelative('nope '.repeat(33).trim(), REFERENCE, { fuzzy: true })).toThrow(/fuzzy input is too large/);
  });

  it('throws when fuzzy is combined with a non-English locale', () => {
    expect(() => parseRelative('tommorow', REFERENCE, { fuzzy: true, locale: 'es-ES' })).toThrow(/only supports English/);
  });
});

describe('parseRelative: Temporal capability requirements', () => {
  it('throws a clear error when the active Temporal lacks PlainDate.compare (month-day phrases)', () => {
    const withoutCompare = {
      PlainDate: {
        from: (fields: Record<string, number>, options?: { overflow?: 'constrain' | 'reject' }) =>
          Temporal.PlainDate.from(fields, options),
      },
      PlainTime: Temporal.PlainTime,
      PlainDateTime: Temporal.PlainDateTime,
      ZonedDateTime: Temporal.ZonedDateTime,
    } as unknown as TemporalNamespace;
    setTemporal(withoutCompare);
    try {
      expect(() => parseRelative('March 5th', REFERENCE)).toThrow(/needs Temporal\.PlainDate\.compare/);
    } finally {
      setTemporal(Temporal);
    }
  });
});
