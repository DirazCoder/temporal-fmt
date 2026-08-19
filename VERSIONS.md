# Version Support

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :x:                |
| < 0.6   | :x:                |

`0.8.x` is the current active release line. New features, bug fixes,
security fixes, and parser hardening land here first.

`0.7.x` is still supported and is the previous maintained release line.
Security fixes continue to land there where they are appropriate for the
branch.

`0.6.x` is now end of life. It no longer receives security fixes. Upgrade
to `0.8.x` or `0.7.x` instead.

### Unsupported versions

Everything below `0.7.0` is unsupported.

| Version | Supported |
| ------- | --------- |
| 0.6.x   | :x:       |
| 0.5.x   | :x:       |
| 0.3.x   | :x:       |
| 0.2.x   | :x:       |
| 0.1.x   | :x:       |

These versions are no longer maintained. Upgrading is the fix.

## 0.8.6

`0.8.6` adds three locale-and-config features to the active
`0.8.x` release line. All three are additive: calls with no new
options produce byte-identical output to `0.8.5`, verified against
the captured pre-change baseline.

### Added

- **Multi-language `formatDuration`** — pass `locale: 'es-ES'` /
  `'fr-FR'` / `'de-DE'` (or any locale tag) and the short/long
  word-form tokens (`yy`/`yyy`, `hh`/`hhh`, etc.) delegate to
  `Intl.NumberFormat`'s `style: 'unit'` mode, same approach
  `formatDistance` already uses for `Intl.RelativeTimeFormat`.
  Numeric-only tokens (`y`, `o`, `w`, ...) stay ASCII digits.

  The previous limitation ("English-only, hardcoded table") was
  the documented behavior — a test pinned it down. That test now
  asserts the locale-aware output instead.

  Milliseconds are confirmed supported by `Intl.NumberFormat`'s
  unit list on every Node version we target. The task brief flagged
  this as a possible gap; empirically it isn't.

  Example: `formatDuration({hours:2,minutes:30}, 'hhh mmm',
  {locale:'fr-FR'}) // "2 heures 30 minutes"`

- **Multi-language `parseRelative` for es/fr/de** — each language
  has its own grammar module with its own phrase patterns and
  vocabulary. The matching engine and resolution helpers (weekday
  offset, leap-year fallback, direction-ambiguous throw) are shared
  across languages; only the per-language regex patterns and name
  lists differ. Not a config flag or token substitution over the
  English grammar.

  Every phrase class the English grammar supports has an equivalent
  idiom in each language: weekday refs (next/last/this + weekday),
  relative day offsets (today/tomorrow/yesterday), relative unit
  offsets ("in N X" / "N X ago" equivalents), and month-day
  without year (resolved to next occurrence).

  Same ambiguity philosophy: bare `"3 días"` / `"3 jours"` /
  `"3 Tage"` without a directional marker throws with a localized
  error message pointing at the disambiguation options.

  Diacritics are stripped before matching (NFD + combining-mark
  removal), so `"miercoles"` matches `"miércoles"`, `"aout"`
  matches `"août"`. German umlaut transliterations (`ä` → `ae`,
  `ö` → `oe`, `ü` → `ue`, `ß` → `ss`) are also expanded, so
  `"5. Maerz"` resolves the same as `"5. März"`.

  Cross-language consistency on the same-day-of-week ambiguity:
  `"next Tuesday"` said on a Tuesday means 7 days out, not today —
  and the equivalent idiom in every supported language resolves
  the same way. Documented as a deliberate convention; if a future
  language's natural phrasing resolves differently, document it in
  that grammar's section and here.

  Unknown locales (Italian, Portuguese, etc.) fall back to the
  English grammar rather than throwing — best-effort, matches how
  `formatDistance` treats unknown locales.

  Example: `parseRelative('el próximo martes', today,
  {locale:'es-ES'}).toString() // '2026-08-11'`

