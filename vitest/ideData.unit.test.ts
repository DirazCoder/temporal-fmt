import { describe, expect, it, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';

setTemporal(Temporal);

// Covers src/ideData.ts — the IDE data layer (autocomplete, hover docs,
// inline diagnostics, preview, doc links, Day.js/date-fns conversion
// tables).
//
// The one mock in this file: tokenFamily()'s `return 'Other'` catch-all
// (line 66) and getHoverDocs()'s `formatCapable: 'no'` arm (line 114) are
// only reachable for a token that exists in the metadata table but matches
// no token-family pattern / isn't format-capable. No such token exists in
// the real table (all 51 entries are format-capable and family-tagged), so
// this simulates exactly the "token added in the future" scenario those
// defensive branches exist for: one synthetic metadata entry, appended to
// the real table via vi.mock, consumed only through ideData's own public
// functions. Real-token behavior is unchanged for every other test.
vi.mock('../src/tokenMetadata.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/tokenMetadata.js')>();
  return {
    ...actual,
    ALL_TOKEN_NAMES: [...actual.ALL_TOKEN_NAMES, 'zz-future-fake'],
    TOKEN_METADATA: {
      ...actual.TOKEN_METADATA,
      'zz-future-fake': {
        meaning: 'Synthetic future token — exists only to exercise the defensive branches.',
        formatCapable: false,
        parseCapable: false,
        localeSensitive: false,
        calendarSensitive: false,
        timezoneSensitive: false,
        supportedTypes: ['PlainDate'],
        roundTripSafe: false,
      },
    },
  };
});

import {
  getAutocompleteData,
  getHoverDocs,
  getInlineDiagnostics,
  previewFormat,
  getDocUrl,
  DAYJS_TO_TEMPORAL_FMT,
  DATE_FNS_TO_TEMPORAL_FMT,
  listTokens,
  TOKEN_METADATA,
  ALL_TOKEN_NAMES,
} from '../src/ideData.js';
import { translateDayjsFormatString, translateDateFnsFormatString } from '../src/codemod.js';

const KNOWN_FAMILIES = new Set([
  'Year', 'Month', 'Day', 'Weekday', 'Quarter', 'Era', 'Hour', 'Minute',
  'Second', 'Fractional Second', 'Day Period', 'Time Zone', 'UTC Offset',
  'Ordinal Day', 'ISO Week',
]);

describe('getAutocompleteData', () => {
  it('returns one entry per token, with label/detail/documentation/family', () => {
    const entries = getAutocompleteData();
    expect(entries).toHaveLength(ALL_TOKEN_NAMES.length);
    for (const entry of entries) {
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.detail).toBe('string');
      expect(typeof entry.documentation).toBe('string');
      expect(KNOWN_FAMILIES.has(entry.family) || entry.family === 'Other').toBe(true);
    }
    const byLabel = new Map(entries.map((e) => [e.label, e]));
    // every real token is present exactly once
    for (const name of ALL_TOKEN_NAMES) expect(byLabel.has(name)).toBe(true);
  });

  it('groups tokens into families (tokenFamily branch per family)', () => {
    const byLabel = new Map(getAutocompleteData().map((e) => [e.label, e]));
    expect(byLabel.get('yyyy')!.family).toBe('Year');
    expect(byLabel.get('MMMM')!.family).toBe('Month');
    expect(byLabel.get('LLLL')!.family).toBe('Month');
    expect(byLabel.get('dd')!.family).toBe('Day');
    expect(byLabel.get('D')!.family).toBe('Day');
    expect(byLabel.get('EEEE')!.family).toBe('Weekday');
    // quirk: 'ccc'/'cccc' match /^[decD]+$/ (Day class contains 'c') before
    // the weekday pattern ever gets a chance:
    expect(byLabel.get('ccc')!.family).toBe('Day');
    expect(byLabel.get('Q')!.family).toBe('Quarter');
    expect(byLabel.get('QQQ')!.family).toBe('Quarter');
    expect(byLabel.get('G')!.family).toBe('Era');
    expect(byLabel.get('GGGG')!.family).toBe('Era');
    expect(byLabel.get('HH')!.family).toBe('Hour');
    expect(byLabel.get('m')!.family).toBe('Minute');
    expect(byLabel.get('ss')!.family).toBe('Second');
    expect(byLabel.get('SSS')!.family).toBe('Fractional Second');
    expect(byLabel.get('a')!.family).toBe('Day Period');
    expect(byLabel.get('z')!.family).toBe('Time Zone');
    expect(byLabel.get('zzz')!.family).toBe('Time Zone');
    expect(byLabel.get('zzzz')!.family).toBe('Time Zone');
    expect(byLabel.get('X')!.family).toBe('UTC Offset');
    expect(byLabel.get('xxx')!.family).toBe('UTC Offset');
    expect(byLabel.get('do')!.family).toBe('Ordinal Day');
    // ww/RRRR ARE in ALL_TOKEN_NAMES, so the ISO Week branch is live
    // (the in-source "unreachable" comment is stale):
    expect(byLabel.get('ww')!.family).toBe('ISO Week');
    expect(byLabel.get('RRRR')!.family).toBe('ISO Week');
    // the synthetic future token falls through every family check:
    expect(byLabel.get('zz-future-fake')!.family).toBe('Other');
  });

  it('documentation strings carry the metadata flags', () => {
    const byLabel = new Map(getAutocompleteData().map((e) => [e.label, e]));
    const yyyy = byLabel.get('yyyy')!.documentation;
    expect(yyyy).toContain('Format-capable: true');
    expect(yyyy).toContain('Parse-capable: true');
    expect(yyyy).toContain(`Supported types: ${TOKEN_METADATA['yyyy']!.supportedTypes.join(', ')}`);
  });
});

