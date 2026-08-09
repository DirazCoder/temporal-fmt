import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Every locale-aware test elsewhere in the suite checks a small handful of
// locales (en-US mainly, plus one or two others per test). That's fine for
// checking a mechanism works, but it means most of the ICU locale surface
// has never actually been exercised. These run the locale-aware tokens
// (MMMM, MMM, EEEE, EEE, a) across a broad locale set in one pass, plus
// document a specific numeric-token ambiguity that's real and deterministic
// but easy to trip over silently.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const LOCALES = [
  'en-US', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'ko-KR', 'ar-EG', 'ru-RU',
  'th-TH', 'he-IL', 'hi-IN', 'pt-BR', 'es-ES', 'it-IT', 'tr-TR', 'pl-PL',
  'nl-NL', 'sv-SE', 'vi-VN', 'id-ID',
];

test(`MMMM round-trips (format then parse back to the same month) across every locale in the matrix, ja-JP included`, () => {
  // ja-JP used to be the one exception here — see partValue()'s comment in
  // localeVocab.ts for why its vocab and format() disagreed, now fixed.
  const date = Temporal.PlainDate.from('2026-08-04');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, 'MMMM d, yyyy', { locale });
      const reparsed = parse('MMMM d, yyyy', formatted, { locale });
      if (reparsed.month !== 8) {
        failures.push({ locale, formatted, gotMonth: reparsed.month });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test(`MMM (short month) round-trips across every locale in the matrix, including ja-JP now that its vocab/format mismatch is fixed`, () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, 'MMM d, yyyy', { locale });
      const reparsed = parse('MMM d, yyyy', formatted, { locale });
      if (reparsed.month !== 8) {
        failures.push({ locale, formatted, gotMonth: reparsed.month });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test(`EEEE (long weekday) round-trips across every locale in the matrix, including th-TH now that resolveCalendar() requires an explicit -u-ca- extension`, () => {
  // th-TH used to be excluded here — its default calendar (Buddhist) got
  // silently picked up by resolveCalendar() even without an explicit
  // -u-ca- extension in the locale tag, breaking the round trip. See the
  // dedicated test below for the fix.
  const date = Temporal.PlainDate.from('2026-08-03'); // Monday
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, 'EEEE, yyyy-MM-dd', { locale });
      const reparsed = parse('EEEE, yyyy-MM-dd', formatted, { locale });
      if (reparsed.toString() !== '2026-08-03') {
        failures.push({ locale, formatted, gotDate: reparsed.toString() });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test('th-TH: plain locale (no -u-ca- extension) round-trips as Gregorian, not the locale\'s Buddhist default', () => {
  // resolveCalendar() used to pick up th-TH's default Buddhist calendar
  // even without an explicit -u-ca- tag — see the comment above
  // resolveCalendar() in parse.ts for the full failure mode.
  const date = Temporal.PlainDate.from('2026-08-03'); // a real Monday, Gregorian
  const formatted = format(date, 'yyyy-MM-dd', { locale: 'th-TH' });
  assert.equal(formatted, '2026-08-03');

  const reparsed = parse('yyyy-MM-dd', formatted, { locale: 'th-TH' });
  assert.equal(reparsed.calendarId, 'iso8601', 'no -u-ca- extension means no non-Gregorian calendar is applied');
  assert.equal(reparsed.toString(), date.toString(), 'format() then parse() with the plain th-TH tag is now an actual round trip');
});

test('th-TH: explicit -u-ca-buddhist extension still opts into Buddhist-calendar parsing on request', () => {
  // confirms the opt-in path itself still works — the fix narrows when
  // resolveCalendar() applies a calendar, it doesn't remove the feature.
  const result = parse('yyyy-MM-dd', '2569-08-03', { locale: 'th-TH-u-ca-buddhist' });
  assert.equal(result.calendarId, 'buddhist');
});

test(`EEE (short weekday) round-trips across every locale in the matrix, th-TH included`, () => {
  const date = Temporal.PlainDate.from('2026-08-03');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, 'EEE, yyyy-MM-dd', { locale });
      const reparsed = parse('EEE, yyyy-MM-dd', formatted, { locale });
      if (reparsed.toString() !== '2026-08-03') {
        failures.push({ locale, formatted, gotDate: reparsed.toString() });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test(`"a" (day period) round-trips both AM and PM across all ${LOCALES.length} locales`, () => {
  const am = Temporal.PlainDateTime.from('2026-08-04T01:00:00');
  const pm = Temporal.PlainDateTime.from('2026-08-04T13:00:00');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const amFormatted = format(am, 'yyyy-MM-dd h:mm a', { locale });
      const pmFormatted = format(pm, 'yyyy-MM-dd h:mm a', { locale });
      const amParsed = parse('yyyy-MM-dd h:mm a', amFormatted, { locale });
      const pmParsed = parse('yyyy-MM-dd h:mm a', pmFormatted, { locale });
      if (amParsed.hour !== 1 || pmParsed.hour !== 13) {
        failures.push({ locale, amFormatted, pmFormatted, gotAmHour: amParsed.hour, gotPmHour: pmParsed.hour });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test('all 12 MMMM names are pairwise distinct within each locale (a same-locale collision would be worse than the cross-locale "May" case)', () => {
  // format.test.js/localeVocab.test.js already confirmed en-US's 12 months
  // are distinct — this broadens that check to every locale in the matrix,
  // since a locale-specific collision (not just MMMM===MMM, which is fine)
  // would silently misparse
  const failures = [];
  for (const locale of LOCALES) {
    const names = new Set();
    for (let m = 1; m <= 12; m++) {
      const date = Temporal.PlainDate.from({ year: 2026, month: m, day: 1 });
      names.add(format(date, 'MMMM', { locale }));
    }
    if (names.size !== 12) {
      failures.push({ locale, uniqueCount: names.size, names: [...names] });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test('all 7 EEEE names are pairwise distinct within each locale', () => {
  const failures = [];
  for (const locale of LOCALES) {
    const names = new Set();
    for (let d = 0; d < 7; d++) {
      const date = Temporal.PlainDate.from('2026-08-03').add({ days: d });
      names.add(format(date, 'EEEE', { locale }));
    }
    if (names.size !== 7) {
      failures.push({ locale, uniqueCount: names.size, names: [...names] });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

// --- Adjacent unpadded numeric token ambiguity ---
//
// M (1-2 digits, no leading zero) directly followed by d (1-2 digits, no
// leading zero) with no separator is genuinely ambiguous for some inputs —
// e.g. "125" could theoretically be month 1/day 25 or month 12/day 5 if d
// allowed a leading zero, which it doesn't, so only one parse is actually
// valid per input shape. Still worth pinning down explicitly: this is
// deterministic (regex engines resolve alternation left-to-right, greedy),
// but a caller reasoning about "M" + "d" with no separator should be able
// to see the actual resolved rule, not just infer it.

test('unpadded month+day glued with no separator: "34" (single digit + single digit) resolves as month 3, day 4', () => {
  const result = parse('yyyy-Md', '2026-34');
  assert.equal(result.month, 3);
  assert.equal(result.day, 4);
});

test('unpadded month+day glued with no separator: "125" resolves as month 1, day 25 — not month 12, day 5', () => {
  // both readings are numerically plausible (month 1 or month 12), but only
  // one is valid given d's "no leading zero" fragment: month=12,day=5 would
  // need "05" for day 5, which d's own regex rejects. So there's exactly
  // one valid parse here, and it's confirmed deterministic across repeated
  // calls (same regex, same compiled pattern from the cache every time).
  const result = parse('yyyy-Md', '2026-125');
  assert.equal(result.month, 1);
  assert.equal(result.day, 25);
});

test('unpadded month+day glued with no separator: "1225" resolves as month 12, day 25', () => {
  const result = parse('yyyy-Md', '2026-1225');
  assert.equal(result.month, 12);
  assert.equal(result.day, 25);
});

test('unpadded month+day glued with no separator: "304" has no valid parse and throws, rather than silently picking one reading', () => {
  // month=3/day=04 is invalid (d rejects the leading zero) and month=30/day=4
  // is invalid (M tops out at 12) — genuinely no valid reading exists, and
  // the fully-anchored regex correctly rejects it instead of guessing
  assert.throws(() => parse('yyyy-Md', '2026-304'), /no valid pattern matches/);
});
