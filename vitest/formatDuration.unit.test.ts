import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/formatDuration.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

// node --test exercises formatDuration through dist/, but only at the
// public-API level. These go straight at the source so a wrong
// pluralization or zero-handling branch surfaces with the actual
// tokenizer state in the failure message.

describe('formatDuration: numeric form', () => {
  it('renders a single unit value with no suffix', () => {
    expect(formatDuration({ hours: 2 }, 'h')).toBe('2');
    expect(formatDuration({ minutes: 30 }, 'm')).toBe('30');
    expect(formatDuration({ seconds: 5 }, 's')).toBe('5');
  });

  it('renders multiple units with literal separators', () => {
    expect(formatDuration({ hours: 2, minutes: 30 }, 'h:m')).toBe('2:30');
    expect(formatDuration({ hours: 2, minutes: 30, seconds: 5 }, 'h:m:s')).toBe('2:30:5');
  });
});

describe('formatDuration: short form (plural-aware)', () => {
  it('uses singular suffix for value 1, plural otherwise', () => {
    expect(formatDuration({ hours: 1 }, 'hh')).toBe('1h');
    expect(formatDuration({ hours: 2 }, 'hh')).toBe('2h');
    expect(formatDuration({ years: 1 }, 'yy')).toBe('1yr');
    expect(formatDuration({ years: 2 }, 'yy')).toBe('2yrs');
  });
});

describe('formatDuration: long form (plural-aware)', () => {
  it('uses singular word for value 1, plural otherwise', () => {
    expect(formatDuration({ years: 1 }, 'yyy')).toBe('1 year');
    expect(formatDuration({ years: 2 }, 'yyy')).toBe('2 years');
    expect(formatDuration({ milliseconds: 1 }, 'SSS')).toBe('1 millisecond');
    expect(formatDuration({ milliseconds: 2 }, 'SSS')).toBe('2 milliseconds');
  });
});

describe('formatDuration: zero-value handling', () => {
  it('omits zero-value units by default', () => {
    expect(formatDuration({ hours: 2, minutes: 0 }, 'hhh')).toBe('2 hours');
    expect(formatDuration({ hours: 0, minutes: 30 }, 'hhh mmm')).toBe(' 30 minutes');
  });

  it('renders zero-value units when showZeroValues is true', () => {
    expect(formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { showZeroValues: true })).toBe('2 hours 0 minutes');
  });

  it('returns the empty string when all values are zero (default)', () => {
    expect(formatDuration({ hours: 0, minutes: 0 }, 'hhh mmm')).toBe(' ');
  });
});

describe('formatDuration: Temporal.Duration object', () => {
  it('accepts a real Temporal.Duration the same as a field bag', () => {
    const dur = Temporal.Duration.from({ hours: 2, minutes: 30 });
    expect(formatDuration(dur, 'hhh mmm')).toBe('2 hours 30 minutes');
  });
});

describe('formatDuration: error handling', () => {
  it('throws on format strings exceeding MAX_FORMAT_LENGTH', () => {
    expect(() => formatDuration({ hours: 2 }, 'h'.repeat(1001))).toThrow(/exceeds maximum length/);
  });

  it('throws on non-finite numeric values', () => {
    expect(() => formatDuration({ hours: NaN }, 'hhh')).toThrow(/not a finite number/);
    expect(() => formatDuration({ hours: Infinity }, 'hhh')).toThrow(/not a finite number/);
  });

  it('throws on unterminated quote in format string', () => {
    expect(() => formatDuration({ hours: 2 }, "hhh 'at")).toThrow(/unterminated quote/);
  });
});

describe('formatDuration: quoted literals', () => {
  it('handles quoted literals the same as format()', () => {
    expect(formatDuration({ hours: 2, minutes: 30 }, "hhh 'and' mmm")).toBe('2 hours and 30 minutes');
  });

  it('doubled quote inside a quoted span is a literal quote', () => {
    expect(formatDuration({ hours: 2 }, "hh''hh")).toBe("2h'2h");
  });
});