describe('getHoverDocs', () => {
  it('returns a hover doc for every token, keyed by name', () => {
    const docs = getHoverDocs();
    for (const name of ALL_TOKEN_NAMES) {
      const doc = docs[name]!;
      expect(doc.signature).toBe(name);
      expect(doc.summary).toBe(TOKEN_METADATA[name]!.meaning);
      expect(typeof doc.details).toBe('string');
    }
  });

  it('details render yes/no per boolean metadata flag', () => {
    const docs = getHoverDocs();
    expect(docs['yyyy']!.details).toContain('Format-capable: yes');
    expect(docs['yyyy']!.details).toContain('Parse-capable: yes');
    expect(docs['yyyy']!.details).toContain('Locale-sensitive: no');
    expect(docs['MMMM']!.details).toContain('Locale-sensitive: yes');
    expect(docs['HH']!.details).toContain('Calendar-sensitive: no');
    expect(docs['yyyy']!.details).toContain('Calendar-sensitive: yes');
    expect(docs['zzz']!.details).toContain('Timezone-sensitive: yes');
    expect(docs['yyyy']!.details).toContain('Round-trip safe: yes');
    expect(docs['yy']!.details).toContain('Round-trip safe: no');
    // the one non-format-capable token in the (mocked) table exercises
    // the 'no' arm — no real token is format-incapable:
    expect(docs['do']!.details).toContain('Parse-capable: no');
    expect(docs['zz-future-fake']!.details).toContain('Format-capable: no');
  });
});

