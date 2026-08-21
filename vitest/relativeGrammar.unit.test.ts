import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { registerRelativeGrammar, tryRegisteredGrammar, listRegisteredGrammars } from '../src/relativeGrammar.js';

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
