import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { parse, safeParse, tryParse, parseToParts, compileParser } from '../src/parse.js';

setTemporal(Temporal);

describe('parse', () => {
  it('parses a matching input against a format string', () => {
    const result = parse('yyyy-MM-dd', '2026-08-04') as Temporal.PlainDate;
    expect(result.toString()).toBe('2026-08-04');
  });
});

describe('safeParse / tryParse', () => {
  it('safeParse returns a typed error result instead of throwing on a mismatch', () => {
    const result = safeParse('yyyy-MM-dd', 'garbage');
    expect(result.ok).toBe(false);
  });

  it('tryParse returns undefined instead of throwing on a mismatch', () => {
    expect(tryParse('yyyy-MM-dd', 'garbage')).toBeUndefined();
  });
});

describe('parseToParts', () => {
  it('reports each matched token with its raw text and position', () => {
    const parts = parseToParts('yyyy-MM-dd', '2026-08-04');
    expect(parts).toEqual([
      { token: 'yyyy', raw: '2026', position: 0 },
      { token: 'MM', raw: '08', position: 5 },
      { token: 'dd', raw: '04', position: 8 },
    ]);
  });
});

describe('compileParser', () => {
  it('produces a reusable parser that matches the one-shot parse() output', () => {
    const compiled = compileParser('yyyy-MM-dd');
    expect((compiled.parse('2026-08-04') as Temporal.PlainDate).toString()).toBe('2026-08-04');
  });
});
