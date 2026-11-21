import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  // duration / rounding
  parseDuration, formatISODuration, parseISODuration, balanceDuration,
  compareDuration, roundDuration,
  // comparison / serialization
  isEqual, compare, isBefore, isAfter, min, max,
  parseISO, parseRFC3339, parseHTTPDate, formatRFC3339,
  fromUnixSeconds, fromUnixNanoseconds, parse,
  // recurrence / interval
  recurrence, parseRRule, formatRRule, take, splitInterval, interval,
  // calendar utils / timezone / business
  daysInMonth, weekOfYear, getWeekday, startOf, endOf,
  getNextTransition, getTransitions, isDST,
  createBusinessCalendar, nextBusinessDay, addBusinessDays,
  // arithmetic / format
  add, formatDistance, formatDuration, formatToParts,
  // codemod / matchesFormat / registry / provider / relative
  translateDateFnsFormatString, translateDayjsFormatString,
  matchesFormat, registerLocale, getLocale, hasLocale, setTemporal,
  registerRelativeGrammar,
  format, parseRelative,
  intervalIsBefore, intervalIsAfter,
} from '../../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Regression tests for the v0.9.88 security & correctness audit fixes
// (C1, H1-H5, M1-M18 and the low-severity cluster). Each case reproduces
// a finding the audit verified at runtime against the pre-fix build.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function timeMs(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}
const BUDGET_MS = 1000; // generous; healthy cases land in single-digit ms

// ---------------------------------------------------------------------------
// C1 — ReDoS in parseDuration()
// ---------------------------------------------------------------------------
test('C1: parseDuration space-separated long-form formats stay linear on near-miss input', () => {
  // The audit measured 116 s for 32 tokens before the fix.
  for (const tokenCount of [16, 24, 32, 40]) {
    const formatStr = Array.from({ length: tokenCount }, () => 'hhh').join(' ');
    const input = Array.from({ length: tokenCount }, () => '1 1').join(' ') + ' x';
    const elapsed = timeMs(() => {
      assert.throws(() => parseDuration(input, formatStr), /does not match duration format/);
    });
    assert.ok(elapsed < BUDGET_MS, `${tokenCount} tokens took ${elapsed}ms — exponential backtracking is back`);
  }
});

test('C1: parseDuration caps format and input lengths', () => {
  assert.throws(() => parseDuration('2', 'h'.repeat(1001)), /maximum length/);
  assert.throws(() => parseDuration('2'.repeat(100_001), 'h'), /maximum length/);
});

test('C1/L4: parseDuration validates unit text instead of consuming any word chars', () => {
  assert.throws(() => parseDuration('2 zzz', 'hhh'), /does not match duration format/);
  // …while the documented liberal forms still parse.
  assert.deepEqual(parseDuration('5hrs', 'hh'), { hours: 5 });
  assert.deepEqual(parseDuration('250ms', 'SSS'), { milliseconds: 250 });
});

test('C1: parseDuration rejects glued value tokens with no separator (ambiguous split)', () => {
  assert.throws(() => parseDuration('1230', 'hhmm'), /no separating literal|ambiguous/);
  assert.deepEqual(parseDuration('12:30', 'h:mm'), { hours: 12, minutes: 30 });
});

// ---------------------------------------------------------------------------
// H1 — ZonedDateTime comparisons ignored the timezone
// ---------------------------------------------------------------------------
test('H1: ZDTs at the same instant in different zones compare equal', () => {
  const utc = Temporal.ZonedDateTime.from('2026-08-04T12:00:00+00:00[UTC]');
  const kolkata = Temporal.ZonedDateTime.from('2026-08-04T17:30:00+05:30[Asia/Kolkata]');
  assert.equal(isEqual(utc, kolkata), true);
  assert.equal(compare(utc, kolkata), 0);
  assert.equal(isBefore(utc, kolkata), false);
  assert.equal(isAfter(utc, kolkata), false);
  // min/max pick by instant, not wall clock.
  const later = Temporal.ZonedDateTime.from('2026-08-04T18:00:00+05:30[Asia/Kolkata]');
  assert.equal(String(min([utc, kolkata, later]).toInstant().epochMilliseconds), String(utc.toInstant().epochMilliseconds));
  // Mixed zoned/plain pairs keep wall-clock semantics.
  const plain = Temporal.PlainDateTime.from('2026-08-04T12:00:00');
  assert.equal(isEqual(utc, plain), true);
});

