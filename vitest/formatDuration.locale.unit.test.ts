import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/formatDuration.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Unit tests for the locale-aware path of formatDuration. node --test
// (test/formatDuration.locale.test.js) covers the public-API surface
// against dist/. These go straight at src/ so a wrong Intl.NumberFormat
// cache hit or a wrong branch through the locale-aware path surfaces
// with the actual tokenizer state in the failure message.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;

const LOCALES = ['en-US', 'es-ES', 'fr-FR', 'de-DE'];

const UNITS = [
  { numericTok: 'y', shortTok: 'yy', longTok: 'yyy', field: 'years', intlUnit: 'year' },
  { numericTok: 'o', shortTok: 'oo', longTok: 'ooo', field: 'months', intlUnit: 'month' },
  { numericTok: 'w', shortTok: 'ww', longTok: 'www', field: 'weeks', intlUnit: 'week' },
  { numericTok: 'd', shortTok: 'dd', longTok: 'ddd', field: 'days', intlUnit: 'day' },
  { numericTok: 'h', shortTok: 'hh', longTok: 'hhh', field: 'hours', intlUnit: 'hour' },
  { numericTok: 'm', shortTok: 'mm', longTok: 'mmm', field: 'minutes', intlUnit: 'minute' },
  { numericTok: 's', shortTok: 'ss', longTok: 'sss', field: 'seconds', intlUnit: 'second' },
  { numericTok: 'S', shortTok: 'SS', longTok: 'SSS', field: 'milliseconds', intlUnit: 'millisecond' },
];

// Independently compute what Intl.NumberFormat produces for the same
// inputs, then assert formatDuration matches it. Catches any drift
// between formatDuration's output and what Intl actually produces.
function intlUnitOutput(locale: string, value: number, intlUnit: string, unitDisplay: 'short' | 'long'): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: intlUnit, unitDisplay }).format(value);
}

describe('formatDuration: locale-aware long form', () => {
  it('produces Intl.NumberFormat unit-style output for every unit, every locale, value=1', () => {
    for (const { longTok, field, intlUnit } of UNITS) {
      for (const locale of LOCALES) {
        const expected = intlUnitOutput(locale, 1, intlUnit, 'long');
        expect(formatDuration({ [field]: 1 }, longTok, { locale }), `${locale} ${field}=1`).toBe(expected);
      }
    }
  });

  it('produces Intl.NumberFormat unit-style output for value=2 (plural form)', () => {
    for (const { longTok, field, intlUnit } of UNITS) {
      for (const locale of LOCALES) {
        const expected = intlUnitOutput(locale, 2, intlUnit, 'long');
        expect(formatDuration({ [field]: 2 }, longTok, { locale }), `${locale} ${field}=2`).toBe(expected);
      }
    }
  });
});

describe('formatDuration: locale-aware short form', () => {
  it('produces Intl.NumberFormat unit-style output at the short width', () => {
    for (const { shortTok, field, intlUnit } of UNITS) {
      for (const locale of LOCALES) {
        const expected = intlUnitOutput(locale, 2, intlUnit, 'short');
        expect(formatDuration({ [field]: 2 }, shortTok, { locale }), `${locale} ${field}=2`).toBe(expected);
      }
    }
  });
});

describe('formatDuration: numeric form is locale-independent', () => {
  it('produces ASCII digits regardless of locale (numbers stay Western convention)', () => {
    for (const { numericTok, field } of UNITS) {
      for (const locale of LOCALES) {
        expect(formatDuration({ [field]: 2 }, numericTok, { locale }), `${locale} ${field}=2`).toBe('2');
      }
    }
  });

  it('stays ASCII even for locales whose native numeral system is non-ASCII', () => {
    expect(formatDuration({ hours: 2 }, 'h', { locale: 'ar-EG' })).toBe('2');
    expect(formatDuration({ hours: 2 }, 'h', { locale: 'ja-JP' })).toBe('2');
  });
});

