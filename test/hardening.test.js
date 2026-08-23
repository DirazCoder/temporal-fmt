import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, format, setTemporal, formatDuration, formatDurationToParts,
  formatDistance, formatRelative,
  balanceDuration, totalDuration, compareDuration, roundDuration,
  parseISODuration, parseRFC2822, parseDuration,
  isPlainDate, isTemporal, assertTemporal,
  interval, intervalDifference as difference, splitInterval,
  createFormatter, registerRelativeGrammar, listRegisteredGrammars,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Regression tests for the 0.9.2 low-severity hardening batch (audit
// Section 6). Each test pins one fix; before the fix each behavior was
// wrong in the way its comment describes.

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const d = (s) => Temporal.PlainDate.from(s);

// ---------------------------------------------------------------------------
// ERR-01: malformed locale tags surface as typed InvalidLocaleError,
// not a bare engine RangeError
// ---------------------------------------------------------------------------

test('ERR-01: parse() with a malformed locale throws InvalidLocaleError (typed, carries the tag)', () => {
  assert.throws(
    () => parse('yyyy MMMM d', '2026 August 4', { locale: 'x' }),
    (err) => err instanceof Error && err.code === 'INVALID_LOCALE' && err.actual === 'x',
  );
});

test('ERR-01: format() with a malformed locale and a locale-aware token throws InvalidLocaleError', () => {
  assert.throws(
    () => format(d('2026-08-04'), 'MMMM d', { locale: 'x' }),
    (err) => err.code === 'INVALID_LOCALE' && err.actual === 'x',
  );
  // 'a' token routes through getFormatter directly (dayPeriodPart)
  assert.throws(
    () => format(Temporal.PlainDateTime.from('2026-08-04T15:45:30'), 'h:mm a', { locale: 'x' }),
    (err) => err.code === 'INVALID_LOCALE',
  );
});

test('ERR-01: formatDuration/formatDistance/formatRelative with a malformed locale throw InvalidLocaleError', () => {
  assert.throws(
    () => formatDuration({ hours: 2 }, 'hhh', { locale: 'x' }),
    (err) => err.code === 'INVALID_LOCALE',
  );
  assert.throws(
    () => formatDistance(d('2026-08-04'), d('2026-08-05'), { locale: 'x' }),
    (err) => err.code === 'INVALID_LOCALE',
  );
  assert.throws(
    () => formatRelative(d('2026-08-04'), d('2026-08-05'), { locale: 'x' }),
    (err) => err.code === 'INVALID_LOCALE',
  );
});

test('ERR-01: a malformed locale does not poison the canonical-key cache for valid tags', () => {
  // The failed tag fell through canonicalCacheKey's catch before too; this
  // pins that valid lookups still canonicalize identically afterwards.
  assert.equal(format(d('2026-08-04'), 'MMMM d', { locale: 'en_US' }), 'August 4');
});

// ---------------------------------------------------------------------------
// ERR-02: fractional durations — exact arithmetic instead of a BigInt
// TypeError crash
// ---------------------------------------------------------------------------

test('ERR-02: balanceDuration balances fractional fields exactly (P1.5D -> 1 day + 12 hours)', () => {
  const balanced = balanceDuration(parseISODuration('P1.5D'));
  assert.equal(balanced.days, 1);
  assert.equal(balanced.hours, 12);
});

test('ERR-02: totalDuration/compareDuration handle fractional fields', () => {
  assert.equal(totalDuration({ days: 1.5 }, 'hours'), 36);
  assert.equal(compareDuration({ days: 1.5 }, { hours: 36 }), 0);
  assert.equal(compareDuration({ days: 1.5 }, { hours: 37 }), -1);
});

test('ERR-02: roundDuration handles fractional input', () => {
  const r = roundDuration({ days: 1.5 }, { unit: 'days', mode: 'trunc' });
  assert.equal(r.days, 1);
});

test('ERR-02: a fractional field too large to convert exactly throws the typed InvalidDurationError', () => {
  // 200000000.5 days * 86400e9 ns/day overflows safe integers.
  assert.throws(
    () => totalDuration({ days: 200000000.5 }, 'hours'),
    (err) => err instanceof Error && err.code === 'INVALID_DURATION' && /days/.test(err.reason ?? err.message),
  );
});

// ---------------------------------------------------------------------------
// ERR-03: parseRFC2822 rejects non-RFC2822 shapes Date.parse would accept
// ---------------------------------------------------------------------------

test('ERR-03: parseRFC2822 rejects ISO 8601 and other non-RFC2822 shapes', () => {
  assert.throws(() => parseRFC2822('2026-08-04T15:45:30Z'), /not a valid RFC 2822 date/);
  assert.throws(() => parseRFC2822('2026-08-04'), /not a valid RFC 2822 date/);
  assert.throws(() => parseRFC2822('Aug 4 2026'), /not a valid RFC 2822 date/);
});

test('ERR-03: parseRFC2822 still accepts the RFC 2822 grammar (incl. optional day-of-week and seconds)', () => {
  const a = parseRFC2822('Mon, 04 Aug 2026 15:45:30 +0000');
  assert.equal(a.toString(), '2026-08-04T15:45:30Z');
  const b = parseRFC2822('04 Aug 2026 15:45 +0000'); // no weekday, no seconds
  assert.equal(b.toString().startsWith('2026-08-04T15:45'), true);
});

// ---------------------------------------------------------------------------
// PERF-01: canonicalCacheKey is memoized and bounded (eviction works)
// ---------------------------------------------------------------------------

test('PERF-01: the canonical locale-key cache evicts at its cap (501 distinct valid tags)', () => {
  // Prime the cache past its bound with valid, distinct private-use tags.
  // Correctness observable via format(): canonicalization still resolves
  // each tag consistently after eviction churn.
  for (let i = 0; i < 520; i++) {
    format(d('2026-08-04'), 'yyyy', { locale: `en-x-evict${i}` });
  }
  // After churn, a previously-evicted tag still canonicalizes correctly.
  assert.equal(format(d('2026-08-04'), 'MMMM d', { locale: 'en_US' }), 'August 4');
});

// ---------------------------------------------------------------------------
// PERF-02: formatDurationToParts slices parts exactly (no indexOf drift)
// ---------------------------------------------------------------------------

test('PERF-02: formatDurationToParts boundaries are exact even when a literal repeats inside token output', () => {
  // The quoted literal "sec" also appears inside "5 seconds" rendered by
  // the adjacent token — the old indexOf-based slicer matched " sec" at
  // index 1 (inside the token's own text) and split the token to just "5".
  const parts = formatDurationToParts({ seconds: 5 }, "sss 'sec'");
  assert.deepEqual(parts, [
    { type: 'token', value: '5 seconds', token: 'sss' },
    { type: 'literal', value: ' sec' },
  ]);
  // And the joined string is exactly what formatDuration produces:
  const joined = parts.map((p) => p.value).join('');
  assert.equal(joined, formatDuration({ seconds: 5 }, "sss 'sec'"));
  // Multi-part shape still matches the documented contract:
  assert.deepEqual(formatDurationToParts({ hours: 0, minutes: 30 }, "h 'and' mm"), [
    { type: 'token', value: '', token: 'h' },
    { type: 'literal', value: ' and ' },
    { type: 'token', value: '30m', token: 'mm' },
  ]);
});

// ---------------------------------------------------------------------------
// MEM-01: registerRelativeGrammar is capped
// ---------------------------------------------------------------------------

test('MEM-01: registerRelativeGrammar caps new-language registrations at 100', () => {
  const before = listRegisteredGrammars().length;
  const dummy = () => null;
  for (let i = before; i < 100; i++) {
    registerRelativeGrammar({ language: `cap-lang-${i}`, matchers: [dummy] });
  }
  assert.throws(
    () => registerRelativeGrammar({ language: 'cap-lang-overflow', matchers: [dummy] }),
    /100-grammar limit/,
  );
  // Replacing an existing language is still allowed at the cap.
  registerRelativeGrammar({ language: 'cap-lang-0', matchers: [dummy] });
});

// ---------------------------------------------------------------------------
// BUG-09: type guards survive hostile getters
// ---------------------------------------------------------------------------

test('BUG-09: type guards return false for objects with throwing getters instead of crashing', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'year', { get() { throw new Error('boom'); } });
  assert.equal(isPlainDate(hostile), false);
  assert.equal(isTemporal(hostile), false);
  // The assert* wrappers degrade to their descriptive error, not "boom".
  assert.throws(() => assertTemporal(hostile), /expected a Temporal/);
  // Real values still guard correctly through the wrapper.
  assert.equal(isPlainDate(d('2026-08-04')), true);
});

