// This package's tsconfig assumes lib: ["ESNext"] only — no ambient
// `Temporal` namespace type. Everywhere else in this codebase only ever
// *reads* fields off a Temporal-like object the caller already built
// (TemporalLike in tokens.ts). This module is the single choke point for
// touching a *namespace*-shaped Temporal (PlainDate.from, etc.): parse()
// uses it to construct a result, tokens.ts uses it to probe native
// Intl<->Temporal support. Consumers can hand us an implementation via
// setTemporal(), or we fall back to globalThis.Temporal
interface TemporalFactory {
  from(fields: Record<string, number | string | undefined>, options?: { overflow?: 'constrain' | 'reject' }): unknown;
}

export interface TemporalNamespace {
  PlainDate: TemporalFactory;
  PlainTime: TemporalFactory;
  PlainDateTime: TemporalFactory;
  ZonedDateTime: TemporalFactory;
}

let injectedTemporal: TemporalNamespace | undefined;

/**
 * Explicitly hand temporal-fmt the Temporal implementation to use, instead
 * of relying on a global `Temporal`. Call this once, before your first
 * `format()`/`parse()`
 *
 * Call with no argument (or `undefined`) to clear the override and fall
 * back to `globalThis.Temporal` again.
 *
 * @example
 * import { Temporal } from 'temporal-polyfill';
 * import { setTemporal } from 'temporal-fmt';
 * setTemporal(Temporal);
 */
export function setTemporal(temporal?: TemporalNamespace): void {
  injectedTemporal = temporal;
}

function resolveTemporal(): TemporalNamespace | undefined {
  return injectedTemporal ?? (globalThis as unknown as { Temporal?: TemporalNamespace }).Temporal;
}

export function getTemporal(): TemporalNamespace {
  const temporal = resolveTemporal();
  if (!temporal) {
    throw new Error(
      'temporal-fmt: parse() needs a Temporal implementation to construct its result. ' +
      'Call setTemporal(Temporal) once at startup, or assign one to globalThis.Temporal ' +
      '(native on Node 26+, or a polyfill like temporal-polyfill).'
    );
  }
  return temporal;
}
