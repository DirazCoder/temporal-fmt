import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { createFormatter } from '../src/extensibility.js';

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');

describe('createFormatter', () => {
  it('formats and formats-to-parts with the built-in tokens', () => {
    const fmt = createFormatter();
    expect(fmt.format(date, 'yyyy-MM-dd')).toBe('2026-08-04');
    expect(fmt.formatToParts(date, 'yyyy-MM')).toEqual([
      { type: 'token', value: '2026', token: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '08', token: 'MM' },
    ]);
  });

  it('accepts a custom token handler', () => {
    const fmt = createFormatter({
      tokens: [{ name: 'YYYYYY', handler: (t: { year: number }) => String(t.year).padStart(6, '0'), field: 'year' }],
    });
    expect(fmt.format(date, 'YYYYYY')).toBe('002026');
  });

  it('handles quoted literals, including a doubled-quote escape', () => {
    const fmt = createFormatter();
    expect(fmt.format(date, "yyyy 'it''s'")).toBe("2026 it's");
  });

  it('throws on an unterminated quote', () => {
    const fmt = createFormatter();
    expect(() => fmt.format(date, "yyyy 'oops")).toThrow(/unterminated quote/);
  });
});
