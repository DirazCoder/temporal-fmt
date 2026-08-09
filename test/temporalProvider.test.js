import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// setTemporal() is the only exported piece of temporalProvider.ts —
// resolveTemporal()'s precedence (injected override beats globalThis.Temporal,
// and clearing the override falls back to the global) is only checked
// once, in passing, in parse.test.js's "no Temporal implementation" case.
// These isolate the precedence rule itself.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;

test('setTemporal() override takes priority even when globalThis.Temporal is also set', () => {
  const savedGlobal = globalThis.Temporal;
  // a namespace whose PlainDate.from() throws — if parse() went to the
  // global instead of the injected override, this test would fail loudly
  // instead of silently passing, which is exactly what we want here
  globalThis.Temporal = {
    PlainDate: { from: () => { throw new Error('should not reach the global'); } },
    PlainTime: { from: () => { throw new Error('should not reach the global'); } },
    PlainDateTime: { from: () => { throw new Error('should not reach the global'); } },
    ZonedDateTime: { from: () => { throw new Error('should not reach the global'); } },
  };
  setTemporal(Temporal);
  try {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  } finally {
    globalThis.Temporal = savedGlobal;
    setTemporal(Temporal);
  }
});

test('setTemporal(undefined) clears the override and falls back to globalThis.Temporal', () => {
  const savedGlobal = globalThis.Temporal;
  globalThis.Temporal = Temporal;
  setTemporal(undefined);
  try {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  } finally {
    globalThis.Temporal = savedGlobal;
    setTemporal(Temporal);
  }
});

test('setTemporal() called with no arguments at all behaves the same as setTemporal(undefined)', () => {
  const savedGlobal = globalThis.Temporal;
  globalThis.Temporal = Temporal;
  setTemporal();
  try {
    const result = parse('yyyy-MM-dd', '2026-08-04');
    assert.equal(result.toString(), '2026-08-04');
  } finally {
    globalThis.Temporal = savedGlobal;
    setTemporal(Temporal);
  }
});

test('neither an override nor a global set throws the descriptive "needs a Temporal implementation" error', () => {
  const savedGlobal = globalThis.Temporal;
  delete globalThis.Temporal;
  setTemporal(undefined);
  try {
    assert.throws(
      () => parse('yyyy-MM-dd', '2026-08-04'),
      /needs a Temporal implementation/
    );
  } finally {
    if (savedGlobal !== undefined) globalThis.Temporal = savedGlobal;
    setTemporal(Temporal);
  }
});

test('switching the override mid-session between two different implementations both take effect', () => {
  // temporal-polyfill twice is a stand-in for "two different
  // implementations" here since it's the only one available in this test
  // environment, but it still exercises the actual swap
  setTemporal(PolyfillTemporal);
  const first = parse('yyyy-MM-dd', '2026-08-04');
  setTemporal(Temporal);
  const second = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(first.toString(), second.toString());
  setTemporal(Temporal);
});
