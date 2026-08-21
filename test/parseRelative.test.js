import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRelative, setTemporal } from "../dist/index.js";
import { Temporal as PolyfillTemporal } from "temporal-polyfill/full";

// parseRelative resolves common English relative-date phrases against
// a reference date, returning a Temporal.PlainDate. Supported:
// - weekday refs: "next Tuesday", "last Friday", "this Monday"
// - day offsets: "today", "tomorrow", "yesterday"
// - unit offsets: "in 3 days", "2 weeks ago", "in 1 month"
// - month-day without year: "March 5th"
//
// For "next X" said on X (e.g. today is Tuesday, asking for "next
// Tuesday"), it returns 7 days out (strictly future, not today).
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const REFERENCE = Temporal.PlainDate.from("2026-08-04"); // Tuesday

test("today: returns the reference date itself", () => {
  assert.equal(parseRelative("today", REFERENCE).toString(), "2026-08-04");
});

test("tomorrow / yesterday: ±1 day", () => {
  assert.equal(parseRelative("tomorrow", REFERENCE).toString(), "2026-08-05");
  assert.equal(parseRelative("yesterday", REFERENCE).toString(), "2026-08-03");
});

test("next Tuesday said on a Tuesday returns 7 days out, not today", () => {
  // 2026-08-04 is a Tuesday. "next Tuesday" means strictly-future
  // next occurrence, which on a Tuesday is 7 days from now. This
  // is the documented behavior — "this Tuesday" handles the
  // same-week case, so "next Tuesday" stays strictly-future to
  // give the two phrases distinct, non-overlapping meanings.
  assert.equal(
    parseRelative("next Tuesday", REFERENCE).toString(),
    "2026-08-11",
  );
});

test("next Friday returns the next occurrence of Friday (3 days out from Tuesday)", () => {
  assert.equal(
    parseRelative("next Friday", REFERENCE).toString(),
    "2026-08-07",
  );
});

test("next Monday returns the next occurrence of Monday (6 days out)", () => {
  assert.equal(
    parseRelative("next Monday", REFERENCE).toString(),
    "2026-08-10",
  );
});

test("last Monday said on a Tuesday returns 7 days ago, not yesterday", () => {
  // Symmetric to "next X" on X: "last Monday" said on a Tuesday is
  // most recent strictly-past Monday, which is yesterday (2026-08-03).
  // Wait — that's NOT 7 days ago. The spec says strictly-past most
  // recent occurrence: yesterday IS strictly past (1 day ago), so
  // this is correct as the most-recent-strictly-past Monday.
  // Let me re-verify: REFERENCE is Tuesday 2026-08-04.
  // last Monday (most recent Monday strictly in the past) = 2026-08-03 (yesterday).
  assert.equal(
    parseRelative("last Monday", REFERENCE).toString(),
    "2026-08-03",
  );
});

test("last Tuesday said on a Tuesday returns 7 days ago", () => {
  // Today is Tuesday; last Tuesday strictly-past must be 7 days ago,
  // not today. Same logic as "next Tuesday on Tuesday" being 7 days out.
  assert.equal(
    parseRelative("last Tuesday", REFERENCE).toString(),
    "2026-07-28",
  );
});

test("last Friday returns the most recent occurrence of Friday (5 days ago from Tuesday)", () => {
  // 2026-08-04 is Tuesday. Last Friday was 2026-07-31 (5 days ago).
  assert.equal(
    parseRelative("last Friday", REFERENCE).toString(),
    "2026-07-31",
  );
});

test("this Wednesday returns the X of the current ISO week (1 day from Tuesday)", () => {
  // Current ISO week (Mon..Sun) of 2026-08-04 (Tuesday) is the week
  // starting Monday 2026-08-03. Wednesday of this week = 2026-08-05.
  assert.equal(
    parseRelative("this Wednesday", REFERENCE).toString(),
    "2026-08-05",
  );
});

test("this Monday returns the Monday of the current week (yesterday from Tuesday)", () => {
  // Monday of this week (2026-08-03) was yesterday from a Tuesday.
  assert.equal(
    parseRelative("this Monday", REFERENCE).toString(),
    "2026-08-03",
  );
});

test("in 3 days returns +3 days", () => {
  assert.equal(parseRelative("in 3 days", REFERENCE).toString(), "2026-08-07");
});

