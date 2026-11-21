import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  enumerateValidSplits,
  UNPADDED_NUMERIC_RANGES,
  UNPADDED_NUMERIC_TOKENS,
  tokenFragment,
  isValidTimeZone,
  FORMAT_ONLY_TOKENS,
  DIGIT_LEADING_TOKENS,
  UNBOUNDED_WIDTH_TOKENS,
} from '../../src/tokens/pattern.js';
import { parse, compileParser } from '../../src/parse/parse.js';
import { registerLocaleVocab } from '../../src/locale/localeVocab.js';
import { UnknownTokenError, InvalidTimeZoneError } from '../../src/core/errors.js';

setTemporal(Temporal);

// The existing suite only hits this indirectly, by parsing "Md" / "dM"
// strings end to end. These go straight at the split enumeration so a
// failure names the actual broken case instead of surfacing three
// layers up as "parse('...') returned the wrong date".
describe('enumerateValidSplits', () => {
  it('returns a single split for an unambiguous run', () => {
    // "Md" against "9" — one token, one digit, only one way to split it
    expect(enumerateValidSplits('9', ['M'])).toEqual([[9]]);
  });

  it('finds every valid split when a 2-digit month/day run is genuinely ambiguous', () => {
    // "112" against ['M', 'd']: M=1,d=12 (both valid) or M=11,d=2 (both valid)
    const splits = enumerateValidSplits('112', ['M', 'd']);
    expect(splits).toEqual(
      expect.arrayContaining([
        [1, 12],
        [11, 2],
      ]),
    );
    expect(splits).toHaveLength(2);
  });

  it('rejects splits where a piece falls outside its token range', () => {
    // "13" against ['M']: no single M reading of "13" is valid (max 12),
    // and there's only one token so there's no alternate split to fall to
    expect(enumerateValidSplits('13', ['M'])).toEqual([]);
  });

  it('handles a 3-token glued run recursively, not just pairs', () => {
    // "123" against ['H','m','s'] — one digit each is the only reading
    // where every piece stays in range
    const splits = enumerateValidSplits('123', ['H', 'm', 's']);
    expect(splits).toEqual(expect.arrayContaining([[1, 2, 3]]));
  });

  it('returns empty for zero tokens with leftover digits', () => {
    expect(enumerateValidSplits('5', [])).toEqual([]);
  });

  it('returns a single empty split for zero tokens and zero digits', () => {
    expect(enumerateValidSplits('', [])).toEqual([[]]);
  });
});

