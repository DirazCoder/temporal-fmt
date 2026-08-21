import { describe, expect, it } from 'vitest';
import { createConfig, mergeWithConfig } from '../src/config.js';

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
});

describe('mergeWithConfig', () => {
  it('layers call-site options over the base config without mutating either', () => {
    const base = createConfig({ locale: 'en-US' });
    const merged = mergeWithConfig(base, { locale: 'de-DE' });
    expect(merged.locale).toBe('de-DE');
    expect(base.locale).toBe('en-US');
  });
});
