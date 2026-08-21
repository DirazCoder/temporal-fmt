import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  between,
  formatRRule,
  parseRRule,
  recurrence,
  round,
  setTemporal,
  skip,
  take,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function iso(v) {
  return `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
}

test('recurrence: previous() walks back through history after next()', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const iter = recurrence(start, { frequency: 'daily', interval: 1 });
  iter.next();
  iter.next();
  iter.next();
  const back1 = iter.previous();
  const back2 = iter.previous();
  assert.equal(iso(back1.value), '2026-01-03');
  assert.equal(iso(back2.value), '2026-01-02');
});

test('recurrence: previous() returns done once history is exhausted', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const iter = recurrence(start, { frequency: 'daily', interval: 1 });
  iter.next();
  iter.previous();
  const result = iter.previous();
  assert.equal(result.done, true);
  assert.equal(result.value, undefined);
});

test('recurrence: previous() with no prior next() call returns done', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const iter = recurrence(start, { frequency: 'daily', interval: 1 });
  const result = iter.previous();
  assert.equal(result.done, true);
});

test('skip: advances past N occurrences before collecting the rest', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, count: 5 };
  const iter = recurrence(start, rule);
  const remaining = skip(iter, 2);
  assert.equal(remaining.length, 3);
  assert.equal(iso(remaining[0]), '2026-01-03');
});

test('skip: skipping past the end leaves nothing to collect', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, count: 2 };
  const iter = recurrence(start, rule);
  const remaining = skip(iter, 10);
  assert.equal(remaining.length, 0);
});

test('between: includes occurrences in [rangeStart, rangeEnd)', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1 };
  const results = between(start, rule, Temporal.PlainDate.from('2026-01-03'), Temporal.PlainDate.from('2026-01-06'));
  assert.deepEqual(results.map(iso), ['2026-01-03', '2026-01-04', '2026-01-05']);
});

test('between: an empty range before any occurrence returns nothing', () => {
  const start = Temporal.PlainDate.from('2026-01-10');
  const rule = { frequency: 'daily', interval: 1, count: 3 };
  const results = between(start, rule, Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-05'));
  assert.deepEqual(results, []);
});

test('recurrence: byWeekday filters to matching ISO weekdays only', () => {
  // 2026-01-01 is a Thursday. byWeekday [1,3] = Mon/Wed.
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, byWeekday: [1, 3] };
  const iter = recurrence(start, rule);
  const results = take(iter, 3).map(iso);
  // Nearest Mon/Wed on or after Jan 1 2026: Mon Jan 5, Wed Jan 7, Mon Jan 12.
  assert.deepEqual(results, ['2026-01-05', '2026-01-07', '2026-01-12']);
});

test('recurrence: byMonthDay filters to matching days of month', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, byMonthDay: [15] };
  const iter = recurrence(start, rule);
  const results = take(iter, 2).map(iso);
  assert.deepEqual(results, ['2026-01-15', '2026-02-15']);
});

test('recurrence: byMonth filters to matching months, stepping monthly', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'monthly', interval: 1, byMonth: [3, 6] };
  const iter = recurrence(start, rule);
  const results = take(iter, 2).map(iso);
  assert.deepEqual(results, ['2026-03-01', '2026-06-01']);
});

test('recurrence: exDates skips a date that would otherwise match', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, exDates: [Temporal.PlainDate.from('2026-01-02')] };
  const iter = recurrence(start, rule);
  const results = take(iter, 3).map(iso);
  assert.deepEqual(results, ['2026-01-01', '2026-01-03', '2026-01-04']);
});

test('recurrence: until stops iteration once a candidate passes the cutoff', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, until: Temporal.PlainDate.from('2026-01-03') };
  const iter = recurrence(start, rule);
  const results = take(iter, 100).map(iso);
  assert.deepEqual(results, ['2026-01-01', '2026-01-02', '2026-01-03']);
});

test('recurrence: until in the past relative to start ends immediately', () => {
  const start = Temporal.PlainDate.from('2026-01-05');
  const rule = { frequency: 'daily', interval: 1, until: Temporal.PlainDate.from('2026-01-01') };
  const iter = recurrence(start, rule);
  const result = iter.next();
  assert.equal(result.done, true);
});

test('recurrence: start not matching the rule advances to the first real match', () => {
  // Start on a Thursday but only allow Mondays (weekday 1).
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, byWeekday: [1] };
  const iter = recurrence(start, rule);
  const first = iter.next();
  assert.equal(iso(first.value), '2026-01-05');
});

test('recurrence: an impossible rule bails out via the safety counter instead of looping forever', () => {
  // byMonthDay 31 combined with byMonth [2] can never match (Feb never has 31 days).
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, byMonthDay: [31], byMonth: [2] };
  const iter = recurrence(start, rule);
  const result = iter.next();
  assert.equal(result.done, true);
});

for (const [frequency, unit] of [
  ['secondly', 'second'],
  ['minutely', 'minute'],
  ['hourly', 'hour'],
]) {
  test(`recurrence: ${frequency} frequency advances by one ${unit}`, () => {
    const start = Temporal.PlainDateTime.from('2026-01-01T00:00:00');
    const rule = { frequency, interval: 1 };
    const iter = recurrence(start, rule);
    const results = take(iter, 2);
    assert.equal(results[1][unit], 1);
  });
}

test('recurrence: weekly frequency advances by 7 days', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'weekly', interval: 1 };
  const iter = recurrence(start, rule);
  const results = take(iter, 2).map(iso);
  assert.deepEqual(results, ['2026-01-01', '2026-01-08']);
});

test('recurrence: yearly frequency advances by one year', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'yearly', interval: 1 };
  const iter = recurrence(start, rule);
  const results = take(iter, 2).map(iso);
  assert.deepEqual(results, ['2026-01-01', '2027-01-01']);
});

test('parseRRule: ignores an RRULE: prefix', () => {
  const r = parseRRule('RRULE:FREQ=WEEKLY');
  assert.equal(r.frequency, 'weekly');
});

test('parseRRule: skips blank segments and parts with no "=" sign', () => {
  const r = parseRRule('FREQ=DAILY;;GARBAGE;INTERVAL=3');
  assert.equal(r.frequency, 'daily');
  assert.equal(r.interval, 3);
});

test('parseRRule: BYDAY parses simple weekday codes', () => {
  const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  assert.deepEqual(r.byWeekday, [1, 3, 5]);
});

test('parseRRule: BYDAY tolerates an ordinal prefix like the RFC 5545 "2MO" form', () => {
  const r = parseRRule('FREQ=MONTHLY;BYDAY=2MO');
  assert.deepEqual(r.byWeekday, [1]);
});

test('parseRRule: an unrecognized BYDAY code maps to 0', () => {
  const r = parseRRule('FREQ=WEEKLY;BYDAY=ZZ');
  assert.deepEqual(r.byWeekday, [0]);
});

test('parseRRule: BYMONTHDAY parses a comma-separated list of days', () => {
  const r = parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,15,-1');
  assert.deepEqual(r.byMonthDay, [1, 15, -1]);
});

test('parseRRule: BYMONTH parses a comma-separated list of months', () => {
  const r = parseRRule('FREQ=YEARLY;BYMONTH=3,6,9');
  assert.deepEqual(r.byMonth, [3, 6, 9]);
});

test('parseRRule: UNTIL is kept as the raw string for the caller to convert', () => {
  const r = parseRRule('FREQ=DAILY;UNTIL=20260301');
  assert.equal(r.until, '20260301');
});

test('formatRRule: omits INTERVAL when it is the default of 1', () => {
  const formatted = formatRRule({ frequency: 'daily', interval: 1 });
  assert.equal(formatted, 'FREQ=DAILY');
});

test('formatRRule: includes INTERVAL when not 1', () => {
  const formatted = formatRRule({ frequency: 'daily', interval: 3 });
  assert.equal(formatted, 'FREQ=DAILY;INTERVAL=3');
});

test('formatRRule: includes UNTIL when present', () => {
  const formatted = formatRRule({ frequency: 'daily', interval: 1, until: '20260301' });
  assert.equal(formatted, 'FREQ=DAILY;UNTIL=20260301');
});

test('formatRRule: includes BYDAY built from byWeekday', () => {
  const formatted = formatRRule({ frequency: 'weekly', interval: 1, byWeekday: [1, 5] });
  assert.equal(formatted, 'FREQ=WEEKLY;BYDAY=MO,FR');
});

test('formatRRule: includes BYMONTHDAY when present', () => {
  const formatted = formatRRule({ frequency: 'monthly', interval: 1, byMonthDay: [1, 15] });
  assert.equal(formatted, 'FREQ=MONTHLY;BYMONTHDAY=1,15');
});

test('formatRRule: includes BYMONTH when present', () => {
  const formatted = formatRRule({ frequency: 'yearly', interval: 1, byMonth: [3, 6] });
  assert.equal(formatted, 'FREQ=YEARLY;BYMONTH=3,6');
});

test('formatRRule: combines every optional field in one rule', () => {
  const rule = {
    frequency: 'monthly',
    interval: 2,
    count: 5,
    until: '20261231',
    byWeekday: [1],
    byMonthDay: [1],
    byMonth: [1, 7],
  };
  const formatted = formatRRule(rule);
  assert.equal(
    formatted,
    'FREQ=MONTHLY;INTERVAL=2;COUNT=5;UNTIL=20261231;BYDAY=MO;BYMONTHDAY=1;BYMONTH=1,7'
  );
});

test('matches: a start value missing dayOfWeek falls back to 0 in the byWeekday check', () => {
  // Caller-supplied start values that skip the derived dayOfWeek field
  // (rather than a real Temporal value) fall back to 0 via `v.dayOfWeek
  // ?? 0`. Rule includes 0 (not a real ISO weekday) so the very first
  // matches() check succeeds on the fallback, without ever advancing —
  // advancing would call add(), which requires day/month/year and would
  // throw for an under-specified start.
  const iter = recurrence({ year: 2026, month: 1, day: 1 }, { frequency: 'daily', interval: 1, byWeekday: [0], count: 1 });
  const r = iter.next();
  assert.equal(r.done, false);
});

