import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import { format, formatToParts, compileFormat, _getPieces, _handlerFor } from '../../src/format/format.js';
import { FormatSyntaxError, UnknownTokenError } from '../../src/core/errors.js';

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

// ---------------------------------------------------------------------------
// Branch-cluster coverage additions (task 2-a2). Cases above are untouched.
// ---------------------------------------------------------------------------

const tooLong = 'y'.repeat(1001); // MAX_FORMAT_LENGTH is 1000
const pt = Temporal.PlainTime.from('15:45:30');
const pdt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[America/New_York]');

// input type dispatch: PlainTime / PlainDateTime / ZonedDateTime / field bag
describe('format: input type dispatch', () => {
  it('formats a PlainTime with time tokens', () => {
    expect(format(pt, 'HH:mm:ss')).toBe('15:45:30');
  });

  it('formats a PlainTime with 12-hour and day-period tokens', () => {
    expect(format(Temporal.PlainTime.from('15:45'), 'h:mm a')).toBe('3:45 PM');
  });

  it('formats a PlainDateTime with date and time tokens', () => {
    expect(format(pdt, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-08-04 15:45:30');
  });

  it('formats a ZonedDateTime including its offset and zone id', () => {
    expect(format(zdt, 'yyyy-MM-dd HH:mm:ss XXX zzz')).toBe('2026-08-04 15:45:30 -04:00 America/New_York');
  });

  it('formats a bare TemporalLike field bag', () => {
    expect(format({ year: 2026, month: 8, day: 4 }, 'yyyy-MM-dd')).toBe('2026-08-04');
  });
});

// locale + numbering option branches
describe('format: options', () => {
  it('uses a non-default locale when one is given', () => {
    expect(format(d, 'MMMM', { locale: 'fr-FR' })).toBe('août');
  });

  it('defaults to en-US when no locale is given', () => {
    expect(format(d, 'MMMM')).toBe('August');
  });

  it('tolerates an explicit null options object', () => {
    // `options ?? {}` branch — the default parameter only covers undefined
    expect(format(d, 'yyyy', null as any)).toBe('2026');
  });

  it('transliterates digits when a numbering system is requested', () => {
    expect(format(d, 'yyyy-MM-dd', { numberingSystem: 'arab' })).toBe('٢٠٢٦-٠٨-٠٤');
  });

  it("resolves numberingSystem 'auto' from the call's own locale", () => {
    expect(format(d, 'yyyy', { locale: 'ar-EG', numberingSystem: 'auto' })).toBe('٢٠٢٦');
  });
});

// every throw path in format()'s own orchestration
describe('format: guard branches', () => {
  it('throws on a format string longer than MAX_FORMAT_LENGTH', () => {
    expect(() => format(d, tooLong)).toThrow(FormatSyntaxError);
    expect(() => format(d, tooLong)).toThrow(/exceeds maximum length of 1000/);
  });

  it('throws a typed error for null input', () => {
    expect(() => format(null as any, 'yyyy')).toThrow(FormatSyntaxError);
    expect(() => format(null as any, 'yyyy')).toThrow(/got null/);
  });

  it('throws a typed error for undefined input', () => {
    expect(() => format(undefined as any, 'yyyy')).toThrow(FormatSyntaxError);
    expect(() => format(undefined as any, 'yyyy')).toThrow(/got undefined/);
  });

  it('throws when a token needs a field the input lacks (date input, time token)', () => {
    expect(() => format(d, 'HH:mm')).toThrow(FormatSyntaxError);
    expect(() => format(d, 'HH:mm')).toThrow(/requires "hour"/);
  });

  it('throws when a token needs a field the input lacks (time input, date token)', () => {
    expect(() => format(pt, 'yyyy')).toThrow(FormatSyntaxError);
    expect(() => format(pt, 'yyyy')).toThrow(/requires "year"/);
  });

  it('throws when a token needs a field the input lacks (zone-less input, zone token)', () => {
    expect(() => format(pdt, 'zzz')).toThrow(FormatSyntaxError);
    expect(() => format(pdt, 'zzz')).toThrow(/requires "timeZoneId"/);
  });

  it('throws on an unterminated quote', () => {
    expect(() => format(d, "'oops")).toThrow(FormatSyntaxError);
    expect(() => format(d, "'oops")).toThrow(/unterminated quote/);
  });

  it('throws UnknownTokenError for an overlong token run', () => {
    expect(() => format(d, 'MMMMM')).toThrow(UnknownTokenError);
  });
});

// empty / literal-only / quoted-literal formats
describe('format: degenerate formats', () => {
  it('renders an empty format string as empty output', () => {
    expect(format(d, '')).toBe('');
  });

  it('passes a literal-only format string through untouched', () => {
    // "fun run" deliberately contains no token characters
    expect(format(d, 'fun run')).toBe('fun run');
  });

  it('treats a quoted span as a literal', () => {
    expect(format(d, "d'th of' MMMM")).toBe('4th of August');
  });

  it('decodes doubled quotes into literal quote characters', () => {
    expect(format(d, "''yyyy''")).toBe("'2026'");
  });
});

describe('formatToParts: guards and structure', () => {
  it('throws on a format string longer than MAX_FORMAT_LENGTH', () => {
    expect(() => formatToParts(d, tooLong)).toThrow(FormatSyntaxError);
    expect(() => formatToParts(d, tooLong)).toThrow(/exceeds maximum length of 1000/);
  });

  it('throws when a token needs a field the input lacks', () => {
    expect(() => formatToParts(d, 'HH:mm')).toThrow(FormatSyntaxError);
    expect(() => formatToParts(d, 'HH:mm')).toThrow(/requires "hour"/);
  });

  it('returns an empty array for an empty format string', () => {
    expect(formatToParts(d, '')).toEqual([]);
  });

  it('returns a single literal part for a literal-only format', () => {
    expect(formatToParts(d, 'fun run')).toEqual([{ type: 'literal', value: 'fun run' }]);
  });

  it('merges quoted and doubled-quote literals into one literal part', () => {
    expect(formatToParts(d, "d'th' ''of'' MMMM")).toEqual([
      { type: 'token', value: '4', token: 'd' },
      { type: 'literal', value: "th 'of' " },
      { type: 'token', value: 'August', token: 'MMMM' },
    ]);
  });

  it('applies the locale option per part', () => {
    expect(formatToParts(d, 'MMMM', { locale: 'fr-FR' })).toEqual([
      { type: 'token', value: 'août', token: 'MMMM' },
    ]);
  });

  it('transliterates digits per token part', () => {
    expect(formatToParts(d, 'yyyy-MM', { numberingSystem: 'arab' })).toEqual([
      { type: 'token', value: '٢٠٢٦', token: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: '٠٨', token: 'MM' },
    ]);
  });
});

describe('compileFormat: guards, reuse, and parts', () => {
  it('throws at compile time on a too-long format string', () => {
    expect(() => compileFormat(tooLong)).toThrow(FormatSyntaxError);
    expect(() => compileFormat(tooLong)).toThrow(/exceeds maximum length of 1000/);
  });

  it('exposes the format string and the pre-tokenized pieces', () => {
    const compiled = compileFormat("yyyy-MM-dd 'at' HH:mm");
    expect(compiled.formatStr).toBe("yyyy-MM-dd 'at' HH:mm");
    expect(compiled.pieces).toEqual([
      { kind: 'token', value: 'yyyy' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'MM' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'dd' },
      { kind: 'literal', value: ' at ' },
      { kind: 'token', value: 'HH' },
      { kind: 'literal', value: ':' },
      { kind: 'token', value: 'mm' },
    ]);
  });

  it('reuses one compiled formatter across different inputs', () => {
    const compiled = compileFormat('yyyy-MM-dd');
    expect(compiled.format(Temporal.PlainDate.from('1999-12-31'))).toBe('1999-12-31');
    expect(compiled.format(d)).toBe('2026-08-04');
  });

  it('throws when the compiled format meets an input missing a field', () => {
    const compiled = compileFormat('HH:mm');
    expect(() => compiled.format(d)).toThrow(FormatSyntaxError);
    expect(() => compiled.format(d)).toThrow(/requires "hour"/);
  });

  it('honors per-call locale and numbering options on the compiled format()', () => {
    const compiled = compileFormat('MMMM yyyy');
    expect(compiled.format(d)).toBe('August 2026'); // default options parameter
    expect(compiled.format(d, {})).toBe('August 2026'); // empty options object
    expect(compiled.format(d, { locale: 'fr-FR' })).toBe('août 2026');
    // digits transliterate, letters pass through untouched
    expect(compiled.format(d, { numberingSystem: 'arab' })).toBe('August ٢٠٢٦');
  });

  it('compiled.formatToParts defaults its options parameter', () => {
    const compiled = compileFormat('yyyy MMMM');
    expect(compiled.formatToParts(d)).toEqual([
      { type: 'token', value: '2026', token: 'yyyy' },
      { type: 'literal', value: ' ' },
      { type: 'token', value: 'August', token: 'MMMM' },
    ]);
  });

  it('compiled.formatToParts accepts an options object with and without a locale', () => {
    const compiled = compileFormat('MMMM');
    expect(compiled.formatToParts(d, {})).toEqual([{ type: 'token', value: 'August', token: 'MMMM' }]);
    expect(compiled.formatToParts(d, { locale: 'fr-FR' })).toEqual([
      { type: 'token', value: 'août', token: 'MMMM' },
    ]);
  });

  it('compiled.formatToParts transliterates each token part', () => {
    const compiled = compileFormat('yyyy');
    expect(compiled.formatToParts(d, { numberingSystem: 'arab' })).toEqual([
      { type: 'token', value: '٢٠٢٦', token: 'yyyy' },
    ]);
  });

  it('compiled.formatToParts throws when a field is missing', () => {
    const compiled = compileFormat('HH:mm');
    expect(() => compiled.formatToParts(d)).toThrow(FormatSyntaxError);
    expect(() => compiled.formatToParts(d)).toThrow(/requires "hour"/);
  });
});

describe('_getPieces (shared tokenization cache)', () => {
  it('returns the same frozen pieces array for a repeated format string', () => {
    const first = _getPieces('yyyy/MM/dd');
    const second = _getPieces('yyyy/MM/dd');
    expect(second).toBe(first); // cache-hit branch
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
  });

  it('tokenizes into token and literal pieces', () => {
    expect(_getPieces("yyyy 'mid' MM")).toEqual([
      { kind: 'token', value: 'yyyy' },
      { kind: 'literal', value: ' mid ' },
      { kind: 'token', value: 'MM' },
    ]);
  });

  it('evicts the oldest entry once the cache passes its size cap', () => {
    // MAX_TOKENIZE_CACHE_SIZE is 500: 501 distinct never-seen literal-only
    // format strings forces the eviction branch to run
    for (let i = 0; i < 501; i++) {
      expect(format(d, `v${i}`)).toBe(`v${i}`);
    }
  });
});

describe('_handlerFor', () => {
  it('looks up a token handler with its required field', () => {
    const handler = _handlerFor('yyyy')!;
    expect(handler.field).toBe('year');
    expect(typeof handler.fn).toBe('function');
    expect(handler.fn({ year: 44 }, 'en-US')).toBe('0044');
  });

  it('returns undefined for a token that does not exist', () => {
    expect(_handlerFor('definitely-not-a-token')).toBeUndefined();
  });
});
