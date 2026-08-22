import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocale,
  hasLocale,
  registerLocale,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('registerLocale / hasLocale / getLocale', () => {
  registerLocale('test-locale-1', {
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
    weekdayLong: ['Day1','Day2','Day3','Day4','Day5','Day6','Day7'],
    weekdayShort: ['D1','D2','D3','D4','D5','D6','D7'],
    dayPeriod: ['AM','PM'],
    quartersLong: ['First','Second','Third','Fourth'],
    erasLong: ['BCE','CE'],
  });
  assert.ok(hasLocale('test-locale-1'));
  const vocab = getLocale('test-locale-1');
  assert.equal(vocab?.monthLong[0], 'Mo1');
  assert.equal(vocab?.quartersLong?.[0], 'First');
});

test('getLocale: falls back to the base Intl-derived vocab for a locale never registered here', () => {
  // 'fr' has no registerLocale() call anywhere in this suite, so this
  // exercises the extendedVocabs-miss path that falls through to
  // getLocaleVocab() instead of returning early with a registered entry.
  assert.ok(!hasLocale('fr'));
  const vocab = getLocale('fr');
  assert.ok(vocab);
  assert.equal(vocab?.monthLong[0], 'janvier');
  // No extended fields were registered for 'fr', so they stay undefined
  // rather than getting invented defaults.
  assert.equal(vocab?.quartersLong, undefined);
});

test('getLocale: returns undefined for a locale that neither extendedVocabs nor Intl.Locale can resolve', () => {
  // An empty string throws inside Intl.Locale's constructor (which
  // getLocaleVocab relies on), so this exercises the catch → undefined
  // branch, not just the try's success path covered above.
  assert.equal(getLocale(''), undefined);
});

test('registerLocale: extended-field validation rejects non-array, wrong-length, and non-string entries', () => {
  const base = {
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
    weekdayLong: ['Day1','Day2','Day3','Day4','Day5','Day6','Day7'],
    weekdayShort: ['D1','D2','D3','D4','D5','D6','D7'],
    dayPeriod: ['AM','PM'],
  };
  assert.throws(
    () => registerLocale('test-locale-bad-1', { ...base, quartersLong: 'not-an-array' }),
    /"quartersLong" must be an array/,
  );
  assert.throws(
    () => registerLocale('test-locale-bad-2', { ...base, erasLong: ['OnlyOne'] }),
    /"erasLong" must have 2 entries \(got 1\)/,
  );
  assert.throws(
    () => registerLocale('test-locale-bad-3', { ...base, ordinals: ['st', '', 'rd', 'th'] }),
    /"ordinals\[1\]" must be a non-empty string/,
  );
});


test('registerLocale: rejects oversized locale tags and extended strings', () => {
  const base = {
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
    weekdayLong: ['Day1','Day2','Day3','Day4','Day5','Day6','Day7'],
    weekdayShort: ['D1','D2','D3','D4','D5','D6','D7'],
    dayPeriod: ['AM','PM'],
  };
  assert.throws(
    () => registerLocale('x'.repeat(257), base),
    /locale tag must be at most 256 characters/,
  );
  assert.throws(
    () => registerLocale('test-locale-long-value', {
      ...base,
      quartersLong: [ 'a'.repeat(257), 'Q2', 'Q3', 'Q4' ],
    }),
    /quartersLong\[0\].*at most 256 characters/,
  );
});