test('matches: a start value missing day falls back to 0 in the byMonthDay check', () => {
  const iter = recurrence({ year: 2026, month: 1 }, { frequency: 'daily', interval: 1, byMonthDay: [0], count: 1 });
  const r = iter.next();
  assert.equal(r.done, false);
});

test('matches: a start value missing month falls back to 0 in the byMonth check', () => {
  const iter = recurrence({ year: 2026 }, { frequency: 'monthly', interval: 1, byMonth: [0], count: 1 });
  const r = iter.next();
  assert.equal(r.done, false);
});

test('recurrence: count limit reached on the very first (atStart) match ends iteration immediately', () => {
  const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, count: 1 });
  const r1 = iter.next();
  assert.equal(r1.done, false);
  const r2 = iter.next();
  assert.equal(r2.done, true);
});

test('recurrence: count limit reached on the first advanced match (start itself did not match) ends iteration immediately', () => {
  // 2026-01-01 is a Thursday; byWeekday [1] (Monday) excludes it, so
  // next() must advance past `start` before finding the first match —
  // a different code path than the test above, which matches on `start`
  // itself with no advance needed.
  const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1, byWeekday: [1], count: 1 });
  const r1 = iter.next();
  assert.equal(r1.done, false);
  assert.equal(r1.value.dayOfWeek, 1);
  const r2 = iter.next();
  assert.equal(r2.done, true);
});

