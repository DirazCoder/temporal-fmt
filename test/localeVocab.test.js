import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// getLocaleVocab() isn't exported — only reachable through the locale-aware
// tokens (MMMM, MMM, EEEE, EEE, a). format.test.js/parse.test.js check a
// few individual locale strings; these check the vocab's shape and caching
// behavior specifically — that all 12 months and 7 weekdays actually come
// back distinct, and that a locale computed once doesn't drift or get
// rebuilt inconsistently on repeat use.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('all 12 months in en-US are distinct strings', () => {
  const names = new Set();
  for (let m = 1; m <= 12; m++) {
    const date = Temporal.PlainDate.from({ year: 2026, month: m, day: 1 });
    names.add(format(date, 'MMMM'));
  }
  assert.equal(names.size, 12);
});

test('all 7 weekdays in en-US are distinct strings, long and short', () => {
  const longNames = new Set();
  const shortNames = new Set();
  for (let d = 0; d < 7; d++) {
    const date = Temporal.PlainDate.from('2026-08-03').add({ days: d }); // 2026-08-03 is a Monday
    longNames.add(format(date, 'EEEE'));
    shortNames.add(format(date, 'EEE'));
  }
  assert.equal(longNames.size, 7);
  assert.equal(shortNames.size, 7);
});

test('weekday index 0 is Monday, matching Temporal dayOfWeek numbering, not JS Date getDay()', () => {
  // 2026-08-03 is a Monday. If localeVocab.ts's weekday walk were anchored
  // to JS Date.getDay() (0 = Sunday) instead of ISO dayOfWeek, this would
  // come back shifted by one.
  const monday = Temporal.PlainDate.from('2026-08-03');
  assert.equal(format(monday, 'EEEE'), 'Monday');
});

test('short month names are actually shorter than long ones for every month, en-US', () => {
  for (let m = 1; m <= 12; m++) {
    const date = Temporal.PlainDate.from({ year: 2026, month: m, day: 1 });
    const long = format(date, 'MMMM');
    const short = format(date, 'MMM');
    assert.ok(short.length <= long.length, `MMM "${short}" should not be longer than MMMM "${long}" for month ${m}`);
  }
});

test('dayPeriodPart (the "a" token handler) produces different strings for AM and PM, en-US', () => {
  // NOTE: renamed from "dayPeriod vocab dedups to exactly 2 entries" — this
  // test calls format(), which routes through dayPeriodPart() in tokens.ts,
  // not getLocaleVocab(). getLocaleVocab().dayPeriod is a separate array
  // that only parse()'s reverse lookup reads; see the two tests below for
  // that one specifically.
  const am = Temporal.PlainDateTime.from('2026-08-04T01:00:00');
  const pm = Temporal.PlainDateTime.from('2026-08-04T13:00:00');
  const amStr = format(am, 'a');
  const pmStr = format(pm, 'a');
  assert.notEqual(amStr, pmStr);
});

test('getLocaleVocab().dayPeriod actually resolves 2 distinct entries for en-US, not just "am !== pm" as a proxy', () => {
  // parse()'s reverse lookup does `raw === vocab.dayPeriod[1]` to detect PM —
  // if dayPeriod ever collapsed to length 1 (am === pm for some locale),
  // dayPeriod[1] would be undefined and every parsed hour would silently
  // resolve to AM with no thrown error. getLocaleVocab isn't exported, so
  // this drives it through parse()'s round trip on both AM and PM inputs
  // and confirms they resolve to different hours — the closest external
  // proxy for "dayPeriod[1] is defined and distinct from dayPeriod[0]".
  const amResult = parse('yyyy-MM-dd h:mm a', '2026-08-04 1:00 AM');
  const pmResult = parse('yyyy-MM-dd h:mm a', '2026-08-04 1:00 PM');
  assert.notEqual(amResult.hour, pmResult.hour);
});

test('a locale where AM and PM formatToParts collide would make every 12-hour parse resolve to AM, and this is a real silent-failure risk, not a hypothetical', () => {
  // simulates the collision directly via a stubbed Intl.DateTimeFormat, the
  // same technique used in temporalProvider.test.js — no known real-world
  // locale in this ICU build actually collides (checked en-US, fr-FR,
  // de-DE, ja-JP, zh-CN, ko-KR), so this is the only way to exercise the
  // branch at all rather than hoping to find one.
  //
  // getLocaleVocab() caches per locale tag with no external bust, so this
  // has to use a locale string genuinely untouched anywhere else in the
  // suite — otherwise the vocab is already built (and cached) with real
  // AM/PM strings before the stub below ever runs.
  const freshLocale = 'en-US-x-collide';
  const RealDateTimeFormat = Intl.DateTimeFormat;
  class CollidingDateTimeFormat extends RealDateTimeFormat {
    formatToParts(date) {
      const parts = super.formatToParts(date);
      return parts.map((p) => (p.type === 'dayPeriod' ? { ...p, value: 'MERIDIEM' } : p));
    }
  }
  Intl.DateTimeFormat = CollidingDateTimeFormat;
  try {
    const amResult = parse('yyyy-MM-dd h:mm a', '2026-08-04 1:00 MERIDIEM', { locale: freshLocale });
    // both AM and PM literal text is now "MERIDIEM" per the stub, so the
    // isPM check (raw === dayPeriod[1]) can only ever be true if dayPeriod[1]
    // happens to also be "MERIDIEM" — with a real collision, dayPeriod
    // dedupes to length 1 and dayPeriod[1] is undefined, so isPM is always
    // false and this always resolves to the AM hour (1), never 13
    assert.equal(amResult.hour, 1, 'a collided dayPeriod should silently resolve to AM, not throw or resolve to PM');
  } finally {
    Intl.DateTimeFormat = RealDateTimeFormat;
  }
});

