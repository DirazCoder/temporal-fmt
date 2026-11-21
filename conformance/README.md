# Conformance fixtures

`fixtures.json` is a portable, library-agnostic test-vector set for
token-based Temporal formatters. It's written against a different
library's token vocabulary, not temporal-fmt's — the fixtures are
data, not code. Each case names an `op` (`format` / `parse` /
`roundtrip`), an input, a pattern, and an expected result, so any
library with a `format`/`parse` pair can be pointed at it.

`temporal-fmt.test.js` is the temporal-fmt-specific adapter. It
translates fixture patterns into temporal-fmt's actual tokens, runs
the cases against `format()`/`parse()`, and checks the result.
Run it separately with `npm run test:conformance`; it is intentionally
not part of `npm test`'s classic `node:test` suite. `npm run test:all`
runs it as a separate step.

`reference.test.js` adds independently authored, translated vectors for
the public APIs that overlap with external standards and libraries.
`scripts/run-conformance.mjs` discovers and runs every `*.test.js` file
in this directory.

## External reference sources and scope

These are curated vectors, not imported copies of complete upstream
suites or datasets. Each case is expressed in temporal-fmt's public API
and only tests behavior this package implements. Passing this suite does
not claim full conformance to any upstream suite or standard.

| Source | Adapted coverage | Deliberate limit |
|---|---|---|
| TC39 [Temporal built-ins](https://github.com/tc39/test262/tree/main/test/built-ins/Temporal) and [Intl402](https://github.com/tc39/test262/tree/main/test/intl402/Temporal) in Test262 | Temporal calendar boundaries and format/parse behavior at this library's API boundary | Does not test Temporal engine internals or constructor semantics unrelated to this package |
| [Unicode CLDR](https://github.com/unicode-org/cldr-json) via `Intl.DateTimeFormat` | Month/weekday names across representative locales, Arabic digits, Hebrew leap-month naming | Uses the host runtime's ICU/CLDR data as the reference; does not vendor the CLDR dataset |
| [IANA tzdb](https://www.iana.org/time-zones) | New York gaps/overlaps and historical offset seconds, Lord Howe's half-hour transition, Sydney DST, Apia's skipped date | Representative transition vectors, not a full historical tzdb comparison |
| [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), with related [libical](https://github.com/libical/libical) and [ical.js](https://github.com/mozilla-comm/ical.js) fixture domains | Supported `FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`, and exclusion behavior | Does not claim `BYSETPOS`, `WKST`, `BYHOUR`, `BYMINUTE`, `BYSECOND`, or `RDATE` support |
| [date-fns format tokens](https://date-fns.org/docs/format) | Representative shared token semantics, including calendar, ordinal, week, era, and fraction output | Does not import date-fns tests; token overlap is not complete parity |
| [chrono-node](https://github.com/wanasit/chrono) | Relative phrases accepted by `parseRelative()` in English, Spanish, French, and German | `parseRelative()` is not a general natural-language parser; unsupported grammar and locales are excluded |
| [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339), [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822), [RFC 9110 HTTP-date](https://www.rfc-editor.org/rfc/rfc9110), and ISO 8601 durations | Supported timestamp grammars, offsets, canonical output, obsolete HTTP-date forms, and duration round-trips | RFC 3339 leap seconds are normalized to second 59 because Temporal has no leap-second representation; the duration parser accepts the loose extension `P1YT` and formats it canonically as `P1Y` |

No upstream test code or reference dataset is vendored here. The source
links establish the standards and behavior domains used to author the
vectors; the tests and expected values are adapted for temporal-fmt.

## Why this is separate from `test/adversarial.test.js` and `test/fuzz.test.js`

Those two check that temporal-fmt is internally consistent under
hostile input — clean throw or correct value, never a crash or a
silently wrong one. The reference point there is the library's own
logic.

This folder is different: it checks temporal-fmt against an external,
shared set of tricky-but-well-defined cases — DST transitions, leap
years, offset rendering, calendar limits — where "correct" comes from
the fixture, not from temporal-fmt's own code.

## Pattern translation

Two fixture tokens don't exist in temporal-fmt:

| Fixture token | temporal-fmt equivalent | Why |
|---|---|---|
| `ZZ` (always-signed offset, never `Z`) | `xxx` | Only the **uppercase** `X`/`XX`/`XXX` family collapses `+00:00` to `Z` (see `formatOffset()` in `src/tokens/tokens.ts`). Lowercase never does, which is exactly `ZZ`'s semantics. Mapping `ZZ` to `XXX` was tried first and is wrong — it fails `offset-ZZ-format-utc-not-Z` and `zone-utc-roundtrip`, both of which expect `+00:00`, not `Z`. |
| `VV` (IANA zone id) | `zzz` | temporal-fmt's only zone-identity token. |

Translation happens in `translatePattern()` and skips anything inside
a quoted literal span. Everything else in the fixture set — `yyyy`,
`MM`, `dd`, `HH`, `mm`, `ss`, `S`..`SSSSSSSSS`, `h`, `a`,
`X`/`XX`/`XXX` — already matches temporal-fmt's vocabulary directly.

One token has no equivalent at all: bare `y`, an unpadded,
variable-width year. temporal-fmt only has `yyyy` and `yy`, so there's
no way to write `y-MM-dd` as a temporal-fmt pattern. Cases using it
can't be adapted; see below.

## `opinionated` cases

Some cases are flagged `"opinionated": true` right in the fixture.
These encode a design choice of the fixture's source library, not a
fact about dates, and temporal-fmt is allowed to disagree with them.
The adapter still runs them — if temporal-fmt's behavior differs, it
logs a divergence note (printed at the end of the run) instead of
failing the suite.

One case actually diverges: **`shape-mixing-H-and-a-rejected`**.
temporal-fmt's `resolveHour()` (`src/parse/parse.ts`) cross-checks `H`
against `a` instead of banning the combination outright, so `13:05
PM` is accepted — 13:00 is consistent with PM, only a genuine
contradiction throws. Intentional, and already covered by
`test/lenient.test.js`/`test/parse.test.js`.

## Cases NOT flagged `opinionated` that still diverge

These are real behavior differences. The fixture doesn't call them
out as design choices, and they weren't predicted going in — they
turned up from actually running the adapter. Each one lives in
`KNOWN_FAILURES` at the top of `temporal-fmt.test.js`, and the
harness asserts they *stay* failing, so a genuine fix removes them
automatically instead of the test quietly starting to lie.

**Real bug: offset seconds get dropped, not rejected.**
`formatOffset()` (`src/tokens/tokens.ts`) assumes every offset string is
exactly 6 characters — sign, `HH`, `:`, `MM` — and never checks for a
seconds component. Same root cause, two symptoms:
- `offset-sub-minute-rejected-by-X` — pattern `X` on a pre-1900
  `America/New_York` offset (`-04:56:02`) should throw instead of
  truncating; it silently returns `-0456`.
- `offset-sub-minute-passes-through-ZZ` — `xxx` should pass the full
  `-04:56:02` through; it truncates to `-04:56`.

**Design difference: offset-only `ZonedDateTime` construction is
supported on purpose.** `parse()` can build a `ZonedDateTime` from an
offset token alone, no `zzz` zone required — that's the
`offsetString`-only branch in `src/parse/parse.ts`, and it's deliberate, not
an oversight. The fixture assumes a zone is always required:
- `zone-required-for-zoneddatetime`
- `zone-offset-token-rejected-on-plain-type` (same branch also lets a
  pattern with only an offset token resolve to a fixed-offset
  `ZonedDateTime` instead of getting refused outright)

**Vocabulary gap: no `y` token.** Cases using bare `y` can't be
adapted at all — there's no temporal-fmt token for an unpadded year:
- `extreme-year-max-supported`
- `extreme-year-negative`

`extreme-year-past-max-rejected` also uses `y`, but it's *not* in
`KNOWN_FAILURES`. It expects a throw, and "no valid pattern matches"
for the unrecognized token happens to also throw — so it passes, just
not for the reason it claims to. It isn't testing year-275761
rejection right now. Flagging that here rather than leaving it green
and silent.

**Unresolved.** `offset-X-parse-accepts-four-digit` expects `X`/`x`
to parse a 4-digit offset body (`+0530`). `parseOffsetString()`'s own
per-piece checks allow this for `X`/`x`, but parsing fails earlier
with "no valid pattern matches the format string and input shape" —
probably because the capturing regex built in `pattern.ts` doesn't
offer the 4-digit shape as an alternative for `X`. Wasn't traced
further; outside scope for adding a test folder.

## Adapter mapping notes

- `parse(formatStr, input, options)` takes `(formatStr, input)` —
  reversed from the fixture's `pattern`/`input` field order.
- temporal-fmt has no error class hierarchy. `parse()`/`format()`
  both throw plain `Error`, so the fixture's `expect.throws` values
  (`"ParseError"`, `"FormatError"`, `"InvalidPatternError"`) don't
  map to real classes here. The adapter just treats any thrown
  `Error` as satisfying `expect.throws`.
- `target` in the fixture is informational only. temporal-fmt's
  `parse()` infers the result shape from which fields the pattern
  captures, so the adapter never passes `target` as an input.