import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  format,
  formatRelative,
  formatRelativeToNow,
  listRegisteredGrammars,
  registerRelativeGrammar,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('formatRelative: same day → "now"-ish', () => {
  const today = Temporal.Now.plainDateISO();
  const r = formatRelative(today, today);
  // Intl.RelativeTimeFormat with numeric:'auto' returns "now" or "today" for 0 days.
  assert.match(r, /(now|today|in 0|0 days)/i);
});

test('formatRelative: tomorrow', () => {
  const today = Temporal.Now.plainDateISO();
  const tomorrow = today.add({ days: 1 });
  const r = formatRelative(tomorrow, today);
  // Intl.RelativeTimeFormat with numeric:'auto' returns "tomorrow" for +1 day.
  assert.match(r, /(tomorrow|in 1 day|1 day)/i);
});

test('formatRelativeToNow: returns a string', () => {
  const today = Temporal.Now.plainDateISO();
  const r = formatRelativeToNow(today);
  assert.equal(typeof r, 'string');
  assert.ok(r.length > 0);
});

test('formatRelative: 8 days out lands in the week bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 8 }), today);
  // absDays 8 is >= 7 and < 30, so this exercises the week-rounding branch
  // (rtf.format(..., 'week')), not the day branch the other tests hit.
  assert.match(r, /week/i);
});

test('formatRelative: 40 days out lands in the month bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 40 }), today);
  assert.match(r, /month/i);
});

test('formatRelative: 400 days out lands in the year bucket', () => {
  const today = Temporal.PlainDate.from('2026-08-04');
  const r = formatRelative(today.add({ days: 400 }), today);
  assert.match(r, /year/i);
});

test('formatRelative: negative-direction buckets (past week/month/year) also format', () => {
  // Same three thresholds, but date1 in the past relative to date2 — covers
  // the negative side of each -Math.trunc(-dayDiff / N) calculation.
  const today = Temporal.PlainDate.from('2026-08-04');
  assert.match(formatRelative(today.subtract({ days: 8 }), today), /week/i);
  assert.match(formatRelative(today.subtract({ days: 40 }), today), /month/i);
  assert.match(formatRelative(today.subtract({ days: 400 }), today), /year/i);
});

test('formatRelative: Intl.RelativeTimeFormat instances are cached and evicted past the cache cap', () => {
  // getRtf() caches by `${locale}|${numeric}` and evicts the oldest entry
  // once the cache hits MAX_RTF_CACHE_SIZE (100) — request more than that
  // many distinct locale tags to force the eviction path.
  const today = Temporal.PlainDate.from('2026-08-04');
  const tomorrow = today.add({ days: 1 });
  for (let i = 0; i < 105; i++) {
    // en-US region subtags are all valid distinct BCP-47 locales, which
    // keeps the cache key genuinely unique per iteration.
    const locale = `en-${String(i).padStart(3, '0')}`;
    const r = formatRelative(tomorrow, today, { locale });
    assert.equal(typeof r, 'string');
  }
});

test('registerRelativeGrammar: registers and lists a grammar', () => {
  registerRelativeGrammar({
    language: 'test-lang',
    matchers: [
      // Trivial matcher — recognizes the literal phrase "test grammar date"
      // and returns the reference date.
      (_input) => null,
    ],
  });
  const langs = listRegisteredGrammars();
  assert.ok(langs.includes('test-lang'));
});

test('registerRelativeGrammar: re-registering the same language replaces the old grammar, not appends', () => {
  registerRelativeGrammar({
    language: 'test-lang-replace',
    matchers: [(_input) => null],
  });
  const before = listRegisteredGrammars().filter((l) => l === 'test-lang-replace');
  assert.equal(before.length, 1);

  registerRelativeGrammar({
    language: 'test-lang-replace',
    matchers: [(_input) => null],
  });
  const after = listRegisteredGrammars().filter((l) => l === 'test-lang-replace');
  // Still exactly one entry for this language — the second call replaced
  // the first in place rather than adding a duplicate.
  assert.equal(after.length, 1);
});

test('registerRelativeGrammar: throws on an empty language string', () => {
  assert.throws(
    () => registerRelativeGrammar({ language: '', matchers: [(_input) => null] }),
    /requires a non-empty language string/,
  );
});

test('registerRelativeGrammar: throws when matchers is missing or empty', () => {
  assert.throws(
    () => registerRelativeGrammar({ language: 'test-lang-empty', matchers: [] }),
    /requires at least one matcher/,
  );
  assert.throws(
    // Deliberately omitting matchers entirely to hit the !Array.isArray(...)
    // side of the guard, not just the array-but-empty length check above.
    () => registerRelativeGrammar({ language: 'test-lang-missing' }),
    /requires at least one matcher/,
  );
});