describe('UNPADDED_NUMERIC_TOKENS / UNPADDED_NUMERIC_RANGES', () => {
  it('every unpadded token has a matching range entry', () => {
    for (const token of UNPADDED_NUMERIC_TOKENS) {
      expect(UNPADDED_NUMERIC_RANGES[token]).toBeDefined();
    }
  });

  it('range entries cover 1-digit and 2-digit widths with no gap or overlap', () => {
    for (const [token, ranges] of Object.entries(UNPADDED_NUMERIC_RANGES)) {
      const oneDigit = ranges.find((r) => r.digits === 1);
      const twoDigit = ranges.find((r) => r.digits === 2);
      expect(oneDigit, `${token} missing 1-digit range`).toBeDefined();
      expect(twoDigit, `${token} missing 2-digit range`).toBeDefined();
      // the two ranges should be adjacent, not overlapping and not gapped
      expect(twoDigit!.min).toBe(oneDigit!.max + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Branch-cluster coverage additions (task 2-a2). Cases above are untouched.
// ---------------------------------------------------------------------------

// Registered so escapeRegExp()/foldCase() see vocab entries containing regex
// metacharacters — the built-in en-US names never exercise the escaping paths.
const SPECIALS_LOCALE = 'art-x-test';
registerLocaleVocab(SPECIALS_LOCALE, {
  monthLong: ['Jan+uary', 'February', 'March', 'April', 'May', 'June', 'July', 'Aug(ust)', 'September', 'October', 'November', 'December'],
  monthShort: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'],
  weekdayLong: ['Mon+day', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weekdayShort: ['Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.', 'Sun.'],
  dayPeriod: ['A.M.', 'P.M.'],
});

// yyyy's fragment depends on what follows it (YYYY_EXACT vs YYYY_EXTENDED)
describe('tokenFragment: year fragments', () => {
  it('yyyy with no successor uses the open-ended fragment', () => {
    expect(tokenFragment('yyyy', 'en-US')).toBe('-?\\d{4,}');
  });

  it('yyyy followed by a digit-leading token is bounded to exactly 4 digits', () => {
    expect(tokenFragment('yyyy', 'en-US', 'MM')).toBe('-?\\d{4}');
    expect(tokenFragment('yyyy', 'en-US', 'SSSS')).toBe('-?\\d{4}');
    expect(tokenFragment('yyyy', 'en-US', 'y')).toBe('-?\\d{4}');
  });

  it('yyyy followed by a non-digit token stays open-ended', () => {
    expect(tokenFragment('yyyy', 'en-US', 'MMMM')).toBe('-?\\d{4,}');
    expect(tokenFragment('yyyy', 'en-US', 'zzz')).toBe('-?\\d{4,}');
  });

  it('y is unconditionally unbounded', () => {
    expect(tokenFragment('y', 'en-US')).toBe('-?\\d+');
    expect(tokenFragment('y', 'en-US', 'MM')).toBe('-?\\d+');
  });
});

// every entry of NUMERIC_FRAGMENTS, plus QQQ's static fragment
describe('tokenFragment: numeric fragments', () => {
  it.each([
    ['yy', '\\d{2}'],
    ['MM', '(?:0[1-9]|1[0-2])'],
    ['M', '(?:1[0-2]|[1-9])'],
    ['dd', '(?:0[1-9]|[12]\\d|3[01])'],
    ['d', '(?:[12]\\d|3[01]|[1-9])'],
    ['HH', '(?:[01]\\d|2[0-3])'],
    ['H', '(?:1\\d|2[0-3]|[0-9])'],
    ['hh', '(?:0[1-9]|1[0-2])'],
    ['h', '(?:1[0-2]|[1-9])'],
    ['mm', '(?:[0-5]\\d)'],
    ['m', '(?:[1-5]\\d|[0-9])'],
    ['ss', '(?:[0-5]\\d)'],
    ['s', '(?:[1-5]\\d|[0-9])'],
    ['SSSSSSSSS', '\\d{9}'],
    ['SSSSSSSS', '\\d{8}'],
    ['SSSSSSS', '\\d{7}'],
    ['SSSSSS', '\\d{6}'],
    ['SSSSS', '\\d{5}'],
    ['SSSS', '\\d{4}'],
    ['SSS', '\\d{3}'],
    ['SS', '\\d{2}'],
    ['S', '\\d'],
    ['Q', '[1-4]'],
  ] as Array<[string, string]>)('numeric fragment for %s', (token, fragment) => {
    expect(tokenFragment(token, 'en-US')).toBe(fragment);
  });

  it('QQQ keeps its literal "Q" prefix in the fragment', () => {
    expect(tokenFragment('QQQ', 'en-US')).toBe('Q[1-4]');
  });
});

// the FORMAT_ONLY_TOKENS throw and the default-case throw
describe('tokenFragment: parse-side token rejection', () => {
  it.each([...FORMAT_ONLY_TOKENS])('%s is rejected as format-only', (token) => {
    expect(() => tokenFragment(token, 'en-US')).toThrow(UnknownTokenError);
    expect(() => tokenFragment(token, 'en-US')).toThrow(/format-only/);
  });

  it('unknown tokens hit the default throw', () => {
    expect(() => tokenFragment('nope', 'en-US')).toThrow(UnknownTokenError);
    expect(() => tokenFragment('nope', 'en-US')).toThrow(/unknown token "nope"/);
  });
});

// alternation() with and without case-insensitivity, via the vocab switch cases
describe('tokenFragment: locale vocabulary alternations', () => {
  it('MMMM builds a case-sensitive alternation of the locale month names', () => {
    const frag = tokenFragment('MMMM', 'en-US');
    expect(frag.startsWith('(?:')).toBe(true);
    const re = new RegExp(`^(?:${frag})$`);
    expect(re.test('August')).toBe(true);
    expect(re.test('august')).toBe(false); // case-sensitive on purpose
  });

  it('MMM / EEEE / EEE each match their own vocabulary', () => {
    expect(new RegExp(`^(?:${tokenFragment('MMM', 'en-US')})$`).test('Aug')).toBe(true);
    expect(new RegExp(`^(?:${tokenFragment('EEEE', 'en-US')})$`).test('Tuesday')).toBe(true);
    expect(new RegExp(`^(?:${tokenFragment('EEE', 'en-US')})$`).test('Tue')).toBe(true);
  });

  it('a folds case per letter so pm/Pm/PM all match', () => {
    const frag = tokenFragment('a', 'en-US');
    expect(frag).toContain('[aA][mM]');
    const re = new RegExp(`^(?:${frag})$`);
    expect(re.test('AM')).toBe(true);
    expect(re.test('pm')).toBe(true);
    expect(re.test('Pm')).toBe(true);
    expect(re.test('XM')).toBe(false);
  });

  it('a non-en locale vocabulary is used for the alternation', () => {
    const re = new RegExp(`^(?:${tokenFragment('MMMM', 'fr-FR')})$`);
    expect(re.test('août')).toBe(true);
    expect(re.test('August')).toBe(false);
  });
});

// regex metacharacters in vocab entries — escapeRegExp + foldCase together
describe('tokenFragment: metacharacters in registered vocab entries', () => {
  it('escapes metacharacters so they only match their literal selves', () => {
    const re = new RegExp(`^(?:${tokenFragment('MMMM', SPECIALS_LOCALE)})$`);
    expect(re.test('Aug(ust)')).toBe(true);
    // unescaped '(' would make the group optional and also match "August"
    expect(re.test('August')).toBe(false);
    expect(re.test('August)')).toBe(false);
  });

  it('escapes dots in short names ("." is not a wildcard)', () => {
    const re = new RegExp(`^(?:${tokenFragment('MMM', SPECIALS_LOCALE)})$`);
    expect(re.test('Aug.')).toBe(true);
    expect(re.test('AugX')).toBe(false);
  });

  it('case-folds day periods that contain metacharacters', () => {
    const re = new RegExp(`^(?:${tokenFragment('a', SPECIALS_LOCALE)})$`);
    expect(re.test('A.M.')).toBe(true);
    expect(re.test('a.m.')).toBe(true);
    expect(re.test('p.M.')).toBe(true);
    expect(re.test('X.M.')).toBe(false);
  });
});

// zzz's bounded shape fragment and the six offset-token shapes
describe('tokenFragment: zone and offset fragments', () => {
  it('zzz uses the bounded zone-shape fragment', () => {
    expect(tokenFragment('zzz', 'en-US')).toBe(
      '(?:UTC|[+-]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?|[A-Za-z_]+(?:[+-]\\d{1,2})?(?:\\/[A-Za-z0-9_+-]+)*)',
    );
  });

  it.each([
    ['X', '(?:Z|[+-]\\d{2}(?:\\d{2})?)'],
    ['XX', '(?:Z|[+-]\\d{4})'],
    ['XXX', '(?:Z|[+-]\\d{2}:\\d{2})'],
    ['x', '[+-]\\d{2}(?:\\d{2})?'],
    ['xx', '[+-]\\d{4}'],
    ['xxx', '[+-]\\d{2}:\\d{2}'],
  ] as Array<[string, string]>)('offset fragment for %s', (token, fragment) => {
    expect(tokenFragment(token, 'en-US')).toBe(fragment);
  });
});

// post-match zone validation: fixed offsets, Intl zone set, Temporal fallback
describe('isValidTimeZone', () => {
  it('accepts fixed-offset strings by shape', () => {
    expect(isValidTimeZone('+05:00')).toBe(true);
    expect(isValidTimeZone('-12:00')).toBe(true);
    expect(isValidTimeZone('+05:30:15.123')).toBe(true); // seconds + fraction
  });

  it('accepts canonical IANA zone ids from the Intl zone set', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true); // builds the zone set…
    expect(isValidTimeZone('Europe/Paris')).toBe(true); // …then hits the cached set
  });

  it('accepts UTC explicitly (it is not itself an IANA zone name)', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('falls back to Temporal itself for zone aliases Intl omits', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Etc/GMT+12')).toBe(true);
  });

  it('rejects zone-like strings Temporal refuses', () => {
    expect(isValidTimeZone('Bogus/Zone')).toBe(false);
  });
});

describe('token-set exports', () => {
  it('FORMAT_ONLY_TOKENS contains exactly the documented tokens', () => {
    expect([...FORMAT_ONLY_TOKENS].sort()).toEqual(
      ['cccc', 'ccc', 'D', 'DD', 'DDD', 'do', 'GGGG', 'G', 'LLLL', 'LLL', 'RRRR', 'ww', 'z', 'zzzz'].sort(),
    );
  });

  it('parseable tokens are not format-only', () => {
    expect(FORMAT_ONLY_TOKENS.has('yyyy')).toBe(false);
    expect(FORMAT_ONLY_TOKENS.has('zzz')).toBe(false);
    expect(FORMAT_ONLY_TOKENS.has('QQQ')).toBe(false);
  });

  it('digit-leading tokens are the numeric ones, not the named ones', () => {
    expect(DIGIT_LEADING_TOKENS.has('MM')).toBe(true);
    expect(DIGIT_LEADING_TOKENS.has('S')).toBe(true);
    expect(DIGIT_LEADING_TOKENS.has('y')).toBe(true);
    expect(DIGIT_LEADING_TOKENS.has('MMMM')).toBe(false);
    expect(DIGIT_LEADING_TOKENS.has('zzz')).toBe(false);
  });

  it('only "y" is unbounded-width', () => {
    expect([...UNBOUNDED_WIDTH_TOKENS]).toEqual(['y']);
  });
});

// remaining piece-level guards inside the split enumeration
describe('enumerateValidSplits: piece-level guards', () => {
  it('rejects a 2-digit piece with a leading zero', () => {
    // "05" as a 2-digit d piece is not a valid unpadded day reading
    expect(enumerateValidSplits('05', ['d'])).toEqual([]);
  });

  it('throws the internal-error guard for a non-unpadded token', () => {
    expect(() => enumerateValidSplits('1', ['zzz'])).toThrow(/internal error/);
  });
});

// TIME_ZONE_SHAPE's variants, exercised through the real parse() regex
describe('zzz zone shapes via parse()', () => {
  it('matches the UTC alternative', () => {
    const result = parse('yyyy-MM-dd HH:mm:ss zzz', '2026-08-04 15:45:30 UTC');
    expect((result as Temporal.ZonedDateTime).toString()).toBe('2026-08-04T15:45:30+00:00[UTC]');
  });

  it('matches the fixed-offset alternative', () => {
    const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 +05:30');
    expect((result as Temporal.ZonedDateTime).toString()).toBe('2026-08-04T15:45:00+05:30[+05:30]');
  });

  it('matches a multi-segment zone id', () => {
    const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/Argentina/Buenos_Aires');
    const expected = Temporal.ZonedDateTime.from('2026-08-04T15:45[America/Argentina/Buenos_Aires]');
    expect((result as Temporal.ZonedDateTime).toString()).toBe(expected.toString());
  });

  it('matches an Etc/GMT+12 offset-style zone id', () => {
    const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 09:00 Etc/GMT+12');
    const expected = Temporal.ZonedDateTime.from('2026-08-04T09:00[Etc/GMT+12]');
    expect((result as Temporal.ZonedDateTime).toString()).toBe(expected.toString());
  });

  it('rejects a shape-matching but unknown zone id', () => {
    expect(() => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Bogus/Zone')).toThrow(InvalidTimeZoneError);
  });
});

// the six offset tokens' regex variants, round-tripped through parse()
describe('offset token shapes via parse()', () => {
  it.each([
    ['X', 'UTC', 'Z'],
    ['X', 'UTC', '+00'],
    ['X', '+05:30', '+0530'],
    ['XX', 'UTC', 'Z'],
    ['XXX', 'UTC', 'Z'],
    ['x', '+05:30', '+0530'],
    ['xx', '+05:30', '+0530'],
    ['xxx', '+05:30', '+05:30'],
  ] as Array<[string, string, string]>)('%s against zone %s with offset %s', (token, zone, offset) => {
    const fmt = `yyyy-MM-dd HH:mm zzz ${token}`;
    const input = `2026-08-04 15:45 ${zone} ${offset}`;
    const result = parse(fmt, input) as Temporal.ZonedDateTime;
    const expected = Temporal.ZonedDateTime.from(`2026-08-04T15:45[${zone}]`);
    expect(result.toString()).toBe(expected.toString());
  });

  it('negative offsets round-trip too', () => {
    const result = parse('yyyy-MM-dd HH:mm zzz x', '2026-08-04 09:00 Etc/GMT+12 -1200');
    const expected = Temporal.ZonedDateTime.from('2026-08-04T09:00[Etc/GMT+12]');
    expect((result as Temporal.ZonedDateTime).toString()).toBe(expected.toString());
  });
});

// foldCase's per-letter classes working inside a real parse
describe('case-insensitive day period via parse()', () => {
  it('accepts lowercase pm', () => {
    expect((parse('h:mm a', '3:45 pm') as Temporal.PlainTime).toString()).toBe('15:45:00');
  });

  it('accepts uppercase PM', () => {
    expect((parse('h:mm a', '3:45 PM') as Temporal.PlainTime).toString()).toBe('15:45:00');
  });

  it('morning hours stay AM', () => {
    expect((parse('h:mm a', '3:45 AM') as Temporal.PlainTime).toString()).toBe('03:45:00');
  });
});

// escaped metacharacter vocab working inside a real parse
describe('metacharacter vocab via parse()', () => {
  it('round-trips a custom month name containing regex metacharacters', () => {
    const result = parse('MMMM d, yyyy', 'Aug(ust) 4, 2026', { locale: SPECIALS_LOCALE });
    expect((result as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });

  it('round-trips the custom dotted day period', () => {
    const result = parse('h:mm a', '3:45 P.M.', { locale: SPECIALS_LOCALE });
    expect((result as Temporal.PlainTime).toString()).toBe('15:45:00');
  });
});

describe('compileParser reuses the pre-built pattern', () => {
  it('exposes formatStr/pattern and parses through them', () => {
    const compiled = compileParser('yyyy-MM-dd');
    expect(compiled.formatStr).toBe('yyyy-MM-dd');
    expect(compiled.pattern.groups.map((g) => g.token)).toEqual(['yyyy', 'MM', 'dd']);
    expect((compiled.parse('2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
    expect((compiled.parse('1999-12-31') as Temporal.PlainDate).toString()).toBe('1999-12-31');
  });
});