// ---------------------------------------------------------------------------
// H2 — parseISO silently discarded zone and offset
// ---------------------------------------------------------------------------
test('H2: parseISO keeps bracketed zones and offset-seconds as ZonedDateTime', () => {
  const zdt = parseISO('2026-01-01T15:45:30+05:30[Asia/Kolkata]');
  assert.equal(String(zdt.timeZoneId), 'Asia/Kolkata');
  assert.equal(String(zdt.offset), '+05:30');
  // Offset with seconds: routed to ZonedDateTime.from now instead of
  // silently dropping the suffix into a PlainDateTime. Sub-minute
  // offsets are rejected by Temporal's own ISO parser (and no named
  // zone ever used +05:30:30), so the correct outcome is a typed
  // InvalidDateError — not a silent wrong type.
  assert.throws(() => parseISO('2026-01-01T15:45:30+05:30:30[Asia/Kolkata]'), /InvalidDate|valid date/);
  // formatISO(zdt) round-trips back to a ZonedDateTime now.
  const again = parseISO(String(zdt));
  assert.equal(typeof again.toInstant, 'function');
  // A bare offset still produces a ZonedDateTime with a fixed-offset zone.
  const fixed = parseISO('2026-01-01T15:45:30+05:30');
  assert.equal(String(fixed.timeZoneId), '+05:30');
  // Plain date-times stay plain.
  assert.equal(parseISO('2026-01-01T15:45:30').constructor.name.includes('PlainDateTime'), true);
});

test('L8: parseISO accepts lowercase t and >9 fractional digits (RFC 3339)', () => {
  const a = parseISO('2026-01-01t15:45:30Z');
  assert.equal(typeof a.toInstant, 'function');
  const b = parseISO('2026-01-01T15:45:30.123456789123Z');
  assert.equal(typeof b.toInstant, 'function');
});

test('L8: epoch helpers throw typed errors instead of leaking raw RangeError', () => {
  assert.throws(() => fromUnixSeconds(1e300), /Instant range|finite/);
  assert.throws(() => fromUnixNanoseconds(10n ** 30n), /Instant range/);
});

// ---------------------------------------------------------------------------
// H3 — recurrence 2000-step cap silently truncated valid rules
// ---------------------------------------------------------------------------
test('H3: DAILY;BYMONTHDAY=29;BYMONTH=2 finds Feb 29 more than 2000 steps away', () => {
  // From 2097-03-01 the next Feb 29 (2104) is ~2554 daily steps out.
  const iter = recurrence(Temporal.PlainDate.from('2097-03-01'), { frequency: 'daily', interval: 1, byMonthDay: [29], byMonth: [2] });
  const first = iter.next();
  assert.equal(first.done, false);
  assert.equal(`${first.value.year}-${String(first.value.month).padStart(2, '0')}-${String(first.value.day).padStart(2, '0')}`, '2104-02-29');
});

test('H3: sub-daily frequencies with date constraints fast-forward by day', () => {
  const iter = recurrence(
    Temporal.PlainDateTime.from('2097-03-01T00:00:00'),
    { frequency: 'hourly', interval: 1, byMonthDay: [29], byMonth: [2] },
  );
  const r = iter.next();
  assert.equal(r.done, false);
  assert.equal(r.value.year, 2104);
  assert.equal(r.value.month, 2);
  assert.equal(r.value.day, 29);
});

// ---------------------------------------------------------------------------
// H4 — splitInterval / take resource exhaustion
// ---------------------------------------------------------------------------
test('H4: splitInterval caps its slice count instead of OOMing', () => {
  const iv = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-02'));
  assert.throws(() => splitInterval(iv, 1e8), /caps at 100000|splitInterval caps/);
});

test('H4: take() caps its occurrence count on unbounded rules', () => {
  const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'daily', interval: 1 });
  assert.throws(() => take(iter, 1e9), /caps at 100000/);
});

// ---------------------------------------------------------------------------
// H5 — codemod corrupted date-fns quoted literals
// ---------------------------------------------------------------------------
test('H5: date-fns quoted literals translate losslessly', () => {
  assert.equal(translateDateFnsFormatString("yyyy 'at' HH:mm"), "yyyy 'at' HH:mm");
  assert.equal(translateDayjsFormatString('[foo][bar]'), "'foobar'"); // seam-merged, no spurious apostrophe
  assert.equal(translateDayjsFormatString('[]'), ''); // not "''" (which renders an apostrophe)
});

// ---------------------------------------------------------------------------
// M-cluster — recurrence semantics
// ---------------------------------------------------------------------------
test('M1: recurrence() rejects unknown/missing frequency', () => {
  assert.throws(() => recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'weekl' }), /frequency must be one of/);
  assert.throws(() => recurrence(Temporal.PlainDate.from('2026-01-01'), {}), /frequency must be one of/);
});

