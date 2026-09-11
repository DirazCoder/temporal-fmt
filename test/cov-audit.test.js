// Extra tests for coverage
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  between,
  createConfig,
  createHolidayCalendar,
  format,
  formatDistance,
  formatISODuration,
  formatRRule,
  getNextTransition,
  getPreviousTransition,
  getTransitions,
  intersection,
  isDST,
  mergeIntervals,
  parseISODuration,
  parseRelative,
  parseRRule,
  recurrence,
  registerRelativeGrammar,
  roundDuration,
  setTemporal,
  skip,
  splitInterval,
  take,
  union,
  intervalDifference,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const T = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(T);

const D = (s) => T.PlainDate.from(s);
const iv = (a, b, bounds) => ({ start: D(a), end: D(b), bounds });

// ---------------------------------------------------------------------------
// REGRESSION: interval end-inclusivity ownership (audit follow-up bugs).
// The inner end-side comparisons in intersection()/union() had their
// direction flipped, so the "other interval strictly extends further" arm
// was unreachable and the bounds came out wrong.
// ---------------------------------------------------------------------------

test('cov: union((1,5], [3,10)) is (1,10) — b owns the end and excludes it', () => {
  // 10 is in neither (1,5] nor [3,10) — the union's end must be exclusive.
  const u = union(iv('2026-01-01', '2026-01-05', 'half-open-start'), iv('2026-01-03', '2026-01-10', 'half-open-end'));
  assert.equal(u.bounds, 'open');
  assert.equal(u.start.toString(), '2026-01-01');
  assert.equal(u.end.toString(), '2026-01-10');
});

test('cov: union with b strictly-earlier start takes its start inclusivity', () => {
  const u = union(iv('2026-01-05', '2026-01-10', 'closed'), iv('2026-01-01', '2026-01-08', 'closed'));
  assert.equal(u.bounds, 'closed');
  assert.equal(u.start.toString(), '2026-01-01');
  assert.equal(u.end.toString(), '2026-01-10');
});

test('cov: union equal ends take the disjunction of end inclusivities', () => {
  const u = union(iv('2026-01-01', '2026-01-05', 'closed'), iv('2026-01-03', '2026-01-05', 'closed'));
  assert.equal(u.bounds, 'closed');
  // half-open-end + closed at a shared end -> inclusive (disjunction).
  const u2 = union(iv('2026-01-01', '2026-01-05', 'half-open-end'), iv('2026-01-03', '2026-01-05', 'closed'));
  assert.equal(u2.bounds, 'closed');
});

test('cov: intersect([1,10), [3,5]) is [3,5] — 5 is in both, end inclusive', () => {
  const i = intersection(iv('2026-01-01', '2026-01-10', 'half-open-end'), iv('2026-01-03', '2026-01-05', 'closed'));
  assert.equal(i.bounds, 'closed');
  assert.equal(i.start.toString(), '2026-01-03');
  assert.equal(i.end.toString(), '2026-01-05');
});

test('cov: intersection with b strictly-later start takes its start inclusivity', () => {
  const i = intersection(iv('2026-01-01', '2026-01-10', 'closed'), iv('2026-01-05', '2026-01-15', 'half-open-start'));
  // b owns the start and excludes 5 -> intersection excludes it too: (5,10].
  assert.equal(i.bounds, 'half-open-start');
});

test('cov: intersection equal ends take the conjunction of end inclusivities', () => {
  const i = intersection(iv('2026-01-01', '2026-01-10', 'half-open-end'), iv('2026-01-05', '2026-01-10', 'closed'));
  // a excludes 10, b includes it -> intersection excludes it.
  assert.equal(i.bounds, 'half-open-end');
});

