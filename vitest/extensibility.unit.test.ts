import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { createFormatter } from '../src/extensibility.js';
import type { CustomToken } from '../src/extensibility.js';
import { format } from '../src/format.js';
import { UnknownTokenError } from '../src/errors.js';

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

// ---------------------------------------------------------------------------
// Branch-cluster coverage additions (task 3-d2). Cases above are untouched.
// ---------------------------------------------------------------------------

const tooLong = 'y'.repeat(1001); // MAX_FORMAT_LENGTH is 1000
const pt = Temporal.PlainTime.from('15:45:30');
const pdt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[America/New_York]');
const bag = { year: 2026, month: 8, day: 4 };

// token-table merging: override-in-place vs append-new
describe('createFormatter: token merging', () => {
  it('replaces a built-in token with the same name in place', () => {
    const fmt = createFormatter({ tokens: [{ name: 'yyyy', handler: () => 'YEAR', field: 'year' }] });
    expect(fmt.format(date, 'yyyy-MM-dd')).toBe('YEAR-08-04'); // 'MM'/'dd' still built-in
  });

  it('lets a later duplicate custom token win over an earlier one', () => {
    const fmt = createFormatter({
      tokens: [
        { name: 'J', handler: () => 'first', field: 'year' },
        { name: 'J', handler: () => 'second', field: 'year' },
      ],
    });
    expect(fmt.format(date, 'J')).toBe('second');
  });

  it('treats an empty options object and an empty tokens array as no tokens', () => {
    expect(createFormatter({}).format(date, 'yyyy')).toBe('2026');
    expect(createFormatter({ tokens: [] }).format(date, 'yyyy')).toBe('2026');
  });

  it('passes the temporal object and the locale to custom handlers', () => {
    const tokens: CustomToken[] = [
      { name: 'NNNN', handler: (t, locale) => `${locale}:${t.year}`, field: 'year' },
    ];
    const fmt = createFormatter({ tokens });
    expect(fmt.format(date, 'NNNN')).toBe('en-US:2026'); // DEFAULT_LOCALE fallback
    expect(fmt.format(date, 'NNNN', { locale: 'fr-FR' })).toBe('fr-FR:2026'); // per-call override
    const fr = createFormatter({ tokens, defaultLocale: 'fr-FR' });
    expect(fr.format(date, 'NNNN')).toBe('fr-FR:2026'); // formatter-level defaultLocale
    expect(fr.format(date, 'NNNN', { locale: 'de-DE' })).toBe('de-DE:2026'); // per-call beats defaultLocale
  });
});

// declared TokenField drives the missing-field precheck on every entry point
describe('createFormatter: missing-field validation', () => {
  const hourTok: CustomToken = { name: 'J', handler: (t) => String(t.hour), field: 'hour' };

  it('throws in format() when the declared field is absent', () => {
    const fmt = createFormatter({ tokens: [hourTok] });
    expect(() => fmt.format(date, 'J')).toThrow(/token "J" requires "hour"/);
  });

  it('throws in formatToParts() when the declared field is absent', () => {
    const fmt = createFormatter({ tokens: [hourTok] });
    expect(() => fmt.formatToParts(date, 'J')).toThrow(/requires "hour"/);
  });

  it('throws for built-in tokens reading fields the input lacks', () => {
    const fmt = createFormatter(); // PlainDate has no hour
    expect(() => fmt.format(date, 'HH:mm')).toThrow(/requires "hour"/);
  });
});

