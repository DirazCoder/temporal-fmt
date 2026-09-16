import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConfig,
  format,
  mergeWithConfig,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

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

test('config-level numberingSystem "auto" flows through mergeWithConfig into format(), resolving per call', () => {
  // The README documents that a config's numberingSystem: 'auto' resolves
  // against whichever locale each call uses — so the same config drives
  // ar-EG input to Arabic-Indic digits while a per-call locale override
  // back to en-US still gets ASCII.
  const c = createConfig({ locale: 'ar-EG', numberingSystem: 'auto' });
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy', mergeWithConfig(c, {})), '٢٠٢٦');
  // per-call locale wins over the config's, and 'auto' follows it
  assert.equal(format(date, 'yyyy', mergeWithConfig(c, { locale: 'en-US' })), '2026');
});