test('cov: difference before/after parts inherit the right endpoint inclusivity', () => {
  // [1,10] - (5,15]: before-part is [1,5] — b never owned 5, a keeps it.
  let r = intervalDifference(iv('2026-01-01', '2026-01-10', 'closed'), iv('2026-01-05', '2026-01-15', 'half-open-start'));
  assert.equal(r.length, 1);
  assert.equal(r[0].bounds, 'closed');
  assert.equal(r[0].end.toString(), '2026-01-05');

  // (1,10] - (5,15]: before-part keeps a's exclusive start.
  r = intervalDifference(iv('2026-01-01', '2026-01-10', 'half-open-start'), iv('2026-01-05', '2026-01-15', 'half-open-start'));
  assert.equal(r[0].bounds, 'half-open-start');

  // [1,10] - [3,5): b sits strictly inside a -> two pieces, [1,3) and [5,10]
  // (b excluded its own end 5, so a keeps it: the cut is inclusive).
  r = intervalDifference(iv('2026-01-01', '2026-01-10', 'closed'), iv('2026-01-03', '2026-01-05', 'half-open-end'));
  assert.equal(r.length, 2);
  assert.equal(r[0].bounds, 'half-open-end');
  assert.equal(r[0].end.toString(), '2026-01-03');
  assert.equal(r[1].bounds, 'closed');
  assert.equal(r[1].start.toString(), '2026-01-05');

  // [1,10] - [3,5]: same shape, but b owned its end -> the cut is exclusive,
  // so the after-part is (5,10].
  r = intervalDifference(iv('2026-01-01', '2026-01-10', 'closed'), iv('2026-01-03', '2026-01-05', 'closed'));
  assert.equal(r.length, 2);
  assert.equal(r[1].bounds, 'half-open-start');
  assert.equal(r[1].start.toString(), '2026-01-05');
});

test('cov: mergeIntervals touching endpoints merge only when the point is owned', () => {
  // [1,5) + [5,10]: 5 is owned by the second -> merge to [1,10].
  let m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'half-open-end'), iv('2026-01-05', '2026-01-10', 'closed')]);
  assert.equal(m.length, 1);
  assert.equal(m[0].bounds, 'closed');
  assert.equal(m[0].start.toString(), '2026-01-01');
  assert.equal(m[0].end.toString(), '2026-01-10');

  // (1,5) + (5,10): nobody owns 5 -> two intervals, hole preserved.
  m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'open'), iv('2026-01-05', '2026-01-10', 'half-open-start')]);
  assert.equal(m.length, 2);
});

test('cov: mergeIntervals extending interval carries the new end inclusivity', () => {
  // (1,5) + [2,10]: overlap, end extends to 10 (inclusive, from current).
  let m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'open'), iv('2026-01-02', '2026-01-10', 'closed')]);
  assert.equal(m.length, 1);
  assert.equal(m[0].bounds, 'half-open-start');

  // (1,5) + [2,10): end extends to 10, exclusive.
  m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'open'), iv('2026-01-02', '2026-01-10', 'half-open-end')]);
  assert.equal(m[0].bounds, 'open');
});

test('cov: mergeIntervals equal ends combine inclusivities', () => {
  // closed + closed -> closed.
  let m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'closed'), iv('2026-01-03', '2026-01-05', 'closed')]);
  assert.equal(m[0].bounds, 'closed');
  // half-open-end + half-open-end -> half-open-end (disjunction false).
  m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'half-open-end'), iv('2026-01-03', '2026-01-05', 'half-open-end')]);
  assert.equal(m[0].bounds, 'half-open-end');
  // open start + closed end partner -> half-open-start.
  m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'open'), iv('2026-01-03', '2026-01-05', 'closed')]);
  assert.equal(m[0].bounds, 'half-open-start');
  // open + open -> open.
  m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'open'), iv('2026-01-03', '2026-01-05', 'open')]);
  assert.equal(m[0].bounds, 'open');
});

test('cov: splitInterval keeps the caller start exclusivity on slice 0', () => {
  const parts = splitInterval(iv('2026-01-01', '2026-01-10', 'half-open-start'), 2);
  assert.equal(parts.length, 2);
  // slice 0: (1, 5.5] -> open start, exclusive interior end.
  assert.equal(parts[0].bounds, 'open');
  // slice 1: [5.5, 10] -> included start, inclusive final end.
  assert.equal(parts[1].bounds, 'closed');
});

// ---------------------------------------------------------------------------
// REGRESSION: isDST string-offset fallback compared seconds against
// nanoseconds, so standard-time values read as "in DST" on Temporal
// implementations without offsetNanoseconds.
// ---------------------------------------------------------------------------

test('cov: isDST string-offset fallback is unit-consistent (winter NY = false)', () => {
  const fake = { ZonedDateTime: { from: (f) => ({ offset: f.month === 1 ? '-05:00' : '-04:00' }) } };
  setTemporal(fake);
  try {
    const winter = isDST({ year: 2026, month: 1, day: 15, offset: '-05:00', timeZoneId: 'America/New_York' });
    assert.equal(winter, false, 'winter (standard offset) must not read as DST');
    const summer = isDST({ year: 2026, month: 7, day: 15, offset: '-04:00', timeZoneId: 'America/New_York' });
    assert.equal(summer, true);
  } finally {
    setTemporal(T);
  }
});

