import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDuration, splitInterval, interval, recurrence, take,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Regression tests for the 0.8.x SECURITY BACKPORT (v0.8.988):
// C1 (ReDoS in parseDuration) and H4 (uncatchable OOM in
// splitInterval/take). Correctness fixes from the same audit were
// intentionally NOT backported to this maintenance line.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

function timeMs(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

test('security: parseDuration stays linear on near-miss long-form input (C1)', () => {
  // Pre-fix, 32 tokens of "hhh hhh ..." against this 66-char near-miss
  // hung for 116 seconds (exponential backtracking across token
  // boundaries). Must complete within the budget on every size.
  for (const tokenCount of [16, 24, 32, 40]) {
    const formatStr = Array.from({ length: tokenCount }, () => 'hhh').join(' ');
    const input = Array.from({ length: tokenCount }, () => '1 1').join(' ') + ' x';
    const elapsed = timeMs(() => {
      assert.throws(() => parseDuration(input, formatStr), /does not match duration format/);
    });
    assert.ok(elapsed < 1000, `${tokenCount} tokens took ${elapsed}ms`);
  }
});

test('security: parseDuration caps format and input lengths (C1)', () => {
  assert.throws(() => parseDuration('2', 'h'.repeat(1001)), /maximum length/);
  assert.throws(() => parseDuration('2'.repeat(100_001), 'h'), /maximum length/);
});

test('security: parseDuration rejects glued value tokens (ambiguous split, C1)', () => {
  assert.throws(() => parseDuration('1230', 'hhmm'), /no separating literal|ambiguous/);
  assert.deepEqual(parseDuration('12:30', 'h:mm'), { hours: 12, minutes: 30 });
});

test('security: parseDuration validates unit text (C1)', () => {
  assert.throws(() => parseDuration('2 zzz', 'hhh'), /does not match duration format/);
  assert.deepEqual(parseDuration('5hrs', 'hh'), { hours: 5 });
  assert.deepEqual(parseDuration('12 hours', 'hhh'), { hours: 12 });
});

test('security: splitInterval caps its slice count instead of OOMing (H4)', () => {
  const iv = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-02'));
  assert.throws(() => splitInterval(iv, 1e8), /caps at 100000/);
});

test('security: take() caps its occurrence count on unbounded rules (H4)', () => {
  const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1 });
  assert.throws(() => take(iter, 1e9), /caps at 100000/);
});
