// Type guards for Temporal values. The rest of this library works off the
// duck-typed `TemporalLike` shape (year/month/day/hour/...) rather than
// `instanceof Temporal.X`, because `instanceof` breaks across polyfill/
// native boundaries — a polyfill's `Temporal.PlainDate` is a different
// constructor from the native one, so a `value instanceof Temporal.PlainDate`
// check would silently fail when the caller is using a polyfill while the
// guard happens to be looking at native Temporal, or vice versa. Same
// reasoning as tokens.ts's `intlSupportsNativeTemporal` probe: identity
// checks don't survive the polyfill/native swap.
//
// These guards check structural shape instead: presence of the type-
// discriminating method each Temporal type carries. Method presence is
// part of the Temporal spec contract — every implementation, native or
// polyfill, must expose the same methods on the same types — so it's a
// stable signal without dragging in a Temporal namespace.
//
// Per-type discriminators (verified against @js-temporal/polyfill's
// prototype method list, which matches the spec):
//
//   PlainDate       — `toPlainDateTime` + `withCalendar` + year/month/day,
//                     no hour. (PlainDateTime also has `toPlainDateTime`'s
//                     sibling `toPlainDate`/`toPlainTime`, but carries
//                     hour — distinguished by time-field presence.)
//   PlainTime       — no `toPlainDateTime`, no `withCalendar`. Has hour,
//                     no year/month/day. (The only Temporal date/time type
//                     that has neither `withCalendar` nor any `toPlainX`
//                     method.)
//   PlainDateTime   — `toPlainDate` + `withPlainTime` + year/month/day
//                     AND hour. (`withPlainTime` is unique — only
//                     PlainDateTime and ZonedDateTime carry it; ZonedDateTime
//                     also carries `toInstant`, which PlainDateTime doesn't.)
//   ZonedDateTime   — `toInstant` + `withTimeZone`. (Both are unique —
//                     only ZonedDateTime carries `withTimeZone`.)
//   Instant         — `toZonedDateTimeISO`, no `toInstant`. (Instant IS
//                     the instant; the `toInstant` method belongs to
//                     ZonedDateTime. `toZonedDateTimeISO` exists on
//                     Instant and ZonedDateTime per the spec, but on
//                     ZonedDateTime it's not exposed via the prototype
//                     in either native or polyfill — only Instant has it
//                     as a method. Verified by probing both.)
//   PlainYearMonth  — `toPlainDate` (takes a day arg) + year/month,
//                     no day. (PlainDate also has `toPlainDate`-shaped
//                     methods but carries day; PlainMonthDay also has
//                     `toPlainDate` but carries day, not year.)
//   PlainMonthDay   — `toPlainDate` + month/day, no year. Plus: lacks
//                     `add`/`subtract`/`until`/`since` (calendar arithmetic
//                     doesn't apply to a month-day without a year).
//   Duration        — `total` + `abs` + `negated`. (All three are unique
//                     to Duration; no other Temporal type carries any of them.)

// The shapes below intentionally mirror TemporalLike in tokens.ts but
// stay loose enough to also match real Temporal objects (which carry
// the spec methods the field-only TemporalLike doesn't).
interface TemporalInstance {
  toInstant?: () => unknown;
  toPlainDate?: (arg?: unknown) => unknown;
  toPlainDateTime?: (arg?: unknown) => unknown;
  toPlainTime?: () => unknown;
  toPlainYearMonth?: () => unknown;
  toPlainMonthDay?: () => unknown;
  toZonedDateTime?: (arg: unknown) => unknown;
  toZonedDateTimeISO?: (arg: unknown) => unknown;
  withCalendar?: (cal: unknown) => unknown;
  withPlainTime?: (t: unknown) => unknown;
  withTimeZone?: (z: unknown) => unknown;
  getTimeZoneTransition?: (opts: unknown) => unknown;
  startOfDay?: () => unknown;
  sign?: () => number;
  blank?: () => boolean;
  total?: (opts: unknown) => number;
  abs?: () => unknown;
  negated?: () => unknown;
  toString?: () => string;
  // Fields from TemporalLike — present on all date-carrying Temporal
  // types but absent on PlainTime (which has no calendar position).
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  calendarId?: string;
  timeZoneId?: string;
  // PlainMonthDay stores its month as `monthCode` (e.g. "M08"), not
  // as a numeric `month` field — without a year there's no way to
  // disambiguate which month a calendar-independent numeric month
  // refers to in leap-year-aware calendars, so the spec uses
  // `monthCode` instead. PlainMonthDay is the only Temporal type that
  // exposes `monthCode` without also exposing `month`.
  monthCode?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Hostile-getter hardening: the structural guards below read properties
// (year, hour, Symbol.toStringTag, ...) off arbitrary caller values. An
// object with a throwing getter used to turn isPlainDate(obj) — a function
// whose whole contract is returning a boolean — into an exception factory.
// Every exported guard now runs through this wrapper: a throw during
// probing means "not one of ours", not a crash. One shared catch (rather
// than one per guard) keeps the coverage burden honest too.
function guardOrFalse<T>(impl: (value: unknown) => value is T): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    try {
      return impl(value);
    } catch {
      return false;
    }
  };
}

