// Wire protocol shared by the host loader (scripts/modSandbox.mjs) and the
// sandboxed worker (scripts/modWorker.mjs). Both processes import this
// file, so it must stay free of anything side-effectful and of any import
// the child couldn't make under a zero-permission sandbox: it runs in the
// child with only the loader's own baseline read grants (see
// modSandbox.mjs), which cover this directory and dist/ — the capability
// list below is re-exported from the built library for exactly that
// reason, and the worker already imports the whole library anyway.

// The closed capability set lives in src/modApi.ts (canonical, typed,
// shipped in the public API) and is re-exported here so both sandbox
// processes and the loader share one list rather than two that could
// drift apart. See the source comment there for why the list is what it
// is — every entry has to map to a permission-model flag that exists on
// Node 20 through 26.
export { GRANTABLE_PERMISSIONS } from '../dist/index.js';

// How long the host waits for a sandboxed mod to finish register() before
// killing the subprocess, and how long a runtime override bridge call may
// block format()/parse() before the host gives up and falls back to the
// built-in. Setup gets more headroom than runtime because register() runs
// once and legitimately does real work (building holiday tables, reading
// data files); a runtime call is in a hot path and only needs enough room
// to distinguish "slow" from "never".
export const SETUP_TIMEOUT_MS = 10_000;
export const RUNTIME_TIMEOUT_MS = 5_000;

// The permission-model flag changed names when the feature went stable in
// Node 22.13.0: --experimental-permission before, --permission after.
// Hardcoding either name would break on one side of that line (Node 20
// rejects --permission outright), so pick per running version.
export function permissionFlagName() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) return '--experimental-permission';
  return '--permission';
}

// True when the running Node can only offer the experimental-era
// permission model, no matter which side of the 22.13 rename it's on.
// The load report says so once per pass — someone on Node 20 deserves to
// know the sandbox wall is thinner there than the docs imply.
export function isExperimentalPermissionModel() {
  return permissionFlagName() === '--experimental-permission';
}

// One stable JSON form for keys and wire messages: own enumerable
// properties, recursively, with object keys sorted so two structurally
// equal values serialize identically regardless of insertion order.
// Throws on values that can't cross a process boundary (bigint, cycles,
// functions) so callers can treat "unserializable" as "no cache" rather
// than getting a poisoned key later.
export function stableStringify(value) {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value) {
  if (typeof value === 'bigint') throw new Error('bigint');
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortForJson);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortForJson(value[key]);
  return out;
}

// Everything below is the value wire format. A mod's override impl runs
// in the sandbox subprocess but is called with values the host holds and
// must return values the host can use, so arguments travel host→child and
// results travel child→host. Plain JSON covers most of it; Temporal
// instances get a tag plus their field values and are rebuilt from those
// fields on the other side, because a Temporal object is methods plus
// state and only the state survives a pipe.

// The fields this library ever reads off a value (see TemporalLike in
// src/tokens.ts), plus the ZonedDateTime bits. Read defensively: a value
// tagged PlainDate simply won't have hour, and accessing missing getters
// is the normal way to find that out.
const VALUE_FIELDS = [
  'year', 'month', 'day', 'hour', 'minute', 'second',
  'millisecond', 'microsecond', 'nanosecond',
  'calendarId', 'timeZoneId', 'offset', 'dayOfWeek',
  'monthCode', 'era', 'eraYear',
];

// Duration carries its own field set.
const DURATION_FIELDS = [
  'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds',
  'millisecond', 'microseconds', 'nanoseconds',
];

function temporalTag(value) {
  const tag = value[Symbol.toStringTag];
  return typeof tag === 'string' && tag.startsWith('Temporal.') ? tag.slice('Temporal.'.length) : undefined;
}

function fieldsOf(value, names) {
  const fields = {};
  for (const name of names) {
    const v = value[name];
    if (v !== undefined) fields[name] = v;
  }
  return fields;
}

