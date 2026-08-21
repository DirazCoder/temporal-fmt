import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_NUMBERING_SYSTEMS,
  convertDigits,
  convertDigitsToAscii,
  round,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('convertDigits: latn → latn is identity', () => {
  assert.equal(convertDigits('2026', 'latn'), '2026');
});

test('convertDigits: latn → arab converts ASCII to Arabic-Indic', () => {
  const arab = convertDigits('2026', 'arab');
  assert.notEqual(arab, '2026');
  assert.equal(arab.length, 4); // 4 chars, all non-ASCII
});

test('convertDigitsToAscii: round-trips through convertDigits', () => {
  const arab = convertDigits('12345', 'arab');
  const ascii = convertDigitsToAscii(arab, 'arab');
  assert.equal(ascii, '12345');
});

test('convertDigits: throws on unsupported numbering system', () => {
  assert.throws(() => convertDigits('1', 'madeup'), /not supported/);
});

test('SUPPORTED_NUMBERING_SYSTEMS includes latn and arab', () => {
  assert.ok(SUPPORTED_NUMBERING_SYSTEMS.has('latn'));
  assert.ok(SUPPORTED_NUMBERING_SYSTEMS.has('arab'));
});
