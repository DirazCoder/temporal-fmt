import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFormat } from '../dist/index.js';

test('matches a plausible date + time string', () => {
  assert.equal(matchesFormat('yyyy-MM-dd HH:mm', '2026-08-04 15:45'), true);
});

test('rejects a string with extra trailing content', () => {
  assert.equal(matchesFormat('yyyy-MM', '2026-08-04T15:45:30'), false);
});

test('rejects out-of-range numeric fields', () => {
  assert.equal(matchesFormat('yyyy-MM-dd', '2026-13-40'), false);
});

test('accepts unpadded month/day within range', () => {
  assert.equal(matchesFormat('yyyy-M-d', '2026-8-4'), true);
});

test('matches exact en-US long month name', () => {
  assert.equal(matchesFormat('MMMM d', 'August 4'), true);
});

test('rejects a month name that is not real en-US vocabulary', () => {
  assert.equal(matchesFormat('MMMM d', 'Augusto 4'), false);
});

test('respects a locale option for month names', () => {
  assert.equal(matchesFormat('MMMM', 'août', { locale: 'fr-FR' }), true);
  assert.equal(matchesFormat('MMMM', 'August', { locale: 'fr-FR' }), false);
});

test('matches AM/PM day-period marker', () => {
  assert.equal(matchesFormat('h:mm a', '3:45 PM'), true);
  assert.equal(matchesFormat('h:mm a', '3:45 XM'), false);
});

test('matches a real IANA time zone id', () => {
  assert.equal(matchesFormat('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York'), true);
});

test('rejects a bogus time zone id', () => {
  assert.equal(matchesFormat('zzz', 'Not/AZone'), false);
});

test('matches quoted literal text passed through unparsed', () => {
  assert.equal(matchesFormat("'at' h:mm", 'at 3:45'), true);
});

test('finds a valid split for ambiguous adjacent numeric tokens', () => {
  // "123" could be H="1" m="23" or H="12" m="3" — either is a legitimate
  // possible output, so this should match via backtracking.
  assert.equal(matchesFormat('Hm', '123'), true);
});

test('rejects a string with no valid split at all', () => {
  assert.equal(matchesFormat('Hm', '999'), false);
});
