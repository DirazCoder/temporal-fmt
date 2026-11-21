import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createConfig, mergeWithConfig } from '../../src/core/config.js';

describe('createConfig', () => {
  it('returns a frozen config seeded with defaults', () => {
    const c = createConfig();
    expect(c.locale).toBe('en-US');
    expect(c.firstDayOfWeek).toBe(1);
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('applies overrides on top of the defaults', () => {
    const c = createConfig({ locale: 'fr-FR', timezone: 'Europe/Paris' });
    expect(c.locale).toBe('fr-FR');
    expect(c.timezone).toBe('Europe/Paris');
  });

  it('rejects an invalid firstDayOfWeek', () => {
    expect(() => createConfig({ firstDayOfWeek: 9 as never })).toThrow(/firstDayOfWeek/);
  });

  it('rejects a non-string locale', () => {
    // line 80-81: typeof half of the guard
    expect(() => createConfig({ locale: 42 as never })).toThrow(/config\.locale must be a non-empty string/);
  });

  it('rejects an empty locale', () => {
    // line 80-81: empty-string half of the guard
    expect(() => createConfig({ locale: '' })).toThrow(/config\.locale must be a non-empty string/);
  });

  it('rejects a non-string numberingSystem but accepts an explicit undefined', () => {
    // line 83-84: only undefined and strings pass
    expect(() => createConfig({ numberingSystem: 42 as never })).toThrow(/config\.numberingSystem must be a string/);
    expect(() => createConfig({ numberingSystem: undefined })).not.toThrow();
    expect(createConfig({ numberingSystem: undefined }).numberingSystem).toBeUndefined();
  });

  it('accepts firstDayOfWeek 7 (Sunday) alongside 1', () => {
    // line 86: the !== 7 half of the guard must not reject the documented value
    expect(createConfig({ firstDayOfWeek: 7 }).firstDayOfWeek).toBe(7);
    expect(() => createConfig({ firstDayOfWeek: 0 as never })).toThrow(/firstDayOfWeek/);
  });

  it('rejects an unrecognized roundingMode', () => {
    // line 89-90
    expect(() => createConfig({ roundingMode: 'bogus' as never })).toThrow(
      /config\.roundingMode "bogus" is not recognized/,
    );
  });

  it('rejects an unrecognized disambiguation', () => {
    // line 92-93
    expect(() => createConfig({ disambiguation: 'bogus' as never })).toThrow(
      /config\.disambiguation "bogus" is not recognized/,
    );
  });

  it('rejects an unrecognized overflow', () => {
    // line 95-96
    expect(() => createConfig({ overflow: 'bogus' as never })).toThrow(
      /config\.overflow "bogus" is not recognized/,
    );
  });

  it('accepts and freezes a config overriding every field', () => {
    const c = createConfig({
      locale: 'fr-FR',
      calendar: 'hebrew',
      timezone: 'Europe/Paris',
      numberingSystem: 'auto',
      firstDayOfWeek: 7,
      roundingMode: 'ceil',
      disambiguation: 'later',
      overflow: 'constrain',
      parseLenient: true,
      durationShowZeroValues: true,
    });
    expect(c).toEqual({
      locale: 'fr-FR',
      calendar: 'hebrew',
      timezone: 'Europe/Paris',
      numberingSystem: 'auto',
      firstDayOfWeek: 7,
      roundingMode: 'ceil',
      disambiguation: 'later',
      overflow: 'constrain',
      parseLenient: true,
      durationShowZeroValues: true,
    });
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('is frozen — shared module state can\'t be mutated', () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    // ESM is strict mode, so assigning to a frozen object throws
    expect(() => {
      (DEFAULT_CONFIG as { locale?: string }).locale = 'fr-FR';
    }).toThrow(TypeError);
  });

  it('carries the documented defaults', () => {
    expect(DEFAULT_CONFIG).toEqual({
      locale: 'en-US',
      numberingSystem: 'latn',
      firstDayOfWeek: 1,
      roundingMode: 'nearest',
      disambiguation: 'compatible',
      overflow: 'reject',
      parseLenient: false,
      durationShowZeroValues: false,
    });
  });
});

describe('mergeWithConfig', () => {
  it('layers call-site options over the base config without mutating either', () => {
    const base = createConfig({ locale: 'en-US' });
    const merged = mergeWithConfig(base, { locale: 'de-DE' });
    expect(merged.locale).toBe('de-DE');
    expect(base.locale).toBe('en-US');
  });

  it('returns the per-call options untouched when no config is given', () => {
    // line 115: the !config early return
    const perCall = { locale: 'de-DE', foo: 1 };
    expect(mergeWithConfig(undefined, perCall)).toBe(perCall);
  });

  it('fills every config-driven field when the per-call options leave them unset', () => {
    // lines 127-131: each extras branch with perCall unset + config set
    const cfg = createConfig({
      locale: 'fr-FR',
      calendar: 'hebrew',
      timezone: 'Asia/Tokyo',
      numberingSystem: 'arab',
      parseLenient: true,
    });
    const merged = mergeWithConfig(cfg, { input: 'x' });
    expect(merged).toEqual({
      input: 'x',
      locale: 'fr-FR',
      calendar: 'hebrew',
      timezone: 'Asia/Tokyo',
      numberingSystem: 'arab',
      lenient: true,
    });
  });

  it('per-call values win over the config for every mergeable field', () => {
    // lines 127-131 false paths, including the numberingSystem guard at
    // line 130 (a per-call numberingSystem must not be clobbered)
    const cfg = createConfig({
      locale: 'fr-FR',
      calendar: 'hebrew',
      timezone: 'Asia/Tokyo',
      numberingSystem: 'arab',
      parseLenient: true,
    });
    const merged = mergeWithConfig(cfg, {
      locale: 'de-DE',
      calendar: 'iso8601',
      timezone: 'UTC',
      numberingSystem: 'fullwide',
      lenient: false,
    });
    expect(merged).toEqual({
      locale: 'de-DE',
      calendar: 'iso8601',
      timezone: 'UTC',
      numberingSystem: 'fullwide',
      lenient: false,
    });
  });

  it('adds no calendar/timezone/lenient keys when the config leaves them unset', () => {
    // lines 128/129/131: perCall unset AND the config field undefined/false
    const merged = mergeWithConfig(createConfig(), { input: 'y' });
    expect(merged).toEqual({ input: 'y', locale: 'en-US', numberingSystem: 'latn' });
    expect('calendar' in merged).toBe(false);
    expect('timezone' in merged).toBe(false);
    expect('lenient' in merged).toBe(false);
  });
});
