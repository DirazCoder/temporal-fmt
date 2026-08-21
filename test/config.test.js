import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConfig,
  mergeWithConfig,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// ============== Section H: config ==============
test('createConfig: returns frozen config with defaults', () => {
  const c = createConfig();
  assert.equal(c.locale, 'en-US');
  assert.equal(c.numberingSystem, 'latn');
  assert.equal(c.firstDayOfWeek, 1);
  assert.equal(c.disambiguation, 'compatible');
  assert.ok(Object.isFrozen(c));
});

test('createConfig: merges overrides', () => {
  const c = createConfig({ locale: 'fr-FR', timezone: 'Europe/Paris' });
  assert.equal(c.locale, 'fr-FR');
  assert.equal(c.timezone, 'Europe/Paris');
});

test('createConfig: validates firstDayOfWeek', () => {
  assert.throws(() => createConfig({ firstDayOfWeek: 3 }), /firstDayOfWeek must be 1.*7/);
});

test('createConfig: validates locale is a non-empty string', () => {
  assert.throws(() => createConfig({ locale: '' }), /locale must be a non-empty string/);
  assert.throws(() => createConfig({ locale: 42 }), /locale must be a non-empty string/);
});

test('createConfig: validates roundingMode', () => {
  assert.throws(() => createConfig({ roundingMode: 'banana' }), /roundingMode "banana" is not recognized/);
});

test('createConfig: validates disambiguation', () => {
  assert.throws(() => createConfig({ disambiguation: 'banana' }), /disambiguation "banana" is not recognized/);
});

test('createConfig: validates overflow', () => {
  assert.throws(() => createConfig({ overflow: 'banana' }), /overflow "banana" is not recognized/);
});

test('mergeWithConfig: per-call overrides win', () => {
  const c = createConfig({ locale: 'fr-FR' });
  const merged = mergeWithConfig(c, { locale: 'en-US' });
  assert.equal(merged.locale, 'en-US');
});

test('mergeWithConfig: config fills in defaults when per-call omits', () => {
  const c = createConfig({ locale: 'fr-FR' });
  const merged = mergeWithConfig(c, {});
  assert.equal(merged.locale, 'fr-FR');
});

test('mergeWithConfig: no config returns perCall unchanged', () => {
  const perCall = { locale: 'en-US' };
  assert.equal(mergeWithConfig(undefined, perCall), perCall);
});

test('mergeWithConfig: fills in calendar, timezone, and lenient when config sets them and per-call omits them', () => {
  const c = createConfig({ calendar: 'hebrew', timezone: 'America/New_York', parseLenient: true });
  const merged = mergeWithConfig(c, {});
  assert.equal(merged.calendar, 'hebrew');
  assert.equal(merged.timezone, 'America/New_York');
  assert.equal(merged.lenient, true);
});
