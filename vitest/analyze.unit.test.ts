import { describe, expect, it } from 'vitest';
import {
  analyzeFormat,
  explainFormat,
  fieldForToken,
  isValidFormat,
  listTokens,
  tokenizeFormat,
  tokenInfo,
  validateFormat,
  FORMAT_ONLY_TOKENS,
} from '../src/analyze.js';
import { FormatSyntaxError, UnknownTokenError } from '../src/errors.js';

describe('isValidFormat', () => {
  it('accepts a well-formed token/literal mix', () => {
    expect(isValidFormat('yyyy-MM-dd')).toBe(true);
  });
  it('rejects an unterminated quoted literal', () => {
    expect(isValidFormat("yyyy 'unterminated")).toBe(false);
  });
});

describe('listTokens', () => {
  it('returns every registered token with its metadata attached', () => {
    const tokens = listTokens();
    expect(tokens.length).toBeGreaterThan(0);
    const yyyy = tokens.find((t) => t.name === 'yyyy');
    expect(yyyy?.metadata.formatCapable).toBe(true);
  });
});

describe('analyzeFormat', () => {
  it('reports required fields and compatible types for a format string', () => {
    const analysis = analyzeFormat('yyyy-MM');
    expect(analysis.requiredFields).toEqual(expect.arrayContaining(['year', 'month']));
    expect(analysis.compatibleTypes).toContain('PlainDate');
  });
});

// ---- full introspection surface below ----------------------------------

describe('tokenizeFormat', () => {
  it('exposes the runtime tokenizer under its introspection name', () => {
    expect(tokenizeFormat('yyyy-MM-dd')).toEqual([
      { kind: 'token', value: 'yyyy' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'MM' },
      { kind: 'literal', value: '-' },
      { kind: 'token', value: 'dd' },
    ]);
  });

  it('decodes quoted literals and doubled quotes', () => {
    expect(tokenizeFormat("HH'o''clock'")).toEqual([
      { kind: 'token', value: 'HH' },
      { kind: 'literal', value: "o'clock" },
    ]);
    expect(tokenizeFormat("''")).toEqual([{ kind: 'literal', value: "'" }]);
  });
});

describe('tokenInfo', () => {
  it('returns metadata for known tokens', () => {
    expect(tokenInfo('yyyy')?.meaning).toBe('Four-digit year (preserves sign for BCE; no truncation).');
    expect(tokenInfo('zzz')?.timezoneSensitive).toBe(true);
    expect(tokenInfo('do')?.parseCapable).toBe(false);
    expect(tokenInfo('SSSSSSSSS')?.formatCapable).toBe(true);
  });

  it('returns undefined for unknown tokens instead of throwing', () => {
    expect(tokenInfo('not-a-token')).toBeUndefined();
    expect(tokenInfo('')).toBeUndefined();
  });
});

describe('token table invariants', () => {
  it('gives every registered token a metadata entry with a meaning', () => {
    for (const { metadata } of listTokens()) {
      expect(typeof metadata.meaning).toBe('string');
      expect(metadata.meaning.length).toBeGreaterThan(0);
    }
  });

  it('marks exactly the format-only tokens as not parse-capable', () => {
    for (const { name, metadata } of listTokens()) {
      expect(metadata.parseCapable, `parseCapable of ${name}`).toBe(!FORMAT_ONLY_TOKENS.has(name));
    }
  });
});

