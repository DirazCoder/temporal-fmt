// Probe: parse() without setTemporal() or a global Temporal should throw
// temporal-fmt's own clean error (temporalProvider.ts's getTemporal()),
// not a cryptic crash — this is a real behavior contract a consumer who
// forgets setup will hit, and it's only ever been checked against dist/
// in-repo (test/parse.test.js), never against the installed artifact.
// Deliberately does NOT import temporal-polyfill or call setTemporal.
//
// Only meaningful pre-Node 26: from Node 26 on, Temporal is a native
// global, so "no Temporal implementation available" isn't a state a
// real consumer can be in on that runtime — resolveTemporal() will
// always find the native one via its globalThis.Temporal fallback.
'use strict';

const assert = require('node:assert/strict');

if (globalThis.Temporal !== undefined) {
  console.log('smoke-no-temporal.cjs: skipped (native Temporal present on this Node version)');
  process.exit(0);
}

const { parse } = require('temporal-fmt');

assert.throws(
  () => parse('yyyy-MM-dd', '2026-08-04'),
  (err) => {
    assert.ok(err instanceof Error, `expected an Error, got ${String(err)}`);
    assert.match(err.message, /needs a Temporal implementation/);
    assert.match(err.message, /setTemporal/);
    return true;
  }
);

console.log('smoke-no-temporal.cjs: ok');
