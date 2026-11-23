// Regression test for the package's documented subpath imports (README
// "Subpath imports" section). These import through the package NAME —
// Node's self-reference resolution, the same resolution a consumer's
// bundler/runtime uses — rather than reaching into dist/ directly, so a
// missing re-export in a subpath entry stub fails here even though the
// main entry is fine.
//
// This is exactly the shape of the bug this file guards against:
// src/duration.ts only re-exported ./ops/duration.js, so
// `import { formatDuration } from 'temporal-fmt/duration'` — the import
// the README documents — threw "formatDuration is not a function" while
// `import { formatDuration } from 'temporal-fmt'` worked fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('temporal-fmt/duration exposes formatDuration (README-documented export)', async () => {
  const mod = await import('temporal-fmt/duration');
  assert.equal(typeof mod.formatDuration, 'function', 'formatDuration must be exported from the duration subpath');
});

test('every README-documented subpath import resolves with its claimed exports', async () => {
  const fmtMod = await import('temporal-fmt/format');
  assert.equal(typeof fmtMod.format, 'function');

  const parseMod = await import('temporal-fmt/parse');
  assert.equal(typeof parseMod.parse, 'function');

  const durMod = await import('temporal-fmt/duration');
  assert.equal(typeof durMod.formatDuration, 'function');
  assert.equal(typeof durMod.parseDuration, 'function');
  assert.equal(typeof durMod.formatDurationToParts, 'function');

  const relMod = await import('temporal-fmt/relative');
  assert.equal(typeof relMod.formatRelative, 'function');
  assert.equal(typeof relMod.formatRelativeToNow, 'function');

  const ivMod = await import('temporal-fmt/interval');
  assert.equal(typeof ivMod.interval, 'function');
  assert.equal(typeof ivMod.formatRange, 'function');

  const calMod = await import('temporal-fmt/calendar');
  assert.equal(typeof calMod.daysInMonth, 'function');
  assert.equal(typeof calMod.startOf, 'function');

  const tzMod = await import('temporal-fmt/timezone');
  assert.equal(typeof tzMod.resolveZoned, 'function');
  assert.equal(typeof tzMod.isDST, 'function');

  const recMod = await import('temporal-fmt/recurrence');
  assert.equal(typeof recMod.recurrence, 'function');

  const locMod = await import('temporal-fmt/locale');
  assert.equal(typeof locMod.registerLocale, 'function');
});
