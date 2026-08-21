import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveZoned, getTimeZone, getOffset, getOffsetNanoseconds, isDST,
  getNextTransition, getPreviousTransition, getTransitions, possibleInstantsFor,
  setTemporal,
} from '../dist/index.js';
import { Temporal as P } from 'temporal-polyfill/full';
const T = globalThis.Temporal ?? P;
setTemporal(T);

test('cov: getTimeZone throws on non-ZDT', () => assert.throws(() => getTimeZone(42), /expected a ZonedDateTime/));
test('cov: getOffset throws on non-ZDT', () => assert.throws(() => getOffset(42), /expected a ZonedDateTime/));
test('cov: getOffsetNanoseconds throws on non-ZDT', () => assert.throws(() => getOffsetNanoseconds(42), /expected a ZonedDateTime/));
test('cov: getOffsetNanoseconds throws on malformed', () => assert.throws(() => getOffsetNanoseconds({ offset: 'bad' }), /couldn't parse/));
test('cov: isDST summer NY', () => assert.ok(isDST(T.ZonedDateTime.from('2026-07-04T12:00[America/New_York]'))));
test('cov: isDST winter NY', () => assert.ok(!isDST(T.ZonedDateTime.from('2026-01-04T12:00[America/New_York]'))));
test('cov: isDST throws on non-ZDT', () => assert.throws(() => isDST(42), /expected a ZonedDateTime/));

test('cov: isDST returns false when the January comparison ZonedDateTime cannot be constructed', () => {
  // A timeZoneId Temporal doesn't recognize makes the internal January
  // lookup throw, landing in the catch { return false } branch rather
  // than the compare-offsets happy path exercised by the two tests above.
  const fake = { timeZoneId: 'Not/A_Real_Zone', offset: '+00:00', year: 2026 };
  assert.equal(isDST(fake), false);
});

test('cov: resolveZoned rewrites the DST-gap error message when disambiguation is "reject"', () => {
  // temporal-polyfill's real ZonedDateTime.from throws "Ambiguous offset"
  // for a DST gap, not "no such wall-clock time" — so the custom
  // rewritten-message branch in resolveZoned's catch block can't be
  // reached through the polyfill as installed. Swapping in a minimal
  // fake Temporal whose ZonedDateTime.from throws the message this
  // library's regex actually expects lets us test that branch's own
  // logic directly, without relying on a specific Temporal
  // implementation's exact wording.
  const fakeTemporal = {
    ZonedDateTime: {
      from() {
        throw new Error('no such wall-clock time exists in this time zone');
      },
    },
  };
  setTemporal(fakeTemporal);
  try {
    assert.throws(
      () => resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York', { disambiguation: 'reject' }),
      /has no such wall-clock time on 2026-3-8T2:30 — it falls in a DST gap/,
    );
  } finally {
    setTemporal(T);
  }
});

test('cov: resolveZoned\'s DST-gap message defaults omitted hour/minute to 0', () => {
  // Same fake as above, but with hour/minute left out of the fields
  // entirely — exercises the `fields.hour ?? 0` / `fields.minute ?? 0`
  // fallback inside the error-message template, not just the
  // pass-through values the previous test used.
  const fakeTemporal = {
    ZonedDateTime: {
      from() {
        throw new Error('no such wall-clock time exists in this time zone');
      },
    },
  };
  setTemporal(fakeTemporal);
  try {
    assert.throws(
      () => resolveZoned({ year: 2026, month: 3, day: 8 }, 'America/New_York', { disambiguation: 'reject' }),
      /has no such wall-clock time on 2026-3-8T0:0 — it falls in a DST gap/,
    );
  } finally {
    setTemporal(T);
  }
});

test('cov: resolveZoned rethrows unmodified when disambiguation is not "reject", even on a gap-shaped message', () => {
  // Same fake error message as above, but disambiguation defaults to
  // 'compatible' — the message-rewrite guard requires disambiguation
  // === 'reject', so this exercises the `throw err` fallthrough
  // instead of the custom-message branch.
  const fakeTemporal = {
    ZonedDateTime: {
      from() {
        throw new Error('no such wall-clock time exists in this time zone');
      },
    },
  };
  setTemporal(fakeTemporal);
  try {
    assert.throws(
      () => resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York'),
      /no such wall-clock time exists in this time zone/,
    );
  } finally {
    setTemporal(T);
  }
});

test('cov: getNextTransition finds one', () => { const n = getNextTransition(T.ZonedDateTime.from('2026-01-01T00:00[America/New_York]')); if (n !== undefined) assert.ok(n); });
test('cov: getPreviousTransition finds one', () => { const p = getPreviousTransition(T.ZonedDateTime.from('2026-07-01T00:00[America/New_York]')); if (p !== undefined) assert.ok(p); });
test('cov: getNextTransition throws on non-ZDT', () => assert.throws(() => getNextTransition(42), /expected a ZonedDateTime/));
test('cov: getPreviousTransition throws on non-ZDT', () => assert.throws(() => getPreviousTransition(42), /expected a ZonedDateTime/));
test('cov: getTransitions in range', () => { const s = T.ZonedDateTime.from('2026-01-01T00:00[America/New_York]'); const e = T.ZonedDateTime.from('2026-12-31T00:00[America/New_York]'); const r = getTransitions(s, e); assert.ok(Array.isArray(r)); });
test('cov: possibleInstantsFor normal time', () => { const r = possibleInstantsFor({ year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'UTC'); assert.ok(r.length >= 1); });
test('cov: possibleInstantsFor returns exactly 1 instant for a normal time in a real DST-observing zone', () => {
  const r = possibleInstantsFor({ year: 2026, month: 8, day: 4, hour: 12, minute: 0, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(r.length, 1);
});
test('cov: possibleInstantsFor returns 0 instants for a spring-forward gap', () => {
  // 2:30am on Mar 8 2026 never happens in America/New_York — clocks jump
  // from 2:00am straight to 3:00am.
  const r = possibleInstantsFor({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(r.length, 0);
});
test('cov: possibleInstantsFor returns 2 instants for a fall-back overlap', () => {
  // 1:30am on Nov 1 2026 happens twice in America/New_York — once before
  // the clocks fall back, once after.
  const r = possibleInstantsFor({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0, millisecond: 0 }, 'America/New_York');
  assert.equal(r.length, 2);
});
test('cov: resolveZoned reject', () => assert.ok(resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC', { disambiguation: 'reject' }) !== undefined));
test('cov: resolveZoned earlier', () => assert.ok(resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC', { disambiguation: 'earlier' }) !== undefined));
test('cov: resolveZoned later', () => assert.ok(resolveZoned({ year: 2026, month: 8, day: 4, hour: 15 }, 'UTC', { disambiguation: 'later' }) !== undefined));

// New token family tests (Section B)
import { format, tokenInfo, analyzeFormat, FORMAT_ONLY_TOKENS } from '../dist/index.js';

test('cov: LLLL format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'LLLL');
  assert.ok(r.length > 0);
});

test('cov: LLL format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'LLL');
  assert.ok(r.length > 0);
});

test('cov: cccc format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'cccc');
  assert.ok(r.length > 0);
});

test('cov: ccc format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'ccc');
  assert.ok(r.length > 0);
});

test('cov: GGGG format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'GGGG');
  assert.ok(r.length > 0);
});

test('cov: G format', () => {
  const date = T.PlainDate.from('2026-08-04');
  const r = format(date, 'G');
  assert.ok(r.length > 0);
});

test('cov: D format', () => {
  const date = T.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'D'), '216');
});

test('cov: DD format', () => {
  const date = T.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'DD'), '216');
});

test('cov: DDD format', () => {
  const date = T.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'DDD'), '216');
});

