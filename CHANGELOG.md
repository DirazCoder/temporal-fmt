# Changelog

All notable changes to this project are documented here, newest first.
Format loosely follows [Keep a Changelog](https://keepachangelog.com).
For which lines are currently supported, see [VERSIONS.md](VERSIONS.md).

## 0.8.982 (HOTFIX)
### Fixed
- Offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`) threw a generic error on
  numeric-offset ISO input (`+02:00`) instead of explaining that the
  offset is intentionally dropped during parsing and that offset tokens
  only work on `Z`-suffixed input.

## 0.8.981
### Changed
- Comment cleanup across ~30 files, no logic touched. The concrete
  change in `index.ts`: dropped the `// Section A/V —`, `// Section D —`
  style labels in front of each export group (type guards, typed errors,
  analyzer, calendar utilities, etc.) down to a plain one-line comment
  naming the group, no lettered/numbered section markers. Other files
  got smaller wording trims of the same kind.

## 0.8.98
### Added
- CLI `translate` subcommand is now a real in-repo implementation
  (previously depended on an external `temporal-fmt-codemod` package).
- Rebuilt the Day.js/date-fns token mapping tables — the date-fns table
  had been a copy-paste of the Day.js one and was wrong (`D`/`DD` mean
  different things in each). Unsupported tokens now throw instead of
  silently producing garbage.
- `temporal-fmt` with no arguments starts an interactive REPL.
- Package is now installable as a CLI (`bin` field, executable
  `scripts/cli.mjs`). `temporal-polyfill` moved to `optionalDependencies`.
### Fixed
- CLI's ISO-input detection blindly appended `Z` even to input that
  already had a numeric offset, producing malformed strings.

## 0.8.97
### Fixed
- `addBusinessDays()` / `differenceInBusinessDays()` now validate input
  (reject non-finite, fractional, unsafe-integer values) and bound large
  operations.
- `differenceInBusinessDays()` no longer fabricates a result when the
  target date is a weekend/holiday.
- `parseRelative({ fuzzy: true })` now has its own input-size limits.
- `parseRRule()` validates input at runtime instead of trusting TS types.
- Recurrence iterators no longer keep unbounded history in memory.
- Locale registration is now bounded (custom vocab can't grow unbounded).
### Security
- Hardened public APIs against resource-exhaustion input generally.
- Bumped esbuild 0.28.1 → 0.28.2.

## 0.8.96
### Fixed
- `startOf()`/`endOf()` now recompute `dayOfWeek` after a month/year
  boundary change instead of carrying over the stale value from the
  input. Same bug, same fix, applied to `add()` in `arithmetic.ts`.
- `splitInterval()` could land tens of thousands of days off — `fromMs()`
  was double-counting the day offset.
- Unrecognized time zones in `parse()`/`parseToParts()` now throw
  `InvalidTimeZoneError` naming the bad zone instead of a generic error.
- Spanish `parseRelative` grammar read the wrong regex capture group for
  the "N units hace" past-tense form.
- `recurrence()` no longer hands back a non-matching value as a real
  occurrence when a safety counter/cutoff is hit — reports `done: true`.
- `serialization.ts`: `parseISO()` now handles numeric UTC offsets;
  `getInstant()` prefers `epochNanoseconds` over `epochMilliseconds`;
  removed a call to a non-existent `Instant.fromEpochMicroseconds`.
- `timezone.ts`: DST-transition detection was comparing `.offset` on a
  plain field bag that never carries one, always reporting a transition
  on day one. `possibleInstantsFor()` rewritten to correctly distinguish
  gaps/overlaps/normal times.
### Testing
- c8 coverage gate raised to 100% (statements/branches/functions/lines)
  across `src/` and `dist/`, enforced via `package.json`.

## 0.8.95
### Fixed
- Same `startOf()`/`endOf()` `dayOfWeek` fix as 0.8.96, landed here first
  for this release line.

## 0.8.94
### Added
- `format()`/`parse()` now actually apply the `numberingSystem` /
  `parseNumberingSystem` options — the conversion helpers existed but
  were never wired into any entry point, so the option silently did
  nothing before this.
- `getQuarter()` accepts a `startMonth` option for non-January fiscal
  years.
- `formatDistanceToNow()` — `formatDistance(date, now)` convenience.
- `parseRelative({ fuzzy: true })` — typo-tolerant matching, English-only,
  opt-in, max edit distance 2.

## 0.8.93 / 0.8.92
### Changed
- 0.8.92 fully restructured the README (588 insertions, 684 deletions)
  — new Contents/table of contents, sections renamed for clarity
  (`Usage` → `Formatting`, `Parsing a string` → `Parsing`, `Locale
  support` → `Locales`), and new sections added for features that had
  shipped in prior releases but were never documented on their own:
  Intervals, Recurrence, Business calendars and holidays, Time zones,
  Config, Numbering systems, Type guards, and CLI.
- 0.8.93 added an intro paragraph clarifying that most of the library's
  surface (locales, recurrence, business calendars, the analyzer, etc.)
  is optional depth, not required reading — the core is just
  `format()`/`parse()` — plus a new "Testing" section describing the
  `node:test`/`vitest`/conformance/smoke-test split.

## 0.8.91
### Security
- Removed a polynomial ReDoS in locale error classification.
### Fixed
- `cli.mjs` was missing from `package.json`'s `files`.

## 0.8.82
### Fixed
- DST overlap: `offset: 'prefer'` could silently resolve to the wrong
  occurrence when an explicit offset token disagreed with it — now throws
  instead of quietly returning the wrong hour.
- DST gaps: a wall-clock time that never happened could silently resolve
  to the nearest real instant — now throws when an offset token is
  present to disagree with the shift.
  _(Reported in #8.)_

## 0.8.81
### Added
- `conformance/` test suite — a fixtures-based test file
  (`conformance.test.js`) plus a README explaining the format, added
  after an issue on the repo raised the idea.
- `smoke-test/` folder replacing the old ad-hoc smoke scripts — probes
  for CJS `require`, ESM `import`, deep-import blocking, the no-Temporal
  case, and a TypeScript types check, run via a single `run.mjs`.
- CI now runs the full matrix across Ubuntu, Windows, and macOS (Node
  20/22/24/26 × 3 OSes), not just Ubuntu — added specifically because
  `smoke-test/`'s real npm-pack-and-install checks broke three separate
  ways on Windows (`ENOENT`, `EINVAL`, `DEP0190`) that Ubuntu-only CI
  never surfaced; those were only caught by someone running it locally
  on Windows.
### Security
- Fixed unescaped backslashes in `smoke-test/run.mjs`.
### Docs
- README tool links point at package pages instead of GitHub.

## 0.8.9
### Added
Large feature pass — biggest release since 0.8.82. Highlights:
- New format-only tokens: `LLLL`/`LLL` (standalone month), `cccc`/`ccc`
  (standalone weekday), `GGGG`/`G` (era), `zzzz`/`z` (localized tz name).
  Every token now carries explicit metadata.
- Analyzer: `analyzeFormat()`, `tokenizeFormat()`, `tokenInfo()`,
  `listTokens()`, `explainFormat()`, `formatToParts()`, `compileFormat()`.
- Parsing: `safeParse()`, `tryParse()`, `compileParser()`,
  `parseToParts()`, plus structured error classes
  (`FormatSyntaxError`, `UnknownTokenError`, `ParseMismatchError`, and others).
- Duration: `formatDurationToParts()`, `parseDuration()`,
  `parseISODuration()`/`formatISODuration()`, `balanceDuration()`,
  `roundDuration()`, `totalDuration()`, `compareDuration()`,
  `addDuration()`/`subtractDuration()`.
- Relative time: `formatRelative()`, `formatRelativeToNow()`,
  `registerRelativeGrammar()`.
- Calendar/arithmetic: `daysInMonth/Year()`, `monthsInYear()`,
  `isLeapYear/Month()`, `dayOfYear()`, `weekOfYear/Year()`,
  `getQuarter/Month/Weekday()`, `startOf()`/`endOf()`, full
  `add()`/`subtract()`/`difference()` per-unit wrappers.
- Rounding: `round()`, `floor()`, `ceil()`, `truncate()`.
- Comparison: `compare()`, `isEqual/Before/After()`, `min/max/clamp()`,
  `isBetween()`, `isToday/Tomorrow/Yesterday()`,
  `isSameDay/Week/Month/Quarter/Year()`, `isWeekend/Weekday()`.
- Intervals: `interval()` with `contains/overlaps/intersects/
  intersection/union/difference/subtract/mergeIntervals/splitInterval/
  formatRange/formatRangeToParts()`.
- Time zones: `getTimeZone/Offset/OffsetNanoseconds()`, `isDST()`,
  `getNext/PreviousTransition()`, `getTransitions()`,
  `possibleInstantsFor()`, `resolveZoned()`.
- Business calendars & holidays: `createBusinessCalendar()`,
  `isBusinessDay()`, `add/subtractBusinessDays()`,
  `differenceInBusinessDays()`, `next/previousBusinessDay()`,
  `createHolidayCalendar()`, `isHoliday()`, `next/previousHoliday()`,
  `holidaysBetween()`.
- Recurrence: `recurrence()`, `next/previous/between/take/skip()`,
  `parseRRule()`/`formatRRule()`.
- Serialization: ISO/RFC3339/RFC2822/HTTP-date/SQL parse+format pairs,
  full epoch conversions.
- Locale & extensibility: `registerLocale()`, `getLocale()`,
  `hasLocale()`, vocab registration for quarters/eras/ordinals/
  duration-units/relative-time, 13 numbering systems,
  `createFormatter()`, `createConfig()`.
- Tooling: CLI (`format|parse|inspect|validate|translate`), IDE data
  exports, subpath exports (`temporal-fmt/format`, `/parse`, etc.).
- All additive — no existing behavior changed.
### Changed
- Build now emits root-level re-export shims (`format.d.ts`,
  `parse.d.ts`, etc.) for every subpath — TypeScript's older `node10`
  module resolution predates `package.json#exports` entirely and
  resolves `temporal-fmt/format` by looking for a physical `format.d.ts`
  at the package root, so without the shim those consumers would get a
  resolution failure even though modern resolvers (`node16`, `bundler`)
  were fine.

## 0.8.8
### Changed
- Removed a leftover README note about a botched npm publish on a
  related tool (`eslint-plugin-temporal-fmt`) that had since been
  republished and was no longer blocked.

## 0.8.7
### Added
- Six UTC offset tokens: `X`, `XX`, `XXX`, `x`, `xx`, `xxx`. Uppercase
  emits `Z` at UTC; lowercase always writes the numeric offset.
- Offset tokens now parse back, with real range validation.
- `zzz` and an offset token can coexist in one pattern; cross-checked
  against each other, mismatch throws.

## 0.8.6
### Added
- Locale-aware `formatDuration` — word-form tokens now route through
  `Intl.NumberFormat`'s `style: 'unit'` mode. Default locale unchanged,
  output byte-identical without the option.
- `parseRelative` now understands Spanish, French, and German in
  addition to English.
- `formatDistance` takes a `cutoffs` option to override any subset of
  the seconds/minutes/hours/days/months boundaries per call.
### Fixed
- `monthIndexFromName` only checked long month names — short forms
  ("Feb", "Dec") silently failed to match in `parseRelative`.
- French duration/distance output correctly uses NBSP per typographic
  convention (was previously flagged as a test mismatch).

## 0.8.5
### Added
- `S` through `SSSSSSSSS` — fractional-second tokens now go to full
  nanosecond precision, not just fixed 3-digit `SSS`. Format truncates,
  parse right-pads.
### Fixed
- Coverage misattribution for the shared fraction-formatting helper
  (bundler minification decoupled call sites from the declaration) —
  moved the helper onto `pad()` (`pad.fraction`). No behavior change.

## 0.8.4
### Fixed
- The `a` (AM/PM) token was case-sensitive with no real reason —
  `parse('h:mm a', '3:45 pm')` now succeeds instead of throwing.
  Scoped to `a` only; `MMMM`/`EEEE` name matching is still case-sensitive.
### Documented
- `HH`/`H` combined with `a` was already supported/cross-checked but
  undocumented — now written down and directly tested.

## 0.8.3
### Added
- `do` ordinal-day token (English-only suffix rules).
- `Q`/`QQQ` quarter tokens, cross-checked against month/date tokens
  on parse.
- `ww`/`RRRR` ISO week tokens (format-only, real ISO 8601 week-1 rule).
- `formatDuration(duration, formatStr, options?)`.
- `formatDistance(date1, date2, options?)`, built on
  `Intl.RelativeTimeFormat`.
- `lenient` option on `parse()` — opt-in heuristic for ambiguous glued
  numeric input; default behavior (throw) unchanged.
- `registerLocaleVocab(locale, vocab)` for locales `Intl` covers poorly.
- `parseRelative(input, referenceDate, options?)` — separate grammar
  from the token-based parser.
### Changed
- First `c8` coverage gate wired into `test:coverage` (90% lines / 75%
  branches / 88% functions on `dist/index.js` and `dist/index.cjs`).
  `test:pack` also gained `publint` alongside the existing `attw` check.
  Test runner switched from the plain `node --test` glob to a dedicated
  `scripts/run-tests.mjs`.

## 0.8.2
### Fixed
- `require()` resolved to an ESM-shaped `.d.ts` for a CJS file, which
  Node16+ TypeScript resolution flagged as "masquerading as ESM." Build
  now generates a matching `.d.cts` twin.

## 0.8.1
### Security
- Same `zzz` regex-expansion DoS as the 0.7.98 backport (see below),
  fixed the same way in the 0.8.x line.
### Fixed
- `yyyy` could format a year `parse()` then refused to read back
  (negative years, years past 9999) when glued to a literal separator.
- `setTemporal()` didn't invalidate the cached native-Intl-support probe,
  so swapping Temporal implementations mid-session could use a stale
  answer.
- Formatting an ISO object with a locale carrying a calendar extension
  (`en-u-ca-hebrew`) mixed fields from two calendars at once. ISO objects
  now always format in Gregorian regardless of the locale's calendar tag.
### Changed
- Locale-keyed caches now canonicalize locale strings (`en-US` /
  `en-us` / `en_US` → one cache key) instead of three separate slots.

## 0.7.98 (backport of 0.8.1's security fix)
### Security
- `zzz` built its regex by inlining the entire `Intl.supportedValuesOf
  ('timeZone')` list per occurrence — repeating `zzz` enough times in a
  format string could expand into a multi-megabyte regex. Fixed via a
  bounded zone-id shape matched first, validated against the real list
  after. ~760ms → <100ms for 160 repeated `zzz` tokens.

## 0.8.0
### Fixed
- `parse()` now caps input at 100,000 characters.
- Unknown day-period (`a`) strings now throw immediately instead of
  failing silently downstream.
- Locale calendar resolution now canonicalizes via `Intl.Locale` instead
  of a plain `.includes('-u-ca-')` string check.
- `enumerateValidSplits` (glued numeric token runs) is now memoized and
  capped at 2 valid splits per branch.
- `HH` + `a` conflict check now verifies the day period actually agrees
  with the hour value, not just that both are present.
### Security
- CI pins `actions/checkout`/`actions/setup-node` to commit SHAs.
- Removed the unpinned `npm install -g npm@latest` release step.

## 0.7.97 (backport of two 0.8.0 hardening fixes)
### Fixed
- `parse()` 100,000-character input cap.
- Memoized, capped `enumerateValidSplits`.
### Security
- Same CI SHA-pinning and npm-install removal as 0.8.0.

## 0.7.96
### Added
- More vitest tests targeting bugs the `node:test` suite alone wasn't
  catching.
### Changed
- Dependency bump: `temporal-polyfill` 1.0.3 → 1.0.4.
- CI workflow and README now point at `npm run test:all` instead of
  `npm test`, so both suites actually run.
- `0.6.x` support policy tightened further; unused comments and stale
  dependencies cleaned up.

## 0.7.95
### Changed
- TypeScript 7 upgrade; `.d.ts` generation disabled as a result.

## 0.7.9
### Fixed
- A README code example had a wrong Markdown-escaped snippet.
### Changed
- Comments in the adversarial and combinatorial test suites refactored
  for clarity, no test-behavior change.

## 0.7.8
### Added
- New adversarial/perf test suites (pathological Unicode, malformed
  BCP47 tags, ReDoS/catastrophic-backtracking checks).
- Fuzz testing scaled up two orders of magnitude; failing seeds now
  auto-shrink to a minimal repro.
### Fixed
- `parse()` now throws on genuinely ambiguous glued numeric input
  (e.g. `Md` against `"121"`) instead of silently picking a reading via
  regex alternation order.
- Reordered unpadded-numeric regex alternations to try the longer
  branch first, fixing some silent mis-splits even in unambiguous cases.

## 0.7.7
### Fixed
- `MMMM`/`MMM` produced text `parse()` couldn't read back for locales
  that render months with a separate suffix part (e.g. `ja-JP`'s 月).
- `parse()` silently misread Gregorian dates in locales whose *default*
  calendar isn't Gregorian (e.g. `th-TH` → Buddhist) unless the locale
  tag carried an explicit `-u-ca-` extension.
- Colliding locale month/weekday names could silently resolve to the
  wrong month with no error — `getLocaleVocab()` now checks for
  duplicates at build time.
### Known limitations
- On native-Temporal engines (Node 26+), locale-aware tokens can render
  the wrong month/weekday for dates before ~1582 CE — an ICU/Julian-
  Gregorian cutover limitation (tc39/ecma402#1003), not fixable here.

## 0.7.6
### Fixed
- `yyyy` produced a malformed string for negative years — `pad()` was
  padding the sign into the digit width. Sign now split off before
  padding.

## 0.7.5
### Fixed
- `vocabCache` had no size cap, unlike the other three internal caches.
  Now capped the same way.
### Changed
- `0.6.x` support policy changed from "critical fixes only" to "fixes
  only, if backportable."

## 0.7.4
### Added
- `setTemporal()` (PR #6, FoxxMD) — an optional top-level export letting
  consumers inject their own Temporal implementation instead of relying
  on the global namespace; falls back to the global if none is provided.
  Fully backward compatible. Lets a library like pino-roll depend on
  `temporal-fmt` without forcing a global polyfill on its own consumers:
  ```js
  import { Temporal } from 'temporal-polyfill/full';
  import { parse, setTemporal } from 'temporal-fmt';
  setTemporal(Temporal);
  parse(...);
  ```
### Docs
- New `VERSIONS.md`, splitting the supported-versions table out of
  `SECURITY.md` into its own file, with a fuller explanation: `0.6.x`
  is the first line to get a fixes-only grace period instead of going
  dead the instant the next version ships — everything before `0.6.0`
  had no such window and is fully EOL.

## 0.6.3
### Fixed
- Backport of the 0.7.6 `pad()` negative-year fix.

## 0.6.2
### Fixed
- Backport of the 0.7.5 `vocabCache` size-cap fix.
### Docs
- `SECURITY.md` gets its first supported-versions table: `0.7.x` fully
  supported, `0.6.x` kept alive as a critical-fixes-only backport line,
  anything older unsupported.

## 0.7.3
### Changed
- Comments trimmed in `format.ts`, `parse.ts`, `tokens.ts`,
  `localeVocab.ts`, and `tokenize.ts` — mostly cutting redundant
  wrapping and merging multi-line JSDoc blocks into shorter prose (e.g.
  `resolveYear()`'s POSIX-year explanation went from an 8-line JSDoc
  block to two comment lines with the same `strptime` reference).
  `parse()`'s top-level doc comment also fixed a typo ("escribes an
  impossible date" → "describes an impossible date"). No logic changed.

## 0.7.2
### Changed
- `parse()` now throws whenever a format string mixes 24-hour (`HH`) and
  12-hour (`hh`/`a`) tokens (PR #5, jameswilloton2-hash) — regardless of
  whether the two values actually agree. Resolves an open question about
  `resolveHour`'s behavior on mixed tokens by treating having both token
  types present at all as the problem, rather than silently letting `HH`
  win.

## 0.7.1
### Fixed
- Type-safety fix: added an `unknown as` cast in `temporalGlobal.ts`.
### Docs
- `SECURITY.md`'s supported-versions table (0.7.x supported, 0.6.x
  critical-fixes-only) restored here after being accidentally reverted
  in 0.7.0.

## 0.7.0
### Added
- Support for Node 20+ without native Temporal (PR #4, FoxxMD) — removed
  the hard requirement for native `Intl`/Temporal interop on locale-aware
  tokens. A memoized `intlSupportsNativeTemporal()` check picks the fast
  cached-`Intl.DateTimeFormat` path when available, and falls back to the
  polyfilled Temporal object's own `toLocaleString()` when not.
  Non-locale tokens keep the fast path regardless. Verified against Node
  20 with no native Temporal present: full suite passed, every README
  example checked manually against the fallback path, output matched
  exactly including the Hebrew calendar case.
### Changed
- CI now matrix-tests Node 20, 22, 24, and 26.
- `SECURITY.md`'s supported-versions table (added on the `0.6.x` line in
  0.6.2) got reverted on `main` back to its earlier single-paragraph
  form here — likely a stale merge rather than an intentional change,
  since the table reappears again by 0.7.5 with the same content.

## 0.6.1
### Fixed
- Backport of the 0.7.1 unsafe-cast fix.
### Changed
- Release workflow now publishes old-line backports (like this one)
  under a dedicated npm dist-tag (`0.6-lts`) instead of `latest` —
  npm would likely refuse the publish anyway once a newer version
  exists, but this makes sure people pinned to `0.6.x` still get a
  real, installable tag rather than a failed publish.

## 0.6.0
### Added
- Real `parse()` function (PR #2, FoxxMD), superseding `matchesFormat()`.
  Returns an actual Temporal object instead of a plausibility guess, and
  throws both on shape mismatches and on input that would build an
  invalid date — `matchesFormat()` could do neither. Supports the
  `locale` option the same way `format()` does. Ships a stubbed Temporal
  namespace (`temporalGlobal.ts`) for type-checking, since the library
  only relies on a possible polyfill rather than a guaranteed global,
  plus a `getTemporal()` check for a clearer error when Temporal isn't
  available at all.
### Changed
- 2-digit years now resolve via a POSIX-style `strptime` convention
  (`00`–`68` → 2000–2068, `69`–`99` → 1900–1999) instead of date-fns's
  reference-date approach — deterministic and independent of the current
  date, at the cost of being a fixed, opinionated window rather than a
  sliding one.

## 0.5.4
### Changed
- Added a minification build step.

## 0.5.3
### Changed
- License name change only.

## 0.5.2
### Added
- First `SECURITY.md` — private vulnerability reporting via GitHub
  security advisories instead of public issues, plus a "credited in
  release notes unless you'd rather stay anonymous" note. Not mentioned
  in the original release notes, which only covered the rename below.
### Changed
- Package renamed to match an npm username change (`package.json` +
  npm page). Dev dependencies pinned to exact versions in the same
  commit.

## 0.5.1
### Added
- "Special thanks" section in the README.

## 0.5.0
### Added
- `matchesFormat()` (PR #1, FoxxMD) — a heuristic, regex-based check for
  whether a string could plausibly have come from `format()`, as a
  lighter alternative to writing a full `parse()`. Reuses the tokenizer
  and generates locale vocab from `Intl` rather than hardcoding it.
### Fixed
- `zzz` rejected the timezone id `'UTC'` even though `format()` can
  produce it — `Intl.supportedValuesOf('timeZone')` doesn't list `'UTC'`,
  so it never made it into the token's alternation. Found by round-
  tripping a real `ZonedDateTime` through `format()` and back through
  `matchesFormat()`, which came back `false` on the library's own valid
  output. Other non-IANA-but-valid ids (fixed offsets) may have the same
  gap but weren't confirmed.

## 0.3.2 / 0.3.1
### Added
- Release workflow can now be triggered manually (`workflow_dispatch`)
  in addition to pushing a version tag; the tag/package.json version
  match check is skipped when triggered manually on a branch, since
  there's no tag to compare against.
### Changed
- Trimmed the over-explained comments from 0.3.0 down to their point:
  `tokens.ts`'s JSDoc for `TemporalLike` used to spend three sentences
  justifying why `calendarId`/`toInstant` are optional — cut to one line
  ("not every field exists on every Temporal type"). The formatter-cache
  comment dropped its aside about the eviction policy being "defensive
  rather than fixing an observed leak" and just states what it does. The
  LRU-eviction comment on `getFormatter()` went from a three-line
  justification to a single inline note ("not real LRU, just evicts
  oldest insertion — fine for this key space"). No logic changed in
  either commit; 0.3.1 briefly reverted to 0.2.5 mid-fix before landing
  on the actual bug fix.

## 0.3.0
### Breaking
- `yy` now throws on negative years instead of silently mangling them
  (`t.year % 100` on a negative year produced a malformed, over-width
  string). Use `yyyy` for BCE dates.
### Fixed
- `intlPart`'s `temporal` param was typed `any`; now `TemporalLike` with
  one narrow cast at the `Intl.DateTimeFormat` boundary.
### Changed
- `Intl.DateTimeFormat` instances now cached with a 500-entry FIFO cap.
- Tokenizer coalesces runs of plain characters into one literal piece.
- Build target bumped to `ESNext` (was `ES2022`).

## 0.2.5
### Changed
- Dependencies un-pinned in `package.json` (no longer locked to exact
  versions).

## 0.2.4
### Fixed
- A test file had a duplicated comment explanation, accidentally
  introduced in 0.2.3 — cleaned up, no behavior change.

## 0.2.3
### Changed
- README wording tightened in two places — the "numeric fields stay
  Western-digit" note and the dev-notes section on the `tsconfig.json`
  `ignoreDeprecations` workaround and the `temporal-polyfill/full`
  test dependency. No factual change, just terser phrasing.

## 0.2.2
### Changed
- Added missing `author` field to `package.json`.

## 0.2.1
### Changed
- Releases now go out via GitHub Actions instead of manual `npm publish`;
  publishes now carry Sigstore provenance attestation.

## 0.2.0
### Added
- `format()` takes a third argument for BCP 47 locale tags (default
  `'en-US'`, existing calls unaffected). Localizes month/weekday names,
  day period, and non-Gregorian calendars already on the object.
  Numeric fields stay Western-digit always. Requires native Temporal
  (Node 26+) for locale-aware tokens.
### Fixed
- `ZonedDateTime` now works with locale-aware tokens (convert to
  `Instant` + pass timezone via the formatter's `timeZone` option,
  since `Intl.DateTimeFormat.formatToParts()` rejects `ZonedDateTime`
  directly per spec).
- Non-Gregorian calendar objects no longer throw `Mismatching
  Calendars`; the default `iso8601` calendar is no longer passed
  explicitly to `Intl` (was silently producing zero parts).

## 0.1.1
### Fixed
- Doubled single-quotes inside a literal span (`''`) broke the
  tokenizer — `'it''s'` used to leave dangling unparsed text. Scanner
  now walks character-by-character inside an open quote.
### Added
- Tokenizer test suite, including the doubled-quote regression case.
- `repository` field in `package.json`.

## 0.1.0
### Added
- Initial tagged release. The tag itself didn't exist at the time — it
  was created retroactively, pointing at whatever commit was on `main`
  right before `0.1.1` shipped. Everything before this point is
  untagged repo history.

