import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Lenient parse mode opts into a documented heuristic for ambiguous
// glued numeric runs (e.g. "121" against "Md"). Default behavior
// (lenient unset or false) must remain strict — throw on ambiguity.
// The heuristic prefers the split where the day token (if any) has a
// value of 12 or less.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('strict mode (default) throws on ambiguous "121" against yyyy-Md', () => {
  assert.throws(
    () => parse('yyyy-Md', '2026-121'),
    /ambiguous.*parse\(\) won't guess.*Pass \{ lenient: true \}/s
  );
});

test('strict mode with explicit { lenient: false } still throws', () => {
  assert.throws(
    () => parse('yyyy-Md', '2026-121', { lenient: false }),
    /ambiguous/
  );
});

test('lenient mode picks M=12/d=1 for "121" against yyyy-Md (day<=12 heuristic)', () => {
  // Two valid splits: M=1/d=21 (day=21 > 12) and M=12/d=1 (day=1 <= 12).
  // Heuristic prefers the small-day reading → 2026-12-01.
  const result = parse('yyyy-Md', '2026-121', { lenient: true });
  assert.equal(result.toString(), '2026-12-01');
});

test('lenient mode does not affect unambiguous inputs — single valid split is used', () => {
  // "85" against yyyy-Md only has one valid split (M=8/d=5), so
  // lenient mode picks the same one strict mode would.
  assert.equal(parse('yyyy-Md', '2026-85', { lenient: true }).toString(), '2026-08-05');
  assert.equal(parse('yyyy-Md', '2026-85').toString(), '2026-08-05');
});

test('lenient mode: heuristic still picks the small-day reading for ambiguous yyyy-Md inputs', () => {
  // For yyyy-Md "121": M=1/d=21 (day=21 > 12) vs M=12/d=1 (day=1 <= 12).
  // Heuristic prefers the small-day reading → M=12/d=1 → 2026-12-01.
  // (For yyyy-dM "121", only one split is valid: d=12/M=1, since
  // d=1 would require M=21 which is out of month range. That case
  // isn't ambiguous at all.)
  const result = parse('yyyy-Md', '2026-121', { lenient: true });
  assert.equal(result.toString(), '2026-12-01');
});

test('lenient mode handles Hm (hour:minute) ambiguous runs without a "d" token', () => {
  // Format yyyy-MM-dd Hm: date part is unambiguous (fixed-width MM/dd),
  // only the trailing "Hm" run is ambiguous. "111" against Hm:
  //   H=1/m=11 (valid: H=1 in 0-23, m=11 in 0-59)
  //   H=11/m=1 (also valid)
  // No "d" token in this run, so the day<=12 heuristic doesn't apply.
  // Falls back to the first valid split per enumerateValidSplits:
  // depth-first tries width=1 first, so H=1/m=11 wins.
  const result = parse('yyyy-MM-dd Hm', '2026-08-04 111', { lenient: true });
  assert.equal(result.hour, 1);
  assert.equal(result.minute, 11);
});

test('lenient mode does not change behavior for non-ambiguous format strings', () => {
  // If the format string has no glued numeric runs at all (e.g.
  // "yyyy-MM-dd"), lenient mode is a no-op. The strict and lenient
  // results must match exactly for every input.
  const cases = ['2026-08-04', '0001-01-01', '9999-12-31'];
  for (const input of cases) {
    const strict = parse('yyyy-MM-dd', input);
    const lenient = parse('yyyy-MM-dd', input, { lenient: true });
    assert.equal(strict.toString(), lenient.toString());
  }
});

test('lenient mode still rejects impossible dates (Feb 30)', () => {
  // Lenient picks a split; the constructed date still goes through
  // Temporal's overflow: 'reject' check. Impossible dates still throw.
  assert.throws(
    () => parse('yyyy-Md', '2026-230', { lenient: true }),
    /doesn't describe a valid date|impossible date|out of range/i
  );
});

test('adversarial: lenient mode on "112" against yyyy-Md picks M=11/d=2 or M=1/d=12 (both have valid days)', () => {
  // "112" against yyyy-Md: M=1/d=12 (day=12 <= 12) or M=11/d=2 (day=2 <= 12).
  // Both readings have day <= 12, so the heuristic doesn't narrow.
  // Falls back to the first valid split per enumerateValidSplits.
  // Document this behavior — when both readings satisfy the
  // heuristic, the choice is necessarily arbitrary, which is the
  // reason lenient mode is opt-in and documented as a guess.
  const result = parse('yyyy-Md', '2026-112', { lenient: true });
  // enumerateValidSplits tries M=1 first (depth-first), so this gives M=1/d=12
  assert.equal(result.month, 1);
  assert.equal(result.day, 12);
});

test('lenient mode accepts the unambiguous case "85" without changing behavior', () => {
  // Sanity: "85" has only one valid split (M=8, d=5). Lenient and
  // strict should produce the same value.
  assert.equal(
    parse('yyyy-Md', '2026-85', { lenient: true }).toString(),
    parse('yyyy-Md', '2026-85').toString(),
  );
});

test('lenient mode: parser-stable across many calls (cache does not corrupt lenient vs strict)', () => {
  // The pattern cache is keyed by (locale, formatStr), not by lenient
  // flag. Both strict and lenient share the same pattern; the
  // lenient flag only changes the post-match split-selection logic.
  // So alternating between strict and lenient on the same formatStr
  // should never see cache-staleness corruption.
  for (let i = 0; i < 5; i++) {
    assert.throws(() => parse('yyyy-Md', '2026-121'), /ambiguous/);
    assert.equal(parse('yyyy-Md', '2026-121', { lenient: true }).toString(), '2026-12-01');
  }
});
