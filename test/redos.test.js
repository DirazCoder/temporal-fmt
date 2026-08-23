import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, safeParse, format, setTemporal,
  isAfter, isBefore, isEqual, min, compare,
  mergeIntervals, interval, formatRange,
  createHolidayCalendar, holidaysBetween,
  recurrence, skip, take,
  createBusinessCalendar,
  registerLocaleVocab, registerRelativeGrammar,
  parseRelative, parseToParts as parseToPartsPublic,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Regression tests for the security-audit fixes. Each test reproduces an
// exploit or misbehavior that was demonstrated against the pre-fix build;
// every one of these failed, hung, or returned a wrong value before the
// corresponding fix.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function timeMs(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

const BUDGET_MS = 500; // generous; healthy cases land in single-digit ms

// ---------------------------------------------------------------------------
// ReDoS — catastrophic backtracking in parse()'s generated regex
// ---------------------------------------------------------------------------

test('ReDoS: a long glued run of unpadded numeric tokens parses in linear time ("Md" x 50, near-miss input)', () => {
  // Pre-fix: exponential in token count — "Md" x 13 took ~2.7 s, x 15+ hung.
  // Post-fix the run is a single bounded digit group with post-match split
  // enumeration (see buildCapturingPattern / enumerateValidSplits).
  const formatStr = 'Md'.repeat(50);
  const input = '1'.repeat(150) + 'x'; // near-miss: valid shape, poisoned tail
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches|is ambiguous/);
  });
  assert.ok(ms < BUDGET_MS, `"Md" x 50 took ${ms}ms, expected < ${BUDGET_MS}ms`);
});

test('ReDoS: a 3-token glued run shape ("Hms" x 20) parses in linear time', () => {
  const formatStr = 'Hms'.repeat(20);
  const input = '1'.repeat(80) + 'x';
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches|is ambiguous/);
  });
  assert.ok(ms < BUDGET_MS, `"Hms" x 20 took ${ms}ms, expected < ${BUDGET_MS}ms`);
});

test('ReDoS: glued-run semantics are unchanged after the single-group rewrite', () => {
  // The documented glued-run contract (pinned by combinatorial.test.js
  // before the fix) must still hold when the run is one regex group:
  assert.equal(parse('yyyy-Md', '2026-34').month, 3);
  assert.equal(parse('yyyy-Md', '2026-34').day, 4);
  assert.equal(parse('yyyy-Md', '2026-1225').month, 12);
  assert.equal(parse('yyyy-Md', '2026-1225').day, 25);
  assert.throws(() => parse('yyyy-Md', '2026-125'), /is ambiguous/);
  assert.throws(() => parse('yyyy-Md', '2026-304'), /no valid pattern matches/);
  assert.equal(parse('yyyy-Md', '2026-121', { lenient: true }).day, 1);
});

test('ReDoS: a run whose digit span has no valid split is a mismatch, not a hang', () => {
  // "999" matches the run's width window (2..4 digits) but no per-token
  // split is valid (M tops out at 12) — must surface the standard
  // mismatch error, not explore the split space.
  assert.throws(() => parse('Md', '999'), /no valid pattern matches/);
  assert.throws(() => parse('Md', '99999'), /no valid pattern matches/); // too long for the window
});

test('ReDoS: many unpadded tokens glued to digit literals are rejected at build time (ambiguity budget)', () => {
  // "M1" x 13 is the "M1M1M1..." attack shape: 13 variable-width tokens
  // each trading digits with a digit literal — exponential backtracking
  // before the budget guard (x8 already took ~50ms, x24 ~550ms, growing
  // ~x5 per +2), rejected outright at 13 (13 bits > the 12-bit budget).
  assert.throws(() => parse('M1'.repeat(13), '1'.repeat(20) + 'x'), /ambiguity budget|too many variable-width/);
  // A small, legitimate count of such adjacencies still parses:
  // yyyy=2026, M=12, literal "1", d=1 -> month 12, day 1.
  const r = parse('yyyy-M1d', '2026-1211');
  assert.equal(r.month, 12);
  assert.equal(r.day, 1);
});

