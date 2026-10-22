import { describe, expectTypeOf, it } from 'vitest';
import { format, matchesFormat, parse, setTemporal } from '../src/index.js';
import type { FormatOptions, TemporalLike } from '../src/index.js';
import * as legacy from '../src/legacy.js';

// Runtime tests prove format()/parse() return the right *values*, not
// that the exported *types* are right — a param accidentally typed
// `any`, or a return type silently widened, passes every runtime
// assertion. This file is compile-time only; vitest's typecheck mode
// reads it but never runs it.
describe('format', () => {
  it('accepts a TemporalLike and a string, with options optional', () => {
    expectTypeOf(format).parameter(0).toMatchTypeOf<TemporalLike>();
    expectTypeOf(format).parameter(1).toBeString();
    expectTypeOf(format).parameter(2).toMatchTypeOf<FormatOptions | undefined>();
  });

  it('returns a string', () => {
    expectTypeOf(format).returns.toBeString();
  });
});

describe('parse', () => {
  it('returns a string, not `any` — callers should get real inference', () => {
    expectTypeOf(parse).returns.not.toBeAny();
  });
});

describe('matchesFormat', () => {
  it('returns a boolean for a format and input string', () => {
    expectTypeOf(matchesFormat).parameter(0).toBeString();
    expectTypeOf(matchesFormat).parameter(1).toBeString();
    expectTypeOf(matchesFormat).returns.toBeBoolean();
  });
});

describe('legacy API', () => {
  it('keeps the same call signatures while exposing plain Error results', () => {
    expectTypeOf(legacy.format).parameter(0).toMatchTypeOf<TemporalLike>();
    expectTypeOf(legacy.format).returns.toBeString();
    expectTypeOf(legacy.parse).parameter(0).toBeString();
    expectTypeOf(legacy.matchesFormat).parameter(0).toBeString();
    expectTypeOf(legacy.matchesFormat).returns.toBeBoolean();
    expectTypeOf(legacy.safeParse).returns.toMatchTypeOf<
      { ok: true; value: unknown } | { ok: false; error: Error }
    >();
  });
});

describe('setTemporal', () => {
  it('accepts one argument and returns void', () => {
    expectTypeOf(setTemporal).parameters.toHaveLength(1);
    expectTypeOf(setTemporal).returns.toBeVoid();
  });
});

describe('FormatOptions', () => {
  it('locale is an optional string, not required', () => {
    expectTypeOf<FormatOptions>().toHaveProperty('locale');
    expectTypeOf<FormatOptions['locale']>().toEqualTypeOf<string | undefined>();
  });
});