- **Configurable cutoffs for `formatDistance`** — the
  seconds→minutes→hours→days→months→years boundaries used to be
  hardcoded. Now override any subset per call via the `cutoffs`
  option; unspecified boundaries fall back to the defaults (60s,
  60min, 24h, 30d, 365d). Not a global registration function —
  cutoffs are a per-call display preference, not shared
  vocabulary state like `registerLocaleVocab`.

  The `months` cutoff is in days, not months — "months" itself
  isn't a fixed number of days, so the months→years boundary is
  expressed as a day count, matching how the original hardcoded
  table expressed the same boundary. This lets a caller say
  "treat anything under 90 days as months" rather than "anything
  under 3 months" (which would require picking a definition of
  "month").

  Throws descriptively on non-monotonic boundaries (e.g.
  `seconds: 300, minutes: 1` — 300s > 1min, so the seconds branch
  would always win and the minutes branch would be unreachable) or
  non-positive values, rather than producing confusing output
  downstream. The error message names all five cutoff values so
  the user can spot the inverted pair.

  Example: `formatDistance(in14d, today, {cutoffs: {days: 10}})
  // "this month" (14d > 10d, crosses into month territory)`

### Unchanged (default path)

- `formatDuration` with no `locale` option: byte-identical English
  output to 0.8.5 (the hardcoded singular/plural table is still
  the default-path fallback).
- `parseRelative` with no `locale` option: English grammar,
  unchanged behavior. All existing English tests pass unmodified.
- `formatDistance` with no `cutoffs` option: same default cutoffs
  as 0.8.5 (60s/60min/24h/30d/365d). Verified byte-for-byte against
  the captured pre-change baseline.

## 0.8.3

`0.8.3` extends the active `0.8.x` release line with new formatting,
parsing, duration, relative-time, locale, and ISO week functionality.

### Added

- **`do` ordinal-day token** — format-only English ordinal day output:
  `1st`, `2nd`, `3rd`, `4th`, and so on. English suffix rules are used,
  including `11th`, `12th`, and `13th`. Other locale-specific ordinal rules
  are not attempted.

  Example: `format(d, 'do') // "4th"`

- **`Q` / `QQQ` quarter tokens** — quarters are computed from the month:
  months 1–3 are Q1, 4–6 are Q2, 7–9 are Q3, and 10–12 are Q4.
  Both formatting and parsing are supported.

  Examples:
  `format(d, 'QQQ') // "Q3"`
  `parse('Q3 2026', 'QQQ yyyy')`

  When parsing, `QQQ` is cross-checked against any month or date token in
  the same format string. A disagreement throws instead of silently
  choosing one value.

- **`ww` / `RRRR` ISO week tokens** — `ww` formats the ISO week number and
  `RRRR` formats the ISO week-numbering year. These tokens are format-only.
  Turning an ISO week back into a date is out of scope because a weekday is
  also required.

  ISO week numbering follows the ISO 8601 rule: week 1 is the week
  containing the year's first Thursday. As a result, the ISO
  week-numbering year can differ from the calendar year.

  Example:
  `format(Temporal.PlainDate.from('2026-12-31'), 'ww RRRR') // "01 2027"`

- **`formatDuration(duration, formatStr, options?)`** — formats
  `Temporal.Duration` values using a separate duration token set covering
  years, months, weeks, days, hours, minutes, seconds, and milliseconds.

  Zero-value units are omitted by default.

  Example:
  `formatDuration(Duration.from({ hours: 2, minutes: 0 }), ...) // "2 hours"`

  Pass `{ showZeroValues: true }` to include zero-value units.

- **`formatDistance(date1, date2, options?)`** — formats relative strings
  such as `"3 days ago"` and `"in 2 hours"`. It uses
  `Intl.RelativeTimeFormat` so locale behavior comes from the platform
  rather than a separate hand-maintained translation table.

- **`lenient` option on `parse()`** — the default parser behavior remains
  strict. An ambiguous glued numeric run such as `Md` against `"121"`
  still throws unless lenient parsing is explicitly enabled.

  Example:
  `parse('121', 'Md', { lenient: true })`

  Lenient mode uses a documented heuristic: when multiple calendrically
  valid splits exist, it prefers a day value of 12 or less over a month
  value greater than 12.