// Host→child and child→host share one shape, so this and reviveValue are
// used from both processes. Depth-capped: override arguments and results
// are values, format strings, and options objects, none of which nest
// deeply; a cap keeps a pathological structure from costing more to walk
// than the call it rode in on.
//
// Functions follow JSON.stringify's rules rather than throwing: a
// top-level function becomes undefined, one inside an object is dropped,
// one inside an array becomes null. A mod whose override returns a
// function was already returning garbage in-process — the sandbox can't
// ship a live closure over a pipe, and failing the call would break
// garbage that used to "work", so it degrades the way JSON does.
// BigInts still throw: they're real data with no lossless JSON form.
export function toWire(value, depth = 0) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') throw new Error(`can't send a bigint across the mod subprocess boundary`);
    if (typeof value === 'function') return undefined;
    return value;
  }
  if (depth > 4) return value;

  const tag = temporalTag(value);
  if (tag === 'Duration') return { __tf: 'Duration', f: fieldsOf(value, DURATION_FIELDS) };
  if (tag === 'Instant') return { __tf: 'Instant', f: { epochNanoseconds: value.epochNanoseconds.toString() } };
  if (tag) return { __tf: tag, f: fieldsOf(value, VALUE_FIELDS) };

  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'function' ? null : toWire(v, depth + 1)));
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'function') continue;
    out[key] = toWire(v, depth + 1);
  }
  return out;
}

// Rebuilds wire values into live objects. Temporal is the instance this
// process already bootstrapped (the host's, or the worker's own) — passed
// in rather than imported here so this file keeps no state.
export function fromWire(value, Temporal, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 4) return value;

  if (typeof value.__tf === 'string') {
    // No Temporal in this process: hand back the plain field object.
    // Everything in this library reads values duck-typed, so a
    // fields-only value still formats — it just can't be used where a
    // real Temporal instance's methods are needed.
    if (!Temporal) return value.f;
    const f = { ...value.f };
    switch (value.__tf) {
      case 'ZonedDateTime':
        return Temporal.ZonedDateTime.from({ ...f, timeZone: f.timeZoneId, offset: f.offset });
      case 'Duration':
        return Temporal.Duration.from(f);
      case 'Instant':
        return Temporal.Instant.from({ epochNanoseconds: BigInt(f.epochNanoseconds) });
      default: {
        const ctor = Temporal[value.__tf];
        if (!ctor || typeof ctor.from !== 'function') {
          throw new Error(`can't rebuild a Temporal.${value.__tf} value: this Temporal implementation has no such type`);
        }
        return ctor.from(f);
      }
    }
  }

  if (Array.isArray(value)) return value.map((v) => fromWire(v, Temporal, depth + 1));
  const out = {};
  for (const [key, v] of Object.entries(value)) out[key] = fromWire(v, Temporal, depth + 1);
  return out;
}

// Errors don't survive JSON, and a bare message loses the name and code
// that say what actually went wrong. Keep those three; the stack refers
// to frames in the other process and is noise here.
export function errorToWire(err) {
  return { name: err?.name, message: err?.message, code: err?.code };
}

export function errorFromWire(wire) {
  if (!wire || typeof wire !== 'object') return new Error(String(wire));
  const err = new Error(wire.message ?? String(wire));
  if (wire.name) err.name = wire.name;
  if (wire.code) err.code = wire.code;
  return err;
}

// A createFormatter() token table crosses the process boundary as each
// handler's source text. Rebuilding a function from source with new
// Function only works when the handler is self-contained (see
// modWorker.mjs's serializeFormatterOptions for how that's verified
// before shipping); a source that can't revive at all is a bug in the
// verification, so it surfaces as a handler that's null and fails loudly
// at the first format() call that reaches it.
export function reviveFunction(source) {
  try {
    return new Function(`return (${source});`)();
  } catch {
    return null;
  }
}

export function rehydrateFormatterOptions(wireOptions) {
  if (!wireOptions || !wireOptions.tokens) return wireOptions;
  return {
    ...wireOptions,
    tokens: wireOptions.tokens.map((t) => ({
      name: t.name,
      field: t.field,
      handler: reviveFunction(t.handlerSource),
    })),
  };
}