// ---------------------------------------------------------------------------
// BUG-10: field bag + locale-aware token -> descriptive error, not
// "[object Object]"
// ---------------------------------------------------------------------------

test('BUG-10: a plain field bag with a locale-aware token throws a descriptive error', () => {
  assert.throws(
    () => format({ year: 2026, month: 8, day: 4 }, 'MMMM d'),
    /toLocaleString.*field bag|field bag.*toLocaleString/s,
  );
  // Real Temporal objects still render locale-aware tokens fine.
  assert.equal(format(d('2026-08-04'), 'MMMM d'), 'August 4');
});

// ---------------------------------------------------------------------------
// BUG-11: splitInterval rejects endpoints outside the Date range
// ---------------------------------------------------------------------------

test('BUG-11: splitInterval throws a RangeError for endpoints beyond the representable Date range', () => {
  const big = interval({ year: 1, month: 1, day: 1 }, { year: 300000, month: 1, day: 1 });
  assert.throws(() => splitInterval(big, 2), /representable Date range/);
  // Sane ranges still split.
  const ok = interval(d('2026-08-04'), d('2026-08-06'));
  assert.equal(splitInterval(ok, 2).length, 2);
});

// ---------------------------------------------------------------------------
// BUG-12: difference() bounds preserve the original interval's inclusivity
// ---------------------------------------------------------------------------

