import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';

setTemporal(Temporal);

// Covers src/legacy.ts (the `export *` barrel), src/legacy/index.ts (the
// withLegacyErrors wrappers) and src/legacy/matchesFormat.ts. The legacy
// surface deliberately converts TemporalFmtError subclasses into plain
// Error objects — every wrapper needs both its happy path and its
// conversion path exercised.

import * as legacyBarrel from '../../src/legacy.js';
import {
  format,
  formatToParts,
  compileFormat,
  parse,
  safeParse,
  tryParse,
  parseToParts,
  compileParser,
} from '../../src/legacy/index.js';
import { matchesFormat } from '../../src/legacy/matchesFormat.js';
import { format as typedFormat } from '../../src/format/format.js';
import { TemporalFmtError } from '../../src/core/errors.js';

const d = Temporal.PlainDate.from('2026-08-04');

// Captures a thrown value without failing the assertion, so a case can
// assert on the error's shape/message afterwards.
function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

// Asserts the legacy error-conversion contract: a plain Error (not a
// TemporalFmtError subclass) carrying the typed error's exact message.
function expectPlainError(error: unknown, typed: unknown): asserts error is Error {
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(TemporalFmtError);
  expect(error.constructor).toBe(Error);
  expect((error as Error).message).toBe((typed as Error).message);
}

