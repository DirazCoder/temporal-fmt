import { afterEach, describe, expect, it } from 'vitest';
import { buildModContext, buildModContextFor, buildTrackedModContext, isMod, type ModContext } from '../src/modApi.js';
import { _resetOverridesForTesting, _resetGeneratedOverridesForTesting, getParseImpl, setParseOverride, OverrideConflictError } from '../src/runtime.js';

afterEach(() => {
  _resetOverridesForTesting();
  _resetGeneratedOverridesForTesting();
});

// Every overrideXxx() method on ModContext follows one shape: read the
// current impl, install a wrapper around it under the calling mod's
// name. Rather than hand-write 83 near-identical blocks (which is
// exactly the repetition createOverridable/generate.mjs exist to
// avoid in the source itself), this drives the same assertion across
// every method name pulled directly off a live ModContext — so the
// list can't drift out of sync with modApi.ts the way a hand-typed
// array of names could.
function allOverrideMethodNames(ctx: ModContext): (keyof ModContext)[] {
  return (Object.keys(ctx) as (keyof ModContext)[]).filter((k) => k.startsWith('override'));
}

describe('buildModContextFor: every override point', () => {
  const ctx = buildModContextFor('test-mod');
  const methodNames = allOverrideMethodNames(ctx);

  it('exposes all 83 documented override points', () => {
    // Guards against a future generate.mjs run silently dropping a
    // point — a shrinking list here should fail loudly, not just
    // quietly test fewer things than intended.
    expect(methodNames.length).toBe(83);
  });

  it.each(methodNames)('%s installs a wrapper without throwing, and a second call from another mod collides', (name) => {
    const override = ctx[name] as (impl: (...args: unknown[]) => unknown) => void;
    expect(() => override((original: unknown, ...args: unknown[]) => original)).not.toThrow();

    // Same point, different mod — every override point enforces
    // single ownership (see runtime.ts's createOverridable), so this
    // must throw regardless of which of the 83 points it is.
    const other = buildModContextFor('other-mod');
    const otherOverride = other[name] as (impl: (...args: unknown[]) => unknown) => void;
    expect(() => otherOverride((original: unknown, ...args: unknown[]) => original)).toThrow(OverrideConflictError);
  });
});

describe('buildModContext', () => {
  it('is buildModContextFor with a generic, unattributed owner name', () => {
    const ctx = buildModContext();
    expect(() => ctx.overrideFormat((original) => original)).not.toThrow();
    // The unattributed context isn't a bypass of ownership tracking —
    // a second override attempt, even another unattributed one, still
    // collides, and the conflict error names the generic owner.
    expect(() => buildModContext().overrideFormat((original) => original)).toThrow(/\(unattributed\)/);
  });
});

describe('runtime.ts: getParseImpl / setParseOverride', () => {
  it('returns the built-in parse until a mod installs an override, then returns that override', () => {
    const before = getParseImpl();
    setParseOverride(((...args: unknown[]) => 'overridden') as never, 'test-mod');
    const after = getParseImpl();
    expect(after).not.toBe(before);
  });

  it('a second setParseOverride call collides', () => {
    setParseOverride(((...args: unknown[]) => 'first') as never, 'first-mod');
    expect(() => setParseOverride(((...args: unknown[]) => 'second') as never, 'second-mod')).toThrow(OverrideConflictError);
  });
});

describe('buildTrackedModContext: tracked registrations', () => {
  it('tracks registerLocale, registerRelativeGrammar, and createFormatter calls', () => {
    const touched: { kind: string; key: string }[] = [];
    const ctx = buildTrackedModContext('tracker-mod', (k) => touched.push(k));

    // Same minimal-but-real vocab shape used in localeRegistry.unit.test.ts
    // — registerLocale validates the full ExtendedLocaleVocab shape, so a
    // partial fixture throws before the tracking wrapper is ever reached.
    const vocab = {
      monthLong: ['Mo1', 'Mo2', 'Mo3', 'Mo4', 'Mo5', 'Mo6', 'Mo7', 'Mo8', 'Mo9', 'Mo10', 'Mo11', 'Mo12'],
      monthShort: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'],
      weekdayLong: ['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6', 'Day7'],
      weekdayShort: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
      dayPeriod: ['AM', 'PM'],
    };
    ctx.registerLocale('xx-TEST', vocab);
    ctx.registerRelativeGrammar({ language: 'xx-TEST', matchers: [() => null] });
    ctx.createFormatter({ tokens: [{ name: 'xTestToken', handler: () => 'x', field: 'year' as never }] });

    expect(touched).toContainEqual({ kind: 'locale', key: 'xx-TEST' });
    expect(touched.some((t) => t.kind === 'relativeGrammar' && t.key === 'xx-TEST')).toBe(true);
    expect(touched).toContainEqual({ kind: 'formatterTokens', key: 'xTestToken' });
  });

  it('tracks a successful overrideParse the same way overrideFormat is tracked', () => {
    const touched: { kind: string; key: string }[] = [];
    const ctx = buildTrackedModContext('tracker-mod', (k) => touched.push(k));

    ctx.overrideParse((original) => original);

    expect(touched).toContainEqual({ kind: 'overrideParse', key: 'parse' });
  });
});

describe('isMod', () => {
  it('rejects null (typeof null is "object", so this needs its own check)', () => {
    expect(isMod(null)).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(isMod('not a mod')).toBe(false);
  });

  it('rejects an object missing a usable register function', () => {
    expect(isMod({ name: 'x', register: 'not-a-function' })).toBe(false);
  });

  it('accepts a minimal valid mod', () => {
    expect(isMod({ name: 'x', register() {} })).toBe(true);
  });

  it('rejects a requires array containing a non-string element', () => {
    expect(isMod({ name: 'x', register() {}, requires: ['ok', 42] })).toBe(false);
  });

  it('accepts a requires array of all strings', () => {
    expect(isMod({ name: 'x', register() {}, requires: ['a', 'b'] })).toBe(true);
  });

  it('rejects a priority that is not a number', () => {
    expect(isMod({ name: 'x', register() {}, priority: '1' })).toBe(false);
  });

  it('accepts a numeric priority', () => {
    expect(isMod({ name: 'x', register() {}, priority: 5 })).toBe(true);
  });
});
