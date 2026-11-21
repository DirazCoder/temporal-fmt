import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { registerRelativeGrammar, tryRegisteredGrammar, listRegisteredGrammars } from '../../src/parse/relativeGrammar.js';
import { parseRelative } from '../../src/parse/parseRelative.js';

setTemporal(Temporal);

describe('registerRelativeGrammar / listRegisteredGrammars', () => {
  it('registers a grammar and lists its language', () => {
    registerRelativeGrammar({ language: 'vitest-lang', matchers: [() => null] });
    expect(listRegisteredGrammars()).toContain('vitest-lang');
  });

  it('re-registering the same language replaces rather than appends', () => {
    registerRelativeGrammar({ language: 'vitest-lang-replace', matchers: [() => null] });
    registerRelativeGrammar({ language: 'vitest-lang-replace', matchers: [() => null] });
    const matches = listRegisteredGrammars().filter((l) => l === 'vitest-lang-replace');
    expect(matches).toHaveLength(1);
  });

  it('throws on an empty language or missing matchers', () => {
    expect(() => registerRelativeGrammar({ language: '', matchers: [() => null] })).toThrow(/non-empty language string/);
    expect(() => registerRelativeGrammar({ language: 'vitest-lang-empty', matchers: [] })).toThrow(/at least one matcher/);
  });
});

