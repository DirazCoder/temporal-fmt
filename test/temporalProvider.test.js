import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, setTemporal } from '../dist/index.js';
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

test('setTemporal() resets tokens.ts\'s memoized native-Intl-support probe, so it re-runs against whichever implementation is active now (M-02 regression)', () => {
  // intlSupportsNativeTemporal() (tokens.ts) is a plain module-level cache
  // keyed on nothing — it just remembers the *first* answer it ever got.
  // Before the fix, that answer was never invalidated, so an app that
  // called setTemporal() to swap implementations mid-session (a case the
  // provider API explicitly supports — see the tests above) could still be
  // probing against the *original* implementation's behavior indefinitely.
  //
  // This can't easily be proven by checking format() *output*, because
  // format()'s TemporalLike input doesn't go through getTemporal() at all
  // (only parse() does — getTemporal() feeds PlainDate.from() during
  // construction, not formatting) and there's no real native Temporal
  // available in this test environment to contrast against the polyfill.
  // So instead: wrap PlainDate.from() on the implementation being handed
  // to setTemporal() and count calls — the probe calls
  // `getTemporal().PlainDate.from(...)` exactly once per fresh run, so a
  // count of 1 after each of two setTemporal() calls (with a locale-aware
  // format() in between to trigger the probe) proves the probe actually
  // re-ran the second time instead of returning a cached answer for free.
  let fromCallCount = 0;
  function wrapPlainDateFrom(temporal) {
    const realFrom = temporal.PlainDate.from.bind(temporal.PlainDate);
    return {
      ...temporal,
      PlainDate: { ...temporal.PlainDate, from: (...args) => { fromCallCount++; return realFrom(...args); } },
    };
  }

  // A real PlainDate, not a hand-rolled {year, month, day, ...} object.
  // formatToParts() on a bare non-Date object is engine/ICU-dependent —
  // it throws here but apparently coerces on some builds — so a fake
  // object made this test's outcome depend on that quirk instead of the
  // probe-invalidation logic it's meant to check.
  const subject = PolyfillTemporal.PlainDate.from({ year: 2026, month: 8, day: 4 });

  try {
    setTemporal(wrapPlainDateFrom(PolyfillTemporal));
    format(subject, 'MMMM');
    const countAfterFirst = fromCallCount;
    assert.equal(countAfterFirst, 1, 'first locale-aware format() should trigger exactly one probe call');

    // A second locale-aware format() with NO setTemporal() call in between
    // should NOT re-probe — this is the cache actually doing its job in
    // the normal (non-swapping) case.
    format(subject, 'MMMM');
    assert.equal(fromCallCount, countAfterFirst, 'a second format() with no setTemporal() in between should reuse the cached probe result');

    // Now swap implementations and format again — the probe must re-run.
    setTemporal(wrapPlainDateFrom(Temporal));
    format(subject, 'MMMM');
    assert.equal(fromCallCount, countAfterFirst + 1, 'setTemporal() must invalidate the probe so the next locale-aware format() re-runs it');
  } finally {
    setTemporal(Temporal);
  }
});