describe('analyzeFormat: token families', () => {
  it('reports date, time and fractional-second tokens', () => {
    const a = analyzeFormat('yyyy-MM-dd HH:mm:ss.SSS');
    expect(a.tokens.map((t) => t.name)).toEqual(['yyyy', 'MM', 'dd', 'HH', 'mm', 'ss', 'SSS']);
    expect(a.requiredFields).toEqual(['day', 'hour', 'millisecond', 'minute', 'month', 'second', 'year']);
    expect(a.compatibleTypes).toEqual(['PlainDateTime', 'ZonedDateTime']);
    expect(a.parseable).toBe(true);
    expect(a.localeSensitive).toBe(false);
    expect(a.calendarSensitive).toBe(true);
    expect(a.timezoneSensitive).toBe(false);
    expect(a.ambiguous).toBe(false);
    expect(a.roundTripSafe).toBe(true);
    expect(a.warnings).toEqual([]);
  });

  it('flags weekday, quarter, era and stand-alone month tokens', () => {
    const a = analyzeFormat('EEEE Q G GGGG LLLL');
    expect(a.requiredFields).toEqual(['dayOfWeek', 'month', 'year']);
    expect(a.localeSensitive).toBe(true); // G/GGGG/LLLL are locale-aware
    // only G, GGGG and LLLL are format-only here
    expect(a.warnings.map((w) => w.code)).toEqual(['FORMAT_ONLY_TOKEN', 'FORMAT_ONLY_TOKEN', 'FORMAT_ONLY_TOKEN']);
    expect(a.parseable).toBe(false);
    expect(a.roundTripSafe).toBe(false);
  });

  it('treats offset and zone-id tokens as timezone-sensitive', () => {
    for (const fmt of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx', 'zzz', 'zzzz', 'z']) {
      expect(analyzeFormat(fmt).timezoneSensitive, `timezoneSensitive of "${fmt}"`).toBe(true);
    }
    const z = analyzeFormat('zzz');
    expect(z.requiredFields).toEqual(['timeZoneId']);
    expect(z.compatibleTypes).toEqual(['ZonedDateTime']);
    const off = analyzeFormat('XXX');
    expect(off.requiredFields).toEqual(['offset']);
  });

  it('aggregates every field family across a kitchen-sink format', () => {
    const a = analyzeFormat('yyyy-MM-dd HH:mm:ss a Q EEEE zzz X SSS');
    expect(a.requiredFields).toEqual(
      ['day', 'dayOfWeek', 'hour', 'millisecond', 'minute', 'month', 'offset', 'second', 'timeZoneId', 'year'],
    );
    expect(a.compatibleTypes).toEqual(['ZonedDateTime']);
  });
});

describe('analyzeFormat: warnings', () => {
  it('detects unpadded numeric runs and reports them as ambiguous', () => {
    const a = analyzeFormat('Md');
    expect(a.ambiguous).toBe(true);
    expect(a.warnings).toEqual([
      {
        code: 'AMBIGUOUS_NUMERIC_RUN',
        message:
          'Adjacent unpadded numeric tokens "Md" with no separator can be ambiguous to parse. Add a separator or use the padded form (e.g. "MM" instead of "M").',
      },
    ]);
  });

  it('does not flag runs broken by literals, padded tokens or non-unpadded tokens', () => {
    expect(analyzeFormat('M/d').ambiguous).toBe(false);
    expect(analyzeFormat('M/d').warnings).toEqual([]);
    expect(analyzeFormat('y-M-d').ambiguous).toBe(false);
    expect(analyzeFormat('My').ambiguous).toBe(false); // y is not an unpadded numeric token
    expect(analyzeFormat('Hms').ambiguous).toBe(true); // three-token run
  });

  it('warns when a 12-hour token has no day period', () => {
    const a = analyzeFormat('hh:mm');
    expect(a.warnings.map((w) => w.code)).toEqual(['TWELVE_HOUR_WITHOUT_A']);
    expect(analyzeFormat('hh:mm a').warnings).toEqual([]);
  });

  it('warns when 12- and 24-hour tokens are mixed', () => {
    const a = analyzeFormat('hh:mm HH:mm a');
    expect(a.warnings.map((w) => w.code)).toEqual(['MIXED_12_AND_24_HOUR']);
  });

  it('warns when zzz is combined with an offset token', () => {
    const a = analyzeFormat('yyyy-MM-dd HH:mm zzz XXX');
    expect(a.warnings.map((w) => w.code)).toEqual(['ZZZ_WITH_OFFSET_TOKEN']);
  });

  it('warns when an offset token appears without a full date', () => {
    const a = analyzeFormat('HH:mm X');
    expect(a.warnings.map((w) => w.code)).toEqual(['OFFSET_WITHOUT_FULL_DATE']);
    expect(analyzeFormat('yyyy-MM-dd HH:mm X').warnings).toEqual([]);
  });

  it('marks format-only and two-digit-year formats as not round-trip safe', () => {
    const doA = analyzeFormat('yyyy-MM-do');
    expect(doA.parseable).toBe(false);
    expect(doA.roundTripSafe).toBe(false);
    expect(doA.warnings.map((w) => w.code)).toEqual(['FORMAT_ONLY_TOKEN']);
    const yyA = analyzeFormat('yy-MM-dd');
    expect(yyA.parseable).toBe(true);
    expect(yyA.roundTripSafe).toBe(false); // century loss
    expect(yyA.warnings).toEqual([]);
  });
});