test('between: the iterator exhausting itself (r.done) ends the loop before rangeEnd is ever reached', () => {
  // count:3 exhausts the iterator well before the far-future rangeEnd,
  // so the loop's `if (r.done) break` fires — not the rangeEnd compare.
  const results = between(
    Temporal.PlainDate.from('2026-01-01'),
    { frequency: 'daily', interval: 1, count: 3 },
    Temporal.PlainDate.from('2026-01-01'),
    Temporal.PlainDate.from('2030-01-01'),
  );
  assert.equal(results.length, 3);
});

test('parseRRule: a BYDAY entry that fails the weekday regex maps to 0 instead of throwing', () => {
  const rule = parseRRule('FREQ=WEEKLY;BYDAY=MO,bogus,WE');
  assert.deepEqual(rule.byWeekday, [1, 0, 3]);
});

// ============== Section T: recurrence ==============
test('recurrence + take: returns N occurrences', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1 };
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 5);
  assert.equal(occurrences.length, 5);
  // First occurrence is the start itself.
  assert.equal(occurrences[0].toString(), '2026-01-01');
  // Subsequent occurrences are field bags from add() — convert to ISO string.
  assert.equal(`${occurrences[4].year}-${String(occurrences[4].month).padStart(2,'0')}-${String(occurrences[4].day).padStart(2,'0')}`, '2026-01-05');
});

test('recurrence: respects interval', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 7 }; // weekly
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 3);
  assert.equal(`${occurrences[1].year}-${String(occurrences[1].month).padStart(2,'0')}-${String(occurrences[1].day).padStart(2,'0')}`, '2026-01-08');
});

test('recurrence: respects count', () => {
  const start = Temporal.PlainDate.from('2026-01-01');
  const rule = { frequency: 'daily', interval: 1, count: 3 };
  const iter = recurrence(start, rule);
  const occurrences = take(iter, 100);
  assert.equal(occurrences.length, 3);
});

test('parseRRule: parses FREQ=DAILY;INTERVAL=2;COUNT=5', () => {
  const r = parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=5');
  assert.equal(r.frequency, 'daily');
  assert.equal(r.interval, 2);
  assert.equal(r.count, 5);
});

test('formatRRule: round-trips through parseRRule', () => {
  const rule = { frequency: 'weekly', interval: 2, count: 10 };
  const formatted = formatRRule(rule);
  const reparsed = parseRRule(formatted);
  assert.equal(reparsed.frequency, rule.frequency);
  assert.equal(reparsed.interval, rule.interval);
  assert.equal(reparsed.count, rule.count);
});
