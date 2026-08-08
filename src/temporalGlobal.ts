// This package's tsconfig assumes lib: ["ESNext"] only — no ambient
// `Temporal` namespace type. Everywhere else in this codebase only ever
// *reads* fields off a Temporal-like object the caller already built
// (TemporalLike in tokens.ts). parse() is the first place that needs to
// *construct* one, via the global `Temporal` the README already requires
// consumers to provide (native on Node 26+, or a polyfill). Kept loosely
// typed on purpose, consistent with the rest of the codebase.
interface TemporalFactory {
  from(fields: Record<string, number | string | undefined>, options?: { overflow?: 'constrain' | 'reject' }): unknown;
}

export interface TemporalNamespace {
  PlainDate: TemporalFactory;
  PlainTime: TemporalFactory;
  PlainDateTime: TemporalFactory;
  ZonedDateTime: TemporalFactory;
}

export function getTemporal(): TemporalNamespace {
  const temporal = (globalThis as unknown as { Temporal?: TemporalNamespace }).Temporal;
  if (!temporal) {
    throw new Error(
      'temporal-fmt: parse() needs a global `Temporal` to construct its result. ' +
      'Native on Node 26+, or assign a polyfill (e.g. temporal-polyfill) to globalThis.Temporal first.'
    );
  }
  return temporal;
}