describe('getInlineDiagnostics', () => {
  it('returns no diagnostics for a clean format string', () => {
    expect(getInlineDiagnostics('yyyy-MM-dd')).toEqual([]);
  });

  it('maps TWELVE_HOUR_WITHOUT_A to a warning with a quick-fix suggestion', () => {
    const diags = getInlineDiagnostics('h:mm');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      startColumn: 0,
      endColumn: 4,
      severity: 'warning',
      code: 'TWELVE_HOUR_WITHOUT_A',
    });
    expect(diags[0]!.suggestion).toContain('Add an "a" token');
  });

  it('maps MIXED_12_AND_24_HOUR to a warning with a suggestion', () => {
    const diags = getInlineDiagnostics('HH:mm h a');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: 'MIXED_12_AND_24_HOUR', severity: 'warning' });
    expect(diags[0]!.suggestion).toContain('Pick one form');
  });

  it('maps AMBIGUOUS_NUMERIC_RUN to a warning with a suggestion', () => {
    const diags = getInlineDiagnostics('Md');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: 'AMBIGUOUS_NUMERIC_RUN', severity: 'warning' });
    expect(diags[0]!.suggestion).toContain('Add a separator');
  });

  it('maps FORMAT_ONLY_TOKEN to a warning with a suggestion', () => {
    const diags = getInlineDiagnostics('do');
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: 'FORMAT_ONLY_TOKEN', severity: 'warning' });
    expect(diags[0]!.suggestion).toContain('parse-capable variant');
  });

  it('warnings with no quick fix get suggestion: undefined', () => {
    const zzzDiags = getInlineDiagnostics('yyyy-MM-dd HH:mm:ss zzz X');
    expect(zzzDiags).toHaveLength(1);
    expect(zzzDiags[0]).toMatchObject({ code: 'ZZZ_WITH_OFFSET_TOKEN', severity: 'warning' });
    expect(zzzDiags[0]!.suggestion).toBeUndefined();

    const offsetDiags = getInlineDiagnostics('HH:mm X');
    expect(offsetDiags).toHaveLength(1);
    expect(offsetDiags[0]).toMatchObject({ code: 'OFFSET_WITHOUT_FULL_DATE', severity: 'warning' });
    expect(offsetDiags[0]!.suggestion).toBeUndefined();
  });

  it('emits one diagnostic per warning, spanning the whole string', () => {
    const diags = getInlineDiagnostics('h:mm HH');
    expect(diags.map((x) => x.code)).toEqual(['TWELVE_HOUR_WITHOUT_A', 'MIXED_12_AND_24_HOUR']);
    for (const diag of diags) {
      expect(diag.startColumn).toBe(0);
      expect(diag.endColumn).toBe('h:mm HH'.length);
    }
  });
});

