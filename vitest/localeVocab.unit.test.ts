import { describe, expect, it, vi } from 'vitest';
import {
  canonicalCacheKey,
  registerLocaleVocab,
  subscribeToVocabChanges,
  assertValidLocaleTag,
  getLocaleVocab,
  getCustomVocab,
} from '../src/localeVocab.js';
import { InvalidLocaleError } from '../src/errors.js';

// node --test only observes this indirectly, through cache eviction
// behavior on the dist build (see caches.test.js) — that's a real but
// weak signal, since correctness doesn't depend on cache-key
// canonicalization, only cache efficiency does (a bug here wouldn't make
// any test produce wrong output, just more cache churn). This calls
// canonicalCacheKey() directly so a regression shows up as a key-equality
// failure instead of hiding behind unrelated-looking cache behavior.
describe('canonicalCacheKey (L-03 fix)', () => {
  it('folds case variants of the same locale to the same key', () => {
    expect(canonicalCacheKey('en-US')).toBe(canonicalCacheKey('en-us'));
    expect(canonicalCacheKey('en-US')).toBe(canonicalCacheKey('EN-US'));
  });

  it('folds underscore and hyphen separator variants to the same key', () => {
    expect(canonicalCacheKey('en-US')).toBe(canonicalCacheKey('en_US'));
  });

  it('keeps genuinely different locales as different keys', () => {
    expect(canonicalCacheKey('en-US')).not.toBe(canonicalCacheKey('fr-FR'));
    expect(canonicalCacheKey('en-US')).not.toBe(canonicalCacheKey('en-GB'));
  });

  it('keeps different calendar/unicode extensions on the same base locale as different keys', () => {
    // resolveCalendar() (parse.ts) depends on the -u-ca- extension
    // surviving canonicalization distinctly per calendar — folding these
    // together would silently break Hebrew/Buddhist/etc. calendar
    // resolution, not just cache efficiency
    expect(canonicalCacheKey('en-u-ca-hebrew')).not.toBe(canonicalCacheKey('en-u-ca-buddhist'));
    expect(canonicalCacheKey('en-US')).not.toBe(canonicalCacheKey('en-US-u-ca-hebrew'));
  });

  it('falls back to the raw string on a malformed locale instead of throwing', () => {
    // canonicalCacheKey() is only ever computing a cache key, not
    // validating the locale — the actual new Intl.DateTimeFormat(locale)
    // call downstream is where a malformed tag should surface as an
    // error (see format.test.js's "malformed locale tag throws" test),
    // not here.
    expect(() => canonicalCacheKey('not_a_locale!!')).not.toThrow();
  });

  it('is idempotent — canonicalizing an already-canonical key returns the same value', () => {
    const key = canonicalCacheKey('en-US');
    expect(canonicalCacheKey(key)).toBe(key);
  });
});

// A well-shaped LocaleVocab for the registration tests below — all entries
// unique so assertNoCollision() never trips on it.
const validVocab = {
  monthLong: ['VJan', 'VFeb', 'VMar', 'VApr', 'VMay', 'VJun', 'VJul', 'VAug', 'VSep', 'VOct', 'VNov', 'VDec'],
  monthShort: ['VJa', 'VFe', 'VMr', 'VAp', 'VMa', 'VJu', 'VJl', 'VAu', 'VSe', 'VOc', 'VNo', 'VDe'],
  weekdayLong: ['VMonday', 'VTuesday', 'VWednesday', 'VThursday', 'VFriday', 'VSaturday', 'VSunday'],
  weekdayShort: ['VMo', 'VTu', 'VWe', 'VTh', 'VFr', 'VSa', 'VSu'],
  dayPeriod: ['V_AM', 'V_PM'],
};

// fresh mutable copy with per-case overrides, so one bad case can't poison the next
const vocabWith = (overrides: Record<string, unknown>) => ({
  monthLong: [...validVocab.monthLong],
  monthShort: [...validVocab.monthShort],
  weekdayLong: [...validVocab.weekdayLong],
  weekdayShort: [...validVocab.weekdayShort],
  dayPeriod: [...validVocab.dayPeriod],
  ...overrides,
});

describe('registerLocaleVocab — custom vocab registration', () => {
  it('registered vocab takes precedence over the Intl-derived vocab, including for an already-cached locale', () => {
    // build + cache the Intl-derived en-US vocab first; the override must
    // still win on the next lookup (customVocabs is checked before vocabCache)
    expect(getLocaleVocab('en-US').monthLong[0]).toBe('January');
    registerLocaleVocab('en-US', validVocab);
    expect(getCustomVocab('en-US')?.monthLong[0]).toBe('VJan');
    expect(getLocaleVocab('en-US').monthLong[0]).toBe('VJan');
  });

  it('notifies vocab-change subscribers when a vocab is registered', () => {
    // line 174: the onVocabChanged loop only has a body to run once someone
    // subscribes — parse.ts's pattern cache depends on this invalidation
    const listener = vi.fn();
    subscribeToVocabChanges(listener);
    registerLocaleVocab('en-GB', validVocab);
    expect(listener).toHaveBeenCalled();
  });

  it('folds case and underscore variants of a locale tag to one registry key', () => {
    registerLocaleVocab('fr-CA', validVocab);
    expect(getCustomVocab('FR_ca')).toBe(getCustomVocab('fr-CA'));
    expect(getCustomVocab('fr_ca')?.monthShort[0]).toBe('VJa');
  });
});