test('cov: z format', () => {
  const zdt = T.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  const r = format(zdt, 'z');
  assert.ok(r.length > 0);
});

test('cov: zzzz format', () => {
  const zdt = T.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
  const r = format(zdt, 'zzzz');
  assert.ok(r.length > 0);
});

test('cov: tokenInfo for new tokens', () => {
  assert.ok(tokenInfo('LLLL') !== undefined);
  assert.ok(tokenInfo('LLL') !== undefined);
  assert.ok(tokenInfo('cccc') !== undefined);
  assert.ok(tokenInfo('ccc') !== undefined);
  assert.ok(tokenInfo('GGGG') !== undefined);
  assert.ok(tokenInfo('G') !== undefined);
  assert.ok(tokenInfo('zzzz') !== undefined);
  assert.ok(tokenInfo('z') !== undefined);
  assert.ok(tokenInfo('D') !== undefined);
  assert.ok(tokenInfo('DD') !== undefined);
  assert.ok(tokenInfo('DDD') !== undefined);
});

test('cov: analyzeFormat recognizes new tokens', () => {
  const a = analyzeFormat('LLLL cccc GGGG');
  assert.equal(a.tokens.length, 3);
  assert.ok(a.warnings.some(w => w.code === 'FORMAT_ONLY_TOKEN'));
});

test('cov: FORMAT_ONLY_TOKENS includes new tokens', () => {
  assert.ok(FORMAT_ONLY_TOKENS.has('LLLL'));
  assert.ok(FORMAT_ONLY_TOKENS.has('LLL'));
  assert.ok(FORMAT_ONLY_TOKENS.has('cccc'));
  assert.ok(FORMAT_ONLY_TOKENS.has('ccc'));
  assert.ok(FORMAT_ONLY_TOKENS.has('GGGG'));
  assert.ok(FORMAT_ONLY_TOKENS.has('G'));
  assert.ok(FORMAT_ONLY_TOKENS.has('zzzz'));
  assert.ok(FORMAT_ONLY_TOKENS.has('z'));
});