describe('previewFormat', () => {
  it('uses the documented default sample (2026-08-04T15:45:30.123)', () => {
    expect(previewFormat('yyyy-MM-dd')).toBe('2026-08-04');
    expect(previewFormat('HH:mm:ss.SSS')).toBe('15:45:30.123');
    expect(previewFormat('EEEE')).toBe('Tuesday');
    expect(previewFormat('MMMM d')).toBe('August 4');
  });

  it('formats a caller-provided sample instead', () => {
    expect(previewFormat('yyyy', Temporal.PlainDate.from('1999-12-31'))).toBe('1999');
    expect(previewFormat('HH:mm', Temporal.PlainTime.from('09:05'))).toBe('09:05');
    // field bags work for numeric tokens too (duck-typed TemporalLike)
    expect(previewFormat('yyyy', { year: 2000 })).toBe('2000');
  });

  it('propagates format errors for invalid format strings', () => {
    expect(() => previewFormat('MMMMM')).toThrow(/isn't a recognized token/);
  });

  it('propagates errors for samples missing required fields', () => {
    expect(() => previewFormat('yyyy', { month: 13 })).toThrow(/requires "year"/);
  });
});

describe('getDocUrl', () => {
  it('points at the README token reference for known and unknown tokens alike', () => {
    expect(getDocUrl('yyyy')).toBe('README.md#token-reference');
    expect(getDocUrl('not-a-token')).toBe('README.md#token-reference');
  });
});

describe('Day.js / date-fns conversion tables', () => {
  it('DAYJS_TO_TEMPORAL_FMT maps the common Day.js tokens', () => {
    const byFrom = new Map(DAYJS_TO_TEMPORAL_FMT.map((e) => [e.from, e]));
    expect(byFrom.get('YYYY')).toMatchObject({ to: 'yyyy' });
    expect(byFrom.get('YY')).toMatchObject({ to: 'yy' });
    expect(byFrom.get('DD')).toMatchObject({ to: 'dd' });
    expect(byFrom.get('D')).toMatchObject({ to: 'd' });
    expect(byFrom.get('dddd')).toMatchObject({ to: 'EEEE' });
    expect(byFrom.get('A')).toMatchObject({ to: 'a' });
    expect(byFrom.get('ZZ')).toMatchObject({ to: 'XX' });
    expect(byFrom.get('Z')).toMatchObject({ to: 'XXX' });
    expect(byFrom.get('Q')).toMatchObject({ to: 'Q' });
    expect(byFrom.get('gggg')).toMatchObject({ to: 'RRRR' });
    // fractional seconds used to be missing entirely:
    expect(byFrom.get('S')).toMatchObject({ to: 'S' });
    expect(byFrom.get('SS')).toMatchObject({ to: 'SS' });
    expect(byFrom.get('SSS')).toMatchObject({ to: 'SSS' });
    // null means "real Day.js token, no temporal-fmt equivalent" (+ note):
    expect(byFrom.get('Do')).toMatchObject({ to: null });
    expect(byFrom.get('Do')!.notes).toBeTruthy();
    expect(byFrom.get('d')).toMatchObject({ to: null });
    expect(byFrom.get('X')).toMatchObject({ to: null });
    expect(byFrom.get('ww')).toMatchObject({ to: null });
    expect(byFrom.get('L')).toMatchObject({ to: null });
    expect(byFrom.get('LTS')).toMatchObject({ to: null });
  });

  it('DATE_FNS_TO_TEMPORAL_FMT maps the common date-fns tokens', () => {
    const byFrom = new Map(DATE_FNS_TO_TEMPORAL_FMT.map((e) => [e.from, e]));
    expect(byFrom.get('yyyy')).toMatchObject({ to: 'yyyy' });
    expect(byFrom.get('y')).toMatchObject({ to: 'y' }); // used to map to null
    expect(byFrom.get('dd')).toMatchObject({ to: 'dd' });
    expect(byFrom.get('do')).toMatchObject({ to: 'do' });
    expect(byFrom.get('D')).toMatchObject({ to: 'D' }); // day-of-year, passes through
    expect(byFrom.get('cccc')).toMatchObject({ to: 'cccc' });
    expect(byFrom.get('aaa')).toMatchObject({ to: 'a' });
    expect(byFrom.get('S')).toMatchObject({ to: 'S' });
    expect(byFrom.get('QQQ')).toMatchObject({ to: 'QQQ' });
    expect(byFrom.get('RRRR')).toMatchObject({ to: 'RRRR' });
    expect(byFrom.get('GGGG')).toMatchObject({ to: 'GGGG' });
    expect(byFrom.get('zzzz')).toMatchObject({ to: 'zzzz' });
    // refusals with notes:
    expect(byFrom.get('QQQQ')).toMatchObject({ to: null });
    expect(byFrom.get('QQQQ')!.notes).toBeTruthy();
    expect(byFrom.get('eeee')).toMatchObject({ to: null });
    expect(byFrom.get('ww')).toMatchObject({ to: null });
    expect(byFrom.get('R')).toMatchObject({ to: null });
    expect(byFrom.get('Y')).toMatchObject({ to: null });
    expect(byFrom.get('P')).toMatchObject({ to: null });
    expect(byFrom.get('p')).toMatchObject({ to: null });
  });

  it('every table entry has a string `from` and a string-or-null `to`', () => {
    for (const table of [DAYJS_TO_TEMPORAL_FMT, DATE_FNS_TO_TEMPORAL_FMT]) {
      expect(table.length).toBeGreaterThan(40);
      for (const entry of table) {
        expect(typeof entry.from).toBe('string');
        expect(entry.to === null || typeof entry.to === 'string').toBe(true);
        if (entry.to === null) expect(typeof entry.notes).toBe('string');
      }
    }
  });

  it('the codemod consumes these tables end-to-end', () => {
    expect(translateDayjsFormatString('YYYY-MM-DD HH:mm:ss')).toBe('yyyy-MM-dd HH:mm:ss');
    expect(translateDayjsFormatString('[Q]Q YYYY')).toBe("'Q'Q yyyy");
    expect(translateDateFnsFormatString('yyyy-MM-dd')).toBe('yyyy-MM-dd');
    expect(translateDateFnsFormatString('y-M-d')).toBe('y-M-d');
    // a mapped-to-null Day.js token throws rather than mistranslating
    expect(() => translateDayjsFormatString('Do')).toThrow(/no Day.js -> temporal-fmt mapping/);
  });
});

describe('ideData re-exports', () => {
  it('re-exports listTokens / TOKEN_METADATA / ALL_TOKEN_NAMES from one module', () => {
    expect(Array.isArray(listTokens())).toBe(true);
    expect(listTokens().length).toBeGreaterThan(50);
    expect(TOKEN_METADATA['yyyy']!.meaning).toBeTruthy();
    expect(ALL_TOKEN_NAMES).toContain('yyyy');
  });
});
