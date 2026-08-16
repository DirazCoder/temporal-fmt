import { describe, expect, it } from 'vitest';
import { canonicalCacheKey } from '../src/localeVocab.js';

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