describe('analyzeFormat: shape and errors', () => {
  it('intersects compatible types across tokens', () => {
    expect(analyzeFormat('yyyy').compatibleTypes).toEqual(['PlainDate', 'PlainDateTime', 'PlainYearMonth', 'ZonedDateTime']);
    expect(analyzeFormat('yyyy HH').compatibleTypes).toEqual(['PlainDateTime', 'ZonedDateTime']);
    expect(analyzeFormat('HH').compatibleTypes).toEqual(['PlainDateTime', 'PlainTime', 'ZonedDateTime']);
  });

  it('uses source-string positions that account for quoted literals', () => {
    const a = analyzeFormat("'a b' yyyy");
    expect(a.tokens[0]).toMatchObject({ name: 'yyyy', position: 6 });
    const b = analyzeFormat("''yyyyMMdd");
    expect(b.tokens.map((t) => [t.name, t.position])).toEqual([
      ['yyyy', 2],
      ['MM', 6],
      ['dd', 8],
    ]);
  });

  it('returns an empty analysis for empty and literal-only formats', () => {
    const a = analyzeFormat('');
    expect(a.tokens).toEqual([]);
    expect(a.requiredFields).toEqual([]);
    expect(a.compatibleTypes).toEqual([]);
    expect(a.parseable).toBe(true);
    expect(a.localeSensitive).toBe(false);
    expect(a.calendarSensitive).toBe(false);
    expect(a.timezoneSensitive).toBe(false);
    expect(a.ambiguous).toBe(false);
    expect(a.roundTripSafe).toBe(true);
    expect(a.warnings).toEqual([]);
    expect(analyzeFormat("'just words'").tokens).toEqual([]);
    expect(analyzeFormat("'just words'").requiredFields).toEqual([]);
  });

  it('throws on format strings beyond the maximum length', () => {
    const tooLong = 'x'.repeat(1001);
    expect(() => analyzeFormat(tooLong))
      .toThrow('temporal-fmt: format string exceeds maximum length of 1000 characters (got 1001).');
  });

  it('propagates tokenizer errors with their exact types', () => {
    expect(() => analyzeFormat("'oops")).toThrow(FormatSyntaxError); // unterminated quote
    expect(() => analyzeFormat("'oops")).toThrow(/unterminated quote/);
    expect(() => analyzeFormat('MMMMM')).toThrow(UnknownTokenError); // overlong token run
  });
});

describe('explainFormat', () => {
  it('renders the full analysis as prose', () => {
    expect(explainFormat('HH')).toEqual(
      [
        'Format string: "HH"',
        'Tokens (1):',
        '  HH @0 — Two-digit hour, 24-hour clock (00-23, zero-padded).',
        'Required fields: hour',
        'Compatible Temporal types: PlainDateTime, PlainTime, ZonedDateTime',
        'Parseable: yes',
        'Locale-sensitive: no',
        'Calendar-sensitive: no',
        'Timezone-sensitive: no',
        'Ambiguous: no',
        'Round-trip safe: yes',
      ].join('\n'),
    );
  });

  it('renders the yes/no variants of every flag plus warnings', () => {
    const out = explainFormat('Md do');
    expect(out).toContain('Ambiguous: yes');
    expect(out).toContain('Parseable: no');
    expect(out).toContain('Round-trip safe: no');
    expect(out).toContain('Warnings:');
    expect(out).toContain('[AMBIGUOUS_NUMERIC_RUN]');
    expect(out).toContain('[FORMAT_ONLY_TOKEN]');
    expect(explainFormat('MMMM EEEE')).toContain('Locale-sensitive: yes');
    expect(explainFormat('yyyy')).toContain('Calendar-sensitive: yes');
    expect(explainFormat('zzz')).toContain('Timezone-sensitive: yes');
  });

  it('omits empty sections', () => {
    const out = explainFormat('');
    expect(out).toContain('Tokens (0):');
    expect(out).not.toContain('Required fields');
    expect(out).not.toContain('Compatible Temporal types');
    expect(out).not.toContain('Warnings');
  });
});

