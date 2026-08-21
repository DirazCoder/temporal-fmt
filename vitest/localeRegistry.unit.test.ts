import { describe, expect, it } from 'vitest';
import { registerLocale, getLocale, hasLocale } from '../src/localeRegistry.js';

const base = {
  monthLong: ['Mo1', 'Mo2', 'Mo3', 'Mo4', 'Mo5', 'Mo6', 'Mo7', 'Mo8', 'Mo9', 'Mo10', 'Mo11', 'Mo12'],
  monthShort: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'],
  weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
  weekdayShort: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
  dayPeriod: ['AM', 'PM'],
};

describe('registerLocale / hasLocale / getLocale', () => {
  it('registers extended fields and reads them back', () => {
    registerLocale('vitest-locale-1', { ...base, quartersLong: ['First', 'Second', 'Third', 'Fourth'] });
    expect(hasLocale('vitest-locale-1')).toBe(true);
    expect(getLocale('vitest-locale-1')?.quartersLong?.[0]).toBe('First');
  });

  it('falls back to the Intl-derived vocab for a locale never registered here', () => {
    expect(hasLocale('fr')).toBe(false);
    const vocab = getLocale('fr');
    expect(vocab?.monthLong[0]).toBe('janvier');
    expect(vocab?.quartersLong).toBeUndefined();
  });
});

describe('registerLocale validation', () => {
  it('rejects a wrong-shaped extended field', () => {
    expect(() => registerLocale('vitest-locale-bad', { ...base, quartersLong: 'not-an-array' as never })).toThrow(
      /"quartersLong" must be an array/,
    );
  });
});
