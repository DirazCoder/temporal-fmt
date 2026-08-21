import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { format, formatToParts, compileFormat } from '../src/format.js';

setTemporal(Temporal);

const d = Temporal.PlainDate.from('2026-08-04');

describe('format', () => {
  it('renders a token/literal format string', () => {
    expect(format(d, 'yyyy-MM-dd')).toBe('2026-08-04');
  });
});

describe('formatToParts', () => {
  it('splits the same output into token and literal parts', () => {
    const parts = formatToParts(d, 'yyyy-MM-dd');
    expect(parts).toEqual([
      { type: 'token', value: '2026', token: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '08', token: 'MM' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '04', token: 'dd' },
    ]);
  });
});

describe('compileFormat', () => {
  it('produces a reusable formatter that matches the one-shot format() output', () => {
    const compiled = compileFormat('yyyy-MM-dd');
    expect(compiled.format(d)).toBe(format(d, 'yyyy-MM-dd'));
  });
});