test('ReDoS: yyyy followed by a digit-starting literal uses the exact 4-digit fragment', () => {
  // "yyyy1" x 8 used to take ~26 s (unbounded per-year width choices).
  // Now the year is exact-4 next to a digit literal, so matching is linear.
  const formatStr = 'yyyy1'.repeat(8);
  const input = '1'.repeat(80) + 'x';
  const ms = timeMs(() => {
    assert.throws(() => parse(formatStr, input), /no valid pattern matches/);
  });
  assert.ok(ms < BUDGET_MS, `"yyyy1" x 8 took ${ms}ms, expected < ${BUDGET_MS}ms`);
  // and the exact-year form still matches what it always matched:
  assert.equal(parse('yyyy1-MM-dd', '20261-08-04').year, 2026);
});

// ---------------------------------------------------------------------------
// Stale pattern cache after registerLocaleVocab()
// ---------------------------------------------------------------------------

test('registerLocaleVocab invalidates parse()\'s compiled-pattern cache (format->parse round-trip)', () => {
  const locale = 'zz';
  // Prime the pattern cache against the Intl-derived vocab.
  safeParse('yyyy MMMM d', '2026 January 5', { locale });
  // Swap in a custom vocab.
  registerLocaleVocab(locale, {
    monthLong:  ['Foo','Bar','Baz','Qux','Quux','Fum','Fudge','Grault','Garp','Huffle','Imp','Kludge'],
    monthShort: ['Fo','Ba','Bz','Qx','Qu','Fu','Fd','Gr','Gp','Hf','Im','Kl'],
    weekdayLong:  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    weekdayShort: ['Mo','Tu','We','Th','Fr','Sa','Su'],
    dayPeriod: ['AM','PM'],
  });
  // format() renders the new vocab; parse() must accept the library's own output.
  const out = format(Temporal.PlainDate.from('2026-01-05'), 'yyyy MMMM d', { locale });
  assert.equal(out, '2026 Foo 5');
  const back = parse('yyyy MMMM d', out, { locale });
  assert.equal(back.toString(), '2026-01-05');
});

// ---------------------------------------------------------------------------
// Comparison corruption across leap-year boundaries
// ---------------------------------------------------------------------------

test('compare()/isAfter()/isEqual() are exact across year boundaries (no 365.2425 approximation)', () => {
  const A = { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
  const B = { year: 2024, month: 12, day: 31, hour: 18, minute: 12 };
  // A is ~5.8h AFTER B. Pre-fix, the avg-year math made this compare "before".
  assert.equal(isAfter(A, B), true);
  // Pre-fix, these two compared "equal" (~18.2h apart).
  const B2 = { year: 2024, month: 12, day: 31, hour: 5, minute: 49, second: 12 };
  assert.equal(isEqual(A, B2), false);
  assert.equal(min([A, B2]).year, 2024);
  // Sweep the boundary: every Dec-31 hour must compare before every Jan-1 hour.
  for (let h = 0; h < 24; h += 3) {
    for (let h2 = 0; h2 < 24; h2 += 6) {
      const x = { year: 2024, month: 12, day: 31, hour: h };
      const y = { year: 2025, month: 1, day: 1, hour: h2 };
      assert.ok(isBefore(x, y), `2024-12-31T${h} must be before 2025-01-01T${h2}`);
    }
  }
});

test('compare() agrees with Temporal\'s own compare on a spread of boundary dates', () => {
  const samples = [
    ['2024-12-31T00:00', '2025-01-01T00:00'],
    ['2024-12-31T23:59', '2025-01-01T00:00'],
    ['2000-02-29T00:00', '2000-03-01T00:00'],
    ['1900-02-28T00:00', '1900-03-01T00:00'],
    ['2026-08-04T12:00', '2026-08-04T12:00'],
  ];
  for (const [a, b] of samples) {
    const ta = Temporal.PlainDateTime.from(a);
    const tb = Temporal.PlainDateTime.from(b);
    const expected = Math.sign(Temporal.PlainDateTime.compare(ta, tb));
    const got = Math.sign(compare(ta, tb));
    assert.equal(got, expected, `${a} vs ${b}: expected ${expected}, got ${got}`);
  }
});

// ---------------------------------------------------------------------------
// Input mutation
// ---------------------------------------------------------------------------

test('mergeIntervals does not mutate the caller\'s interval objects', () => {
  const i1 = interval({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 10 });
  const i2 = interval({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 20 });
  const i1Before = JSON.stringify(i1);
  const merged = mergeIntervals([i1, i2]);
  assert.equal(JSON.stringify(i1), i1Before, 'caller object must be untouched');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].end.day, 20);
});