test('cov: isDST with equal Jan/Jul offsets is false, malformed offsets read as 0', () => {
  const fake = { ZonedDateTime: { from: () => ({ offset: '+00:00' }) } };
  setTemporal(fake);
  try {
    assert.equal(isDST({ year: 2026, month: 7, day: 1, offset: '+00:00', timeZoneId: 'UTC' }), false);
  } finally {
    setTemporal(T);
  }
  // Malformed offset strings parse to 0 (offsetToSeconds regex miss).
  const junk = { ZonedDateTime: { from: () => ({ offset: 'not-an-offset' }) } };
  setTemporal(junk);
  try {
    assert.equal(isDST({ year: 2026, month: 7, day: 1, offset: '+00:00', timeZoneId: 'UTC' }), false);
  } finally {
    setTemporal(T);
  }
});

test('cov: isDST on a zone with no DST is false via the equal-offset arm', () => {
  assert.equal(isDST(T.ZonedDateTime.from('2026-07-01T12:00[Asia/Tokyo]')), false);
});

// ---------------------------------------------------------------------------
// config validation
// ---------------------------------------------------------------------------

test('cov: createConfig rejects a non-string numberingSystem', () => {
  assert.throws(() => createConfig({ numberingSystem: 123 }), /numberingSystem must be a string/);
});

// ---------------------------------------------------------------------------
// duration sign handling
// ---------------------------------------------------------------------------

test('cov: parseISODuration negates only nonzero components of a negative duration', () => {
  const r = parseISODuration('-P1YT2H');
  assert.equal(r.years, -1);
  assert.equal(r.hours, -2);
  // Zero components must stay +0, never -0.
  const z = parseISODuration('-PT1H0M');
  assert.equal(z.hours, -1);
  assert.ok(Object.is(z.minutes, 0));
});

test('cov: formatISODuration emits the ISO leading minus sign', () => {
  assert.equal(formatISODuration({ seconds: -30 }), '-PT30S');
  assert.equal(formatISODuration({ years: -1, months: 0 }), '-P1Y');
});

// ---------------------------------------------------------------------------
// format() null guards
// ---------------------------------------------------------------------------

test('cov: format() throws a typed error for null/undefined input', () => {
  assert.throws(() => format(null, 'yyyy'), /format\(\) expected a Temporal/);
  assert.throws(() => format(undefined, 'yyyy'), /format\(\) expected a Temporal/);
});

test('cov: format() tolerates an explicitly null options object', () => {
  const date = D('2026-08-04');
  assert.equal(format(date, 'yyyy', null), '2026');
});

// ---------------------------------------------------------------------------
// formatDistance readFields validation (year-DoS guards)
// ---------------------------------------------------------------------------

const BASE = D('2026-08-04');

test('cov: formatDistance rejects out-of-range and non-integer years', () => {
  assert.throws(() => formatDistance({ year: 275761, month: 1, day: 1 }, BASE), /outside the -271821..275760 range/);
  assert.throws(() => formatDistance({ year: 1.5, month: 1, day: 1 }, BASE), /outside the -271821..275760 range/);
  assert.throws(() => formatDistance({ year: Number.NaN, month: 1, day: 1 }, BASE), /outside the -271821..275760 range/);
});

test('cov: formatDistance rejects out-of-range months', () => {
  assert.throws(() => formatDistance({ year: 2026, month: 13, day: 1 }, BASE), /month 13 is not in 1..12/);
  assert.throws(() => formatDistance({ year: 2026, month: 0, day: 1 }, BASE), /month 0 is not in 1..12/);
});

test('cov: formatDistance rejects impossible days, including Feb 29 non-leap', () => {
  assert.throws(() => formatDistance({ year: 2026, month: 1, day: 32 }, BASE), /day 32 is not valid for year 2026/);
  assert.throws(() => formatDistance({ year: 2023, month: 2, day: 29 }, BASE), /day 29 is not valid for year 2023/);
  // Feb 29 on a leap year is fine (exercises the leap-year arm).
  assert.equal(formatDistance({ year: 2024, month: 2, day: 29 }, { year: 2024, month: 2, day: 29 }), 'now');
});

