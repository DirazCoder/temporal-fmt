// type guards for Temporal values. the rest of this lib works off the
// duck-typed TemporalLike shape (year/month/day/hour/...) instead of
// `instanceof Temporal.X`, because instanceof just breaks across
// polyfill/native boundaries — a polyfill's Temporal.PlainDate is a
// completely different constructor from the native one, so
// `value instanceof Temporal.PlainDate` would silently fail if the
// caller's using a polyfill while the guard's looking at native
// Temporal, or the other way around. same reasoning as tokens.ts's
// intlSupportsNativeTemporal probe — identity checks just don't survive
// a polyfill/native swap.
//
// so instead these guards check structural shape: does it have the
// type-discriminating method each Temporal type carries. method
// presence is part of the actual Temporal spec contract — every
// implementation, native or polyfill, has to expose the same methods on
// the same types — so it's a stable signal without needing to import a
// Temporal namespace at all.
//
// per-type discriminators (double checked these against
// @js-temporal/polyfill's actual prototype method list, matches spec):
//
//   PlainDate       — toPlainDateTime + withCalendar + year/month/day,
//                     no hour. (PlainDateTime also has toPlainDateTime's
//                     sibling toPlainDate/toPlainTime, but carries hour —
//                     that's what distinguishes them.)
//   PlainTime       — no toPlainDateTime, no withCalendar. has hour,
//                     no year/month/day. (only Temporal date/time type
//                     with neither withCalendar nor any toPlainX method.)
//   PlainDateTime   — toPlainDate + withPlainTime + year/month/day
//                     AND hour. (withPlainTime is unique — only
//                     PlainDateTime and ZonedDateTime carry it;
//                     ZonedDateTime also carries toInstant, which
//                     PlainDateTime doesn't.)
//   ZonedDateTime   — toInstant + withTimeZone. (both unique — only
//                     ZonedDateTime carries withTimeZone.)
//   Instant         — toZonedDateTimeISO, no toInstant. (Instant IS the
//                     instant — toInstant belongs to ZonedDateTime.
//                     toZonedDateTimeISO exists on both Instant and
//                     ZonedDateTime per spec, but on ZonedDateTime it's
//                     not actually exposed on the prototype in either
//                     native or polyfill — only Instant has it as a real
//                     method. checked both to confirm.)
//   PlainYearMonth  — toPlainDate (takes a day arg) + year/month, no
//                     day. (PlainDate also has a toPlainDate-shaped
//                     method but carries day; PlainMonthDay also has
//                     toPlainDate but carries day, not year.)
//   PlainMonthDay   — toPlainDate + month/day, no year. also lacks
//                     add/subtract/until/since (calendar arithmetic
//                     doesn't really make sense on a month-day without
//                     a year anyway).
//   Duration        — total + abs + negated. (all three unique to
//                     Duration, nothing else carries any of them.)

// this shape intentionally mirrors TemporalLike over in tokens.ts, but
// stays loose enough to also match real Temporal objects (which carry
// the spec methods the field-only TemporalLike doesn't have)
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
  // these come from TemporalLike — present on all the date-carrying
  // Temporal types but absent on PlainTime (no calendar position there)
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  calendarId?: string;
  timeZoneId?: string;
  // PlainMonthDay stores its month as monthCode (like "M08") instead of
  // a plain numeric month — without a year there's no way to know which
  // month a calendar-independent numeric month even refers to once
  // leap-year-aware calendars get involved, so the spec uses monthCode
  // instead. PlainMonthDay's the only type that has monthCode but not month
  monthCode?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// hardening against hostile getters: the guards below read properties
// (year, hour, Symbol.toStringTag, ...) off whatever value the caller
// hands us. an object with a throwing getter used to turn isPlainDate(obj)
// — a function whose entire contract is "return a boolean" — into an
// exception factory instead. every exported guard now goes through this
// wrapper, so a throw during probing just means "not one of ours", not a
// crash. one shared catch here instead of one per guard also keeps the
// coverage numbers honest
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
// this symbol regardless of native vs polyfill. the per-type guards use
// this as a fast positive check: a tag match is enough on its own, the
// structural fallback (field presence + method checks) only kicks in
// when there's no tag set, which can happen with hand-built mocks or
// partial implementations
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
  // PlainTime is the only type with hour but no year, and neither
  // withCalendar nor any toPlainX method. that combo is unique among
  // all eight types
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
  // withPlainTime shows up on both PlainDateTime and ZonedDateTime, but
  // ZonedDateTime also has toInstant. so "has withPlainTime, no
  // toInstant" uniquely picks out PlainDateTime
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
  // withTimeZone is unique to ZonedDateTime, nothing else has it
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
  // Instant has toZonedDateTimeISO but no toInstant — makes sense, it
  // IS the instant already. also has no year/month/day/hour fields since
  // those only mean anything against a calendar + zone, which Instant
  // alone doesn't carry
  const v = value as TemporalInstance;
  return hasMethod(v, 'toZonedDateTimeISO')
    && !hasMethod(v, 'toInstant')
    && typeof v.year === 'undefined';
});

export const isPlainYearMonth: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainYearMonthImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainYearMonth')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // has year+month but no day, carries toPlainDate (used to attach a day
  // later). PlainMonthDay also has toPlainDate but doesn't have year
  return typeof v.year === 'number'
    && typeof v.month === 'number'
    && typeof v.day === 'undefined'
    && hasMethod(v, 'toPlainDate');
});

export const isPlainMonthDay: (value: unknown) => value is TemporalInstance = guardOrFalse(function isPlainMonthDayImpl(value: unknown): value is TemporalInstance {
  if (hasTag(value, 'PlainMonthDay')) return true;
  if (!isObject(value)) return false;
  const v = value as TemporalInstance;
  // PlainMonthDay has day and monthCode but no year and no numeric month.
  // monthCode's the discriminator here — every other Temporal type with
  // a month concept either has month (numeric, calendar-aware) or
  // doesn't have months at all (PlainTime, Duration)
  return typeof v.year === 'undefined'
    && typeof v.month === 'undefined'
    && typeof v.day === 'number'
    && typeof v.monthCode === 'string'
    && hasMethod(v, 'toPlainDate');
});

export const isDuration: (value: unknown) => value is Record<string, unknown> = guardOrFalse(function isDurationImpl(value: unknown): value is Record<string, unknown> {
  if (hasTag(value, 'Duration')) return true;
  if (!isObject(value)) return false;
  // total is unique to Duration across the whole Temporal set — nothing
  // else has it (checked every prototype to confirm). abs and negated
  // are also Duration-only, checking any one of the three would work;
  // going with total since it's the most semantically distinctive one —
  // a Duration-specific operation nothing else would coincidentally need
  const v = value as TemporalInstance;
  return hasMethod(v, 'total');
});

// umbrella guard: is this ANY Temporal namespace member. used by
// assertTemporal below for the "this needs to be some Temporal thing"
// case. checks two signals in order:
//   1. Symbol.toStringTag — every Temporal type brands itself as
//      Temporal.X via this symbol. spec-mandated, present on native
//      and polyfill instances alike.
//   2. the discriminating-method fallback — covers whatever future or
//      partial Temporal implementation doesn't bother setting the tag.
//      method presence is part of the spec contract, so combined with
//      equals + with (both on every Temporal instance) it's still a
//      reliable signal even without the tag being set
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

// assertion helpers — throw with a real message instead of just
// returning false. same convention the rest of this lib uses: descriptive
// thrown errors instead of failing silently. the thrown error includes
// a valueType hint so the caller can actually see what they passed in
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