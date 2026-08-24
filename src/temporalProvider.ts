// tsconfig here is lib: ["ESNext"] only, so there's no ambient Temporal
// namespace type to lean on. everywhere else in the codebase we just read
// fields off whatever Temporal-like object gets passed in (see TemporalLike
// in tokens.ts) but this file is the one place that actually touches the
// Temporal namespace itself — PlainDate.from and friends. parse() uses it
// to build results, tokens.ts uses it to check native Intl<->Temporal
// support. you can hand us your own implementation via setTemporal(), or
// we just grab globalThis.Temporal if there is one
interface TemporalFactory {
  from(fields: Record<string, number | string | undefined>, options?: { overflow?: 'constrain' | 'reject'; disambiguation?: 'compatible' | 'earlier' | 'later' | 'reject'; offset?: 'use' | 'ignore' | 'prefer' | 'reject' }): unknown;
  // compare() is on the namespace, not instances (Temporal.PlainDate.compare).
  // made optional since someone might hand us a stripped-down shim that
  // doesn't bother implementing it
  compare?(one: unknown, two: unknown): number;
}

// Instant doesn't use from(fields) like the others, it's
// fromEpochMilliseconds / fromEpochNanoseconds. needs its own shape.
interface InstantFactory {
  from(iso: string): unknown;
  fromEpochMilliseconds(ms: number): unknown;
  fromEpochMicroseconds(µs: number): unknown;
  fromEpochNanoseconds(ns: bigint): unknown;
}

// Duration uses from(fields) too, but also has round() and compare()
interface DurationFactory extends TemporalFactory {
  compare?(one: unknown, two: unknown): number;
  prototype?: { round(options: unknown): unknown };
}

// PlainYearMonth / PlainMonthDay also just use from(fields) — same shape
// as TemporalFactory really, kept as its own type so callers can narrow
export interface TemporalNamespace {
  PlainDate: TemporalFactory;
  PlainTime: TemporalFactory;
  PlainDateTime: TemporalFactory;
  ZonedDateTime: TemporalFactory;
  Instant?: InstantFactory;
  Duration?: DurationFactory;
  PlainYearMonth?: TemporalFactory;
  PlainMonthDay?: TemporalFactory;
}

let injectedTemporal: TemporalNamespace | undefined;

// anything caching something tied to WHICH Temporal impl is active
// (right now just tokens.ts's native-Intl probe) registers a listener
// here so it knows to invalidate when setTemporal() swaps things out —
// see setTemporal() below for why that matters. kept this as a plain
// array instead of a full event emitter since all we need is "call
// everyone back, in order, no payload" — didn't need unsubscribe either
const onTemporalChanged: Array<() => void> = [];

export function subscribeToTemporalChanges(listener: () => void): void {
  onTemporalChanged.push(listener);
}

/**
 * Explicitly hand temporal-fmt the Temporal implementation to use, instead
 * of relying on a global `Temporal`. Call this once, before your first
 * `format()`/`parse()`/`parseISO()`/etc.
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
  // tokens.ts caches its native-Intl probe result based on whatever
  // Temporal was active the first time it ran. if that changes later
  // (native -> polyfill, say) the cached result goes stale. so just reset
  // everyone on any setTemporal() call — costs one extra probe re-run,
  // worth it to not silently use a stale answer
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