describe('registerLocaleVocab — vocab shape validation', () => {
  it('throws when a required field is missing', () => {
    // line 57-58: value === undefined branch
    expect(() => registerLocaleVocab('vd-missing', vocabWith({ monthLong: undefined }))).toThrow(
      /missing required field "monthLong"/,
    );
  });

  it('throws when a required field is not an array', () => {
    // line 62-63: !Array.isArray branch
    expect(() => registerLocaleVocab('vd-notarray', vocabWith({ monthShort: 'Jan,Feb,…' }))).toThrow(
      /"monthShort" must be an array, got string/,
    );
  });

  it('throws when an array has the wrong length', () => {
    // line 67-68: length mismatch branch
    expect(() => registerLocaleVocab('vd-len', vocabWith({ weekdayLong: validVocab.weekdayLong.slice(0, 6) }))).toThrow(
      /"weekdayLong" must have exactly 7 entries \(got 6\)/,
    );
  });

  it('throws on an empty-string entry', () => {
    // line 73-74: typeof ok but length 0
    const v = vocabWith({});
    (v.monthLong as string[])[4] = '';
    expect(() => registerLocaleVocab('vd-empty', v)).toThrow(/"monthLong\[4\]" must be a non-empty string/);
  });

  it('throws on a non-string entry', () => {
    // line 73-74: typeof branch (LHS of the ||)
    const v = vocabWith({});
    (v.monthLong as unknown as unknown[])[4] = 42;
    expect(() => registerLocaleVocab('vd-type', v)).toThrow(/must be a non-empty string, got 42/);
  });

  it('throws a RangeError on an entry over 256 characters', () => {
    // line 78-79: MAX_VOCAB_ENTRY_LENGTH guard
    const v = vocabWith({});
    (v.monthLong as string[])[0] = 'V'.repeat(257);
    expect(() => registerLocaleVocab('vd-toolong', v)).toThrow(RangeError);
    expect(() => registerLocaleVocab('vd-toolong', v)).toThrow(/too long/);
  });

  it('throws when both dayPeriod entries are identical', () => {
    // line 100-101: parse()'s AM/PM disambiguation would be impossible
    expect(() => registerLocaleVocab('vd-dayperiod', vocabWith({ dayPeriod: ['AM', 'AM'] }))).toThrow(
      /dayPeriod entries must differ/,
    );
  });

  it('throws on duplicate month names within a registered vocab', () => {
    // line 89 -> assertNoCollision: a caller-supplied dup is just as
    // ambiguous for parse()'s reverse lookup as an Intl-produced one
    const v = vocabWith({});
    (v.monthLong as string[])[1] = (v.monthLong as string[])[0]!;
    expect(() => registerLocaleVocab('vd-collision', v)).toThrow(
      /renders MMMM month index 0 and 1 identically/,
    );
  });
});

describe('registerLocaleVocab — locale argument validation', () => {
  it('throws on an empty locale string', () => {
    // line 145-146
    expect(() => registerLocaleVocab('', validVocab)).toThrow(/requires a non-empty locale string/);
  });

  it('throws on a non-string locale', () => {
    // line 145-146: typeof branch (LHS of the ||)
    expect(() => registerLocaleVocab(undefined as never, validVocab)).toThrow(
      /requires a non-empty locale string, got undefined/,
    );
  });

  it('throws a RangeError on a locale tag over 256 characters', () => {
    // line 148-149: MAX_LOCALE_TAG_LENGTH guard
    expect(() => registerLocaleVocab('x'.repeat(257), validVocab)).toThrow(RangeError);
    expect(() => registerLocaleVocab('x'.repeat(257), validVocab)).toThrow(/maximum 256 characters/);
  });
});

describe('assertValidLocaleTag / getLocaleVocab on malformed tags', () => {
  it('throws a typed InvalidLocaleError for a malformed BCP-47 tag', () => {
    // line 242-248: assertValidLocaleTag rethrows as InvalidLocaleError
    expect(() => assertValidLocaleTag('not_a_locale!!')).toThrow(InvalidLocaleError);
    expect(() => getLocaleVocab('not_a_locale!!')).toThrow(InvalidLocaleError);
  });
});

describe('registerLocaleVocab cache bounds', () => {
  it('evicts the oldest canonical cache key once 500 keys are cached', () => {
    // lines 227-229: bounded canonicalKeyCache. Push past 500 distinct keys;
    // lookups must still resolve correctly (evicted entries re-derive).
    for (let i = 0; i < 505; i++) {
      expect(canonicalCacheKey(`en-x-q${i}`)).toBe(`en-x-q${i}`);
    }
    // 'en-US' was among the first keys inserted, so it got evicted — it just
    // gets re-derived and returns the same canonical key.
    expect(canonicalCacheKey('en-US')).toBe('en-us');
  });

  it('caps the custom-vocab registry at 500 locales; re-registering an existing key still works at the cap', () => {
    // lines 154-155: MAX_CUSTOM_VOCABS guard. NOTE: this intentionally runs
    // LAST in this file — it fills customVocabs to its 500-locale cap, so any
    // later first-time registration in this module instance would throw.
    let thrown: unknown = null;
    let registered = 0;
    for (let i = 0; i < 600 && thrown === null; i++) {
      try {
        registerLocaleVocab(`en-x-v${i}`, validVocab);
        registered++;
      } catch (err) {
        thrown = err;
      }
    }
    expect(thrown).toBeInstanceOf(RangeError);
    expect((thrown as Error).message).toMatch(/500-locale limit/);
    expect(registered).toBeGreaterThan(400); // sanity: the cap, not a validation error
    // has() short-circuits the limit check — refreshing a known key is fine
    expect(() => registerLocaleVocab('en-x-v0', validVocab)).not.toThrow();
    // but a brand-new key at the cap still throws
    expect(() => registerLocaleVocab('en-x-overflow', validVocab)).toThrow(/500-locale limit/);
  });
});
