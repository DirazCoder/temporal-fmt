import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Every other test file in this suite is a hand-picked example. That's
// real coverage, but a regex-generation-heavy parser like this one can have
// failure modes nobody thought to type by hand — a specific digit sequence
// that satisfies one fragment's boundary but breaks an adjacent one, a
// format string shape that happens to make two tokens' fragments ambiguous
// with each other, etc. These generate large numbers of random-but-valid
// inputs instead and check invariants that should hold for all of them.
//
// No fuzzing library is installed (fast-check, etc.), and adding a new
// dependency for this felt like a bigger call than "add tests" — so this
// uses a small seeded PRNG instead. Deterministic and reproducible: a
// failure always reproduces at the same seed, no flakiness from run to run,
// and no new dependency footprint.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// mulberry32 — small, fast, seeded, good enough distribution for test-input
// generation (not cryptographic, doesn't need to be)
function makeRng(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

// Minimal integer shrinker. When a property fails on some random `n`, walks
// `n` toward `low` one bisection step at a time, keeping the move only if
// the property still fails at the smaller value. Not exhaustive shrinking
// (no shrinking of format-string shape, only the numeric seed driving date
// construction) — but for this generator, the date/time fields are what
// vary per-iteration, and a smaller year/month/day/hour is almost always
// the more legible repro. Bounded iteration count so a pathological case
// can't hang the suite; falls back to the original failing value if it
// can't make progress.
function shrinkInt(low, high, isStillFailing) {
  let lo = low;
  let hi = high;
  let guard = 0;
  while (lo < hi && guard++ < 64) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (isStillFailing(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return hi;
}

// Shrinks a full { year, month, day, hour, minute, second, millisecond }
// input toward the earliest failing value on each field independently,
// holding the others fixed at the already-shrunk value. Cheap (a handful of
// property re-checks per field, not a search over the whole product space)
// and good enough — the goal is a smaller repro to read, not a provably
// minimal one.
function shrinkDateFields(fields, checkFails) {
  const order = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'];
  const floor = { year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
  const shrunk = { ...fields };
  for (const field of order) {
    if (shrunk[field] === undefined) continue;
    shrunk[field] = shrinkInt(floor[field], shrunk[field], (candidate) => {
      const trial = { ...shrunk, [field]: candidate };
      return checkFails(trial);
    });
  }
  return shrunk;
}

// Known ICU limitation, not a bug here: ICU's default Gregorian cutover is
// October 15, 1582, so dates before that get silently reinterpreted under
// the Julian calendar when formatted through Intl, even though Temporal
// uses a proleptic Gregorian calendar throughout — see
// https://github.com/tc39/ecma402/issues/1003. Only affects locale-aware
// tokens (MMMM/MMM/EEEE/EEE); numeric tokens never touch Intl. Seen so far
// only on engines with native Temporal (Node 26+) — the polyfill's
// toLocaleString() path doesn't reproduce it.
//
// Probed at runtime rather than hardcoded to "skip pre-1582" so this only
// suppresses failures the quirk actually explains, and still catches a
// real regression on an engine that doesn't have it.
const GREGORIAN_CUTOVER_YEAR = 1582;
let hasIcuCutoverQuirk;
function engineHasIcuCutoverQuirk() {
  if (hasIcuCutoverQuirk === undefined) {
    const probeDate = Temporal.PlainDate.from({ year: 946, month: 9, day: 4 });
    hasIcuCutoverQuirk = format(probeDate, 'MMMM') !== 'September';
  }
  return hasIcuCutoverQuirk;
}

// only true if the quirk actually explains the failure — a pre-cutover
// date failing through pure numeric tokens would still be a real bug
function isKnownIcuCutoverFailure(dateYear, formatStr) {
  if (dateYear >= GREGORIAN_CUTOVER_YEAR) return false;
  if (!engineHasIcuCutoverQuirk()) return false;
  return /MMMM|MMM|EEEE|EEE/.test(formatStr);
}

// mirrors TOKENS in src/tokens.ts — not exported, so this list has to be
// kept in sync by hand, same constraint every other file in this suite
// hit. Grouped by which Temporal fields they need, so the generator can
// build format strings whose tokens are mutually satisfiable by one
// randomly-generated date/time value.
const DATE_TOKENS = ['yyyy', 'yy', 'MMMM', 'MMM', 'MM', 'M', 'dd', 'd'];
const TIME_TOKENS = ['HH', 'H', 'mm', 'm', 'ss', 's', 'SSS'];
const HOUR12_TOKENS = ['hh', 'h']; // needs 'a' alongside it, handled separately

function randomPlainDate(rng) {
  const year = randInt(rng, 1, 9999);
  const month = randInt(rng, 1, 12);
  // clamp day to a value valid for every month/year combo generated here —
  // the property under test is round-tripping, not calendar-arithmetic
  // correctness (that's covered elsewhere), so avoid generating invalid
  // dates that would just throw before reaching the logic being fuzzed
  const day = randInt(rng, 1, 28);
  return Temporal.PlainDate.from({ year, month, day });
}

function randomPlainDateTime(rng) {
  const date = randomPlainDate(rng);
  return Temporal.PlainDateTime.from({
    year: date.year,
    month: date.month,
    day: date.day,
    hour: randInt(rng, 0, 23),
    minute: randInt(rng, 0, 59),
    second: randInt(rng, 0, 59),
    millisecond: randInt(rng, 0, 999),
  });
}

function randomDateFormatString(rng) {
  // year, month, day each exactly once, since duplicate-token "last wins"
  // behavior is already covered directly in parse.test.js and pattern.test.js
  // — mixing that concern into round-trip fuzzing would muddy what a
  // failure here actually indicates
  const yearTok = pick(rng, ['yyyy']); // 'yy' excluded: lossy (2-digit), can't round-trip arbitrary years
  const monthTok = pick(rng, ['MMMM', 'MMM', 'MM', 'M']);
  const dayTok = pick(rng, ['dd', 'd']);
  const sep1 = pick(rng, ['-', '/', ' ', '.']);
  const sep2 = pick(rng, ['-', '/', ' ', '.']);
  const order = pick(rng, [
    [yearTok, monthTok, dayTok],
    [monthTok, dayTok, yearTok],
    [dayTok, monthTok, yearTok],
  ]);
  return `${order[0]}${sep1}${order[1]}${sep2}${order[2]}`;
}

// Bumped two orders of magnitude from the original 300. At 300 iterations
// this test exists but barely exercises the input space; at this scale it's
// actually likely to hit a boundary nobody typed by hand. Runs in well
// under a second per test even at this size (pure regex + Temporal
// construction, no I/O), so the cost is negligible.
const ROUND_TRIP_ITERATIONS = 20000;

test(`round-trip fuzz: format(date) then parse() recovers the same date, across ${ROUND_TRIP_ITERATIONS} random dates and format-string shapes`, () => {
  const rng = makeRng(20260809); // fixed seed — same failures every run, no flakiness
  const failures = [];
  const knownIcuCutoverFailures = [];

  const checkDateFormat = (date, formatStr) => {
    try {
      const formatted = format(date, formatStr);
      const reparsed = parse(formatStr, formatted);
      return reparsed.toString() !== date.toString();
    } catch {
      return true; // any throw counts as "still failing" for shrink purposes
    }
  };

  for (let i = 0; i < ROUND_TRIP_ITERATIONS; i++) {
    const date = randomPlainDate(rng);
    const formatStr = randomDateFormatString(rng);
    let formatted, reparsed;
    try {
      formatted = format(date, formatStr);
      reparsed = parse(formatStr, formatted);
    } catch (err) {
      const shrunkFields = shrinkDateFields(
        { year: date.year, month: date.month, day: date.day },
        (f) => checkDateFormat(Temporal.PlainDate.from(f), formatStr)
      );
      const entry = {
        date: date.toString(), formatStr, error: err.message,
        shrunk: Temporal.PlainDate.from(shrunkFields).toString(),
      };
      (isKnownIcuCutoverFailure(date.year, formatStr) ? knownIcuCutoverFailures : failures).push(entry);
      continue;
    }
    if (reparsed.toString() !== date.toString()) {
      const shrunkFields = shrinkDateFields(
        { year: date.year, month: date.month, day: date.day },
        (f) => checkDateFormat(Temporal.PlainDate.from(f), formatStr)
      );
      const entry = {
        date: date.toString(), formatStr, formatted, reparsedAs: reparsed.toString(),
        shrunk: Temporal.PlainDate.from(shrunkFields).toString(),
      };
      (isKnownIcuCutoverFailure(date.year, formatStr) ? knownIcuCutoverFailures : failures).push(entry);
    }
  }

  if (knownIcuCutoverFailures.length > 0) {
    console.log(
      `\n[fuzz.test.js] ${knownIcuCutoverFailures.length}/${ROUND_TRIP_ITERATIONS} round-trip cases failed on ` +
      `this engine due to a known ICU limitation (Gregorian calendar cutover at 1582 — see ` +
      `https://github.com/tc39/ecma402/issues/1003), not a bug in this library. Excluded from the ` +
      `assertion below, not silently dropped:\n${JSON.stringify(knownIcuCutoverFailures.slice(0, 5), null, 2)}\n`
    );
  }

  assert.equal(
    failures.length, 0,
    `${failures.length}/${ROUND_TRIP_ITERATIONS} round-trip failures (excluding ${knownIcuCutoverFailures.length} ` +
    `known ICU-cutover cases, see above). Each entry's "shrunk" field is the smallest date that still ` +
    `reproduces the failure against the same format string:\n${JSON.stringify(failures.slice(0, 5), null, 2)}`
  );
});

test(`round-trip fuzz: PlainDateTime with random time-of-day fields, across ${ROUND_TRIP_ITERATIONS} iterations`, () => {
  const rng = makeRng(19700101);
  const failures = [];

  for (let i = 0; i < ROUND_TRIP_ITERATIONS; i++) {
    const dt = randomPlainDateTime(rng);
    const timeTok = pick(rng, [['HH', 'mm', 'ss'], ['H', 'm', 's'], ['HH', 'mm', 'ss', 'SSS']]);
    const formatStr = `yyyy-MM-dd ${timeTok.join(':')}`.replace(':SSS', '.SSS');
    let formatted, reparsed;
    try {
      formatted = format(dt, formatStr);
      reparsed = parse(formatStr, formatted);
    } catch (err) {
      const shrunk = shrinkDateFields(
        { year: dt.year, month: dt.month, day: dt.day, hour: dt.hour, minute: dt.minute, second: dt.second, millisecond: dt.millisecond },
        (f) => {
          try {
            const trial = Temporal.PlainDateTime.from(f);
            const fmt = format(trial, formatStr);
            const rep = parse(formatStr, fmt);
            const exp = timeTok.includes('SSS') ? trial.toString() : trial.toString().replace(/\.\d+/, '');
            return rep.toString() !== exp;
          } catch {
            return true;
          }
        }
      );
      failures.push({ dt: dt.toString(), formatStr, error: err.message, shrunk: Temporal.PlainDateTime.from(shrunk).toString() });
      continue;
    }
    // millisecond only round-trips when SSS is in the format string —
    // compare only the fields the format string actually captured
    const expected = timeTok.includes('SSS')
      ? dt.toString()
      : dt.toString().replace(/\.\d+/, '');
    if (reparsed.toString() !== expected) {
      const shrunk = shrinkDateFields(
        { year: dt.year, month: dt.month, day: dt.day, hour: dt.hour, minute: dt.minute, second: dt.second, millisecond: dt.millisecond },
        (f) => {
          try {
            const trial = Temporal.PlainDateTime.from(f);
            const fmt = format(trial, formatStr);
            const rep = parse(formatStr, fmt);
            const exp = timeTok.includes('SSS') ? trial.toString() : trial.toString().replace(/\.\d+/, '');
            return rep.toString() !== exp;
          } catch {
            return true;
          }
        }
      );
      failures.push({ dt: dt.toString(), formatStr, formatted, reparsedAs: reparsed.toString(), expected, shrunk: Temporal.PlainDateTime.from(shrunk).toString() });
    }
  }

  assert.equal(
    failures.length, 0,
    `${failures.length}/${ROUND_TRIP_ITERATIONS} round-trip failures:\n${JSON.stringify(failures.slice(0, 5), null, 2)}`
  );
});

test(`round-trip fuzz: 12-hour clock with "a" token, across ${ROUND_TRIP_ITERATIONS} iterations`, () => {
  const rng = makeRng(31415926);
  const failures = [];

  for (let i = 0; i < ROUND_TRIP_ITERATIONS; i++) {
    const dt = randomPlainDateTime(rng);
    const hourTok = pick(rng, HOUR12_TOKENS);
    const formatStr = `yyyy-MM-dd ${hourTok}:mm a`;
    let formatted, reparsed;
    try {
      formatted = format(dt, formatStr);
      reparsed = parse(formatStr, formatted);
    } catch (err) {
      failures.push({ dt: dt.toString(), formatStr, error: err.message });
      continue;
    }
    const expected = dt.toString().replace(/:\d{2}(\.\d+)?$/, ':00');
    if (reparsed.toString() !== expected) {
      const shrunk = shrinkDateFields(
        { year: dt.year, month: dt.month, day: dt.day, hour: dt.hour, minute: dt.minute },
        (f) => {
          try {
            const trial = Temporal.PlainDateTime.from({ ...f, second: 0, millisecond: 0 });
            const fmt = format(trial, formatStr);
            const rep = parse(formatStr, fmt);
            const exp = trial.toString().replace(/:\d{2}(\.\d+)?$/, ':00');
            return rep.toString() !== exp;
          } catch {
            return true;
          }
        }
      );
      failures.push({ dt: dt.toString(), formatStr, formatted, reparsedAs: reparsed.toString(), expected, shrunk: Temporal.PlainDateTime.from({ ...shrunk, second: 0, millisecond: 0 }).toString() });
    }
  }

  assert.equal(
    failures.length, 0,
    `${failures.length}/${ROUND_TRIP_ITERATIONS} round-trip failures:\n${JSON.stringify(failures.slice(0, 5), null, 2)}`
  );
});

const GARBAGE_ITERATIONS = 10000;

function randomGarbageString(rng, maxLen) {
  // biased toward characters that actually appear in format strings, so
  // this stresses the tokenizer's boundary logic rather than mostly hitting
  // "not a token, not a quote, passes through as literal" every time
  const alphabet = "yMdHhmsSazE-/:. '0123456789";
  const len = randInt(rng, 0, maxLen);
  let out = '';
  for (let i = 0; i < len; i++) out += pick(rng, alphabet.split(''));
  return out;
}

test(`fuzz: random garbage format strings never crash format() or parse() — always a clean thrown Error, ${GARBAGE_ITERATIONS} iterations`, () => {
  const rng = makeRng(2718281);
  const date = Temporal.PlainDate.from('2026-08-04');
  const crashes = [];

  for (let i = 0; i < GARBAGE_ITERATIONS; i++) {
    const formatStr = randomGarbageString(rng, 30);
    try {
      format(date, formatStr);
    } catch (err) {
      if (!(err instanceof Error)) {
        crashes.push({ formatStr, thrown: String(err), op: 'format' });
      }
      // a normal thrown Error is expected and fine — most random strings
      // are invalid format strings (unterminated quotes, unsupported
      // fields for a PlainDate, etc.)
    }
  }

  for (let i = 0; i < GARBAGE_ITERATIONS; i++) {
    const formatStr = randomGarbageString(rng, 20);
    const input = randomGarbageString(rng, 20);
    try {
      parse(formatStr, input);
    } catch (err) {
      if (!(err instanceof Error)) {
        crashes.push({ formatStr, input, thrown: String(err), op: 'parse' });
      }
    }
  }

  assert.equal(
    crashes.length, 0,
    `${crashes.length} non-Error throws (raw crash, not a handled error):\n${JSON.stringify(crashes.slice(0, 5), null, 2)}`
  );
});

test(`fuzz: valid format string paired with random garbage input never crashes parse(), always throws or returns cleanly, ${GARBAGE_ITERATIONS} iterations`, () => {
  const rng = makeRng(1618033);
  const crashes = [];
  const formatStr = 'yyyy-MM-dd HH:mm:ss';

  for (let i = 0; i < GARBAGE_ITERATIONS; i++) {
    const input = randomGarbageString(rng, 25);
    try {
      const result = parse(formatStr, input);
      // if it didn't throw, it must have produced a real, stringifiable result
      assert.equal(typeof result.toString(), 'string');
    } catch (err) {
      if (!(err instanceof Error)) {
        crashes.push({ input, thrown: String(err) });
      }
    }
  }

  assert.equal(
    crashes.length, 0,
    `${crashes.length} non-Error throws against a valid format string:\n${JSON.stringify(crashes.slice(0, 5), null, 2)}`
  );
});
