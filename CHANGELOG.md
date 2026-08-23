# Changelog

All notable changes to this project are documented here, newest first.
Format loosely follows [Keep a Changelog](https://keepachangelog.com).
For which lines are currently supported, see [VERSIONS.md](VERSIONS.md).

## 0.9.2 — 2026-08-24 (`2a2bd05`)
### Security
- **ReDoS: three related classes of catastrophic backtracking in
  `parse()`'s compiled regex are closed**, all found by a full security
  audit that exploited each one against the real build before fixing it.
  The performance suite's structural claim ("never a nested or
  overlapping quantifier like `(a+)+`, which is the actual precondition
  for catastrophic backtracking") turned out to be half right — nested
  quantifiers aren't the only exponential engine. Multiple
  *variable-width digit fragments* whose digit consumption is mutually
  ambiguous blow up just as hard, and none of the shapes were tested
  against near-miss input:
  - glued unpadded numeric token runs — `parse('Md'.repeat(k), ...)` was
    exponential in k (measured 2.7 s at k=13, ~3.3x per extra token, on
    a 26-char format string and a 40-char input; k=15+ hangs
    indefinitely). A run of R glued unpadded tokens (M/d/H/h/m/s) is now
    emitted as ONE bounded `\d{R,2R}` group in `buildCapturingPattern()`,
    and the per-token split is resolved after the match by the same
    `enumerateValidSplits()` machinery that already powered the
    ambiguity check — so the documented semantics (unique split
    resolves, 2+ valid splits throws in strict mode / heuristic-picks in
    lenient mode, 0 splits is a mismatch) are preserved exactly, pinned
    by the pre-existing combinatorial and lenient-mode suites. Matching
    is now flat milliseconds at any run length.
  - `yyyy` glued to a digit-starting literal — `"yyyy1"` repeated 8
    times (a 48-char format string) took 26.4 s, because the open-ended
    `-?\d{4,}` year fragment traded digits with the adjacent literal
    with unbounded width choices. `yyyy` now uses the exact 4-digit
    fragment not only next to digit-leading *tokens* (the pre-existing
    rule) but also next to digit-starting *literals*.
  - unpadded tokens separated by digit literals — `"M1"` repeated k
    times grew ~5x per two repetitions (555 ms at k=24). A
    pattern-build-time **ambiguity budget** now charges log2 of the
    width choices at every boundary where a variable-width digit
    consumer meets a digit-consuming successor, and rejects patterns
    over 12 bits (a 4,096-path hard ceiling) with a `FormatSyntaxError`
    advising separators or padded forms. Realistic format strings score
    0-3.
  All three shapes are pinned by the new `test/redos.test.js` (21
  regression tests reproducing every original exploit), and the `zzz`,
  `X`/`x` offset, custom-vocab prefix-chain, and `parseDuration` regex
  shapes were probed and confirmed NOT exploitable (structure-delimited,
  linear).
- `skip()` on an unbounded recurrence rule (no `count`, no `until`) used
  to call `take(iter, Number.MAX_SAFE_INTEGER)` — an iterator over
  `{ frequency: 'daily', interval: 1 }` never returns done, so the call
  looped forever pushing into a growing array until the process OOM'd.
  `skip()` now collects at most 100,000 occurrences and throws a
  descriptive `RangeError` when the rule is still producing, matching
  the traversal-cap convention `businessCalendar.ts` already used.
- `holidaysBetween()` walked from `start.year` to `end.year` with no
  validation and no cap, caching a holiday list per visited year — a
  300,000-year range drove 300k iterations and 300k cache entries in one
  call. Endpoints must now carry year/month/day (descriptive error
  otherwise), and ranges beyond 5,000 years throw a `RangeError`
  suggesting smaller queries.

### Fixed
- `compare()`/`isEqual()`/`isBefore()`/`isAfter()`/`min()`/`max()`/
  `clamp()`/`isBetween()` — and through them the whole `interval`
  module — compared dates via a sort key that multiplied the year offset
  by an average 365.2425 days/year. The code's own comment claimed the
  error "cancels out in a diff", but it only cancels *within* a year:
  across a year boundary the error term differs by up to 0.7575 days,
  which is larger than the interval being measured. Demonstrated:
  `isAfter(2025-01-01T00:00, 2024-12-31T18:12)` returned `false` (truth:
  ~5.8 h after), and `isEqual(2025-01-01T00:00:00,
  2024-12-31T05:49:12)` returned `true` for instants ~18.2 h apart.
  Replaced with exact proleptic-Gregorian day arithmetic (Howard
  Hinnant's `days_from_civil`, the same algorithm arithmetic.ts and
  interval.ts already used), verified against
  `Temporal.PlainDateTime.compare` across the boundary.
- `registerLocaleVocab()` left `parse()`'s compiled-pattern cache stale:
  the cached regex kept matching the OLD month/weekday vocabulary while
  `format()` rendered the new one, so the library's own `format()` output
  failed to parse back after a registration (until 500 more patterns
  evicted the entry). `localeVocab.ts` now exposes
  `subscribeToVocabChanges()` (mirroring
  `subscribeToTemporalChanges()`), and `parse.ts` clears its pattern
  cache on any vocab registration.
- `mergeIntervals()` merged overlapping intervals by writing
  `last.end = current.end` directly into the caller's interval objects —
  merging `[Jan 1-Jan 10]` with `[Jan 5-Jan 20]` silently rewrote the
  caller's first interval to end Jan 20. The merged result now carries a
  shallow copy of the interval it extends.
- `createBusinessCalendar()` filled weekday default hours by writing them
  into the caller's `options.workingHours` object: a caller's `{ 1: 6 }`
  grew keys 2-7 as a side effect of "creating" a calendar, and an object
  shared between calendars cross-contaminated them with the first
  calendar's defaults. The factory now copies before defaulting.
- `formatRange()` ignored its `formatStr` parameter on its primary code
  path: it called `Intl.DateTimeFormat.formatRange()` with empty options
  and never touched the token format string, so
  `formatRange(iv, 'yyyy-MM-dd')` returned locale-default output like
  `"8/4/2026 - 8/6/2026"` instead of `"2026-08-04 - 2026-08-06"`. The
  token-format path (which honors the contract) now runs first;
  Intl's native range collapsing is kept as a fallback for inputs the
  token path can't render.
- `parse()` threw a raw `RangeError: Incorrect locale information
  provided` for underscore-separated locale tags like `'en_US'`, while
  `format()` accepted them — the cache-key helper normalizes underscores
  but the `Intl` construction sites didn't. A shared
  `normalizeLocaleTag()` now runs at every `new Intl.*()` boundary
  (vocab builders, formatter caches in tokens.ts, formatDuration,
  formatDistance, relativeTime, and interval's fallback).
- `registerRelativeGrammar()` was a dead extension point: exported,
  documented ("lets a caller add a new language without modifying
  parseRelative.ts"), and unit-tested in isolation — but
  `parseRelative()` never consulted the registered grammars, so callers
  got the English fallback silently. `parseRelative()` now dispatches to
  registered grammars for the locale's language before the built-ins,
  exactly as documented.
- `parseRFC2822()` accepted far more than RFC 2822, because it delegated
  straight to `Date.parse` — `parseRFC2822('2026-08-04')` (ISO 8601)
  succeeded against the function's own contract. A strict shape
  pre-check mirroring RFC 2822 §3.3 (optional day-of-week, month name,
  2-4 digit year, optional seconds, numeric or alphabetic zone) now
  gates the delegation; a shape-valid but semantically invalid date
  (e.g. day 99) still surfaces the same typed error rather than an
  Invalid Date instant.
- `difference()`'s output intervals carried wrong bounds metadata for
  open/half-open inputs: the lossy `flipEndBounds` helper re-included
  endpoints the original interval excluded — the after-piece of a
  `[Jan 1, Dec 31)` interval came back `closed`. Each piece's bounds are
  now derived from the original endpoint it inherits (start inclusivity
  from `a.bounds` on the before-piece, end inclusivity on the
  after-piece) with the cut endpoints always exclusive. Endpoints were
  already correct and are unchanged.
- `formatDurationToParts()` could mis-slice parts: it re-derived part
  boundaries by searching the rendered string with `indexOf` for the
  next literal anchor, which matched inside an earlier token's rendered
  value (e.g. a quoted `'sec'` literal against `"5 seconds"` split the
  token to just `"5"`). It now consumes the same piece renderer
  `formatDuration()` uses, so the joined string and the parts can never
  disagree.
- Fractional duration fields (legal from `parseISODuration` — `"P1.5D"`
  parses to `days: 1.5`, pinned by tests) crashed
  `balanceDuration`/`totalDuration`/`compareDuration`/`roundDuration`
  with an opaque `TypeError: Cannot convert 1.5 to a BigInt`. A shared
  `fieldToNs()` now scales fractional fields exactly in floating point
  when the product is a safe integer — so `"P1.5D"` balances to exactly
  1 day + 12 hours and `totalDuration({ days: 1.5 }, 'hours')` is 36 —
  and throws the typed `InvalidDurationError` (naming the field) when a
  fractional value is too large to convert exactly.
- `splitInterval()` silently produced `Invalid Date` endpoints (NaN
  year/month/day fields) when an endpoint fell outside JS Date's
  representable range (~±275,760 years), because the slice math flows
  through `Date`. Out-of-range endpoints now throw a descriptive
  `RangeError`.
- The type guards (`isPlainDate` et al.) crashed on objects with
  hostile getters — a throwing `year` getter turned `isPlainDate(obj)`,
  whose whole contract is returning a boolean, into an exception
  factory. Every guard now runs through a shared wrapper that treats a
  throw during probing as "not one of ours"; the `assert*` helpers
  degrade to their descriptive errors.
- `format()` with a plain field bag and a locale-aware token rendered
  `"[object Object]"`: a `{ year, month, day }` object's
  `toLocaleString` is `Object.prototype.toLocaleString`, which ignores
  both arguments. The polyfill path now detects the inherited method and
  throws a descriptive error asking for a real Temporal object.
- Malformed locale tags surfaced as bare engine `RangeError`s at several
  boundaries. `parse()` (via `resolveCalendar`), the vocab builder, the
  `DateTimeFormat`/`NumberFormat`/`RelativeTimeFormat` caches, and the
  polyfill `toLocaleString` path now all rethrow the typed
  `InvalidLocaleError` with the offending tag in its structured fields.

### Changed
- `roundDuration()`'s internal distribution loop was rewritten while
  removing dead code: the tautological `if (u === options.unit ||
  isLargerUnit(...) || u === options.unit)` block and the always-false
  `isLargerUnit()` helper are gone, and units finer than the rounding
  target are zeroed explicitly while the rounded total is re-derived
  from the largest unit down. Output is unchanged (pinned by the
  rounding suite); the code no longer lies about what it keeps.
- `serialization.ts` no longer imports from `./index.js` (the barrel it
  is itself re-exported through) — it imports `parse`/`format` from
  their defining modules, like every other file. The never-called
  `temporal()` helper is deleted.
- Dead code removed: `duration.ts`'s `void getTemporal` import-shim,
  `extensibility.ts`'s `void builtinFormat` / `void builtinFormatToParts`
  / `void tokenize` shims and their now-unused imports.
- `createFormatter()`'s private tokenizer now rejects overlong token
  runs (`"MMMMM"`, `"ddddd"`) with the same `UnknownTokenError`
  tokenize.ts throws, instead of silently splicing the run into a token
  plus a literal — the exact misreading the main tokenizer's guard
  exists to prevent.
- `registerRelativeGrammar()` caps new-language registrations at 100
  grammars (`RangeError` past it, replacement still allowed) — the
  registry and `tryRegisteredGrammar`'s per-language scan previously
  grew without bound. `localeRegistry`'s extended-vocab map is bounded
  indirectly (every entry passes `registerLocaleVocab`'s existing
  500-locale cap first); that invariant is now documented where the map
  lives.
- `canonicalCacheKey()` is memoized (bounded at 500 entries, same
  eviction shape as every other cache here), and `resolveCalendar()`
  keys off it — repeated `parse()` calls with the same locale no longer
  construct a fresh `Intl.Locale` per call just to compute the cache key.
- Line endings normalized to LF across `src/` (four files were CRLF, one
  mixed), with a `.gitattributes` (`*.ts`/`*.js`/`*.mjs`/`*.json`/
  `*.md` `text eol=lf`) so it stays that way.

### Added
- `test/redos.test.js`: 21 regression tests pinning every exploit from
  the audit (the three ReDoS shapes, the comparison corruption and its
  `Temporal.compare` cross-check, the stale pattern cache, the input
  mutations, the unbounded traversals, the grammar wiring, and the
  locale normalization).
- `test/hardening.test.js`: 23 regression tests pinning the low-severity
  fixes above (typed locale errors across all six boundaries, fractional
  duration arithmetic, strict RFC 2822, exact formatDurationToParts
  slicing, the grammar cap, hostile getters, the field-bag guard,
  splitInterval's range check, difference()'s corrected bounds,
  createFormatter's overlong-run guard, and the canonical-key cache
  eviction).
- `assertValidLocaleTag()` / `normalizeLocaleTag()` /
  `subscribeToVocabChanges()` / `fieldToNs()` internal helpers, exported
  from their modules for cross-module reuse.

## 0.9.1 — 2026-08-22 (`c38fdc4`)
### Added
- `tsup.config.ts` minification is back, gated behind a `TSUP_MINIFY` env
  var instead of the hardcoded `false` it's had since 0.8.96 raised the
  coverage gate to 100% and disabled it.
  Turns out esbuild's inlining breaks c8's function-coverage attribution
  — reported coverage on a minified build dropped to 30.94% against a
  real ~90%, since `test:all`/`test:coverage` and the published package
  were both building from the same unminified `tsup` output. New
  `build:publish` script sets the env var and is what `prepublishOnly`
  now calls, so `npm publish` ships a minified `dist/`, while `build`,
  `dev`, and every test script stay on the plain unminified build — same
  as before this change, coverage numbers are unaffected. Added
  `cross-env` as a devDependency so the env var sets consistently across
  shells.
- `.github/workflows/release.yml` runs `build:publish` as its own step
  before publishing, then greps the built chunks for a known function
  name to confirm minification actually happened, so a broken
  minification config fails CI loudly instead of silently shipping an
  unminified — or wrongly minified — tarball.
- `codemod.unit.test.ts` (vitest) covers `codemod.ts` cases the existing
  `codemod_test.js` (node:test, run against `dist/`) doesn't: a token
  absent from a table falls through as quoted literal text, while a
  token present with `to: null` throws — those are different code paths
  and easy to conflate. Also locks in the error message's inclusion of
  the full source string, and empty/literal-only input.

## 0.9.0 — 2026-08-22 (`f15542f`)
### Changed
- **Breaking:** `parse()`, `safeParse()`, `tryParse()`, `parseToParts()`,
  `format()`, and `formatToParts()` now throw the typed `TemporalFmtError`
  subclasses (`FormatSyntaxError`, `UnknownTokenError`, `ParseMismatchError`,
  `InvalidDateError`, `InvalidOffsetError`, `InvalidLocaleError`, etc.)
  directly instead of plain `new Error(message)`. This lands on every
  reachable throw site in `tokenize.ts`, `pattern.ts`, `format.ts`,
  `parse.ts`, and the two data-path throws in `localeVocab.ts`
  (`partValue`/`assertNoCollision` on the `getLocaleVocab` side).
- Every migrated message string is unchanged, byte for byte. Since
  `TemporalFmtError` extends `Error`, code doing `instanceof Error` or
  matching on `err.message` with a regex sees no difference — that's why
  this didn't need to be a rewrite of the error text, just a rewrap of
  the throw. What *does* change: `err.constructor` and `err.name` are no
  longer plain `'Error'` (e.g. `FormatSyntaxError` now reports its own
  name), so code checking `err.constructor === Error` or
  `err.name === 'Error'` specifically will see different results. That's
  the actual breaking change, and the reason this is a minor bump on a
  pre-1.0 package rather than a patch.
- `wrapUntypedError()` (the regex-based classifier `safeParse()` used to
  lean on for every failure) is still there, but now only does real work
  for `localeVocab.ts`'s registration-time throws and for errors a caller
  hands into `safeParse`/`tryParse` from outside the package. On the
  parse/format data path, every throw already arrives as a
  `TemporalFmtError`, so `safeParse`'s `instanceof TemporalFmtError` check
  passes it straight through and the classifier's regex branches for that
  path are now dead code (kept around rather than deleted, since it's
  still live for the registration and external-error cases).
- Fixed two small pre-existing classification gaps while migrating, both
  cases `wrapUntypedError` had no regex branch for and fell back to a
  generic `ParseMismatchError`: a format-only token used in a parse
  pattern (e.g. formatting-only tokens hit during pattern parsing) now
  reports `UnknownTokenError`, and a locale-vocabulary rendering collision
  now reports `InvalidLocaleError`. Neither had a pinned test locking in
  the old generic behavior — checked the full suite for that before
  changing either.
### Not changed, on purpose
- `localeVocab.ts`'s registration-time throws (`assertValidVocab`,
  `registerLocaleVocab`'s own guards, including its `RangeError`s) are
  untouched. These fire when a developer registers malformed locale data
  at startup, not when an end user's input fails to parse — a different
  failure class that doesn't fit the existing `TemporalFmtErrorCode`
  taxonomy without adding a new code for it, which is separate follow-up
  work, not part of this migration.
- `0.8.x` is now the LTS line: plain `Error`/string-message throws stay
  exactly as they've always been, and it keeps receiving fixes. If you
  don't want the typed-error behavior, or can't move off exact
  `err.constructor === Error` checks yet, stay on `0.8.x` — nothing about
  it changes here.
### Testing
- 1273/1273 (node test runner) + 271/271 (vitest) passing after the full
  migration. Two real regressions turned up during the process and got
  fixed before landing: a throw classified against my own judgment call
  instead of an existing pinned test (`errors.test.js` expects
  `PARSE_MISMATCH` for a "has no tokens" format string; I'd guessed
  `FormatSyntaxError`), and two sites where I set a custom `message` but
  forgot the `reason` field, breaking a `.reason`-matching assertion on
  `safeParse`'s error output.

## 0.8.982 — 2026-08-22 (`e6b7fa7` — HOTFIX)
### Fixed
- Offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`) threw a generic error on
  numeric-offset ISO input (`+02:00`) instead of explaining that the
  offset is intentionally dropped during parsing and that offset tokens
  only work on `Z`-suffixed input.

## 0.8.981 — 2026-08-22 (`59ec5c5`)
### Changed
- Comment cleanup across ~30 files, no logic touched. The concrete
  change in `index.ts`: dropped the `// Section A/V —`, `// Section D —`
  style labels in front of each export group (type guards, typed errors,
  analyzer, calendar utilities, etc.) down to a plain one-line comment
  naming the group, no lettered/numbered section markers. Other files
  got smaller wording trims of the same kind.

## 0.8.98 — 2026-08-22 (`7ef3b41`)
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

## 0.8.97 — 2026-08-22 (`7162b16`)
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

## 0.8.96 — 2026-08-21 (`a0b2f40`)
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

## 0.8.95 — 2026-08-21 (`8bbbe69`)
### Fixed
- Same `startOf()`/`endOf()` `dayOfWeek` fix as 0.8.96, landed here first
  for this release line.

## 0.8.94 — 2026-08-21 (`fbe521d`)
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

## 0.8.93 / 0.8.92 — 2026-08-20 (`bd280ec/dcd9a0f`)
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

## 0.8.91 — 2026-08-20 (`2734169`)
### Security
- `wrapUntypedError()`'s locale-error classification used a regex with
  unbounded `.*` between two alternated words
  (`/locale.*produced no|locale.*not a valid/i`) — flagged by CodeQL as
  polynomial ReDoS-prone on adversarial input. Replaced with plain
  substring checks (`.includes(...)`), same classification, no regex
  backtracking risk.
### Fixed
- `cli.mjs` was missing from `package.json`'s `files`.

## 0.8.82 — 2026-08-20 (`c79d01e`)
### Fixed
- DST overlap: `offset: 'prefer'` could silently resolve to the wrong
  occurrence when an explicit offset token disagreed with it — now throws
  instead of quietly returning the wrong hour.
- DST gaps: a wall-clock time that never happened could silently resolve
  to the nearest real instant — now throws when an offset token is
  present to disagree with the shift.
  _(Reported in #8.)_

## 0.8.81 — 2026-08-20 (`ba6935e`)
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

## 0.8.9 — 2026-08-20 (`8fa86d2`)
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

## 0.8.8 — 2026-08-19 (`72d617c`)
### Changed
- Removed a leftover README note about a botched npm publish on a
  related tool (`eslint-plugin-temporal-fmt`) that had since been
  republished and was no longer blocked.

## 0.8.7 — 2026-08-19 (`afc0800`)
### Added
- Six UTC offset tokens: `X`, `XX`, `XXX`, `x`, `xx`, `xxx`. Uppercase
  emits `Z` at UTC; lowercase always writes the numeric offset.
- Offset tokens now parse back, with real range validation.
- `zzz` and an offset token can coexist in one pattern; cross-checked
  against each other, mismatch throws.

## 0.8.6 — 2026-08-19 (`5da93b6`)
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

## 0.8.5 — 2026-08-19 (`52dd2e8`)
### Added
- `S` through `SSSSSSSSS` — fractional-second tokens now go to full
  nanosecond precision, not just fixed 3-digit `SSS`. Format truncates,
  parse right-pads.
### Fixed
- Coverage misattribution for the shared fraction-formatting helper
  (bundler minification decoupled call sites from the declaration) —
  moved the helper onto `pad()` (`pad.fraction`). No behavior change.

## 0.8.4 — 2026-08-19 (`cf3ae0c`)
### Fixed
- The `a` (AM/PM) token was case-sensitive with no real reason —
  `parse('h:mm a', '3:45 pm')` now succeeds instead of throwing.
  Scoped to `a` only; `MMMM`/`EEEE` name matching is still case-sensitive.
### Documented
- `HH`/`H` combined with `a` was already supported/cross-checked but
  undocumented — now written down and directly tested.

## 0.8.3 — 2026-08-18 (`d6b90a6`)
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

## 0.8.2 — 2026-08-16 (`46470d3`)
### Fixed
- `require()` resolved to an ESM-shaped `.d.ts` for a CJS file, which
  Node16+ TypeScript resolution flagged as "masquerading as ESM." Build
  now generates a matching `.d.cts` twin.

## 0.8.1 — 2026-08-16 (`fafa568`)
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

## 0.7.98 — 2026-08-16 (`da23e0d` — backport of 0.8.1's security fix)
### Security
- `zzz` built its regex by inlining the entire `Intl.supportedValuesOf
  ('timeZone')` list per occurrence — repeating `zzz` enough times in a
  format string could expand into a multi-megabyte regex. Fixed via a
  bounded zone-id shape matched first, validated against the real list
  after. ~760ms → <100ms for 160 repeated `zzz` tokens.

## 0.8.0 — 2026-08-15 (`f71378a`)
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

## 0.7.97 — 2026-08-15 (`9ebd41c` — backport of two 0.8.0 hardening fixes)
### Fixed
- `parse()` 100,000-character input cap.
- Memoized, capped `enumerateValidSplits`.
### Security
- Same CI SHA-pinning and npm-install removal as 0.8.0.

## 0.7.96 — 2026-08-14 (`df56bc9`)
### Added
- More vitest tests targeting bugs the `node:test` suite alone wasn't
  catching.
### Changed
- Dependency bump: `temporal-polyfill` 1.0.3 → 1.0.4.
- CI workflow and README now point at `npm run test:all` instead of
  `npm test`, so both suites actually run.
- `0.6.x` support policy tightened further; unused comments and stale
  dependencies cleaned up.

## 0.7.95 — 2026-08-11 (`2861c7e`)
### Changed
- TypeScript upgraded from 6 to 7. `.d.ts` generation disabled as a
  result — TS 7.0.2 doesn't have a stable declaration-emit API yet;
  the plan is to re-enable it once 7.1 ships. README updated to match.

## 0.7.9 — 2026-08-10 (`9f7ea7e`)
### Fixed
- The README's glued-numeric-token ambiguity example used a bare `Md`
  format string, which throws anyway (missing year) regardless of the
  ambiguity it was meant to demonstrate — fixed to use `yyyy-Md`, with a
  note explaining why a standalone `Md`/`dM`/`Hm` always throws.
### Changed
- Comments in the adversarial and combinatorial test suites refactored
  for clarity, no test-behavior change.

## 0.7.8 — 2026-08-09 (`ff4e921`)
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

## 0.7.7 — 2026-08-09 (`cbbf094`)
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

## 0.7.6 — 2026-08-09 (`d46dea4`)
### Fixed
- `yyyy` produced a malformed string for negative years — `pad()` was
  padding the sign into the digit width. Sign now split off before
  padding.

## 0.7.5 — 2026-08-09 (`5d7d414`)
### Fixed
- `vocabCache` had no size cap, unlike the other three internal caches.
  Now capped the same way.
### Changed
- `0.6.x` support policy changed from "critical fixes only" to "fixes
  only, if backportable."

## 0.7.4 — 2026-08-09 (`6d420d1`)
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

## 0.6.3 — 2026-08-09 (`8205912`)
### Fixed
- Backport of the 0.7.6 `pad()` negative-year fix.

## 0.6.2 — 2026-08-09 (`a7f32bb`)
### Fixed
- Backport of the 0.7.5 `vocabCache` size-cap fix.
### Docs
- `SECURITY.md` gets its first supported-versions table: `0.7.x` fully
  supported, `0.6.x` kept alive as a critical-fixes-only backport line,
  anything older unsupported.

## 0.7.3 — 2026-08-08 (`c6d6d1c`)
### Changed
- Comments trimmed in `format.ts`, `parse.ts`, `tokens.ts`,
  `localeVocab.ts`, and `tokenize.ts` — mostly cutting redundant
  wrapping and merging multi-line JSDoc blocks into shorter prose (e.g.
  `resolveYear()`'s POSIX-year explanation went from an 8-line JSDoc
  block to two comment lines with the same `strptime` reference).
  `parse()`'s top-level doc comment also fixed a typo ("escribes an
  impossible date" → "describes an impossible date"). No logic changed.

## 0.7.2 — 2026-08-08 (`64d368b`)
### Changed
- `parse()` now throws whenever a format string mixes 24-hour (`HH`) and
  12-hour (`hh`/`a`) tokens (PR #5, jameswilloton2-hash) — regardless of
  whether the two values actually agree. Resolves an open question about
  `resolveHour`'s behavior on mixed tokens by treating having both token
  types present at all as the problem, rather than silently letting `HH`
  win.

## 0.7.1 — 2026-08-08 (`d310354`)
### Fixed
- Type-safety fix: added an `unknown as` cast in `temporalGlobal.ts`.
### Docs
- `SECURITY.md`'s supported-versions table (0.7.x supported, 0.6.x
  critical-fixes-only) restored here after being accidentally reverted
  in 0.7.0.

## 0.7.0 — 2026-08-08 (`de2a569`)
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

## 0.6.1 — 2026-08-08 (`c6c1a8a`)
### Fixed
- Backport of the 0.7.1 unsafe-cast fix.
### Changed
- Release workflow now publishes old-line backports (like this one)
  under a dedicated npm dist-tag (`0.6-lts`) instead of `latest` —
  npm would likely refuse the publish anyway once a newer version
  exists, but this makes sure people pinned to `0.6.x` still get a
  real, installable tag rather than a failed publish.

## 0.6.0 — 2026-08-06 (`fc17279`)
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

## 0.5.4 — 2026-08-06 (`13ef4f9`)
### Changed
- `tsup.config.ts` gets `minify: true` — output bundles are now
  minified, cutting install/download size.

## 0.5.3 — 2026-08-06 (`68ae18d`)
### Changed
- `LICENSE`'s copyright holder updated from `NovaByte Official` to
  `DirazCoder`, matching the GitHub username change from 0.5.2.

## 0.5.2 — 2026-08-06 (`4c30d5a`)
### Added
- First `SECURITY.md` — private vulnerability reporting via GitHub
  security advisories instead of public issues, plus a "credited in
  release notes unless you'd rather stay anonymous" note. Not mentioned
  in the original release notes, which only covered the rename below.
### Changed
- GitHub username changed from `NovaByteOfficial` to `DirazCoder` —
  `package.json`'s author/repository/homepage URLs and the GitHub
  profile updated to match. npm username stays `novabyteofficial`
  permanently, since npm doesn't allow renaming an existing account;
  the npm package page will keep showing that name regardless of the
  GitHub-side rename. Dev dependencies pinned to exact versions in the
  same commit.

## 0.5.1 — 2026-08-06 (`413efdb`)
### Added
- New "Thanks" section in the README, crediting FoxxMD for
  `matchesFormat()` — built to drop a `date-fns` dependency in
  [pino-roll](https://github.com/mcollina/pino-roll).

## 0.5.0 — 2026-08-06 (`ff518d5`)
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

## 0.3.2 / 0.3.1 — 2026-08-04 (`b971b3b/3748823`)
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

## 0.3.0 — 2026-08-04 (`7340f60`)
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

_All of the above landed in one commit; the author noted using a Claude
audit to help catch the bugs it fixes._

## 0.2.5 — 2026-08-04 (`066b301`)
### Changed
- Dependencies un-pinned in `package.json` (no longer locked to exact
  versions).

## 0.2.4 — 2026-08-04 (`761589f`)
### Fixed
- `test/format.test.js` had a 5-line regression-test comment duplicating
  the full explanation already in `tokens.ts`'s `intlPart()` — trimmed
  to a one-line pointer at that function instead. No behavior change.

## 0.2.3 — 2026-08-04 (`5ac4aa1`)
### Changed
- README wording tightened in two places — the "numeric fields stay
  Western-digit" note and the dev-notes section on the `tsconfig.json`
  `ignoreDeprecations` workaround and the `temporal-polyfill/full`
  test dependency. No factual change, just terser phrasing.

## 0.2.2 — 2026-08-04 (`11baa23`)
### Changed
- `package.json` gets an `author` field for the first time:
  `NovaByte Official` (`https://github.com/NovaByteOfficial`).

## 0.2.1 — 2026-08-04 (`85f2d06`)
### Changed
- Releases now go out via GitHub Actions instead of manual `npm publish`;
  publishes now carry Sigstore provenance attestation.

## 0.2.0 — 2026-08-04 (`ee618cb`)
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

## 0.1.1 — 2026-08-04 (`af36284`)
### Fixed
- Doubled single-quotes inside a literal span (`''`) broke the
  tokenizer — `'it''s'` used to leave dangling unparsed text. Scanner
  now walks character-by-character inside an open quote.
### Added
- Tokenizer test suite, including the doubled-quote regression case.
- `repository` field in `package.json`.

## 0.1.0 — 2026-08-04 (`7563b83`)
### Added
- Initial tagged release. The tag itself didn't exist at the time — it
  was created retroactively, pointing at whatever commit was on `main`
  right before `0.1.1` shipped. Everything before this point is
  untagged repo history.
