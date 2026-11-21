import { describe, expect, it } from 'vitest';
import { registerLocale, getLocale, hasLocale } from '../../src/locale/localeRegistry.js';
import { InvalidLocaleError } from '../../src/core/errors.js';

const base = {
  monthLong: ['Mo1', 'Mo2', 'Mo3', 'Mo4', 'Mo5', 'Mo6', 'Mo7', 'Mo8', 'Mo9', 'Mo10', 'Mo11', 'Mo12'],
  monthShort: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'],
  weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
  weekdayShort: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
  dayPeriod: ['AM', 'PM'],
};

describe('registerLocale / hasLocale / getLocale', () => {
  it('registers extended fields and reads them back', () => {
    registerLocale('vitest-locale-1', { ...base, quartersLong: ['First', 'Second', 'Third', 'Fourth'] });
    expect(hasLocale('vitest-locale-1')).toBe(true);
    expect(getLocale('vitest-locale-1')?.quartersLong?.[0]).toBe('First');
  });

  it('falls back to the Intl-derived vocab for a locale never registered here', () => {
    expect(hasLocale('fr')).toBe(false);
    const vocab = getLocale('fr');
    expect(vocab?.monthLong[0]).toBe('janvier');
    expect(vocab?.quartersLong).toBeUndefined();
  });
});

describe('registerLocale validation', () => {
  it('rejects a wrong-shaped extended field', () => {
    expect(() => registerLocale('vitest-locale-bad', { ...base, quartersLong: 'not-an-array' as never })).toThrow(
      /"quartersLong" must be an array/,
    );
  });
});

describe('registerLocale argument validation', () => {
  it('rejects an empty locale string', () => {
    // lines 82-83: length === 0 half of the guard
    expect(() => registerLocale('', { ...base })).toThrow(InvalidLocaleError);
    expect(() => registerLocale('', { ...base })).toThrow(/non-empty/);
  });

  it('rejects a non-string locale', () => {
    // lines 82-83: typeof half of the guard
    expect(() => registerLocale(null as never, { ...base })).toThrow(/non-empty/);
  });

  it('rejects a locale tag over 256 characters', () => {
    // lines 85-86: MAX_LOCALE_TAG_LENGTH guard
    expect(() => registerLocale('y'.repeat(257), { ...base })).toThrow(/at most 256 characters/);
  });

  it('propagates base-vocab validation failures from registerLocaleVocab', () => {
    // the base fields are validated by registerLocaleVocab() first — a bad
    // monthLong must surface its error, not reach extended validation
    expect(() => registerLocale('rl-base-bad', { ...base, monthLong: [] as never })).toThrow(
      /"monthLong" must have exactly 12 entries/,
    );
  });
});

describe('registerLocale extended-field validation', () => {
  it('rejects a wrong-length array', () => {
    // lines 103-104
    expect(() => registerLocale('rl-len', { ...base, quartersLong: ['Q1', 'Q2', 'Q3'] })).toThrow(
      /"quartersLong" must have 4 entries \(got 3\)/,
    );
  });

  it('rejects an empty-string entry', () => {
    // lines 107-108
    expect(() => registerLocale('rl-empty', { ...base, erasLong: ['BC', ''] })).toThrow(
      /"erasLong\[1\]" must be a non-empty string/,
    );
  });

  it('rejects a non-string entry', () => {
    // lines 107-108: typeof half of the per-entry guard
    expect(() => registerLocale('rl-type', { ...base, ordinals: ['st', 'nd', 'rd', 4] as never })).toThrow(
      /"ordinals\[3\]" must be a non-empty string/,
    );
  });

  it('rejects an entry over 256 characters', () => {
    // lines 110-111: MAX_VOCAB_STRING_LENGTH guard
    expect(() => registerLocale('rl-long', { ...base, erasShort: ['B', 'A'.repeat(257)] })).toThrow(
      /at most 256 characters/,
    );
  });
});

describe('getLocale / hasLocale edge cases', () => {
  it('returns undefined for a malformed locale tag rather than throwing', () => {
    // lines 131-135: the Intl-derived fallback catches assertValidLocaleTag's
    // InvalidLocaleError and reports "nothing registered" instead
    expect(getLocale('not_a_locale!!')).toBeUndefined();
  });

  it('hasLocale is false for a malformed locale tag', () => {
    // canonicalKey()'s catch: malformed tags key on the raw string
    expect(hasLocale('not_a_locale!!')).toBe(false);
  });

  it('re-registering a locale overwrites the previous extended vocab', () => {
    registerLocale('xx-rltest', { ...base, quartersShort: ['1q', '2q', '3q', '4q'] });
    registerLocale('xx-rltest', { ...base, quartersShort: ['I', 'II', 'III', 'IV'] });
    expect(getLocale('xx-rltest')?.quartersShort).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('folds case and underscore variants of a locale tag to the same registry key', () => {
    expect(hasLocale('XX_RLTEST')).toBe(true);
    expect(getLocale('xx-rltest')?.quartersShort?.[0]).toBe('I');
  });
});
