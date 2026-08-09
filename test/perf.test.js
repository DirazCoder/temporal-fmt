import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Every regex this library builds (see buildCapturingPattern in
// parsePattern.ts and tokenFragment in pattern.ts) is a flat concatenation
// of fixed-length digit classes or bounded alternations — never a nested or
// overlapping quantifier like (a+)+, which is the actual precondition for
// catastrophic backtracking. So the structural expectation going in is that
// this suite comes back clean, not that it's likely to find something. That's
// a different claim from "untested" — these tests exist to verify the
// structural argument against real pathological input, not because there's
// a known open question about whether it holds.
//
// Each case asserts against a generous wall-clock budget rather than just
// "didn't hang forever" — a regression that makes something 50x slower but
// still sub-second wouldn't hang CI, but it's exactly the kind of thing that
// turns into a real DoS at production scale. The budgets here are loose
// (order-of-magnitude, not tight timing assertions) specifically so they
// don't flake on a loaded CI runner; they're not a performance benchmark.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const MAX_FORMAT_LENGTH = 1000; // mirrors src/constants.ts — not exported

function timeMs(fn) {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6;
}

// A single call is dominated by one-time costs (regex compilation, locale
// vocab building via Intl) that a real caller pays once, not per-call — the
// pattern/vocab caches in parse.ts and localeVocab.ts exist specifically so
// repeat calls with the same format string are cheap. So warm the cache
// with one call before timing, same as any real usage pattern would.
function timedAfterWarmup(fn) {
  fn();
  return timeMs(fn);
}

const BUDGET_MS = 500; // generous — real cases here should take low single-digit ms

test('long format string built from many duplicate tokens does not exhibit pathological slowdown', () => {
  // "last token wins" duplicate-handling is a functional concern tested
  // elsewhere (parse.test.js, pattern.test.js) — this only cares whether
  // repeating the same fragment many times over changes the regex engine's
  // matching complexity class.
  const formatStr = 'yyyy-MM-dd '.repeat(80).trim(); // ~880 chars, under MAX_FORMAT_LENGTH
  assert.ok(formatStr.length <= MAX_FORMAT_LENGTH, 'test input itself must respect the documented limit');

  const date = Temporal.PlainDate.from('2026-08-04');
  let formatted;
  const formatMs = timedAfterWarmup(() => { formatted = format(date, formatStr); });
  assert.ok(formatMs < BUDGET_MS, `format() took ${formatMs}ms on a ${formatStr.length}-char duplicate-heavy string, expected < ${BUDGET_MS}ms`);

  const parseMs = timedAfterWarmup(() => parse(formatStr, formatted));
  assert.ok(parseMs < BUDGET_MS, `parse() took ${parseMs}ms on a ${formatStr.length}-char duplicate-heavy string, expected < ${BUDGET_MS}ms`);
});

test('format string at the maximum allowed length (many short literal/token boundaries) does not exhibit pathological slowdown', () => {
  // alternating single-char literals and the shortest tokens maximizes the
  // number of piece boundaries tokenize() and buildCapturingPattern() have
  // to walk for a given string length — the worst case for per-boundary
  // overhead, as distinct from per-character regex matching cost
  const unit = 'd-';
  const repeats = Math.floor(MAX_FORMAT_LENGTH / unit.length);
  const formatStr = unit.repeat(repeats).slice(0, MAX_FORMAT_LENGTH);
  assert.equal(formatStr.length, MAX_FORMAT_LENGTH);

  const date = Temporal.PlainDate.from('2026-08-04');
  const formatMs = timedAfterWarmup(() => format(date, formatStr));
  assert.ok(formatMs < BUDGET_MS, `format() took ${formatMs}ms at MAX_FORMAT_LENGTH with dense boundaries, expected < ${BUDGET_MS}ms`);
});

test('parse() against a long non-matching input does not exhibit pathological slowdown (regex anchored, should fail fast, not backtrack)', () => {
  // worst case for a backtracking-prone engine: a long input that's
  // *almost* valid, forcing the engine to explore many partial matches
  // before failing. This is the shape that would expose a real ReDoS if
  // one existed here.
  const formatStr = 'yyyy-MM-dd HH:mm:ss.SSS';
  const almostValid = '2026-08-04 15:45:30.99' + '9'.repeat(900); // trailing garbage past MAX_FORMAT_LENGTH-safe size

  const parseMs = timeMs(() => {
    try { parse(formatStr, almostValid); } catch { /* expected to throw — timing is what's under test */ }
  });
  assert.ok(parseMs < BUDGET_MS, `parse() took ${parseMs}ms against a long near-miss input, expected < ${BUDGET_MS}ms`);
});

test('locale with a large alternation vocabulary (long IANA zone list via "zzz") does not exhibit pathological slowdown', () => {
  // zzz's fragment is an alternation over every IANA zone name
  // Intl.supportedValuesOf('timeZone') returns (hundreds of entries) — the
  // largest single alternation this library builds. Worth checking directly
  // since it's structurally the closest thing here to "big alternation",
  // even though flat alternation doesn't backtrack the way nested
  // quantifiers do.
  const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
  const formatStr = 'yyyy-MM-dd HH:mm:ss zzz';

  let formatted;
  const formatMs = timedAfterWarmup(() => { formatted = format(zdt, formatStr); });
  assert.ok(formatMs < BUDGET_MS, `format() with zzz took ${formatMs}ms, expected < ${BUDGET_MS}ms`);

  const parseMs = timedAfterWarmup(() => parse(formatStr, formatted));
  assert.ok(parseMs < BUDGET_MS, `parse() with zzz took ${parseMs}ms, expected < ${BUDGET_MS}ms`);

  // and the near-miss failure case specifically for the zone alternation —
  // a string that looks almost like a zone id but matches no real one
  const badZoneInput = '2026-08-04 15:45:30 Not/A_Real_Zone_' + 'x'.repeat(200);
  const failMs = timeMs(() => {
    try { parse(formatStr, badZoneInput); } catch { /* expected */ }
  });
  assert.ok(failMs < BUDGET_MS, `parse() rejecting a long fake zone id took ${failMs}ms, expected < ${BUDGET_MS}ms`);
});

test('locale with a large month/weekday vocabulary under a long near-miss input does not exhibit pathological slowdown', () => {
  // ja-JP's vocab includes counter-suffix-merged strings (see localeVocab.ts
  // partValue()) — a different shape of alternation entry than a plain
  // Latin-script name, worth checking isn't somehow costlier to match
  const date = Temporal.PlainDate.from('2026-08-04');
  const formatStr = 'MMMM d, yyyy';
  const formatted = format(date, formatStr, { locale: 'ja-JP' });

  const parseMs = timedAfterWarmup(() => parse(formatStr, formatted, { locale: 'ja-JP' }));
  assert.ok(parseMs < BUDGET_MS, `parse() with ja-JP MMMM took ${parseMs}ms, expected < ${BUDGET_MS}ms`);

  const badInput = 'x'.repeat(500) + ', 2026';
  const failMs = timeMs(() => {
    try { parse(formatStr, badInput, { locale: 'ja-JP' }); } catch { /* expected */ }
  });
  assert.ok(failMs < BUDGET_MS, `parse() rejecting long garbage against ja-JP MMMM took ${failMs}ms, expected < ${BUDGET_MS}ms`);
});

test('deeply nested/repeated quoted literals do not exhibit pathological slowdown in tokenize()', () => {
  // "''" (doubled quote -> literal quote char) repeated many times is the
  // closest thing to a "nested" structure tokenize() has to walk — worth
  // checking it's still linear, not quadratic, in input length
  const formatStr = "'" + "''".repeat(400) + "'"; // well-formed: one open quote, 400 escaped quotes, one close
  assert.ok(formatStr.length < MAX_FORMAT_LENGTH);

  const date = Temporal.PlainDate.from('2026-08-04');
  const formatMs = timeMs(() => format(date, formatStr));
  assert.ok(formatMs < BUDGET_MS, `format() with deeply repeated escaped quotes took ${formatMs}ms, expected < ${BUDGET_MS}ms`);
});

test('cost scales roughly linearly with format string length, not superlinearly (coarse check across three sizes)', () => {
  // Not a precise complexity proof — just confirms 10x more input doesn't
  // cost 100x+ more time, which is the practical signature of a
  // superlinear (quadratic or worse) blowup a caller would actually feel.
  const date = Temporal.PlainDate.from('2026-08-04');
  const sizes = [1, 10, 90]; // repeats of 'yyyy-MM-dd ' (11 chars each) — 90*11=990, safely under MAX_FORMAT_LENGTH
  const timings = sizes.map((n) => {
    const formatStr = 'yyyy-MM-dd '.repeat(n).trim();
    return timedAfterWarmup(() => format(date, formatStr));
  });

  // guard against divide-by-near-zero making the ratio noisy on a fast machine
  const floor = 0.05; // ms
  const ratioSmallToLarge = (Math.max(timings[2], floor)) / (Math.max(timings[0], floor));
  const sizeRatio = sizes[2] / sizes[0]; // 50x more input

  assert.ok(
    ratioSmallToLarge < sizeRatio * 5,
    `time ratio ${ratioSmallToLarge.toFixed(2)}x for a ${sizeRatio}x size increase looks superlinear ` +
    `(timings: ${JSON.stringify(timings)})`
  );
});