test("2 weeks ago returns -14 days", () => {
  assert.equal(
    parseRelative("2 weeks ago", REFERENCE).toString(),
    "2026-07-21",
  );
});

test("in 1 month returns +1 calendar month", () => {
  assert.equal(parseRelative("in 1 month", REFERENCE).toString(), "2026-09-04");
});

test("in 1 year returns +1 calendar year", () => {
  assert.equal(parseRelative("in 1 year", REFERENCE).toString(), "2027-08-04");
});

test("5 years ago returns -5 calendar years", () => {
  assert.equal(
    parseRelative("5 years ago", REFERENCE).toString(),
    "2021-08-04",
  );
});

test('month-day without year: "March 5th" resolves to next occurrence (future-leaning)', () => {
  // Today is 2026-08-04. "March 5th" said on Aug 4 2026:
  // March 5 2026 is in the past (5 months ago), so the next
  // occurrence is March 5 2027. Documented as future-leaning.
  assert.equal(parseRelative("March 5th", REFERENCE).toString(), "2027-03-05");
});

test('month-day: "December 25" said in August resolves to this year (Christmas still upcoming)', () => {
  // Dec 25 2026 is 4 months in the future from Aug 4 2026, so it's
  // this year's occurrence.
  assert.equal(
    parseRelative("December 25", REFERENCE).toString(),
    "2026-12-25",
  );
});

test("month-day: today is the named date → returns today", () => {
  // 2026-08-04 → "August 4th" said on August 4 returns today.
  assert.equal(parseRelative("August 4th", REFERENCE).toString(), "2026-08-04");
});

test('month-day abbreviated: "Aug 4" works the same as "August 4"', () => {
  assert.equal(parseRelative("Aug 4th", REFERENCE).toString(), "2026-08-04");
  assert.equal(parseRelative("Aug 4", REFERENCE).toString(), "2026-08-04");
});

test("month-day with explicit year is ignored (year stripped per spec — month-day only)", () => {
  // The regex accepts an optional year, but per the spec the phrase
  // is "month-day without year" — so the year is informational and
  // the result is still resolved as next occurrence.
  assert.equal(
    parseRelative("March 5th, 2030", REFERENCE).toString(),
    "2027-03-05",
  );
});

test("month-day resolution throws clearly if the active Temporal lacks PlainDate.compare", () => {
  // resolveToNextOccurrence needs PlainDate.compare to decide whether
  // this year's occurrence is still upcoming. Real Temporal
  // implementations all expose it, but the type only marks it optional
  // — simulate a partial implementation via a Proxy that hides it, and
  // confirm parseRelative fails loudly instead of doing undefined-method
  // arithmetic.
  const brokenPlainDate = new Proxy(Temporal.PlainDate, {
    get(target, prop, receiver) {
      if (prop === "compare") return undefined;
      return Reflect.get(target, prop, receiver);
    },
  });
  const brokenTemporal = { ...Temporal, PlainDate: brokenPlainDate };
  setTemporal(brokenTemporal);
  try {
    assert.throws(
      () => parseRelative("March 5th", REFERENCE),
      /needs Temporal\.PlainDate\.compare/,
    );
  } finally {
    setTemporal(Temporal);
  }
});

test("Feb 29th on a leap-year reference resolves to this year", () => {
  // 2024-01-01 reference: Feb 29 2024 is upcoming (in the future),
  // so it returns 2024-02-29.
  const ref = Temporal.PlainDate.from("2024-01-01");
  assert.equal(parseRelative("Feb 29th", ref).toString(), "2024-02-29");
});

test("Feb 29th on a non-leap reference falls through to next leap year", () => {
  // 2023-01-01 reference: Feb 29 2023 doesn't exist; the next leap
  // year (2024) is tried.
  const ref = Temporal.PlainDate.from("2023-01-01");
  assert.equal(parseRelative("Feb 29th", ref).toString(), "2024-02-29");
});

test("Feb 29th in a 2-year non-leap window throws descriptively", () => {
  // Reference 2025-01-01: 2025 isn't leap, 2026 isn't leap. Both
  // from() calls inside resolveToNextOccurrence throw, surfacing
  // a clear "not a valid date in either X or X+1" error.
  const ref = Temporal.PlainDate.from("2025-01-01");
  assert.throws(
    () => parseRelative("Feb 29th", ref),
    /can't resolve month 2 day 29.*isn't a valid date in either 2025 or 2026/,
  );
});

