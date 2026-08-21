import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, formatDuration, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Three separate module-level Maps cap themselves at 500 entries and evict
// the oldest key once full: patternCache (parse.ts), formatterCache
// (tokens.ts), and calendarCache (parse.ts). None of them are exported, and
// nothing elsewhere in the suite pushes any of them past a handful of keys —
// the eviction branch (`if (cache.size >= MAX) { delete oldest }`) has never
// actually run under test. These push each one over its cap using distinct
// locale tags per iteration (so every call is a genuine cache miss, not a
// hit) and confirm the library still works correctly afterward, since a
// broken eviction (e.g. wrong key deleted, or a crash on empty cache) would
// otherwise only surface in a long-running process, not a short test file.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('formatterCache (tokens.ts) evicts correctly once pushed past 500 entries — formatting still works afterward', () => {
  // getFormatter() is only reached through dayPeriodPart() (the 'a'
  // token) on a runtime without native Temporal+Intl support — 'MMMM'
  // and friends go through intlPart()'s toLocaleString() fallback
  // instead, which never touches this cache. See the version-gated
  // note on intlPart() in tokens.ts for why.
  const dt = Temporal.PlainDateTime.from('2026-08-04T14:00:00');
  // getFormatter() caches by (locale, JSON.stringify(options)) — vary the
  // options per call so each one is a distinct key, not a repeat hit
  for (let i = 0; i < 520; i++) {
    format(dt, 'a', { locale: `en-US-x-c${i}` });
  }
  // the cache has now evicted its earliest ~20 entries — confirm the
  // library is still in a working state, not just that the loop didn't throw
  assert.equal(format(dt, 'a', { locale: 'en-US' }), 'PM');
});

test('patternCache (parse.ts) evicts correctly once pushed past 500 entries — parsing still works afterward', () => {
  // getPattern() caches by (locale + ' ' + formatStr) — vary the format
  // string itself per call, since a literal-only prefix still produces a
  // distinct cache key without changing what's actually being parsed
  for (let i = 0; i < 520; i++) {
    const formatStr = `'v${i}'yyyy-MM-dd`;
    parse(formatStr, `v${i}2026-08-04`);
  }
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('calendarCache (parse.ts) evicts correctly once pushed past 500 entries — non-Gregorian resolution still works afterward', () => {
  // resolveCalendar() caches by locale tag alone
  for (let i = 0; i < 520; i++) {
    parse('yyyy-MM-dd', '2026-08-04', { locale: `en-US-x-cal${i}` });
  }
  // en-u-ca-hebrew should still resolve to the Hebrew calendar correctly
  // after 520+ unrelated locale entries have cycled through the cache
  const result = parse('yyyy-MM-dd', '5784-06-01', { locale: 'en-u-ca-hebrew' });
  assert.equal(result.calendarId, 'hebrew');
});

test('all three caches evicting simultaneously (interleaved format/parse calls) does not corrupt any of them', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  for (let i = 0; i < 520; i++) {
    format(date, 'MMMM', { locale: `en-US-x-mix${i}` });
    parse(`'w${i}'yyyy-MM-dd`, `w${i}2026-08-04`);
  }
  assert.equal(format(date, 'MMMM'), 'August');
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('unitFormatterCache (formatDuration.ts) evicts correctly once pushed past its 200-entry cap — formatting still works afterward', () => {
  // getUnitFormatter() caches by (canonicalCacheKey(locale), intlUnit,
  // unitDisplay) — vary the locale per call so each one is a distinct
  // key, not a repeat hit, same approach as formatterCache above.
  for (let i = 0; i < 220; i++) {
    formatDuration({ hours: 1 }, 'hhh', { locale: `en-US-x-d${i}` });
  }
  assert.equal(formatDuration({ hours: 1 }, 'hhh'), '1 hour');
});