describe('formatDuration: millisecond edge case', () => {
  it('Intl.NumberFormat supports `millisecond` unit on every locale we test', () => {
    // Confirmed against the current Intl spec — the task brief flagged
    // this as a possible gap, but it's actually supported. Pinning
    // that behavior here so a future engine regression surfaces.
    for (const locale of LOCALES) {
      expect(formatDuration({ milliseconds: 1 }, 'SSS', { locale }), `${locale} ms=1`).toBe(intlUnitOutput(locale, 1, 'millisecond', 'long'));
      expect(formatDuration({ milliseconds: 5 }, 'SSS', { locale }), `${locale} ms=5`).toBe(intlUnitOutput(locale, 5, 'millisecond', 'long'));
      expect(formatDuration({ milliseconds: 5 }, 'SS', { locale }), `${locale} ms=5 short`).toBe(intlUnitOutput(locale, 5, 'millisecond', 'short'));
    }
  });
});

describe('formatDuration: default-path (no locale) byte-identical to pre-change', () => {
  it('uses the hardcoded English table for word forms, not Intl.NumberFormat', () => {
    // Intl.NumberFormat('en-US') would produce "2 hr" with a space —
    // the default path keeps the original "2h" (no space) so existing
    // callers' output is unchanged.
    expect(formatDuration({ hours: 1 }, 'hh')).toBe('1h');
    expect(formatDuration({ hours: 2 }, 'hh')).toBe('2h');
    expect(formatDuration({ years: 1 }, 'yy')).toBe('1yr');
    expect(formatDuration({ years: 2 }, 'yy')).toBe('2yrs');
    expect(formatDuration({ months: 1 }, 'oo')).toBe('1mo');
    expect(formatDuration({ months: 2 }, 'oo')).toBe('2mos');
    expect(formatDuration({ weeks: 1 }, 'ww')).toBe('1wk');
    expect(formatDuration({ weeks: 2 }, 'ww')).toBe('2wks');
    expect(formatDuration({ milliseconds: 1 }, 'SSS')).toBe('1 millisecond');
    expect(formatDuration({ milliseconds: 5 }, 'SSS')).toBe('5 milliseconds');
  });

  it('preserves the sign on negative values with default-path plural rules', () => {
    expect(formatDuration({ hours: -1 }, 'hhh')).toBe('-1 hour');
    expect(formatDuration({ hours: -2 }, 'hhh')).toBe('-2 hours');
  });
});

describe('formatDuration: locale-aware negative values', () => {
  it('passes the value through to Intl, which handles sign and pluralization', () => {
    for (const locale of LOCALES) {
      expect(formatDuration({ hours: -1 }, 'hhh', { locale }), `${locale} -1`).toBe(intlUnitOutput(locale, -1, 'hour', 'long'));
      expect(formatDuration({ hours: -2 }, 'hhh', { locale }), `${locale} -2`).toBe(intlUnitOutput(locale, -2, 'hour', 'long'));
    }
  });
});

describe('formatDuration: mixed units localize consistently', () => {
  it('each long-form token in a multi-unit format string renders via Intl independently', () => {
    for (const locale of LOCALES) {
      const result = formatDuration(
        { years: 2, months: 3, days: 5, hours: 6 },
        'yyy ooo ddd hhh',
        { locale }
      );
      const expected = [
        intlUnitOutput(locale, 2, 'year', 'long'),
        intlUnitOutput(locale, 3, 'month', 'long'),
        intlUnitOutput(locale, 5, 'day', 'long'),
        intlUnitOutput(locale, 6, 'hour', 'long'),
      ].join(' ');
      expect(result).toBe(expected);
    }
  });
});

describe('formatDuration: locale option accepts tag variants', () => {
  it('es-AR, es-MX route the same as es-ES (grammar selected by language subtag)', () => {
    // Not the grammar side (that's parseRelative) — this is the Intl
    // side. Intl.NumberFormat accepts region variants natively.
    expect(formatDuration({ hours: 2 }, 'hhh', { locale: 'es-AR' })).toBe(intlUnitOutput('es-AR', 2, 'hour', 'long'));
    expect(formatDuration({ hours: 2 }, 'hhh', { locale: 'es-MX' })).toBe(intlUnitOutput('es-MX', 2, 'hour', 'long'));
  });
});