- **`registerLocaleVocab(locale, vocab)`** — supplies month, weekday, and
  AM/PM names that `Intl` does not cover adequately for a particular locale.
  The vocabulary shape is validated when it is registered, so malformed
  tables fail immediately instead of surfacing later during formatting or
  parsing.

- **`parseRelative(input, referenceDate, options?)`** — a separate parser
  for relative date expressions. It covers weekday references such as
  `"next Tuesday"`, day offsets such as `"tomorrow"`, unit offsets such as
  `"in 3 days"`, and month-day expressions such as `"March 5th"`.

  `parseRelative()` uses a separate grammar from the token-based `parse()`.
  Unrecognized phrasing throws instead of guessing.

### Testing

The release includes 416 tests, up from 271, plus 91 Vitest unit tests and
96 type tests.

Coverage includes hand-picked, fuzz, adversarial, and combinatorial cases
for the new features and parser behavior, including:

- ISO week year-boundary dates
- `QQQ` and month disagreement
- lenient-mode split selection
- ordinal-day formatting
- duration formatting
- relative-time formatting
- locale vocabulary registration
- relative date parsing

## 0.8.0

`0.8.0` introduced the current active release line and included parser and
security hardening.

Notable changes include:

- Ambiguous unpadded numeric token parsing no longer expands every possible
  split. Candidate exploration is bounded so deliberately ambiguous formats
  cannot cause combinatorial CPU or memory growth.
- `parse()` rejects excessively large input before attempting regex matching.
- Locale calendar detection now uses canonicalized `Intl.Locale` data instead
  of relying on the original locale string's casing or formatting.
- Timezone parsing supports fixed-offset Temporal timezone identifiers while
  continuing to reject identifiers that are not valid timezone strings.
- Extended and signed years supported by Temporal can be formatted and parsed
  without changing the existing `yyyy` token grammar.
- Cache keys no longer depend on ambiguous string concatenation.
- CI and release workflows no longer depend on floating GitHub Action
  versions or `npm@latest`.
- Regression tests cover the parser hardening and the affected Temporal edge
  cases.

The existing token grammar remains unchanged. In particular, `yyyy` still
requires exactly four digits, and repeated fields retain the established
last-occurrence behavior.

## Behavior changes relevant to upgrading

Several changes affect whether upgrading resolves something you might be
relying on:

- **`0.3.0`** — `format()` now throws on format strings over 1000
  characters, and `yy` now throws on negative years instead of silently
  truncating them.

- **`0.7.2`** — `parse()` now throws when a format string mixes a
  24-hour token (`HH`/`H`) with a 12-hour token (`hh`/`h`), instead of
  silently picking one.

- **`0.8.0`** — parser ambiguity handling is bounded to prevent
  combinatorial resource exhaustion. Oversized parse input is also rejected
  before regex processing. These changes can cause previously accepted
  attacker-controlled or pathological inputs to throw instead.

- **`0.8.0`** — timezone parsing accepts valid fixed-offset Temporal
  timezone identifiers. Invalid timezone identifiers continue to fail during
  pattern matching.

- **`0.8.3`** — `do`, `Q`, `QQQ`, `ww`, and `RRRR` add new formatting
  capabilities. The existing token grammar remains unchanged.

- **`0.8.3`** — `formatDuration()`, `formatDistance()`, and
  `parseRelative()` add new APIs without changing the existing
  `format()` and `parse()` call signatures.

- **`0.8.3`** — `parse()` remains strict by default. The new `lenient`
  option is opt-in, so existing calls without the option retain the
  previous ambiguity behavior.

- **`0.8.3`** — `QQQ` parsing cross-checks the parsed quarter against
  month/date information in the same format string and throws when those
  values disagree.

- **`0.8.3`** — `registerLocaleVocab()` validates vocabulary when it is
  registered, so malformed locale data may now throw earlier than it would
  have during a later format or parse operation.