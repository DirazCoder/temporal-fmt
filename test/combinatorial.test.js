import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Most locale-aware tests elsewhere check en-US plus one or two others.
// This runs the locale-aware tokens (MMMM, MMM, EEEE, EEE, a) across a
// broad locale set in one pass, plus documents a numeric-token ambiguity
// that's deterministic but easy to trip over silently.
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

// M (1-2 digits, no leading zero) directly followed by d with no separator
// is genuinely ambiguous for some inputs — e.g. "125" could in theory be
// month 1/day 25 or month 12/day 5. Worth pinning down explicitly: it's
// deterministic, but a caller should be able to see the resolved rule
// rather than infer it.

test('unpadded month+day glued with no separator: "34" (single digit + single digit) resolves as month 3, day 4', () => {
  const result = parse('yyyy-Md', '2026-34');
  assert.equal(result.month, 3);
  assert.equal(result.day, 4);
});

test('unpadded month+day glued with no separator: "125" is genuinely ambiguous (month 1/day 25 vs month 12/day 5) and throws rather than silently picking one', () => {
  // Originally documented as unambiguous (month=1,day=25 only), on the
  // theory that month=12/day=5 would need "05" for day 5. That reasoning
  // was wrong — d's single-digit branch accepts plain "5" with no leading
  // zero required, so both splits are independently valid: [1,25] and
  // [12,5]. The old short-first regex ordering picked [1,25] silently and
  // never surfaced the other reading. Now that parse() checks for multiple
  // valid splits in an unseparated unpadded-numeric run (see
  // enumerateValidSplits() in pattern.ts), this correctly throws instead
  // of guessing. Found by the token×token combinatorial glue matrix below.
  assert.throws(
    () => parse('yyyy-Md', '2026-125'),
    /is ambiguous/,
    '"125" against "Md" has two independently valid readings and should throw, not pick one'
  );
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

// The M+d case above is one pair out of many with the same shape: any two
// unpadded numeric tokens (no leading zero, variable width) glued with no
// separator can in principle be ambiguous, since a greedy variable-width
// match can eat into digits meant for the next field. Padded tokens (MM,
// dd, HH...) don't have this problem — fixed width means nothing to be
// greedy about — so this only needs to cover M, d, H, h, m, s. (yy and SSS
// are both fixed-width too, same reasoning as padded tokens.)
//
// Scoped to just the glue-ambiguity mechanism. Two other failure modes are
// filtered out so they don't show up as false positives here:
//   1. calendar validity (day=31 in a 30-day month) — already covered by
//      parse()'s overflow:'reject' tests. Unique-split cases naming an
//      invalid day for the sampled month get skipped individually instead
//      of narrowing d's range, so the oracle stays in sync with what the
//      library's own ambiguity check sees.
//   2. field-combination rules (parse() needs year+month+day together;
//      time-only pairs need no date token) — already covered in
//      parse.test.js. Format strings below add a "yyyy-" prefix only for
//      the M+d pair; time pairs get none, since parse() builds a
//      PlainTime from time fields alone.
const UNPADDED_NUMERIC = {
  M: { min: 1, max: 12, field: 'month' },
  d: { min: 1, max: 31, field: 'day' }, // real range — must match pattern.ts's actual fragment, see note above
  H: { min: 0, max: 23, field: 'hour' },
  h: { min: 1, max: 12, field: 'hour' },
  m: { min: 0, max: 59, field: 'minute' },
  s: { min: 0, max: 59, field: 'second' },
};

// Only pairs that form a self-sufficient, independently valid parse target
// with no other token required — this is what keeps "field-combination
// rule" throws (e.g. "needs a full date", "mixes 12h/24h") from showing up
// as false positives in a test that's specifically about glue ambiguity.
// M+d is the only viable date pair (year is padded/fixed-width, excluded
// from UNPADDED_NUMERIC entirely). Any H/h/m/s pair is fine together
// except H+h/h+H/h+h, which hit the 12h/24h mixing rule and h's
// need for an "a" token — both already covered by dedicated tests.
const VIABLE_PAIRS = new Set(['M,d', 'd,M', 'H,m', 'm,H', 'H,s', 's,H', 'm,s', 's,m']);

// M+d is the one pair where a "unique valid split" can still fail — not
// from glue ambiguity, but because the day it names doesn't exist in the
// month it names (calendar overflow, a different and already-tested
// mechanism). Rather than avoid the real day range entirely, skip only the
// specific (month, day) unique-split combinations where that would happen,
// using a fixed 2026 (non-leap) year to match what the test actually
// parses against.
function isCalendarValid(monthVal, dayVal) {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dayVal <= daysInMonth[monthVal - 1];
}

function buildGlueFormatAndInput(a, b, aVal, bVal) {
  // M+d needs the "yyyy-" prefix so parse() has a full date to build;
  // pure time pairs (H/h/m/s combinations) need no date tokens at all —
  // parse() is fine building a PlainTime from time fields alone
  const isDatePair = (a === 'M' || a === 'd') && (b === 'M' || b === 'd');
  const formatStr = isDatePair ? `yyyy-${a}${b}` : `${a}${b}`;
  const digits = `${aVal}${bVal}`;
  const input = isDatePair ? `2026-${digits}` : digits;
  return { formatStr, input };
}

test('every unpadded-numeric-token pair glued with no separator either resolves the unique valid reading, or throws when genuinely ambiguous — never silently returns a wrong reading', () => {
  const tokens = Object.keys(UNPADDED_NUMERIC);
  const failures = [];
  let checked = 0;
  let ambiguousCount = 0;

  // independent oracle: given the glued digit string and the two value
  // widths, count how many (aVal, bVal) splits are *themselves* valid
  // against the pair's own min/max ranges (mirrors, but doesn't call,
  // enumerateValidSplits() in pattern.ts — this needs to check the
  // library's behavior against a ground truth computed separately, not
  // just re-run the same code and agree with itself by construction)
  function countValidSplits(digits, aRange, bRange, aToken, bToken) {
    const results = [];
    for (let w = 1; w <= 2 && w < digits.length; w++) {
      const aPiece = digits.slice(0, w);
      const bPiece = digits.slice(w);
      if (w === 2 && aPiece[0] === '0') continue; // no leading zero on the 2-digit branch
      if (bPiece.length === 2 && bPiece[0] === '0') continue;
      if (bPiece.length < 1 || bPiece.length > 2) continue;
      const aV = parseInt(aPiece, 10);
      const bV = parseInt(bPiece, 10);
      if (aV < aRange.min || aV > aRange.max) continue;
      if (bV < bRange.min || bV > bRange.max) continue;
      // month/day splits also have to be real calendar dates — a split
      // that's in-range for both tokens individually (e.g. month=9, day=31)
      // can still be invalid because September has no 31st. That's a
      // separate, already-tested mechanism (calendar overflow), not glue
      // ambiguity, so it shouldn't count as a "valid split" here.
      if (aToken === 'M' && bToken === 'd' && !isCalendarValid(aV, bV)) continue;
      if (aToken === 'd' && bToken === 'M' && !isCalendarValid(bV, aV)) continue;
      results.push([aV, bV]);
    }
    return results;
  }

  for (const a of tokens) {
    for (const b of tokens) {
      if (a === b) continue; // same field twice glued together isn't a meaningful case
      const pairKey = `${a},${b}`;
      if (!VIABLE_PAIRS.has(pairKey)) continue;

      const { min: aMin, max: aMax, field: aField } = UNPADDED_NUMERIC[a];
      const { min: bMin, max: bMax, field: bField } = UNPADDED_NUMERIC[b];

      // exhaustive over both ranges would be thousands of cases per pair —
      // sample the actual boundary-relevant values instead: min, max, and a
      // handful of widths in between, since the ambiguity mechanism (greedy
      // digit consumption) is a function of digit-count boundaries, not of
      // which specific value within a width class is used
      const sample = (min, max) => {
        const vals = new Set([min, max]);
        for (let v = min; v <= max; v++) {
          if (String(v).length !== String(v - 1 >= min ? v - 1 : v).length) vals.add(v); // width boundary
        }
        vals.add(Math.min(9, max)); // last single-digit value, if in range
        vals.add(Math.max(min, 10)); // first two-digit value, if in range
        return [...vals].filter((v) => v >= min && v <= max);
      };

      for (const aVal of sample(aMin, aMax)) {
        for (const bVal of sample(bMin, bMax)) {
          // skip sampled combos that aren't real calendar dates to begin
          // with (e.g. month=9, day=31) — calendar-overflow rejection is
          // a separate, already-tested mechanism, and testing it here
          // would just mean asserting on our own oracle's blind spot
          if (a === 'M' && b === 'd' && !isCalendarValid(aVal, bVal)) continue;
          if (a === 'd' && b === 'M' && !isCalendarValid(bVal, aVal)) continue;

          checked++;
          const { formatStr, input } = buildGlueFormatAndInput(a, b, aVal, bVal);
          const digits = `${aVal}${bVal}`;
          const validSplits = countValidSplits(digits, { min: aMin, max: aMax }, { min: bMin, max: bMax }, a, b);

          let result, threw;
          try {
            result = parse(formatStr, input);
            threw = false;
          } catch {
            threw = true;
          }

          if (validSplits.length === 0) {
            // shouldn't happen — we constructed the digits from a valid
            // (aVal, bVal) pair, so at least that split must be valid;
            // catches a bug in this test's own oracle, not the library
            failures.push({ pair: pairKey, input, note: 'test oracle found zero valid splits for a value it encoded itself — oracle bug' });
            continue;
          }

          if (validSplits.length === 1) {
            // unambiguous: library must return exactly this reading, not throw
            if (threw) {
              failures.push({ pair: pairKey, formatStr, input, note: 'unique valid split exists but parse() threw', expected: { [aField]: aVal, [bField]: bVal } });
            } else if (result[aField] !== aVal || result[bField] !== bVal) {
              failures.push({
                pair: pairKey, formatStr, input,
                expected: { [aField]: aVal, [bField]: bVal },
                got: { [aField]: result[aField], [bField]: result[bField] },
                note: 'unique valid split, but parse() returned a different value',
              });
            }
          } else {
            // genuinely ambiguous: library must throw, not silently pick one
            ambiguousCount++;
            if (!threw) {
              failures.push({
                pair: pairKey, formatStr, input, validSplits,
                got: { [aField]: result[aField], [bField]: result[bField] },
                note: `${validSplits.length} valid splits exist but parse() silently picked one instead of throwing`,
              });
            }
          }
        }
      }
    }
  }

  assert.ok(checked > 50, `sanity check: expected to have exercised a meaningful number of cases, only ran ${checked}`);
  assert.ok(ambiguousCount > 0, 'sanity check: expected the sampled cases to include at least one genuinely ambiguous glue string');
  assert.equal(
    failures.length, 0,
    `${failures.length}/${checked} glued-pair cases (${ambiguousCount} genuinely ambiguous) didn't match expected ` +
    `behavior:\n${JSON.stringify(failures.slice(0, 10), null, 2)}`
  );
});

// Different adjacency shape: MMMM/MMM/EEEE/EEE/a are alternations over a
// vocab list, not digit patterns, so a numeric neighbor can't eat into
// them the way two numeric tokens can. Worth checking the reverse though —
// does a numeric token glued right after a name-based one still parse its
// own digits correctly, given some locale names can end in a digit-like
// character.

test('a locale-aware token immediately followed by an unpadded numeric token with no separator still parses both fields correctly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const failures = [];
  for (const locale of LOCALES) {
    for (const nameTok of ['MMMM', 'MMM']) {
      const formatStr = `${nameTok}d, yyyy`; // e.g. "Augustd, yyyy" -> "August4, 2026" for MMMM
      try {
        const formatted = format(date, formatStr, { locale });
        const reparsed = parse(formatStr, formatted, { locale });
        if (reparsed.day !== 4 || reparsed.month !== 8) {
          failures.push({ locale, nameTok, formatStr, formatted, got: { day: reparsed.day, month: reparsed.month } });
        }
      } catch (err) {
        failures.push({ locale, nameTok, formatStr, error: err.message });
      }
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

test('"a" (day period) immediately followed by an unpadded numeric token with no separator still parses correctly', () => {
  // day-period strings (AM/PM, 午後, etc.) glued directly to a following
  // digit is an artificial format string shape (nobody writes 'a' without
  // a separator in practice) but worth confirming the alternation doesn't
  // accidentally swallow a leading digit from the next field or vice versa
  const pm = Temporal.PlainDateTime.from('2026-08-04T13:30:00');
  const failures = [];
  for (const locale of LOCALES) {
    const formatStr = 'h:mma s'; // "a" glued directly to "s" with no separator
    try {
      const formatted = format(pm, formatStr, { locale });
      const reparsed = parse(formatStr, formatted, { locale });
      if (reparsed.hour !== 13 || reparsed.second !== 0) {
        failures.push({ locale, formatStr, formatted, got: { hour: reparsed.hour, second: reparsed.second } });
      }
    } catch (err) {
      failures.push({ locale, formatStr, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

// New tokens (do, Q, QQQ, ww, RRRR) in combination with existing tokens.
// These verify that the new tokens compose correctly with the existing
// token set in format strings — not just in isolation.

test('do (ordinal day) composes with month/year tokens across the LOCALES matrix', () => {
  // do is English-only and format-only; locale only affects the
  // locale-aware neighbors (MMMM, MMM). The ordinal suffix itself
  // must remain English regardless of locale, which is the
  // documented contract. Don't round-trip — parse() rejects `do`
  // as a format-only token by design.
  const date = Temporal.PlainDate.from('2026-08-04');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, "MMMM do, yyyy", { locale });
      // ordinal suffix is always English; the month name varies by locale
      if (!formatted.endsWith('4th, 2026')) {
        failures.push({ locale, formatted, note: 'ordinal suffix should always be English "4th"' });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

test('Q and QQQ compose with locale-aware month names (MMMM/MMM) across the LOCALES matrix', () => {
  // The quarter token is locale-independent (always numeric or "Q" + digit),
  // but the month name is locale-aware. Confirm both coexist in a single
  // format string across the full locale matrix and the quarter cross-check
  // still triggers on parse.
  const date = Temporal.PlainDate.from('2026-08-04'); // Q3
  const failures = [];
  for (const locale of LOCALES) {
    for (const fmt of ['Q MMMM d, yyyy', 'QQQ MMMM d, yyyy']) {
      try {
        const formatted = format(date, fmt, { locale });
        const reparsed = parse(fmt, formatted, { locale });
        if (reparsed.toString() !== '2026-08-04') {
          failures.push({ locale, fmt, formatted, got: reparsed.toString() });
        }
      } catch (err) {
        failures.push({ locale, fmt, error: err.message });
      }
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

test('Q and QQQ cross-check works across every locale in the matrix', () => {
  // Adversarial: feed a quarter that disagrees with the month, expect
  // the cross-check to throw regardless of locale.
  const date = Temporal.PlainDate.from('2026-08-04'); // August = Q3
  const failures = [];
  for (const locale of LOCALES) {
    // format "Q1 MMMM d, yyyy" with August = mismatch; we can't
    // format() it (since format() emits the correct Q3), so construct
    // the input manually by swapping the quarter in a format() output.
    const correct = format(date, 'QQQ MMMM d, yyyy', { locale });
    // Replace "Q3" with "Q1" in the formatted string
    const mismatched = correct.replace('Q3', 'Q1');
    try {
      parse('QQQ MMMM d, yyyy', mismatched, { locale });
      failures.push({ locale, mismatched, note: 'should have thrown (quarter disagreement)' });
    } catch (err) {
      if (!/disagrees with the parsed month's actual quarter/.test(err.message)) {
        failures.push({ locale, mismatched, error: err.message, note: 'wrong error type' });
      }
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

test('ww and RRRR compose with date tokens across the LOCALES matrix (numeric tokens are locale-independent)', () => {
  // ww/RRRR are format-only and computed from the date fields; locale
  // only affects the locale-aware neighbors. Confirm ww/RRRR compose
  // correctly with both numeric (yyyy-MM-dd) and locale-aware (MMMM)
  // neighbors.
  const date = Temporal.PlainDate.from('2026-08-04');
  const failures = [];
  for (const locale of LOCALES) {
    try {
      const formatted = format(date, "yyyy-MM-dd 'W'ww RRRR", { locale });
      const expected = "2026-08-04 'W'32 2026".replace("'W'", 'W');
      if (formatted !== expected) {
        failures.push({ locale, formatted, expected });
      }
    } catch (err) {
      failures.push({ locale, error: err.message });
    }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 10), null, 2));
});

test('do, Q, QQQ, ww, RRRR all compose together in a single format string', () => {
  // One format string exercising every new token at once — confirms
  // the tokenizer can distinguish all of them and format() emits
  // each in the right position.
  const date = Temporal.PlainDate.from('2026-08-04'); // Tuesday, week 32, Q3
  const formatted = format(date, "yyyy-MM-do 'Q'Q 'in' QQQ 'week' ww of RRRR");
  // do=4th, Q=3, QQQ=Q3, ww=32, RRRR=2026
  assert.equal(formatted, '2026-08-4th Q3 in Q3 week 32 of 2026');
});
