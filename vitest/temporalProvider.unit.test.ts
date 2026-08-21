import { describe, expect, it, afterEach } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal, getTemporal } from '../src/temporalProvider.js';

afterEach(() => {
  delete (globalThis as { Temporal?: unknown }).Temporal;
  setTemporal(Temporal);
});

describe('setTemporal / getTemporal', () => {
  it('an injected override takes priority even when globalThis.Temporal is also set', () => {
    (globalThis as { Temporal?: unknown }).Temporal = {
      PlainDate: { from: () => { throw new Error('should not reach the global'); } },
    };
    setTemporal(Temporal);
    expect(getTemporal()).toBe(Temporal);
  });

  it('setTemporal(undefined) clears the override and falls back to globalThis.Temporal', () => {
    (globalThis as { Temporal?: unknown }).Temporal = Temporal;
    setTemporal(undefined);
    expect(getTemporal()).toBe(Temporal);
  });

  it('throws a descriptive error when neither an override nor a global is set', () => {
    setTemporal(undefined);
    expect(() => getTemporal()).toThrow(/needs a Temporal implementation/);
  });
});