// every Temporal input shape flows through the merged handlers
describe('createFormatter: input types', () => {
  it('formats PlainTime, PlainDateTime, ZonedDateTime and a field bag', () => {
    const fmt = createFormatter();
    expect(fmt.format(pt, 'HH:mm:ss')).toBe('15:45:30');
    expect(fmt.format(pdt, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-08-04 15:45:30');
    expect(fmt.format(zdt, 'yyyy-MM-dd HH:mm:ss XXX zzz')).toBe('2026-08-04 15:45:30 -04:00 America/New_York');
    expect(fmt.format(bag, 'yyyy-MM-dd')).toBe('2026-08-04');
    // parity with the built-in format() for a plain pattern
    expect(fmt.format(pdt, 'yyyy-MM-dd')).toBe(format(pdt, 'yyyy-MM-dd'));
  });

  it('resolves locale-aware built-in tokens via defaultLocale and per-call locale', () => {
    const fr = createFormatter({ defaultLocale: 'fr-FR' });
    expect(fr.format(date, 'MMMM')).toBe('août'); // formatter default
    expect(fr.format(date, 'MMMM', { locale: 'en-US' })).toBe('August'); // per-call override
    expect(createFormatter().format(date, 'MMMM')).toBe('August'); // DEFAULT_LOCALE
  });
});

// quoted-literal escapes: a doubled quote at the *start* of a quote span
describe('createFormatter: quote escapes', () => {
  it('renders a doubled quote at quote start as a single quote literal', () => {
    const fmt = createFormatter();
    expect(fmt.format(date, "''")).toBe("'");
    expect(fmt.format(date, "''''")).toBe("''"); // two escapes merge into one literal run
  });

  it('merges an escaped quote with following literal characters in parts output', () => {
    const fmt = createFormatter();
    expect(fmt.formatToParts(date, "'' yyyy")).toEqual([
      { type: 'literal', value: "' " },
      { type: 'token', value: '2026', token: 'yyyy' },
    ]);
  });

  it('emits a leading literal as the first part', () => {
    const fmt = createFormatter();
    expect(fmt.formatToParts(date, '-yyyy')).toEqual([
      { type: 'literal', value: '-' },
      { type: 'token', value: '2026', token: 'yyyy' },
    ]);
  });

  it('returns empty output for an empty format string', () => {
    const fmt = createFormatter();
    expect(fmt.format(date, '')).toBe('');
    expect(fmt.formatToParts(date, '')).toEqual([]);
  });
});

// overlong-run guard: greedy match + one more of the same letter is not a token
describe('createFormatter: overlong-run guard', () => {
  it('throws UnknownTokenError for built-in token letters run too long', () => {
    const fmt = createFormatter();
    expect(() => fmt.format(date, 'yyyyy')).toThrow(UnknownTokenError);
    expect(() => fmt.format(date, 'ddddd')).toThrow(/isn't a recognized token/);
  });

  it('applies the same guard to custom tokens', () => {
    const fmt = createFormatter({ tokens: [{ name: 'NNNN', handler: () => 'N', field: 'year' }] });
    expect(() => fmt.format(date, 'NNNNN')).toThrow(UnknownTokenError);
  });

  it('surfaces the guard through compileFormat too', () => {
    expect(() => createFormatter().compileFormat('MMMMM')).toThrow(UnknownTokenError);
  });
});

// MAX_FORMAT_LENGTH precheck on all three entry points
describe('createFormatter: format-length cap', () => {
  it('throws when the format string exceeds 1000 characters', () => {
    const fmt = createFormatter();
    expect(() => fmt.format(date, tooLong)).toThrow(/exceeds maximum length/);
    expect(() => fmt.formatToParts(date, tooLong)).toThrow(/exceeds maximum length/);
    expect(() => fmt.compileFormat(tooLong)).toThrow(/exceeds maximum length/);
  });
});

// compileFormat: pre-tokenized reusable formatter
describe('createFormatter: compileFormat', () => {
  it('compiles once and formats repeatedly with the merged token table', () => {
    const compiled = createFormatter().compileFormat('yyyy-MM-dd');
    expect(compiled.formatStr).toBe('yyyy-MM-dd');
    expect(compiled.format(pdt)).toBe('2026-08-04');
    expect(compiled.format(bag)).toBe('2026-08-04');
    expect(compiled.format(pdt)).toBe(format(pdt, 'yyyy-MM-dd')); // parity with built-in
  });

  it('uses custom tokens and quoted literals in the compiled form', () => {
    const fmt = createFormatter({ tokens: [{ name: 'NNNN', handler: (t) => `Y${t.year}`, field: 'year' }] });
    const compiled = fmt.compileFormat("NNNN 'q'");
    expect(compiled.format(date)).toBe('Y2026 q');
    expect(compiled.formatToParts(date)).toEqual([
      { type: 'token', value: 'Y2026', token: 'NNNN' },
      { type: 'literal', value: ' q' },
    ]);
  });

  it('honors defaultLocale and per-call locale overrides when compiled', () => {
    const compiled = createFormatter({ defaultLocale: 'fr-FR' }).compileFormat('MMMM');
    expect(compiled.format(date)).toBe('août'); // defaultLocale
    expect(compiled.format(date, { locale: 'en-US' })).toBe('August'); // per-call override
    expect(compiled.formatToParts(date)).toEqual([{ type: 'token', value: 'août', token: 'MMMM' }]);
    expect(compiled.formatToParts(date, { locale: 'en-US' })).toEqual([
      { type: 'token', value: 'August', token: 'MMMM' },
    ]);
  });

  it('splits compiled output into token and literal parts', () => {
    const compiled = createFormatter().compileFormat('yyyy-MM-dd');
    expect(compiled.formatToParts(pdt)).toEqual([
      { type: 'token', value: '2026', token: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '08', token: 'MM' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '04', token: 'dd' },
    ]);
  });

  it('throws in compiled format()/formatToParts() when a field is missing', () => {
    const compiled = createFormatter().compileFormat('HH'); // PlainDate has no hour
    expect(() => compiled.format(date)).toThrow(/requires "hour"/);
    expect(() => compiled.formatToParts(date)).toThrow(/requires "hour"/);
  });

  it('handles an empty compiled format', () => {
    const compiled = createFormatter().compileFormat('');
    expect(compiled.format(date)).toBe('');
    expect(compiled.formatToParts(date)).toEqual([]);
  });
});