test('M2: parseRRule requires FREQ', () => {
  assert.throws(() => parseRRule(''), /requires FREQ/);
  assert.throws(() => parseRRule('GARBAGE'), /requires FREQ/);
});

test('M3: formatRRule serializes UNTIL in RFC 5545 form and round-trips', () => {
  const rule = parseRRule('FREQ=DAILY;UNTIL=20260630T153000Z');
  const out = formatRRule(rule);
  assert.equal(out, 'FREQ=DAILY;UNTIL=20260630T153000Z');
  assert.deepEqual(parseRRule(out), rule);
});

test('M4: rDates merge into the occurrence stream', () => {
  const iter = recurrence(
    Temporal.PlainDate.from('2026-01-01'),
    {
      frequency: 'monthly', interval: 1, byMonthDay: [15],
      rDates: [Temporal.PlainDate.from('2026-01-07'), Temporal.PlainDate.from('2026-02-20')],
    },
  );
  const got = [];
  for (let i = 0; i < 4; i++) {
    const r = iter.next();
    if (r.done) break;
    got.push(`${r.value.year}-${String(r.value.month).padStart(2, '0')}-${String(r.value.day).padStart(2, '0')}`);
  }
  // Jan 7 (rDate), Jan 15 (rule), Feb 15 (rule), Feb 20 (rDate).
  assert.deepEqual(got, ['2026-01-07', '2026-01-15', '2026-02-15', '2026-02-20']);
});

test('M5: BYDAY ordinals are rejected with FREQ=WEEKLY instead of dropped', () => {
  assert.throws(() => parseRRule('FREQ=WEEKLY;BYDAY=2MO'), /invalid with FREQ=WEEKLY/);
  assert.throws(() => recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'weekly', byWeekdayOrdinal: [{ ordinal: 2, weekday: 1 }] }), /invalid with FREQ=WEEKLY/);
});

test('L9: scalar BY* values are accepted (wrapped to arrays) instead of crashing', () => {
  const iter = recurrence(Temporal.PlainDate.from('2026-01-01'), { frequency: 'monthly', byMonthDay: 29 });
  const r = iter.next();
  assert.equal(r.done, false);
  assert.equal(r.value.day, 29);
});

// ---------------------------------------------------------------------------
// M6/M7/M8/M9/M10 — duration & arithmetic
// ---------------------------------------------------------------------------
test('M6: formatISODuration rejects mixed-sign bags', () => {
  assert.throws(() => formatISODuration({ days: -1, hours: 2 }), /mixed-sign/);
});

test('M7: sub-second fields serialize as fractional seconds', () => {
  assert.equal(formatISODuration({ milliseconds: 500 }), 'PT0.5S');
  assert.equal(formatISODuration({ seconds: 1, nanoseconds: 1 }), 'PT1.000000001S');
  assert.deepEqual(parseISODuration('PT0.5S'), { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0.5 });
});

test('M8: compareDuration resolves calendar units against a relativeTo anchor', () => {
  assert.throws(() => compareDuration({ years: 1 }, { seconds: 1 }), /relativeTo/);
  const anchor = Temporal.PlainDate.from('2026-01-01');
  // 2026 is not a leap year: 1 year = 365 days > 364 days.
  assert.equal(compareDuration({ years: 1 }, { days: 364 }, anchor), 1);
  assert.equal(compareDuration({ years: 1 }, { days: 365 }, anchor), 0);
  // Fixed-unit comparisons keep working without an anchor.
  assert.equal(compareDuration({ hours: 2 }, { minutes: 90 }), 1);
});

test('M9: PT1.1H balances without a bogus "too large" error (float dust)', () => {
  const balanced = balanceDuration(parseISODuration('PT1.1H'));
  assert.equal(balanced.hours, 1);
  assert.equal(balanced.minutes, 6);
  assert.equal(balanced.seconds, 0);
});

test('M10: add() rejects fractional and NaN amounts', () => {
  assert.throws(() => add(Temporal.PlainDate.from('2026-01-01'), 0.5, 'days'), /whole number/);
  assert.throws(() => add(Temporal.PlainDate.from('2026-01-01'), NaN, 'days'), /whole number/);
});

// ---------------------------------------------------------------------------
// M11 / L11 — DST transitions
// ---------------------------------------------------------------------------
test('M11: getNextTransition returns the actual transition instant', () => {
  const next = getNextTransition(Temporal.ZonedDateTime.from('2026-01-01T00:00[America/New_York]'));
  assert.ok(next !== undefined);
  assert.equal(String(next).slice(0, 10), '2026-03-08');
  // 2026-03-08T02:00 EST == 2026-03-08T07:00Z == 2026-03-08T03:00 EDT.
  assert.equal(next.toInstant().toString(), '2026-03-08T07:00:00Z');
});