test('createBusinessCalendar does not mutate the caller\'s workingHours object', () => {
  const workingHours = { 1: 6 };
  const cal = createBusinessCalendar({ workingHours });
  assert.deepEqual(Object.keys(workingHours), ['1'], 'caller object must be untouched');
  assert.equal(cal.workingHours[2], 8, 'calendar itself still carries the defaults');
});

// ---------------------------------------------------------------------------
// formatRange honors the formatStr parameter
// ---------------------------------------------------------------------------

test('formatRange renders both endpoints with the caller\'s format string', () => {
  const iv = interval({ year: 2026, month: 8, day: 4 }, { year: 2026, month: 8, day: 6 });
  assert.equal(formatRange(iv, 'yyyy-MM-dd'), '2026-08-04 – 2026-08-06');
});

// ---------------------------------------------------------------------------
// Locale tag normalization (en_US)
// ---------------------------------------------------------------------------

test('parse() and format() both accept underscore-separated locale tags like "en_US"', () => {
  const d = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(d, 'MMMM d', { locale: 'en_US' }), 'August 4');
  assert.equal(parse('yyyy MMMM d', '2026 August 4', { locale: 'en_US' }).toString(), '2026-08-04');
});

// ---------------------------------------------------------------------------
// Unbounded traversal guards
// ---------------------------------------------------------------------------

test('holidaysBetween rejects year ranges beyond the 5000-year cap instead of walking them', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1, name: 'NY' }]);
  assert.throws(
    () => holidaysBetween(cal, { year: 1, month: 1, day: 1 }, { year: 300000, month: 1, day: 1 }),
    /exceeds the .*-year limit/,
  );
  // Normal ranges keep working.
  const list = holidaysBetween(cal, { year: 2026, month: 1, day: 1 }, { year: 2026, month: 12, day: 31 });
  assert.equal(list.length, 1);
});

test('skip() on an unbounded rule throws a RangeError instead of looping forever', () => {
  const iter = recurrence({ year: 2026, month: 1, day: 1, dayOfWeek: 4 }, { frequency: 'daily', interval: 1 });
  assert.throws(() => skip(iter, 3), /still producing/);
  // Bounded rules still work.
  const iter2 = recurrence({ year: 2026, month: 1, day: 1, dayOfWeek: 4 }, { frequency: 'daily', interval: 1, count: 10 });
  assert.equal(skip(iter2, 2).length, 8);
});

// ---------------------------------------------------------------------------
// registerRelativeGrammar is actually consulted by parseRelative()
// ---------------------------------------------------------------------------