// ---------------------------------------------------------------------------
// holidays cache eviction
// ---------------------------------------------------------------------------

test('cov: holiday calendar cache evicts past 1000 years and stays correct', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1, name: 'New Year' }]);
  for (let y = 1000; y <= 2002; y++) {
    cal.isHoliday(D(`${String(y).padStart(4, '0')}-01-01`));
  }
  // Evicted years recompute on demand.
  assert.ok(cal.isHoliday(D('2026-01-01')));
  assert.ok(!cal.isHoliday(D('2026-08-04')));
});

// ---------------------------------------------------------------------------
// tokens: requireFields validation for multi-field tokens
// ---------------------------------------------------------------------------

test('cov: ww and D throw descriptive errors when required fields are missing', () => {
  assert.throws(() => format({ dayOfWeek: 2 }, 'ww'), /token "ww" requires "year"/);
  assert.throws(() => format({ day: 4 }, 'D'), /token "D" requires "year"/);
});

// ---------------------------------------------------------------------------
// parseRelative contradictory markers
// ---------------------------------------------------------------------------

test('cov: parseRelative rejects "in 3 days ago" as contradictory', () => {
  assert.throws(() => parseRelative('in 3 days ago', BASE), /contradictory direction markers/);
});

// ---------------------------------------------------------------------------
// relativeGrammar registration validation + matcher isolation
// ---------------------------------------------------------------------------

test('cov: registerRelativeGrammar enforces language and matcher limits', () => {
  assert.throws(() => registerRelativeGrammar({ language: 'x'.repeat(36), matchers: [() => null] }), /at most 35 characters/);
  assert.throws(
    () => registerRelativeGrammar({ language: 'ok', matchers: new Array(1001).fill(() => null) }),
    /at most 1000 matchers/,
  );
  assert.throws(() => registerRelativeGrammar({ language: 'ok', matchers: [() => null, 'nope'] }), /must all be functions/);
});

test('cov: a throwing registered matcher is isolated, later matchers still run', () => {
  registerRelativeGrammar({
    language: 'covaudit',
    matchers: [
      () => {
        throw new Error('matcher blew up');
      },
      (input) => (input === 'zapday' ? { year: 2030, month: 1, day: 1 } : null),
    ],
  });
  assert.equal(parseRelative('zapday', BASE, { locale: 'covaudit' }).toString(), '2030-01-01');
  // All matchers miss (one by throwing, one by null) -> English fallback.
  assert.throws(() => parseRelative('xyzzy-no-match', BASE, { locale: 'covaudit' }), Error);
});

// ---------------------------------------------------------------------------
// roundDuration fractional increment
// ---------------------------------------------------------------------------

test('cov: roundDuration rejects fractional rounding increments with a hint', () => {
  assert.throws(
    () => roundDuration({ hours: 5 }, { unit: 'hours', roundingIncrement: 2.5 }),
    /fractional increments aren't supported/,
  );
});

// ---------------------------------------------------------------------------
// timezone: findTransition with offset-less field bags
// ---------------------------------------------------------------------------

test('cov: getNextTransition derives the start offset for offset-less bags', () => {
  const bag = { year: 2026, month: 3, day: 1, hour: 12, minute: 0, second: 0, millisecond: 0, timeZoneId: 'America/New_York' };
  const next = getNextTransition(bag);
  assert.ok(next !== undefined);
  assert.equal(next.month, 3);
  assert.equal(next.day, 8); // 2026 spring-forward is Sunday March 8.
});

test('cov: getPreviousTransition works from offset-less bags too', () => {
  const bag = { year: 2026, month: 4, day: 1, hour: 12, minute: 0, second: 0, millisecond: 0, timeZoneId: 'America/New_York' };
  const prev = getPreviousTransition(bag);
  assert.ok(prev !== undefined);
  assert.equal(prev.month, 3);
  assert.equal(prev.day, 8);
});

test('cov: getNextTransition returns undefined when the bag cannot be resolved', () => {
  // An unresolvable timezone makes the offset-derivation lookup throw,
  // which findTranslation treats as "no answer" rather than crashing.
  const bag = { year: 2026, month: 1, day: 1, timeZoneId: 'Not/A_Real_Zone' };
  assert.equal(getNextTransition(bag), undefined);
});