function hasMethod<T extends keyof TemporalInstance>(
  v: TemporalInstance,
  name: T,
): boolean {
  return typeof v[name] === 'function';
}

// Symbol.toStringTag is the spec-mandated brand for Temporal types —
// every Temporal instance carries a tag like "Temporal.PlainDate" via
// this well-known symbol, regardless of whether it's native or polyfill.
// Used by the per-type guards as a fast positive signal: a tag match
// is sufficient, the structural fallback (field presence + method checks)
// is only consulted when the tag isn't set (which can happen with
// hand-built mock objects or partial implementations).
function hasTag(value: unknown, typeName: string): boolean {
  if (!isObject(value)) return false;
  const tag = (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag];
  return tag === `Temporal.${typeName}`;
}

export const isPlainDate: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainDateImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainDate')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  return typeof v.year === 'number'
    && typeof v.month === 'number'
    && typeof v.day === 'number'
    && typeof v.hour === 'undefined'
    && hasMethod(v, 'toPlainDateTime')
    && hasMethod(v, 'withCalendar');
});

export const isPlainTime: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainTimeImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainTime')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // PlainTime is the only Temporal type with `hour` but no `year` and
  // neither `withCalendar` nor any `toPlainX` method. That combination
  // is unique among the eight types.
  return typeof v.hour === 'number'
    && typeof v.year === 'undefined'
    && !hasMethod(v, 'withCalendar')
    && !hasMethod(v, 'toPlainDate')
    && !hasMethod(v, 'toPlainDateTime');
});

export const isPlainDateTime: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainDateTimeImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainDateTime')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // `withPlainTime` is on PlainDateTime and ZonedDateTime; ZonedDateTime
  // also carries `toInstant`. The combination "has withPlainTime, no
  // toInstant" uniquely identifies PlainDateTime.
  return typeof v.year === 'number'
    && typeof v.month === 'number'
    && typeof v.day === 'number'
    && typeof v.hour === 'number'
    && hasMethod(v, 'withPlainTime')
    && !hasMethod(v, 'toInstant');
});

export const isZonedDateTime: (value: unknown) => value is TemporalInstance = guardOrFalse(function isZonedDateTimeImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'ZonedDateTime')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // `withTimeZone` is unique to ZonedDateTime across every Temporal type.
  return typeof v.year === 'number'
    && typeof v.month === 'number'
    && typeof v.day === 'number'
    && typeof v.hour === 'number'
    && hasMethod(v, 'withTimeZone')
    && hasMethod(v, 'toInstant');
});

export const isInstant: (value: unknown) => value is TemporalInstance = guardOrFalse(function isInstantImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'Instant')) return true;
  if (!isObject(value)) return false;
  // Instant carries `toZonedDateTimeISO` and no `toInstant` (it IS the
  // instant). It also has no year/month/day/hour fields — those are
  // only meaningful against a calendar and zone, which Instant alone
  // doesn't carry.
  const v = value as TemporalInstance;
  return hasMethod(v, 'toZonedDateTimeISO')
    && !hasMethod(v, 'toInstant')
    && typeof v.year === 'undefined';
});

export const isPlainYearMonth: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainYearMonthImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainYearMonth')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // Has year+month, no day, carries `toPlainDate` (used to attach a day).
  // PlainMonthDay also carries `toPlainDate` but has no `year` field.
  return typeof v.year === 'number'
    && typeof v.month === 'number'
    && typeof v.day === 'undefined'
    && hasMethod(v, 'toPlainDate');
});

