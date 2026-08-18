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
  // compare() lives on the namespace (Temporal.PlainDate.compare), not on
  // instances. Optional here since a consumer might be passing a
  // stripped-down Temporal shim that doesn't expose it.
  compare?(one: unknown, two: unknown): number;
}

export interface TemporalNamespace {
  PlainDate: TemporalFactory;
  PlainTime: TemporalFactory;
  PlainDateTime: TemporalFactory;
  ZonedDateTime: TemporalFactory;
}

let injectedTemporal: TemporalNamespace | undefined;

// Anything that caches a result derived from *which* Temporal
// implementation is active (right now: tokens.ts's native-Intl-support
// probe) registers here so it gets invalidated whenever setTemporal()
// swaps the implementation — see the comment on setTemporal() below for
// why that matters. A plain array instead of an event-emitter-style API
// since this only ever needs "call every listener, in registration order,
// with no payload" — nothing here needs unsubscribe or payload data.
const onTemporalChanged: Array<() => void> = [];

export function subscribeToTemporalChanges(listener: () => void): void {
  onTemporalChanged.push(listener);
}

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
  // tokens.ts's native-Intl-support probe is keyed on whichever Temporal
  // implementation was active the first time a locale-aware format() ran —
  // if that implementation changes later (native -> polyfill or back), the
  // memoized probe result can go stale and disagree with what's now
  // actually active. Resetting it here means the next locale-aware format()
  // after any setTemporal() call re-probes against the implementation
  // that's active *now*, at the (small, one-time-per-switch) cost of
  // re-running the probe.
  for (const listener of onTemporalChanged) listener();
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