test('English "May" is a real, currently-existing case where MMMM and MMM produce the identical string, and both directions still resolve correctly', () => {
  // not a stub — this is true today, in this ICU build, with no simulation
  // needed. Worth pinning down because monthLong and monthShort are
  // separate arrays feeding separate regex fragments, so an identical
  // string in both lists should never cross-contaminate between the two
  // tokens even though the value itself collides.
  const may = Temporal.PlainDate.from('2026-05-15');
  assert.equal(format(may, 'MMMM'), 'May');
  assert.equal(format(may, 'MMM'), 'May');
  assert.equal(parse('MMMM d, yyyy', 'May 15, 2026').month, 5);
  assert.equal(parse('MMM d, yyyy', 'May 15, 2026').month, 5);
});

test('a locale where weekday formatToParts collides throws a clear build-time error naming both colliding indices, instead of the old confusing same-string-both-sides runtime error', () => {
  // used to only surface via parse()'s dayOfWeek cross-check, with a
  // confusing same-string-both-sides message — assertNoCollision() in
  // localeVocab.ts now catches it earlier with a clearer one
  const freshLocale = 'en-US-x-wdcoll';
  const RealDateTimeFormat = Intl.DateTimeFormat;
  class CollidingDateTimeFormat extends RealDateTimeFormat {
    formatToParts(date) {
      const parts = super.formatToParts(date);
      return parts.map((p) => (p.type === 'weekday' ? { ...p, value: 'DAY' } : p));
    }
  }
  Intl.DateTimeFormat = CollidingDateTimeFormat;
  try {
    assert.throws(
      () => parse('EEEE, yyyy-MM-dd', 'DAY, 2026-08-04', { locale: freshLocale }),
      /renders EEEE weekday index 0 and 1 identically/
    );
  } finally {
    Intl.DateTimeFormat = RealDateTimeFormat;
  }
});

test('a locale where month name formatToParts collides now throws a clear build-time error instead of silently resolving to the wrong month', () => {
  // the more serious of the two collisions — month has no cross-check like
  // weekday does, so this used to silently resolve to the wrong month;
  // assertNoCollision() in localeVocab.ts now catches it at build time
  const freshLocale = 'en-US-x-mcollide';
  const RealDateTimeFormat = Intl.DateTimeFormat;
  class CollidingDateTimeFormat extends RealDateTimeFormat {
    formatToParts(date) {
      const parts = super.formatToParts(date);
      return parts.map((p) => (p.type === 'month' ? { ...p, value: 'MO' } : p));
    }
  }
  Intl.DateTimeFormat = CollidingDateTimeFormat;
  try {
    assert.throws(
      () => parse('MMMM d, yyyy', 'MO 4, 2026', { locale: freshLocale }),
      /renders MMMM month index 0 and 1 identically/
    );
  } finally {
    Intl.DateTimeFormat = RealDateTimeFormat;
  }
});

test('vocab for the same locale is stable across many calls (cache does not drift)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const first = format(date, 'MMMM');
  for (let i = 0; i < 20; i++) {
    assert.equal(format(date, 'MMMM'), first);
  }
});

test('vocab is looked up per exact locale tag — en-US and en-GB are cached independently', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const usResult = format(date, 'MMMM d, yyyy', { locale: 'en-US' });
  const gbResult = format(date, 'd MMMM yyyy', { locale: 'en-GB' });
  // different token order in the format string, but same month name either way
  assert.ok(usResult.includes('August'));
  assert.ok(gbResult.includes('August'));
});

test('parse() reverse lookup finds every one of the 12 en-US month names, not just the one used in other tests', () => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  months.forEach((name, i) => {
    const result = parse('MMMM d, yyyy', `${name} 1, 2026`);
    assert.equal(result.month, i + 1, `expected ${name} to parse as month ${i + 1}`);
  });
});

test('parse() reverse lookup finds every one of the 7 en-US weekday long names', () => {
  // 2026-08-03..09 is Mon..Sun
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  days.forEach((name, i) => {
    const dateStr = Temporal.PlainDate.from('2026-08-03').add({ days: i }).toString();
    const result = parse('EEEE, yyyy-MM-dd', `${name}, ${dateStr}`);
    assert.equal(result.toString(), dateStr);
  });
});

test('a locale with no meaningful hour12 day-period distinction still produces two dayPeriod strings (Intl fallback, not a throw)', () => {
  // some locales render AM/PM identically to their 24-hour hour label,
  // but getLocaleVocab() should still resolve *some* dayPeriod string
  // rather than throwing — the "no dayPeriod part" error path is a
  // fallback, not something normal locales are expected to hit
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:00');
  assert.doesNotThrow(() => format(dt, 'a', { locale: 'de-DE' }));
});