describe('isValidFormat (extended)', () => {
  it('accepts empty strings and doubled quotes', () => {
    expect(isValidFormat('')).toBe(true);
    expect(isValidFormat("''")).toBe(true);
  });

  it('rejects overlong token runs and oversized strings', () => {
    expect(isValidFormat('MMMMM')).toBe(false);
    expect(isValidFormat('x'.repeat(1001))).toBe(false);
    expect(isValidFormat('y'.repeat(1000))).toBe(false); // 'y' runs glue into an overlong token
    expect(isValidFormat('q'.repeat(1000))).toBe(true);  // exactly at the cap, literals only
  });
});

describe('validateFormat', () => {
  it('returns the analysis for valid format strings', () => {
    const a = validateFormat('yyyy-MM');
    expect(a.requiredFields).toEqual(['month', 'year']);
    expect(a.compatibleTypes).toContain('PlainYearMonth');
  });

  it('throws the same errors as analyzeFormat for invalid ones', () => {
    expect(() => validateFormat('x'.repeat(1001))).toThrow(/exceeds maximum length/);
    expect(() => validateFormat("'oops")).toThrow(FormatSyntaxError);
  });
});

describe('fieldForToken', () => {
  it('maps every registered token to its required field', () => {
    for (const { name } of listTokens()) {
      expect(fieldForToken(name), `fieldForToken(${name})`).toBeDefined();
    }
    expect(fieldForToken('yyyy')).toBe('year');
    expect(fieldForToken('yy')).toBe('year');
    expect(fieldForToken('y')).toBe('year');
    expect(fieldForToken('MM')).toBe('month');
    expect(fieldForToken('MMMM')).toBe('month');
    expect(fieldForToken('dd')).toBe('day');
    expect(fieldForToken('d')).toBe('day');
    expect(fieldForToken('HH')).toBe('hour');
    expect(fieldForToken('h')).toBe('hour');
    expect(fieldForToken('a')).toBe('hour');
    expect(fieldForToken('mm')).toBe('minute');
    expect(fieldForToken('ss')).toBe('second');
    expect(fieldForToken('s')).toBe('second');
    expect(fieldForToken('SSS')).toBe('millisecond');
    expect(fieldForToken('SSSSSSSSS')).toBe('millisecond');
    expect(fieldForToken('Q')).toBe('month');
    expect(fieldForToken('QQQ')).toBe('month');
    expect(fieldForToken('EEEE')).toBe('dayOfWeek');
    expect(fieldForToken('EEE')).toBe('dayOfWeek');
    expect(fieldForToken('zzz')).toBe('timeZoneId');
    expect(fieldForToken('X')).toBe('offset');
    expect(fieldForToken('xxx')).toBe('offset');
    expect(fieldForToken('do')).toBe('day');
    expect(fieldForToken('ww')).toBe('dayOfWeek');
    expect(fieldForToken('RRRR')).toBe('dayOfWeek');
    expect(fieldForToken('G')).toBe('year');
    expect(fieldForToken('GGGG')).toBe('year');
    expect(fieldForToken('LLLL')).toBe('month');
    expect(fieldForToken('ccc')).toBe('dayOfWeek');
    expect(fieldForToken('zzzz')).toBe('timeZoneId');
  });

  it('returns undefined for unknown tokens', () => {
    expect(fieldForToken('nope')).toBeUndefined();
    expect(fieldForToken('')).toBeUndefined();
  });
});