export const isPlainMonthDay: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainMonthDayImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainMonthDay')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // PlainMonthDay has `day` and `monthCode` but no `year` and no numeric
  // `month`. The `monthCode` field is the discriminator — every other
  // Temporal type that has a month concept either exposes `month` (numeric,
  // calendar-aware) or doesn't expose months at all (PlainTime, Duration).
  return typeof v.year === 'undefined'
    && typeof v.month === 'undefined'
    && typeof v.day === 'number'
    && typeof v.monthCode === 'string'
    && hasMethod(v, 'toPlainDate');
});

export const isDuration: (value: unknown) => value is Record<string, unknown> = guardOrFalse(function isDurationImpl(value: unknown): value is Record<string, unknown> {
  if (hasTag(value, 'Duration')) return true;
  if (!isObject(value)) return false;
  // `total` is unique to Duration across every Temporal type — no other
  // type carries it (verified by probing the prototype of each).
  // `abs` and `negated` are also Duration-only. Checking any one of
  // them is sufficient; checking `total` because it's the most semantically
  // distinctive (a Duration-specific operation no other type would
  // coincidentally need).
  const v = value as TemporalInstance;
  return hasMethod(v, 'total');
});

// Umbrella guard: any Temporal namespace member. Used by `assertTemporal`
// below for the "this needs to be some Temporal thing" case. Two signals
// checked in order:
//   1. `Symbol.toStringTag` — every Temporal type brands itself as
//      `Temporal.X` via this well-known symbol. This is the spec-
//      mandated brand, present on native and polyfill instances alike.
//   2. The discriminating-method fallback — covers any case where a
//      future/partial Temporal impl doesn't set the tag. Method
//      presence is part of the Temporal spec contract; combined with
//      `equals` + `with` (both present on every Temporal instance),
//      it's a reliable signal that doesn't rely on the toStringTag
//      being set.
export const isTemporal: (value: unknown) => value is TemporalInstance = guardOrFalse(function isTemporalImpl(value: unknown): value is TemporalInstance {
  if (!isObject(value)) return false;
  const tag = (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag];
  if (typeof tag === 'string' && tag.startsWith('Temporal.')) return true;
  const v = value as TemporalInstance;
  return hasMethod(v, 'toInstant')
    || hasMethod(v, 'toPlainDate')
    || hasMethod(v, 'toPlainDateTime')
    || hasMethod(v, 'toPlainTime')
    || hasMethod(v, 'toPlainYearMonth')
    || hasMethod(v, 'toPlainMonthDay')
    || hasMethod(v, 'toZonedDateTime')
    || hasMethod(v, 'toZonedDateTimeISO')
    || hasMethod(v, 'withCalendar')
    || hasMethod(v, 'withPlainTime')
    || hasMethod(v, 'withTimeZone')
    || hasMethod(v, 'total');
});

// Assertion helpers — throw descriptively rather than returning false.
// Same convention as the rest of the library: descriptive thrown errors
// instead of silent failures. The thrown Error carries a `valueType`
// hint in the message so the caller can see what they actually passed.
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name !== 'Object') {
      return `instance of ${ctor.name}`;
    }
    return 'plain object';
  }
  return typeof value;
}

function assertImpl(value: unknown, guard: (v: unknown) => boolean, expectedType: string): void {
  if (!guard(value)) {
    throw new Error(
      `temporal-fmt: expected a Temporal.${expectedType}, got ${describeValue(value)}.`
    );
  }
}

export function assertTemporal(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isTemporal, 'object (Instant, PlainDate, PlainTime, PlainDateTime, ZonedDateTime, Duration, PlainYearMonth, or PlainMonthDay)');
}
export function assertInstant(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isInstant, 'Instant');
}
export function assertPlainDate(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isPlainDate, 'PlainDate');
}
export function assertPlainTime(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isPlainTime, 'PlainTime');
}
export function assertPlainDateTime(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isPlainDateTime, 'PlainDateTime');
}
export function assertZonedDateTime(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isZonedDateTime, 'ZonedDateTime');
}
export function assertPlainYearMonth(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isPlainYearMonth, 'PlainYearMonth');
}
export function assertPlainMonthDay(value: unknown): asserts value is TemporalInstance {
  assertImpl(value, isPlainMonthDay, 'PlainMonthDay');
}
export function assertDuration(value: unknown): asserts value is Record<string, unknown> {
  assertImpl(value, isDuration, 'Duration');
}