test('cov: bisect probes that throw count as old-side and the day is the fallback', () => {
  // First from() call is the candidate-day detection (returns a new offset,
  // so a transition is "found"); every later call is a bisect probe that
  // throws — they must read as old-side, the search normalizes to the last
  // window minute, and the final reconstruction failure falls back to the
  // candidate day itself.
  let calls = 0;
  const fake = {
    ZonedDateTime: {
      from(f) {
        if (++calls === 1) return { offset: '+01:00', year: f.year, month: f.month, day: f.day, hour: 12, minute: 0 };
        throw new Error('probe failed');
      },
    },
  };
  setTemporal(fake);
  try {
    const r = getNextTransition(T.ZonedDateTime.from('2026-03-01T12:00[UTC]'));
    assert.ok(r !== undefined);
  } finally {
    setTemporal(T);
  }
});

test('cov: getTransitions rejects a non-date-carrying end', () => {
  const s = T.ZonedDateTime.from('2026-01-01T00:00[America/New_York]');
  assert.throws(() => getTransitions(s, {}), /date-carrying/);
});

// ---------------------------------------------------------------------------
// recurrence: validation, BYDAY ordinals, BYMONTHDAY (incl. negative),
// BYMONTH with yearly, weekly day-stepping, caps
// ---------------------------------------------------------------------------