describe('tryRegisteredGrammar', () => {
  it('resolves a match to a Temporal value using the matcher-provided resolve()', () => {
    registerRelativeGrammar({
      language: 'vitest-resolve-lang',
      matchers: [(input: string) => (input === 'probeword' ? { resolve: (ref: { year: number; month: number; day: number }) => ({ year: ref.year, month: ref.month, day: ref.day + 1 }) } : null)],
    });
    const ref = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
    const result = tryRegisteredGrammar('vitest-resolve-lang', 'probeword', ref) as Temporal.PlainDate;
    expect(result.toString()).toBe('2026-08-05');
  });

  it('returns null when no matcher matches, or the language is unregistered', () => {
    registerRelativeGrammar({ language: 'vitest-miss-lang', matchers: [() => null] });
    expect(tryRegisteredGrammar('vitest-miss-lang', 'anything', { year: 2026, month: 8, day: 4, dayOfWeek: 2 })).toBeNull();
    expect(tryRegisteredGrammar('never-registered', 'anything', { year: 2026, month: 8, day: 4, dayOfWeek: 2 })).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Coverage additions: validation throws (non-string language, language
// length, matcher count, non-function matchers), matcher error
// isolation, field-bag matches with per-field fallbacks, first-match
// ordering, parseRelative integration/precedence, and the 100-grammar
// registration cap (kept last — it fills the registry to the limit).

describe('registerRelativeGrammar: validation', () => {
  it('throws on a non-string language', () => {
    expect(() => registerRelativeGrammar({ language: 42 as unknown as string, matchers: [() => null] })).toThrow(/non-empty language string/);
  });

  it('throws on a language tag longer than 35 characters', () => {
    expect(() => registerRelativeGrammar({ language: 'x'.repeat(36), matchers: [() => null] })).toThrow(RangeError);
    expect(() => registerRelativeGrammar({ language: 'x'.repeat(36), matchers: [() => null] })).toThrow(/at most 35 characters/);
  });

  it('throws on more than 1000 matchers', () => {
    const matchers = Array.from({ length: 1001 }, () => () => null);
    expect(() => registerRelativeGrammar({ language: 'vitest-too-many-matchers', matchers })).toThrow(RangeError);
    expect(() => registerRelativeGrammar({ language: 'vitest-too-many-matchers', matchers })).toThrow(/at most 1000 matchers/);
  });

  it('throws when any matcher is not a function', () => {
    expect(() =>
      registerRelativeGrammar({ language: 'vitest-not-a-fn', matchers: [() => null, 'nope' as unknown as () => null] })
    ).toThrow(/must all be functions/);
  });
});

describe('tryRegisteredGrammar: matcher isolation and field bags', () => {
  const REF = { year: 2026, month: 8, day: 4, dayOfWeek: 2 };
  const iso = (result: unknown) => (result as { toString(): string }).toString();

  it('treats a throwing matcher as a non-match and tries the next one', () => {
    registerRelativeGrammar({
      language: 'vitest-throw-lang',
      matchers: [
        () => {
          throw new Error('matcher exploded');
        },
        (input: string) => (input === 'afterthrow' ? { year: 2020, month: 1, day: 1 } : null),
      ],
    });
    expect(iso(tryRegisteredGrammar('vitest-throw-lang', 'afterthrow', REF))).toBe('2020-01-01');
  });

  it('continues when a matcher throws during resolve', () => {
    registerRelativeGrammar({
      language: 'vitest-resolve-throw-lang',
      matchers: [
        () => ({ resolve: () => { throw new Error('resolve exploded'); } }),
        () => ({ year: 2021, month: 2, day: 3 }),
      ] as unknown as Parameters<typeof registerRelativeGrammar>[0]['matchers'],
    });
    expect(iso(tryRegisteredGrammar('vitest-resolve-throw-lang', 'anything', REF))).toBe('2021-02-03');
  });

  it('fills missing year/month/day from the reference date (field-bag matches)', () => {
    registerRelativeGrammar({
      language: 'vitest-fields-lang',
      matchers: [
        (input: string) => (input === 'no-year' ? { month: 3, day: 5 } : null),
        (input: string) => (input === 'no-month' ? { year: 2030, day: 15 } : null),
        (input: string) => (input === 'no-day' ? { year: 2030, month: 7 } : null),
        (input: string) => (input === 'full-fields' ? { year: 2031, month: 5, day: 9 } : null),
      ],
    });
    expect(iso(tryRegisteredGrammar('vitest-fields-lang', 'no-year', REF))).toBe('2026-03-05');
    expect(iso(tryRegisteredGrammar('vitest-fields-lang', 'no-month', REF))).toBe('2030-08-15');
    expect(iso(tryRegisteredGrammar('vitest-fields-lang', 'no-day', REF))).toBe('2030-07-04');
    expect(iso(tryRegisteredGrammar('vitest-fields-lang', 'full-fields', REF))).toBe('2031-05-09');
  });

  it('tries matchers in order — the first non-null match wins', () => {
    registerRelativeGrammar({
      language: 'vitest-order-lang',
      matchers: [
        (input: string) => (input === 'ordered' ? { year: 2001, month: 1, day: 1 } : null),
        (input: string) => (input === 'ordered' ? { year: 2002, month: 2, day: 2 } : null),
      ],
    });
    expect(iso(tryRegisteredGrammar('vitest-order-lang', 'ordered', REF))).toBe('2001-01-01');
  });
});

describe('registerRelativeGrammar → parseRelative integration', () => {
  const REF = Temporal.PlainDate.from({ year: 2026, month: 8, day: 4 }); // Tuesday
  const iso = (result: unknown) => (result as { toString(): string }).toString();

  it('dispatches parseRelative() to a registered grammar for its language', () => {
    registerRelativeGrammar({
      language: 'zz',
      matchers: [(input: string) => (input === 'blorpday' ? { year: 1999, month: 12, day: 31 } : null)],
    });
    expect(iso(parseRelative('blorpday', REF, { locale: 'zz-ZZ' }))).toBe('1999-12-31');
  });

  it('registered grammars take precedence over the built-in for that language, and a miss falls through', () => {
    registerRelativeGrammar({
      language: 'en',
      matchers: [(input: string) => (input === 'today' ? { year: 2000, month: 1, day: 1 } : null)],
    });
    // Registered matcher wins over the built-in English "today".
    expect(iso(parseRelative('today', REF, { locale: 'en-US' }))).toBe('2000-01-01');
    // Registered matcher returns null → the built-in English grammar takes over.
    expect(iso(parseRelative('tomorrow', REF, { locale: 'en-US' }))).toBe('2026-08-05');
  });
});

describe('registerRelativeGrammar: registration cap', () => {
  // Deliberately LAST in this file: it fills the registry up to the
  // MAX_REGISTERED_GRAMMARS (100) limit, after which any first-time
  // registration of a new language throws instead of appending.
  it('throws once 100 distinct grammars are registered', () => {
    let n = 0;
    while (listRegisteredGrammars().length < 100) {
      registerRelativeGrammar({ language: `vitest-cap-${n++}`, matchers: [() => null] });
    }
    expect(() => registerRelativeGrammar({ language: 'vitest-cap-overflow', matchers: [() => null] })).toThrow(RangeError);
    expect(() => registerRelativeGrammar({ language: 'vitest-cap-overflow', matchers: [() => null] })).toThrow(/100-grammar limit/);
  });
});