test('parseRelative() dispatches to grammars registered via registerRelativeGrammar()', () => {
  registerRelativeGrammar({
    language: 'xx',
    matchers: [
      (input) => (input === 'frobnicate' ? { resolve: (ref) => ({ year: ref.year, month: ref.month, day: ref.day + 1 }) } : null),
      // non-resolve shape: matcher supplies absolute fields directly
      (input) => (input === 'absolutely' ? { year: 1999, month: 12, day: 31 } : null),
    ],
  });
  const result = parseRelative('frobnicate', Temporal.PlainDate.from('2026-08-04'), { locale: 'xx' });
  assert.equal(result.toString(), '2026-08-05');
  // The non-resolve branch (absolute fields from the matcher):
  const absolute = parseRelative('absolutely', Temporal.PlainDate.from('2026-08-04'), { locale: 'xx' });
  assert.equal(absolute.toString(), '1999-12-31');
  // And a registered-but-unmatched grammar falls through to the built-ins:
  assert.throws(
    () => parseRelative('not-a-phrase', Temporal.PlainDate.from('2026-08-04'), { locale: 'xx' }),
    /doesn't recognize/,
  );
});

test('parseToParts mirrors parse()\'s glued-run handling: 0 splits and lenient picks', () => {
  // 0 valid splits -> same mismatch error parse() throws
  assert.throws(() => parseToPartsPublic('Md', '999'), /no valid pattern matches/);
  // 2 valid splits + lenient -> parts carry the heuristic-picked values
  const parts = parseToPartsPublic('yyyy-Md', '2026-121', { lenient: true });
  assert.equal(parts.length, 3); // yyyy, M, d — no phantom run entry
  assert.deepEqual(parts.map((p) => p.token), ['yyyy', 'M', 'd']);
  assert.equal(parts[1].raw, '12');
  assert.equal(parts[2].raw, '1');
});

test('holidaysBetween validates that endpoints carry year/month/day', () => {
  const cal = createHolidayCalendar([{ month: 1, day: 1 }]);
  assert.throws(
    () => holidaysBetween(cal, { nope: 1 }, { year: 2026, month: 1, day: 1 }),
    /needs start\/end values with year\/month\/day/,
  );
});

test('formatRange falls back to Intl\'s native range formatting when the token format cannot render the endpoints', () => {
  // Token path throws (PlainDate has no hour) -> Intl fallback with
  // year/month/day field-bag endpoints.
  const a = Temporal.PlainDate.from('2026-01-01');
  const b = Temporal.PlainDate.from('2026-01-05');
  const iv = interval(a, b);
  const s = formatRange(iv, 'HH:mm');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0);
  // Same fallback with a toInstant()-carrying endpoint (ZonedDateTime).
  const zdtA = Temporal.ZonedDateTime.from('2026-01-01T00:00:00[UTC]');
  const zdtB = Temporal.ZonedDateTime.from('2026-01-05T00:00:00[UTC]');
  const iv2 = interval(zdtA, zdtB);
  // Over-length format string throws in format() before anything else,
  // forcing the fallback with toJSDate()'s toInstant branch.
  const s2 = formatRange(iv2, 'y'.repeat(1001));
  assert.equal(typeof s2, 'string');
  assert.ok(s2.length > 0);
});

test('parseToParts resolves a unique glued-run split into per-token parts', () => {
  const parts = parseToPartsPublic('yyyy-Md', '2026-34');
  assert.deepEqual(parts.map((p) => p.token), ['yyyy', 'M', 'd']);
  assert.equal(parts[1].raw, '3');
  assert.equal(parts[2].raw, '4');
});

test('registered grammars only match their own language; partial matches fall back to reference fields', () => {
  registerRelativeGrammar({
    language: 'yy-audit-other', // registered but never requested in the asserts below
    matchers: [() => ({ year: 1111, month: 1, day: 1 })],
  });
  // A matcher may return a partial match: unspecified fields come from
  // the reference date.
  registerRelativeGrammar({
    language: 'yy',
    matchers: [(input) => (input === 'sameday' ? {} : null)],
  });
  const result = parseRelative('sameday', Temporal.PlainDate.from('2026-08-04'), { locale: 'yy' });
  assert.equal(result.toString(), '2026-08-04');
  // The 'yy-audit-other' grammar must not fire for locale 'yy':
  assert.equal(parseRelative('sameday', Temporal.PlainDate.from('2026-08-04'), { locale: 'yy' }).toString(), '2026-08-04');
});