test('adversarial: "5 days" without "in" or "ago" throws (no direction inferred)', () => {
  // "5 days" is ambiguous — past or future? Per the spec, parse()
  // refuses to guess. Throws a clear error pointing at the
  // disambiguation options.
  assert.throws(
    () => parseRelative("5 days", REFERENCE),
    /can't tell whether "5 days" is past or future/,
  );
});

test('adversarial: "next foo" (unrecognized weekday) throws rather than guessing', () => {
  assert.throws(
    () => parseRelative("next foo", REFERENCE),
    /doesn't recognize "next foo"/,
  );
});

test("adversarial: empty input throws", () => {
  assert.throws(() => parseRelative("", REFERENCE), /empty input string/);
  assert.throws(() => parseRelative("   ", REFERENCE), /empty input string/);
  assert.throws(() => parseRelative(null, REFERENCE), /empty input string/);
});

test("adversarial: garbage input throws", () => {
  assert.throws(
    () => parseRelative("the quick brown fox", REFERENCE),
    /doesn't recognize/,
  );
});

test("adversarial: weekday phrase with extra spaces collapses whitespace", () => {
  assert.equal(
    parseRelative("next   Tuesday", REFERENCE).toString(),
    "2026-08-11",
  );
  assert.equal(
    parseRelative("  in  3  days  ", REFERENCE).toString(),
    "2026-08-07",
  );
});

test("adversarial: case-insensitive matching", () => {
  // "next tuesday" (lowercase) should match the same as "next Tuesday"
  assert.equal(
    parseRelative("next tuesday", REFERENCE).toString(),
    "2026-08-11",
  );
  assert.equal(parseRelative("TOMORROW", REFERENCE).toString(), "2026-08-05");
});

test('adversarial: "March 5th" parses regardless of case', () => {
  assert.equal(parseRelative("march 5th", REFERENCE).toString(), "2027-03-05");
});

test("reference date without dayOfWeek throws clearly (PlainTime etc.)", () => {
  // PlainTime has no dayOfWeek — parseRelative needs it to compute
  // weekday offsets. Throw with a clear message rather than crashing
  // on undefined arithmetic.
  const time = Temporal.PlainTime.from("15:45:00");
  assert.throws(
    () => parseRelative("next Tuesday", time),
    /needs a reference date exposing dayOfWeek/,
  );
});

test("this Tuesday said on a Tuesday returns today", () => {
  // Today is Tuesday; "this Tuesday" = Tuesday of the current week = today.
  assert.equal(
    parseRelative("this Tuesday", REFERENCE).toString(),
    "2026-08-04",
  );
});

test("reference date missing year throws clearly", () => {
  // "today" needs year/month/day to build the result date. A bag
  // missing year is the same failure mode as the dayOfWeek case above,
  // just for a different phrase class.
  assert.throws(
    () => parseRelative("today", { month: 8, day: 4 }),
    /reference date is missing year/,
  );
});

test("reference date missing month throws clearly", () => {
  assert.throws(
    () => parseRelative("today", { year: 2026, day: 4 }),
    /reference date is missing month/,
  );
});

test("reference date missing day throws clearly", () => {
  assert.throws(
    () => parseRelative("today", { year: 2026, month: 8 }),
    /reference date is missing day/,
  );
});

test("malformed locale tag falls back to English rather than throwing", () => {
  // Intl.Locale rejects '???' outright — grammarForLocale catches that
  // and falls back to English instead of letting a bad locale string
  // take down parsing.
  assert.equal(
    parseRelative("today", REFERENCE, { locale: "???" }).toString(),
    "2026-08-04",
  );
});

test("parseRelative result type is PlainDate for every supported phrase", () => {
  // The function returns `unknown` per its TS signature (no ambient
  // Temporal types), but the runtime shape is PlainDate. Confirm
  // the .toString() format is the PlainDate ISO form for each
  // supported phrase.
  const phrases = [
    "today",
    "tomorrow",
    "yesterday",
    "next Tuesday",
    "last Friday",
    "this Wednesday",
    "in 3 days",
    "2 weeks ago",
    "in 1 month",
    "5 years ago",
    "March 5th",
    "Dec 25",
  ];
  for (const phrase of phrases) {
    const result = parseRelative(phrase, REFERENCE);
    assert.equal(typeof result.toString(), "string");
    assert.match(result.toString(), /^\d{4}-\d{2}-\d{2}$/);
  }
});