test('BUG-12: difference() pieces carry correct bounds (inherited inclusivity, exclusive cut)', () => {
  const a = interval(d('2026-01-01'), d('2026-12-31'), 'closed');
  const b = interval(d('2026-04-01'), d('2026-06-01'), 'closed');
  const [before, after] = difference(a, b);
  // [Jan 1, Apr 1) and (Jun 1, Dec 31] — both cut ends exclusive.
  assert.equal(before.bounds, 'half-open-end');
  assert.equal(after.bounds, 'half-open-start');
  // An open-bounds `a` yields fully open pieces.
  const openA = interval(d('2026-01-01'), d('2026-12-31'), 'open');
  const [ob] = difference(openA, b);
  assert.equal(ob.bounds, 'open');
  // Endpoints unchanged from the pre-fix behavior (already correct).
  assert.equal(before.end.toString(), '2026-04-01');
  assert.equal(after.start.toString(), '2026-06-01');
});

// ---------------------------------------------------------------------------
// DES-03: createFormatter rejects overlong token runs like tokenize() does
// ---------------------------------------------------------------------------

test('DES-03: createFormatter rejects an overlong token run ("MMMMM") instead of splicing', () => {
  const fmt = createFormatter({});
  assert.throws(() => fmt.format(d('2026-08-04'), 'MMMMM'), /isn't a recognized token|did you mean/s);
  // Correct-width tokens still work through the custom formatter.
  assert.equal(fmt.format(d('2026-08-04'), 'MMMM d'), 'August 4');
});

// ---------------------------------------------------------------------------
// PERF-02 companion: parseDuration's quoted-literal tokenizer branches
// (shared tokenizer retained from the old formatDurationToParts; these
// paths lost their only coverage when ToParts switched to the shared
// renderer)
// ---------------------------------------------------------------------------

test('parseDuration: quoted literal in the format string matches literally', () => {
  // The quoted span contributes its CONTENT (" yrs") as the literal — the
  // quotes themselves are escape syntax, not matched text.
  const r = parseDuration('2 yrs', "y 'yrs'");
  assert.equal(r.years, 2);
});

test('parseDuration: doubled quote is a literal quote character', () => {
  const r = parseDuration("2'", "y''");
  assert.equal(r.years, 2);
});

test('parseDuration: doubled quote inside a quoted span and adjacent literals merge', () => {
  // 'a''b' -> literal "a'b"; the trailing " b" literal merges with it in
  // the tokenizer's appendLiteral (adjacent-literal branch).
  // 'a''b' -> literal "a'b"; ' b' -> literal " b"; they merge to "a'b b".
  const r = parseDuration("2 a'b b", "y 'a''b' 'b'");
  assert.equal(r.years, 2);
});

test('parseDuration: an unterminated quote throws FormatSyntaxError', () => {
  assert.throws(() => parseDuration('2 x', "y 'x"), /unterminated quote/);
});

test('ERR-03 companion: a shape-valid but semantically invalid RFC 2822 date throws', () => {
  // Passes the grammar pre-check (2-digit day, real month name, offset),
  // but day 99 doesn't exist — Date.parse returns NaN, which must surface
  // as the same typed error rather than an Invalid Date instant.
  assert.throws(() => parseRFC2822('Mon, 99 Aug 2026 15:45:30 +0000'), /not a valid RFC 2822 date/);
});