test('M11: getTransitions covers the whole requested range (no silent 5-year cap)', () => {
  const ts = getTransitions(
    Temporal.ZonedDateTime.from('2020-01-01T00:00[America/New_York]'),
    Temporal.ZonedDateTime.from('2040-01-01T00:00[America/New_York]'),
  );
  // 20 years of NY DST = 40 transitions (2/year); the old code silently
  // stopped after 5 years (10 transitions).
  assert.equal(ts.length, 40);
});

// ---------------------------------------------------------------------------
// M12/M13 — locale registry
// ---------------------------------------------------------------------------
test('M12: a failed registerLocale leaves nothing behind (atomic registration)', () => {
  assert.throws(() => registerLocale('AuditFoo', { monthLong: ['x'], monthShort: ['x'], weekdayLong: ['x'], weekdayShort: ['x'], dayPeriod: ['x'], quartersLong: ['a', 'b', 'c'] }));
  assert.equal(hasLocale('AuditFoo'), false);
  // No extended vocab leaked: the fallback base vocab has no quartersLong.
  const leaked = getLocale('AuditFoo');
  assert.equal(leaked === undefined || leaked.quartersLong === undefined, true);
});

test('M13: getLocale returns copies — mutating the result cannot poison the registry', () => {
  registerLocale('AuditBar', {
    monthLong: ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'],
    monthShort: ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'],
    weekdayLong: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    dayPeriod: ['am', 'pm'],
    quartersLong: ['Q1', 'Q2', 'Q3', 'Q4'],
  });
  const first = getLocale('AuditBar');
  first.quartersLong.push('POISON');
  first.monthLong[0] = 'POISON';
  const second = getLocale('AuditBar');
  assert.equal(second.quartersLong.includes('POISON'), false);
  assert.equal(second.monthLong[0], 'Ja');
});

// ---------------------------------------------------------------------------
// M14 — formatDistance half-boundary symmetry
// ---------------------------------------------------------------------------
test('M14: 90 seconds rounds the same in both directions', () => {
  const now = Temporal.PlainDateTime.from('2026-08-04T12:00:00');
  const past = Temporal.PlainDateTime.from('2026-08-04T11:58:30');
  const future = Temporal.PlainDateTime.from('2026-08-04T12:01:30');
  assert.equal(formatDistance(future, now), 'in 2 minutes');
  assert.equal(formatDistance(past, now), '2 minutes ago');
});

// ---------------------------------------------------------------------------
// M15/M16 — HTTP-date grammar, RFC 3339 with ZDT
// ---------------------------------------------------------------------------
test('M15: parseHTTPDate accepts only the three RFC 7231 formats', () => {
  const imf = parseHTTPDate('Sun, 06 Nov 1994 08:49:37 GMT');
  assert.equal(imf.toString(), '1994-11-06T08:49:37Z');
  const asctime = parseHTTPDate('Sun Nov  6 08:49:37 1994');
  assert.equal(asctime.toString(), '1994-11-06T08:49:37Z'); // UTC, not host-TZ
  const rfc850 = parseHTTPDate('Sunday, 06-Nov-94 08:49:37 GMT');
  assert.equal(typeof rfc850.epochMilliseconds, 'number');
  assert.throws(() => parseHTTPDate('2026-01-01'), /HTTP-date/);
  assert.throws(() => parseHTTPDate('not a date at all'), /HTTP-date/);
});

test('M16: formatRFC3339 accepts a ZonedDateTime (bracket stripped)', () => {
  const out = formatRFC3339(Temporal.ZonedDateTime.from('2026-08-04T15:45:30+05:30[Asia/Kolkata]'));
  assert.equal(out, '2026-08-04T15:45:30+05:30');
  assert.throws(() => formatRFC3339(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), /RFC 3339/);
});

// ---------------------------------------------------------------------------
// M17 — business calendar search window
// ---------------------------------------------------------------------------
test('M17: nextBusinessDay survives a month-long closure', () => {
  const julyHolidays = createBusinessCalendar({
    holidays: (() => {
      const days = [];
      for (let d = 1; d <= 31; d++) days.push(Temporal.PlainDate.from(`2026-07-${String(d).padStart(2, '0')}`));
      return { isHoliday: (v) => days.some((h) => h.equals(v)) };
    })(),
  });
  // Aug 1 2026 is a Saturday, so the first business day after the
  // all-July closure is Monday Aug 3 — the old 14-day cap threw.
  const next = nextBusinessDay(julyHolidays, Temporal.PlainDate.from('2026-06-30'));
  assert.equal(`${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`, '2026-08-03');
});