const START = D('2026-01-01');
const iso = (v) => `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;

test('cov: recurrence validates count, interval, and byWeekdayOrdinal', () => {
  assert.throws(() => recurrence(START, { frequency: 'daily', count: 0 }), /count must be a positive safe integer/);
  assert.throws(() => recurrence(START, { frequency: 'daily', count: 1.5 }), /count must be a positive safe integer/);
  assert.throws(() => recurrence(START, { frequency: 'daily', interval: 0 }), /interval must be a positive safe integer/);
  assert.throws(() => recurrence(START, { frequency: 'daily', interval: 2.5 }), /interval must be a positive safe integer/);
  assert.throws(
    () => recurrence(START, { frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: 0, weekday: 1 }] }),
    /byWeekdayOrdinal entries need a nonzero ordinal/,
  );
  assert.throws(
    () => recurrence(START, { frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: 54, weekday: 1 }] }),
    /byWeekdayOrdinal entries need a nonzero ordinal/,
  );
  assert.throws(
    () => recurrence(START, { frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: 2, weekday: 8 }] }),
    /byWeekdayOrdinal entries need a nonzero ordinal/,
  );
});

test('cov: recurrence treats a missing or null interval as 1', () => {
  assert.deepEqual(take(recurrence(START, { frequency: 'daily' }), 2).map(iso), ['2026-01-01', '2026-01-02']);
  assert.deepEqual(take(recurrence(START, { frequency: 'daily', interval: null }), 2).map(iso), ['2026-01-01', '2026-01-02']);
});

test('cov: monthly BYDAY=2MO yields the 2nd Monday of each month', () => {
  const iter = recurrence(START, parseRRule('FREQ=MONTHLY;BYDAY=2MO'));
  assert.deepEqual(take(iter, 3).map(iso), ['2026-01-12', '2026-02-09', '2026-03-09']);
});

test('cov: monthly BYDAY=-1FR yields the last Friday of each month', () => {
  const iter = recurrence(START, parseRRule('FREQ=MONTHLY;BYDAY=-1FR'));
  assert.deepEqual(take(iter, 2).map(iso), ['2026-01-30', '2026-02-27']);
});

test('cov: monthly BYDAY=5MO skips months with only four Mondays', () => {
  // Jan/Feb 2026 have no 5th Monday; March does (the 30th).
  const iter = recurrence(START, parseRRule('FREQ=MONTHLY;BYDAY=5MO'));
  assert.deepEqual(take(iter, 1).map(iso), ['2026-03-30']);
});

test('cov: an impossible ordinal (BYDAY=-6MO) exhausts without matching', () => {
  const iter = recurrence(START, { frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: -6, weekday: 1 }] });
  assert.equal(iter.next().done, true);
});

test('cov: mixed byWeekday + ordinal rules match on either form', () => {
  // Day 1 of the month must be a Monday (plain) — day 1 is never a 2nd
  // Wednesday (ordinal), so months whose 1st isn't a Monday are rejected
  // via the both-false path. First hit: 2026-06-01 (a Monday).
  const rule = { frequency: 'monthly', byMonthDay: [1], byWeekday: [1], byWeekdayOrdinal: [{ ordinal: 2, weekday: 3 }] };
  assert.deepEqual(take(recurrence(START, rule), 1).map(iso), ['2026-06-01']);
});

test('cov: ordinal-only monthly rules reject non-matching generated candidates', () => {
  // Candidates are day 15; the ordinal demands the 1st Wednesday (day 1-7
  // territory) — never satisfiable, so the rule exhausts.
  const never = recurrence(START, { frequency: 'monthly', byMonthDay: [15], byWeekdayOrdinal: [{ ordinal: 1, weekday: 3 }] });
  assert.equal(never.next().done, true);
  // Day 3 is the 1st Wednesday in June 2026 -> matches there.
  const hit = recurrence(START, { frequency: 'monthly', byMonthDay: [3], byWeekdayOrdinal: [{ ordinal: 1, weekday: 3 }] });
  assert.deepEqual(take(hit, 1).map(iso), ['2026-06-03']);
});

test('cov: negative BYMONTHDAY resolves from the end of the month', () => {
  const iter = recurrence(D('2026-01-15'), parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1'));
  assert.deepEqual(take(iter, 3).map(iso), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('cov: yearly BYMONTH yields the listed months in order', () => {
  const iter = recurrence(START, { frequency: 'yearly', byMonth: [6, 3] });
  assert.deepEqual(take(iter, 3).map(iso), ['2026-03-01', '2026-06-01', '2027-03-01']);
});

test('cov: daily rules respect byMonth as a filter', () => {
  const iter = recurrence(START, { frequency: 'daily', byMonth: [6] });
  assert.deepEqual(take(iter, 1).map(iso), ['2026-06-01']);
});

test('cov: weekly BYDAY steps day-by-day from a non-matching start', () => {
  // Start is a Monday; BYDAY=SA -> first occurrence is the coming Saturday.
  const iter = recurrence(D('2026-01-05'), parseRRule('FREQ=WEEKLY;BYDAY=SA'));
  assert.deepEqual(take(iter, 3).map(iso), ['2026-01-10', '2026-01-17', '2026-01-24']);
});

test('cov: weekly BYDAY with INTERVAL=2 only emits in every other week', () => {
  const iter = recurrence(D('2026-01-10'), parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SA'));
  assert.deepEqual(take(iter, 3).map(iso), ['2026-01-10', '2026-01-24', '2026-02-07']);
});

test('cov: monthly rules skip months lacking the anchor day', () => {
  // Anchor day 31: February has none — Jan 31 -> Mar 31.
  const iter = recurrence(D('2026-01-31'), { frequency: 'monthly' });
  assert.deepEqual(take(iter, 2).map(iso), ['2026-01-31', '2026-03-31']);
});

test('cov: skip() refuses unbounded skips past a million occurrences', () => {
  const fakeIter = {
    next: () => ({ done: false, value: { year: 2026, month: 1, day: 1 } }),
    [Symbol.iterator]() {
      return this;
    },
  };
  assert.throws(() => skip(fakeIter, 1_000_001), /more than 1000000 occurrences/);
});

test('cov: between() refuses ranges that need over a million traversals', () => {
  const start = D('2026-01-01');
  const rule = { frequency: 'secondly' };
  assert.throws(
    () => between(start, rule, D('2026-01-10'), D('2026-03-01')),
    /walked more than 1000000 occurrences/,
  );
});

test('cov: parseRRule rejects malformed UNTIL dates and times', () => {
  assert.throws(() => parseRRule('FREQ=DAILY;UNTIL=20241301'), /out-of-range date/);
  assert.throws(() => parseRRule('FREQ=DAILY;UNTIL=20240132'), /out-of-range date/);
  assert.throws(() => parseRRule('FREQ=DAILY;UNTIL=20240110T250000Z'), /out-of-range time/);
});

test('cov: parseRRule rejects out-of-range BYDAY ordinals', () => {
  assert.throws(() => parseRRule('FREQ=MONTHLY;BYDAY=54MO'), /ordinal out of range/);
  // Two-digit ordinals within RFC 5545's -53..53 parse fine.
  const r = parseRRule('FREQ=YEARLY;BYDAY=53MO');
  assert.deepEqual(r.byWeekdayOrdinal, [{ ordinal: 53, weekday: 1 }]);
});

test('cov: formatRRule renders ordinal and merged BYDAY forms', () => {
  assert.equal(formatRRule({ frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] }), 'FREQ=MONTHLY;BYDAY=2MO');
  assert.equal(
    formatRRule({ frequency: 'weekly', byWeekday: [1, 2], byWeekdayOrdinal: [{ ordinal: -1, weekday: 5 }] }),
    'FREQ=WEEKLY;BYDAY=MO,TU,-1FR',
  );
});

test('cov: formatRRule stringifies out-of-map weekday numbers instead of crashing', () => {
  // formatRRule doesn't validate (recurrence() does) — programmatic rules
  // with invalid weekday numbers still render deterministically.
  assert.equal(formatRRule({ frequency: 'weekly', byWeekday: [8] }), 'FREQ=WEEKLY;BYDAY=8');
  assert.equal(formatRRule({ frequency: 'monthly', byWeekdayOrdinal: [{ ordinal: 2, weekday: 9 }] }), 'FREQ=MONTHLY;BYDAY=29');
  assert.equal(
    formatRRule({ frequency: 'weekly', byWeekday: [8], byWeekdayOrdinal: [{ ordinal: 2, weekday: 9 }] }),
    'FREQ=WEEKLY;BYDAY=8,29',
  );
});

// ---------------------------------------------------------------------------
// equal-starts endpoint ownership + remaining arms
// ---------------------------------------------------------------------------

test('cov: intersection with equal starts takes the conjunction', () => {
  const closed = intersection(iv('2026-01-01', '2026-01-10', 'closed'), iv('2026-01-01', '2026-01-05', 'closed'));
  assert.equal(closed.bounds, 'closed');
  // One side excludes the shared start -> intersection excludes it.
  const mixed = intersection(iv('2026-01-01', '2026-01-10', 'half-open-start'), iv('2026-01-01', '2026-01-05', 'half-open-start'));
  assert.equal(mixed.bounds, 'half-open-start');
});

test('cov: union with equal starts takes the disjunction', () => {
  const closed = union(iv('2026-01-01', '2026-01-05', 'closed'), iv('2026-01-01', '2026-01-10', 'closed'));
  assert.equal(closed.bounds, 'closed');
  // Neither side owns the shared start -> union excludes it.
  const open = union(iv('2026-01-01', '2026-01-05', 'half-open-start'), iv('2026-01-01', '2026-01-10', 'half-open-start'));
  assert.equal(open.bounds, 'half-open-start');
});

test('cov: difference after-part keeps an exclusive a-end', () => {
  // [1,10) - [3,5): after-part is [5,10) — b excluded its end, a excludes its own.
  const r = intervalDifference(iv('2026-01-01', '2026-01-10', 'half-open-end'), iv('2026-01-03', '2026-01-05', 'half-open-end'));
  assert.equal(r.length, 2);
  assert.equal(r[1].bounds, 'half-open-end');
});

test('cov: merge extension with an exclusive current end', () => {
  // [1,5] + [2,10): end extends to 10, exclusive.
  const m = mergeIntervals([iv('2026-01-01', '2026-01-05', 'closed'), iv('2026-01-02', '2026-01-10', 'half-open-end')]);
  assert.equal(m.length, 1);
  assert.equal(m[0].bounds, 'half-open-end');
});

// ---------------------------------------------------------------------------
// recurrence: bag starts, yearly ordinals, multi-day BYMONTHDAY
// ---------------------------------------------------------------------------

test('cov: field-bag starts without dayOfWeek work for BYDAY rules', () => {
  // The iterator derives dayOfWeek for bag starts, so a daily Tuesday rule
  // from a Monday bag start finds the coming Tuesday (used to be empty).
  const iter = recurrence({ year: 2026, month: 1, day: 5 }, { frequency: 'daily', byWeekday: [2] });
  assert.deepEqual(take(iter, 2).map(iso), ['2026-01-06', '2026-01-13']);
});

test('cov: yearly ordinal BYDAY yields the 1st weekday of each year', () => {
  const iter = recurrence(START, { frequency: 'yearly', byWeekdayOrdinal: [{ ordinal: 1, weekday: 3 }] });
  assert.deepEqual(take(iter, 2).map(iso), ['2026-01-07', '2027-01-06']);
});

test('cov: multi-value BYMONTHDAY yields same-month days in order', () => {
  const iter = recurrence(START, { frequency: 'monthly', byMonthDay: [1, 15] });
  assert.deepEqual(take(iter, 3).map(iso), ['2026-01-01', '2026-01-15', '2026-02-01']);
});