describe('src/legacy.ts barrel', () => {
  it('re-exports the whole legacy surface', () => {
    expect(typeof legacyBarrel.format).toBe('function');
    expect(typeof legacyBarrel.formatToParts).toBe('function');
    expect(typeof legacyBarrel.compileFormat).toBe('function');
    expect(typeof legacyBarrel.parse).toBe('function');
    expect(typeof legacyBarrel.safeParse).toBe('function');
    expect(typeof legacyBarrel.tryParse).toBe('function');
    expect(typeof legacyBarrel.parseToParts).toBe('function');
    expect(typeof legacyBarrel.compileParser).toBe('function');
    expect(typeof legacyBarrel.matchesFormat).toBe('function');
    // and the bindings are live:
    expect(legacyBarrel.format(d, 'yyyy-MM-dd')).toBe('2026-08-04');
    expect(legacyBarrel.matchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
  });
});

describe('legacy format family', () => {
  it('format() returns the same output as the typed API (with and without options)', () => {
    expect(format(d, 'yyyy-MM-dd')).toBe('2026-08-04');
    expect(format(d, 'yyyy-MM-dd', {})).toBe('2026-08-04');
  });

  it('format() converts TemporalFmtError subclasses to plain Error', () => {
    const err = captureThrow(() => format(d, 'MMMMM')); // overlong run → UnknownTokenError
    const typed = captureThrow(() => typedFormat(d, 'MMMMM'));
    expectPlainError(err, typed);
    expect((err as Error).message).toMatch(/isn't a recognized token/);
  });

  it('formatToParts() happy path and error conversion', () => {
    // 3 tokens + 2 literal separators = 5 parts
    expect(formatToParts(d, 'yyyy-MM-dd')).toHaveLength(5);
    expect(formatToParts(d, 'yyyy-MM-dd', {})).toHaveLength(5);
    const err = captureThrow(() => formatToParts(d, 'MMMMM'));
    const typed = captureThrow(() => typedFormat(d, 'MMMMM'));
    expectPlainError(err, typed);
  });

  it('compileFormat() wraps both compiled methods with the conversion', () => {
    const compiled = compileFormat('yyyy-MM-dd');
    expect(compiled.format(d)).toBe('2026-08-04');
    expect(compiled.formatToParts(d)).toHaveLength(5);
    // a format that compiles fine but fails at format time (PlainDate has no hour):
    const needsHour = compileFormat('HH:mm');
    const err = captureThrow(() => needsHour.format(d));
    const typed = captureThrow(() => typedFormat(d, 'HH:mm'));
    expectPlainError(err, typed);
    expect((err as Error).message).toMatch(/requires "hour"/);
    const partsErr = captureThrow(() => needsHour.formatToParts(d));
    expectPlainError(partsErr, typed);
  });

  it('compileFormat() converts compile-time errors too', () => {
    const err = captureThrow(() => compileFormat('MMMMM'));
    const typed = captureThrow(() => typedFormat(d, 'MMMMM'));
    expectPlainError(err, typed);
  });
});

describe('legacy parse family', () => {
  it('parse() happy path (with and without options)', () => {
    expect(String(parse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(String(parse('yyyy-MM-dd', '2026-08-04', {}))).toBe('2026-08-04');
  });

  it('parse() converts TemporalFmtError subclasses to plain Error', () => {
    const err = captureThrow(() => parse('yyyy-MM-dd', 'nope'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/no valid pattern matches/);
  });

  it('parse() rethrows non-TemporalFmtError errors untouched', () => {
    // getTemporal() throws a plain Error when no Temporal implementation
    // is available — withLegacyErrors must pass it through as-is rather
    // than wrapping or converting it.
    setTemporal(undefined); // falls back to globalThis.Temporal (absent here)
    const globalTemporal = Object.getOwnPropertyDescriptor(globalThis, 'Temporal');
    try {
      if (globalTemporal?.configurable) Reflect.deleteProperty(globalThis, 'Temporal');
      const err = captureThrow(() => parse('yyyy-MM-dd', '2026-08-04'));
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TemporalFmtError);
      expect((err as Error).message).toMatch(/needs a Temporal implementation/);
    } finally {
      if (globalTemporal) Object.defineProperty(globalThis, 'Temporal', globalTemporal);
      setTemporal(Temporal);
    }
  });

  it('safeParse() returns { ok: true, value } on success', () => {
    const result = safeParse('yyyy-MM-dd', '2026-08-04');
    expect(result.ok).toBe(true);
    if (result.ok) expect(String(result.value)).toBe('2026-08-04');
  });

  it('safeParse() returns { ok: false, error } with a PLAIN Error on failure', () => {
    const result = safeParse('yyyy-MM-dd', 'nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error).not.toBeInstanceOf(TemporalFmtError);
      expect(result.error.constructor).toBe(Error);
      expect(result.error.message).toMatch(/no valid pattern matches/);
    }
  });

  it('tryParse() returns the value or undefined without ever throwing', () => {
    expect(String(tryParse('yyyy-MM-dd', '2026-08-04'))).toBe('2026-08-04');
    expect(tryParse('yyyy-MM-dd', 'nope')).toBeUndefined();
    expect(String(tryParse('yyyy-MM-dd', '2026-08-04', {}))).toBe('2026-08-04');
  });

  it('parseToParts() happy path and error conversion', () => {
    expect(parseToParts('yyyy-MM-dd', '2026-08-04')).toHaveLength(3);
    expect(parseToParts('yyyy-MM-dd', '2026-08-04', {})).toHaveLength(3);
    const err = captureThrow(() => parseToParts('yyyy-MM-dd', 'nope'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/no valid pattern matches/);
  });

  it('compileParser() wraps every compiled method', () => {
    const compiled = compileParser('yyyy-MM-dd');
    expect(String(compiled.parse('2026-08-04'))).toBe('2026-08-04');
    const okResult = compiled.safeParse('2026-08-04');
    expect(okResult.ok).toBe(true);
    if (okResult.ok) expect(String(okResult.value)).toBe('2026-08-04');
    expect(String(compiled.tryParse('2026-08-04'))).toBe('2026-08-04');
    expect(compiled.tryParse('nope')).toBeUndefined();
    expect(compiled.parseToParts('2026-08-04')).toHaveLength(3);
  });

  it('compileParser() converts errors from every throwing compiled method', () => {
    const compiled = compileParser('yyyy-MM-dd');
    const parseErr = captureThrow(() => compiled.parse('nope'));
    expect(parseErr).toBeInstanceOf(Error);
    expect(parseErr).not.toBeInstanceOf(TemporalFmtError);
    expect((parseErr as Error).constructor).toBe(Error);

    const safeResult = compiled.safeParse('nope');
    expect(safeResult.ok).toBe(false);
    if (!safeResult.ok) {
      expect(safeResult.error).not.toBeInstanceOf(TemporalFmtError);
      expect(safeResult.error.constructor).toBe(Error);
      expect(safeResult.error.message).toMatch(/no valid pattern matches/);
    }

    const partsErr = captureThrow(() => compiled.parseToParts('nope'));
    expect(partsErr).toBeInstanceOf(Error);
    expect(partsErr).not.toBeInstanceOf(TemporalFmtError);
    expect((partsErr as Error).constructor).toBe(Error);
  });

  it('compileParser() converts compile-time errors and accepts options', () => {
    const err = captureThrow(() => compileParser('MMMMM'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/isn't a recognized token/);
    // options both ways
    expect(String(compileParser('yyyy-MM-dd', {}).parse('2026-08-04'))).toBe('2026-08-04');
  });
});

describe('matchesFormat: shape checks', () => {
  it('accepts input that format() could have produced', () => {
    expect(matchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
    expect(matchesFormat('yyyy-MM-dd', '2026-08-04', {})).toBe(true);
  });

  it('rejects input whose shape does not match (regex mismatch path)', () => {
    expect(matchesFormat('yyyy-MM-dd', 'nope')).toBe(false);
    expect(matchesFormat('yyyy-MM-dd', '2026/08/04')).toBe(false);
  });

  it('handles empty format strings and empty input', () => {
    expect(matchesFormat('', '')).toBe(true);
    expect(matchesFormat('', 'x')).toBe(false);
    expect(matchesFormat('yyyy', '')).toBe(false);
  });

  it('uses the options.locale vocabulary when given', () => {
    expect(matchesFormat('MMMM', 'August')).toBe(true); // default en-US
    expect(matchesFormat('MMMM', 'août')).toBe(false); // not en-US vocabulary
    expect(matchesFormat('MMMM', 'août', { locale: 'fr-FR' })).toBe(true);
  });
});

describe('matchesFormat: ambiguous glued runs', () => {
  it('accepts a glued run that has at least one valid split', () => {
    // "112" splits as M=1,d=12 or M=11,d=2 — both valid → match
    expect(matchesFormat('Md', '112')).toBe(true);
    // "21" only splits as M=2,d=1 (M=21 is out of range) — unique split
    expect(matchesFormat('Md', '21')).toBe(true);
  });

  it('rejects a glued run whose digits admit no valid split', () => {
    // "10" matches the \d{2,4} run regex, but M=1,d=0 (day 0) and M=10
    // (no digits left for d) are both invalid → not a plausible output
    expect(matchesFormat('Md', '10')).toBe(false);
  });
});

describe('matchesFormat: error conversion', () => {
  it('converts TemporalFmtError (unknown token) into a plain Error with the same message', () => {
    const err = captureThrow(() => matchesFormat('MMMMM', 'x'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/isn't a recognized token/);
  });

  it('converts the format-only-token error a parse pattern build would throw', () => {
    const err = captureThrow(() => matchesFormat('do', '4th'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/format-only/);
  });

  it('rethrows non-TemporalFmtError errors as-is (format string too long)', () => {
    const tooLong = 'y'.repeat(1001); // MAX_FORMAT_LENGTH is 1000
    const err = captureThrow(() => matchesFormat(tooLong, 'x'));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TemporalFmtError);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toMatch(/exceeds maximum length of 1000/);
  });
});

describe('matchesFormat: pattern cache', () => {
  it('reuses a cached pattern for a repeated (format, locale) pair', () => {
    expect(matchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
    // second call with the same format string takes the cache-hit path
    expect(matchesFormat('yyyy-MM-dd', '2027-01-01')).toBe(true);
    expect(matchesFormat('yyyy-MM-dd', 'bogus')).toBe(false);
  });

  it('evicts the oldest entry once the pattern cache passes 500 patterns', () => {
    // 520 distinct literal-only format strings → 520 distinct cache keys;
    // the cache caps at 500, so the last ~20 inserts exercise the
    // evict-oldest branch. (Earlier tests in this file already warmed a
    // handful of keys, which only makes eviction fire sooner.)
    for (let i = 0; i < 520; i++) {
      const formatStr = `v${i}`; // literal-only: 'v' and digits are not tokens
      expect(matchesFormat(formatStr, `v${i}`)).toBe(true);
      expect(matchesFormat(formatStr, 'other')).toBe(false);
    }
    // behavior is unaffected by the evictions:
    expect(matchesFormat('yyyy-MM-dd', '2026-08-04')).toBe(true);
  });
});