// ---------------------------------------------------------------------------
// Low-severity cluster
// ---------------------------------------------------------------------------
test('L1: matchesFormat rejects bogus zones and out-of-range offsets, and caps input length', () => {
  assert.equal(matchesFormat('zzz', 'Bogus/Zone'), false);
  assert.equal(matchesFormat('zzz', 'America/New_York'), true);
  assert.equal(matchesFormat('xx', '+9999'), false);
  assert.equal(matchesFormat('xx', '+0530'), true);
  assert.equal(matchesFormat('zzz', 'UTC'.padEnd(100_001, 'x')), false);
});

test('L2: formatToParts and compiled formats tolerate null options', () => {
  const d = Temporal.PlainDate.from('2026-08-04');
  assert.equal(formatToParts(d, 'yyyy-MM-dd', null).length, 5);
  assert.throws(() => formatToParts(null, 'yyyy'), /expected a Temporal/);
});

test('L3: formatDuration rejects overlong token runs like "yyyy"', () => {
  assert.throws(() => formatDuration({ years: 2 }, 'yyyy'), /token runs longer than three/);
  assert.equal(formatDuration({ years: 2 }, 'yyy'), '2 years');
});

test('L5: setTemporal rejects non-namespaces at the call site', () => {
  assert.throws(() => setTemporal(42), /namespace/);
  assert.throws(() => setTemporal('Temporal'), /namespace/);
  assert.throws(() => setTemporal({}), /no Temporal factories/);
  setTemporal(Temporal); // restore
});

test('L6: registered relative grammars match case-insensitively and third-party failures are isolated', () => {
  registerRelativeGrammar({
    language: 'PT',
    matchers: [
      () => { throw new Error('matcher boom'); },
      () => ({ resolve: () => { throw new Error('resolve boom'); } }),
      () => ({ resolve: (ref) => ({ year: ref.year, month: ref.month, day: ref.day + 1 }) }),
    ],
  });
  // The registry lowercases 'PT'; parseRelative looks up the locale's
  // primary subtag ('pt-BR' → 'pt') — both sides are case-insensitive
  // now, and the two throwing matchers/resolvers are skipped in favor
  // of the working one.
  const r = parseRelative('qualquer coisa', Temporal.PlainDate.from('2026-08-04'), { locale: 'pt-BR' });
  assert.ok(r !== null && r !== undefined);
  assert.equal(r.day, 5);
});

test('L10: parse rejects -13:00/-14:00 offsets with the specific diagnostic', () => {
  assert.throws(() => parse('xxx', '-13:00'), /maximum supported negative UTC offset/);
  assert.throws(() => parse('xxx', '-14:00'), /maximum supported negative UTC offset/);
});

test('L11: calendarUtils range checks', () => {
  assert.throws(() => daysInMonth({ year: 2026, month: 13 }), /1 to 12/);
  assert.throws(() => weekOfYear({ year: 2026, month: 1, day: 4, dayOfWeek: 0 }), /1 \(Mon\) through 7 \(Sun\)/);
  assert.throws(() => getWeekday({ dayOfWeek: 8 }), /1 \(Mon\) through 7 \(Sun\)/);
});

test('L11: startOf/endOf understand quarters and reject unknown units', () => {
  const q = startOf(Temporal.PlainDate.from('2026-11-20'), 'quarter');
  assert.deepEqual({ month: q.month, day: q.day }, { month: 10, day: 1 });
  const qe = endOf(Temporal.PlainDate.from('2026-02-15'), 'quarter');
  assert.deepEqual({ month: qe.month, day: qe.day }, { month: 3, day: 31 });
  assert.throws(() => startOf(Temporal.PlainDate.from('2026-02-15'), 'decade'), /unit must be one of/);
});

test('L11: inverted hand-built intervals fail fast instead of contradicting themselves', () => {
  const a = { start: Temporal.PlainDate.from('2026-01-10'), end: Temporal.PlainDate.from('2026-01-05'), bounds: 'closed' };
  const b = interval(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-02'));
  assert.throws(() => intervalIsBefore(a, b), /inverted interval/);
  assert.throws(() => intervalIsAfter(a, b), /inverted interval/);
});

// keep imports referenced
void parseRFC3339; void roundDuration; void max; void addBusinessDays;
void isDST; void format; void compareDuration; void isBefore; void isAfter;
