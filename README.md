# temporal-fmt

[Check out my live site](https://dirazcoder.github.io/temporal-fmt/)

![coverage](https://img.shields.io/badge/coverage-100%25%20(c8)-brightgreen?style=flat-square)

Format and parse `Temporal` values (`PlainDate`, `PlainTime`, `PlainDateTime`, `ZonedDateTime`) with date-fns-style tokens. Bad input throws. No silent garbage. Locale-aware, zero dependencies.

Node 26 shipped `Temporal` without a string formatter. TC39's position: use `Intl.DateTimeFormat` and leave token-style formatting to userland. Fair enough — but if `'yyyy-MM-dd'` is muscle memory from date-fns or Day.js, this library exists so you don't have to give that up.

Native on Node 26+. On older runtimes you bring your own `Temporal`, via a polyfill or `setTemporal()`. Import through subpaths and your bundle carries only what you call; see [Subpath imports](#subpath-imports).

Locale-aware tokens need Node 20+ no matter which import path you take. Untested below that.

> **Just want `format`/`parse`, nothing else, ever?** [`temporal-fmt-lite`](https://github.com/DirazCoder/temporal-fmt-lite) is a frozen snapshot of the 0.8.2 surface: same two functions, same locale support, none of the recurrence or business-calendar weight, and no new tokens or exports coming. Security and correctness fixes only, no LTS promise. If you outgrow it, moving up to the full package is additive, not a rewrite.

## Install

```sh
npm install temporal-fmt
```

## Get started

```js
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';

const date = Temporal.PlainDate.from('2026-08-04');
format(date, 'yyyy-MM-dd');                      // "2026-08-04"

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');   // Temporal.PlainDateTime
```

The shape is the one you already know: `format(temporal, formatStr)` in, `parse(formatStr, input)` out, same as date-fns or Day.js. Import from the subpaths above rather than the bare package, because then a bundler ships only what you actually call. Measured with esbuild, `format` alone comes to ~27KB through the subpath, against ~68KB from the bare entry.

On Node 26+ the snippet just works. Below that, `Temporal` isn't global; see [Providing `Temporal`](#providing-temporal).

The package on npm is large: locales, recurrence, business calendars, timezone disambiguation, an analyzer, config layers. None of it reaches your bundle unless you import it. Each piece lives behind its own subpath; see [Subpath imports](#subpath-imports).

## Contents

- [Get started](#get-started)
- [Providing `Temporal`](#providing-temporal)
- [Formatting](#formatting)
- [Parsing](#parsing)
- [Locales](#locales)
- [Tokens](#tokens)
- [Duration formatting](#duration-formatting)
- [Relative time](#relative-time)
- [Natural-language date parsing](#natural-language-date-parsing)
- [Date arithmetic, comparison, and rounding](#date-arithmetic-comparison-and-rounding)
- [Intervals](#intervals)
- [Recurrence](#recurrence)
- [Business calendars and holidays](#business-calendars-and-holidays)
- [Time zones](#time-zones)
- [Serialization](#serialization)
- [Introspection and the analyzer](#introspection-and-the-analyzer)
- [Typed errors](#typed-errors)
- [Type guards](#type-guards)
- [Config](#config)
- [Extending with custom tokens](#extending-with-custom-tokens)
- [IDE tooling data](#ide-tooling-data)
- [Legacy mod documentation](#legacy-mod-documentation)
- [Subpath imports](#subpath-imports)
- [Migrating from Day.js or date-fns](#migrating-from-dayjs-or-date-fns)
- [Related tools](#related-tools)
- [Testing](#testing)
- [Benchmarks](#benchmarks)
- [Contributing](#contributing)
- [License](#license)

## Providing `Temporal`

### Node 26+

`Temporal` is native and gets picked up automatically.

### Polyfill

```js
import 'temporal-polyfill/global'
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';
```

The slim global build covers `format`/`parse` for Gregorian dates. The non-Gregorian calendar examples below (`withCalendar('hebrew')` and friends) need the full build's calendar data — `import 'temporal-polyfill/full/global'` instead. On Node 26+ none of this matters; native `Temporal` carries full ICU calendars.

### Bring your own

Call `setTemporal()` once, before your first `format()`/`parse()` call:

```js
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from 'temporal-fmt';
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';

setTemporal(Temporal);
```

`setTemporal()` takes precedence over native or global `Temporal`. Called with no argument, it clears the override. Handy for libraries that would rather not touch the global namespace.

Only functions that construct a value from scratch need the namespace: `parse()`, `parseISO()`, `resolveZoned()`, and a few others. Functions that just read fields off an existing value (`format()`, `compare()`, `add()`) never touch it at all.

## Formatting

```js
import { format } from 'temporal-fmt/format';

const date = Temporal.PlainDate.from('2026-08-04');
format(date, 'yyyy-MM-dd');            // "2026-08-04"
format(date, 'MMMM d, yyyy');          // "August 4, 2026"

const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
format(dt, "MMM d, yyyy 'at' h:mm a"); // "Aug 4, 2026 at 3:45 PM"

const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
format(zdt, 'yyyy-MM-dd HH:mm zzz');   // "2026-08-04 15:45 America/New_York"
```

Wrap literal text in single quotes. A literal single quote in the output is `''`.

Ask for a token the input type doesn't support, `HH` on a `PlainDate` say, and you get a descriptive error rather than a silent `undefined`.

- `format(temporal, formatStr, options?)` — returns a string.
- `formatToParts(temporal, formatStr, options?)` — returns `{ type: 'literal' | 'token', value, token? }[]`. Same shape as `Intl.DateTimeFormat.formatToParts`, useful when you want to style individual pieces yourself.
- `compileFormat(formatStr)` — pre-tokenizes once, returning an object with `.format()`/`.formatToParts()`, `.pieces`, and `.formatStr`. Format strings are already LRU-cached internally (500 entries), so what this mainly buys is up-front validation: a bad format string throws at compile time instead of on first use.

## Parsing

`parse()` builds a `PlainDate`, `PlainTime`, `PlainDateTime`, or `ZonedDateTime`, depending on which tokens are present:

```js
import { parse } from 'temporal-fmt/parse';

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');   // Temporal.PlainDateTime
parse('yyyy-MM', '2026-08-04T15:45:30');         // throws — shape mismatch
parse('yyyy-MM-dd', '2026-02-30');               // throws — not a real date
```

Which type comes back depends on the tokens, so narrowing in TypeScript needs `instanceof` or a type guard. See [Type guards](#type-guards).

It also catches contradictions a regex would miss:

```js
parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');  // fine
parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04');   // throws — it's not a Monday
```

Other entry points:

- `safeParse(formatStr, input, options?)` — never throws. Returns `{ ok: true, value }` or `{ ok: false, error: TemporalFmtError }`.
- `tryParse(formatStr, input, options?)` — never throws. Returns the value or `undefined`.
- `parseToParts(formatStr, input, options?)` — returns matched token groups with their positions in the input string.
- `compileParser(formatStr, options?)` — pre-compiles a parser for repeated use against the same format string.

### Parsing notes

- **`yy` (2-digit year)** follows POSIX strptime: `00–68` → `2000–2068`, `69–99` → `1900–1999`.
- **`hh`/`h` without `a` throws.** Mixing `HH`/`H` with `hh`/`h` also throws; `parse()` won't pick one for you.
- **`HH`/`H` with `a` throws too.** Both describe the hour, so `parse()` refuses the combination outright rather than cross-checking it — `parse('HH:mm a', ...)` is a `FormatSyntaxError`. `hh`/`h` paired with `a` is the supported 12-hour form, and the `a` value is folded into the hour (`3:05 PM` → 15:05).
- **`a` is case-insensitive** (`pm`, `Pm`, `PM` all work). Month and weekday names stay case-sensitive.
- **`S`–`SSSSSSSSS`** go to nanosecond precision. Format truncates to the requested width; parse right-pads short input (`SSSSSSSSS` reading `.5` gives you 500ms worth of nanoseconds).
- **`MMMM`/`MMM` assume a 12-month calendar.** Numeric tokens are unaffected.

### Ambiguous input and lenient mode

By default, `parse()` throws when a glued numeric run has more than one valid split:

```js
parse('yyyy-Md', '2026-121')                               // throws — ambiguous
parse('yyyy-Md', '2026-121', { lenient: true }).toString() // '2026-12-01'
```

The lenient heuristic: if one token in the ambiguous run is `d`, prefer the split where day ≤ 12. If that doesn't settle it, fall back to the first valid split. Zero-padding (`MM`/`dd`) or a separator (`M/d`) avoids the ambiguity altogether.

### Offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`)

Uppercase collapses `+00:00` to `Z`; lowercase never emits `Z`. Single-letter forms drop the minutes when they're zero (`+05`, `+0530`).

On parse, an offset token needs a full date and time. An offset identifies a UTC distance, not a time zone, so a pattern with an offset token and no `zzz` throws. With both `zzz` and an offset token, `zzz` wins for `timeZoneId` and the offset gets cross-checked; a mismatch throws.

Sub-minute offsets (pre-railway local-mean-time zones): only `xxx` passes them through. The others throw rather than silently truncating. Range is `-12:00` to `+14:00`.

## Locales

Pass a BCP 47 tag via `options.locale`. The default is `'en-US'`.

```js
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' });   // "août 4, 2026"
format(date, 'EEEE d MMMM', { locale: 'ar-EG' });    // Arabic weekday/month names
format(dt, 'h:mm a', { locale: 'ja-JP' });            // "3:45 午後"
```

Named-vocabulary tokens (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`) go through `Intl.DateTimeFormat`, so non-Gregorian calendars work whenever the `Temporal` object already carries one:

```js
const hebrewDate = date.withCalendar('hebrew');
format(hebrewDate, 'MMMM d, yyyy');   // "Av 21, 5786"
```

Numeric tokens read straight off the object's fields and never touch `Intl`. `parse()` handles locales the same way.

Numeric output is always Western digits by default, whatever the locale. `{ locale: 'ar-EG' }` alone won't turn `yyyy`/`MM`/`dd` into Arabic-Indic digits. That part is an opt-in; see [Numbering systems](#numbering-systems).

### Registering custom vocabulary

`Intl` doesn't cover every case well. A 13-month Hebrew leap year is the standing example.

**`registerLocaleVocab(locale, vocab)`** covers months, weekdays, and day periods only. Months accept 12 or 13 entries — 13 for leap-month calendars (Hebrew in a leap year, Coptic, Ethiopian). The arrays are indexed by the value's ordinal month number, so order a Hebrew vocab Tishrei-first (month 1), not by the traditional Nisan-first sequence:

```js
import { registerLocaleVocab, format } from 'temporal-fmt';

registerLocaleVocab('en-u-ca-hebrew-leap', {
  monthLong: ['Tishrei', 'Marcheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II', 'Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul'],
  monthShort: ['Tish', 'Chesh', 'Kis', 'Tev', 'Shv', 'Ad1', 'Ad2', 'Nis', 'Iyy', 'Siv', 'Tam', 'Av', 'Elu'],
  weekdayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dayPeriod: ['AM', 'PM'],
});

// 5784 is a leap year (13 months) and Av is its 12th month, so the
// 13-entry vocab lines up with the ordinal month number:
const avDate = Temporal.PlainDate.from({ year: 5784, month: 12, day: 21, calendar: 'hebrew' });
format(avDate, 'MMMM d, yyyy', { locale: 'en-u-ca-hebrew-leap' }); // "Av 21, 5784"
```

**`registerLocale(locale, vocab)`** takes everything above plus quarters, eras, ordinals, duration units, and relative-time language:

```js
import { registerLocale } from 'temporal-fmt';

registerLocale('test-locale-1', {
  monthLong: [/* 12 entries */],
  monthShort: [/* 12 entries */],
  weekdayLong: [/* 7 entries */],
  weekdayShort: [/* 7 entries */],
  dayPeriod: ['AM', 'PM'],
  // optional extended vocab:
  quartersLong: ['First', 'Second', 'Third', 'Fourth'],
  quartersShort: ['Q1', 'Q2', 'Q3', 'Q4'],
  erasLong: ['BCE', 'CE'],
  erasShort: ['BC', 'AD'],
  ordinals: ['st', 'nd', 'rd', 'th'],
  durationUnits: { years: ['year', 'years'] /* , ... */ },
  relativeTime: { past: 'ago', future: 'in', now: 'now' },
});
```

`getLocale(locale)` returns the registered vocab or falls back to `Intl`. `hasLocale(locale)` checks without pulling the fallback.

Validation is strict. Wrong array lengths, empty strings, duplicate entries, identical AM/PM values: everything throws at registration time, and registering invalidates the cache for that locale key immediately.

## Tokens

| Token | Meaning | Example |
|-------|---------|---------|
| `yyyy` | Four-digit year (preserves sign for BCE) | `2026` |
| `yy` | Two-digit year (`year % 100`; throws on negative years) | `26` |
| `MMMM` | Long month name, locale-aware | `August` |
| `MMM` | Short month name, locale-aware | `Aug` |
| `MM` | Two-digit month, zero-padded | `08` |
| `M` | One- or two-digit month | `8` |
| `dd` | Two-digit day-of-month, zero-padded | `04` |
| `d` | One- or two-digit day-of-month | `4` |
| `do` | Ordinal day-of-month, English suffix. Format-only | `4th` |
| `EEEE` | Long weekday name, locale-aware. Cross-checked on parse | `Tuesday` |
| `EEE` | Short weekday name, locale-aware. Cross-checked on parse | `Tue` |
| `HH` | Two-digit hour, 24-hour, zero-padded | `15` |
| `H` | One- or two-digit hour, 24-hour | `15` |
| `hh` | Two-digit hour, 12-hour, zero-padded. Needs `a` on parse | `03` |
| `h` | One- or two-digit hour, 12-hour. Needs `a` on parse | `3` |
| `mm` | Two-digit minute, zero-padded | `45` |
| `m` | One- or two-digit minute | `45` |
| `ss` | Two-digit second, zero-padded | `30` |
| `s` | One- or two-digit second | `30` |
| `S`…`SSSSSSSSS` | Fractional second, 1–9 digits (tenths through nanoseconds) | `SSS` → `000` |
| `a` | Day period, locale-aware, case-insensitive on parse | `PM` |
| `zzz` | IANA time zone ID, or fixed offset. Needs full date+time on parse | `America/New_York` |
| `zzzz` | Localized long time zone name (generic form). Format-only | `Eastern Time` |
| `z` | Localized short time zone name. Format-only | `EST` |
| `X` | UTC offset, short, `Z` for UTC | `+05` / `+0530` / `Z` |
| `XX` | UTC offset, no colon, `Z` for UTC | `+0500` / `Z` |
| `XXX` | UTC offset, with colon, `Z` for UTC | `+05:00` / `Z` |
| `x` | Same as `X`, never `Z` | `+05` / `+0530` / `+00` |
| `xx` | Same as `XX`, never `Z` | `+0500` / `+0000` |
| `xxx` | Same as `XXX`, never `Z` | `+05:00` / `+00:00` |
| `Q` | Quarter digit (1–4). Cross-checked against month on parse | `3` |
| `QQQ` | Quarter with "Q" prefix. Cross-checked on parse | `Q3` |
| `ww` | ISO 8601 week number (01–53). Format-only | `32` |
| `RRRR` | ISO 8601 week-numbering year. Format-only | `2026` |
| `D` | Day of year, unpadded. Format-only | `216` |
| `DD` | Day of year, 2-digit minimum. Format-only | `216` |
| `DDD` | Day of year, 3-digit zero-padded. Format-only | `216` |
| `LLLL` | Stand-alone long month name (nominative case). Identical to `MMMM` in most locales | `August` |
| `LLL` | Stand-alone short month name. Identical to `MMM` in most locales | `Aug` |
| `cccc` | Stand-alone long weekday name. Identical to `EEEE` in most locales | `Tuesday` |
| `ccc` | Stand-alone short weekday name. Identical to `EEE` in most locales | `Tue` |
| `GGGG` | Long era name, locale-aware. Format-only | `Anno Domini` |
| `G` | Short era name, locale-aware. Format-only | `AD` |

Structured metadata for every token (round-trip safety, locale/calendar/timezone sensitivity, supported types) is available through `tokenInfo(name)` or `TOKEN_METADATA`. See [Introspection and the analyzer](#introspection-and-the-analyzer).

**`do`** is format-only, because an ordinal suffix isn't structurally distinguishable from adjacent literal text on parse. English-only by design: `Intl.DateTimeFormat` has no part type for ordinals.

**`Q`/`QQQ`** format and parse, cross-checking against any month or date tokens in the same string.

**`ww`/`RRRR`** are format-only. `RRRR` is the ISO week-numbering year, not the calendar year, and the two diverge at year boundaries:

```
format(PlainDate.from('2026-12-31'), 'ww RRRR') // "53 2026"
format(PlainDate.from('2027-01-01'), 'ww RRRR') // "53 2026" — still ISO year 2026
format(PlainDate.from('2027-01-04'), 'ww RRRR') // "01 2027"
```

**`LLLL`/`LLL`/`cccc`/`ccc`** are the stand-alone forms (nominative case in Slavic locales). In most locales they render identically to `MMMM`/`MMM`/`EEEE`/`EEE`.

## Duration formatting

`formatDuration(duration, formatStr, options?)` formats a `Temporal.Duration` or a plain field bag `{ years, months, weeks, days, hours, minutes, seconds, milliseconds }`.

Each unit comes in three forms:

| Token | Form | Example |
|-------|------|---------|
| `y` / `yy` / `yyy` | numeric / short / long — years | `2` / `2yr` / `2 years` |
| `o` / `oo` / `ooo` | numeric / short / long — months | `2` / `2mo` / `2 months` |
| `w` / `ww` / `www` | numeric / short / long — weeks | `2` / `2wk` / `2 weeks` |
| `d` / `dd` / `ddd` | numeric / short / long — days | `2` / `2d` / `2 days` |
| `h` / `hh` / `hhh` | numeric / short / long — hours | `2` / `2h` / `2 hours` |
| `m` / `mm` / `mmm` | numeric / short / long — minutes | `2` / `2m` / `2 minutes` |
| `s` / `ss` / `sss` | numeric / short / long — seconds | `2` / `2s` / `2 seconds` |
| `S` / `SS` / `SSS` | numeric / short / long — milliseconds | `2` / `2ms` / `2 milliseconds` |

Short and long forms are plural-aware.

```js
import { formatDuration } from 'temporal-fmt';

formatDuration({ years: 2, months: 3 }, 'yyy ooo')    // "2 years 3 months"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm')  // "2 hours 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'h:m')      // "2:30"
```

Zero-value units are omitted by default, so any trailing literal separators left over from the format string are the caller's problem. Pass `{ showZeroValues: true }` to render them anyway.

Pass `{ locale }` to localize short and long unit names through `Intl.NumberFormat`'s `style: 'unit'` mode. Numeric-only tokens always stay ASCII digits. One gotcha: explicit `locale: 'en-US'` ≠ omitting the locale. `Intl`'s spacing differs from the built-in English table (`"2 hr"` vs `"2h"`).

```js
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' }) // "2 heures 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'de-DE' }) // "2 Stunden 30 Minuten"
```

### Other duration functions

- `formatDurationToParts(duration, formatStr, options?)` — returns parts instead of a joined string.
- `parseDuration(input, formatStr, options?)` — inverse of `formatDuration`.
- `parseISODuration(input)` / `formatISODuration(duration)` — ISO 8601 duration grammar (`P1Y2M3DT4H5M6S`).
- `balanceDuration(duration)` — normalizes fields (90 minutes → 1 hour 30 minutes).
- `totalDuration(duration, unit)` — sums to a single number in the target unit.
- `compareDuration(a, b)` — `-1`/`0`/`1`.
- `addDuration(a, b)` / `subtractDuration(a, b)`.
- `roundDuration(duration, options)` — see [Date arithmetic, comparison, and rounding](#date-arithmetic-comparison-and-rounding).

## Relative time

### `formatDistance` — "3 days ago"

`formatDistance(date1, date2, options?)` returns a human-readable relative-time string via `Intl.RelativeTimeFormat`.

```js
import { formatDistance } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04');
const yesterday = Temporal.PlainDate.from('2026-08-03');

formatDistance(yesterday, today)                        // "yesterday"
formatDistance(yesterday, today, { numeric: 'always' }) // "1 day ago"
formatDistance(today, today)                            // "now"
formatDistance(today.add({ days: 2 }), today, { numeric: 'always', locale: 'fr-FR' }) // "dans 2 jours"
```

Direction: `diff = date1 - date2`. Positive reads as "in X", negative as "X ago". So `formatDistance(yesterday, today)` describes yesterday as if standing at today — "yesterday" — while the argument order shown the other way round would read "tomorrow". French with the default `numeric: 'auto'` uses natural words like `après-demain` two days out; `numeric: 'always'` forces the `dans 2 jours` form.

Default unit-selection cutoffs:

| abs(diff) | Unit | Default cutoff |
|-----------|------|----------------|
| < 60 seconds | seconds | `seconds: 60` |
| < 60 minutes | minutes | `minutes: 60` |
| < 24 hours | hours | `hours: 24` |
| < 30 days | days | `days: 30` |
| < 365 days | months | `months: 365` (in days) |
| otherwise | years | — |

Override any subset per call with `{ cutoffs }`. The `months` cutoff is expressed in days, since a month isn't a fixed length. Non-monotonic boundaries and non-positive values throw.

Accepts `PlainDate`, `PlainDateTime`, or `ZonedDateTime`. A `PlainDate` diffed against a `PlainDateTime` is treated as midnight. `PlainTime` and partial-date shapes throw.

`formatDistanceToNow(date, options?)` reads the system clock at call time:

```js
import { formatDistanceToNow } from 'temporal-fmt';

formatDistanceToNow(threeHoursAgo)  // "3 hours ago"
formatDistanceToNow(tomorrow)       // "tomorrow" — "in 1 day" with { numeric: 'always' }
```

The reference is captured fresh on every call, never cached.

### `formatRelative` / `formatRelativeToNow`

These return calendar-relative labels ("yesterday", "last week") instead of numeric distance. `formatRelativeToNow(date, options?)` is `formatRelative(date, now)`.

## Natural-language date parsing

`parseRelative(input, referenceDate, options?)` resolves relative-date phrases against a reference date and returns a `Temporal.PlainDate`. English by default; pass `{ locale: 'es' }`, `'fr'`, or `'de'` for those languages.

Supported:

- weekday references: "next Tuesday", "last Friday", "this Monday"
- relative day offsets: "today", "tomorrow", "yesterday"
- relative unit offsets: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago"
- month-day without year: "March 5th", "Aug 4" (resolves to next occurrence)

| Phrase | en | es | fr | de |
|--------|----|----|----|----|
| today | `today` | `hoy` | `aujourd'hui` | `heute` |
| tomorrow | `tomorrow` | `mañana` | `demain` | `morgen` |
| yesterday | `yesterday` | `ayer` | `hier` | `gestern` |
| next Tuesday | `next Tuesday` | `el próximo martes` | `mardi prochain` | `nächsten Dienstag` |
| last Tuesday | `last Tuesday` | `el martes pasado` | `mardi dernier` | `letzten Dienstag` |
| this Wednesday | `this Wednesday` | `este miércoles` | `ce mercredi` | `diesen Mittwoch` |
| in 3 days | `in 3 days` | `en 3 días` | `dans 3 jours` | `in 3 Tagen` |
| 2 weeks ago | `2 weeks ago` | `hace 2 semanas` | `il y a 2 semaines` | `vor 2 Wochen` |
| March 5 | `March 5th` | `5 de marzo` | `5 mars` | `5. März` |

Diacritics are stripped before matching, so `"miercoles"` matches `"miércoles"`. German umlaut transliterations get expanded (`ä`→`ae`, etc.).

```js
import { parseRelative } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04'); // Tuesday
parseRelative('today', today).toString()              // '2026-08-04'
parseRelative('next Tuesday', today).toString()       // '2026-08-11' — 7 days, not today
parseRelative('last Friday', today).toString()        // '2026-07-31'
parseRelative('in 3 days', today).toString()           // '2026-08-07'
parseRelative('March 5th', today).toString()           // '2027-03-05' — next occurrence

parseRelative('mañana', today, { locale: 'es-ES' }).toString()  // '2026-08-05'
parseRelative('demain', today, { locale: 'fr-FR' }).toString()  // '2026-08-05'
parseRelative('morgen', today, { locale: 'de-DE' }).toString()  // '2026-08-05'
```

**Documented ambiguous-case choices:**

- "next Tuesday" said on a Tuesday means 7 days out. "this Tuesday" covers the same-week case.
- "last Tuesday" said on a Tuesday means 7 days ago.
- "March 5th" with no year resolves to the next occurrence. Past dates this year roll to next year.
- Bare number phrases ("5 days" without "in" or "ago") throw, same strict contract as `parse()`.

The "next X on X = 7 days" convention holds across all four supported languages, by design.

`parseRelative` throws a descriptive error on unrecognized phrases. The reference can be a `PlainDate`, `PlainDateTime`, or `ZonedDateTime`; a `PlainTime` throws.

### Typo tolerance (`{ fuzzy: true }`)

```js
parseRelative('tommorow', today, { fuzzy: true }).toString()      // '2026-08-05'
parseRelative('next tuesady', today, { fuzzy: true }).toString()  // '2026-08-11'
parseRelative('tommorow', today);                                  // throws
```

Input gets tokenized on whitespace, and any word that isn't an exact vocabulary match is corrected using edit distance 2. That covers dropped letters (distance 1) and transposed pairs (distance 2) without over-correcting.

Numbers are never corrected. `"5 dyas"` corrects to `"5 days"`, then still throws the usual past-or-future ambiguity error.

Fuzzy mode is English-only. The other grammars have enough positional variation that one word-substitution corrector doesn't fit without per-language tuning. A non-English phrase that doesn't match exactly throws a clear error telling you the corrector never ran, instead of silently skipping the correction pass — a non-English phrase that matches exactly still parses normally.

`registerRelativeGrammar(grammar)` registers a new language. `listRegisteredGrammars()` lists what's registered.

## Date arithmetic, comparison, and rounding

### Arithmetic

```js
import { add, subtract, difference, addDays, differenceInHours } from 'temporal-fmt';

add(date, 3, 'days');
subtract(date, 1, 'months');
difference(a, b, 'hours');
```

- `add(value, amount, unit)` / `subtract(value, amount, unit)` — `unit`: `'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds'`.
- Per-unit wrappers: `addYears`, `addMonths`, `addWeeks`, `addDays`, `addHours`, `addMinutes`, `addSeconds`, `addMilliseconds`, and the matching `subtract*` set.
- `difference(a, b, unit)` — integer count of unit boundaries crossed.
- Per-unit wrappers: `differenceInYears`, `differenceInMonths`, `differenceInWeeks`, `differenceInDays`, `differenceInHours`, `differenceInMinutes`, `differenceInSeconds`, `differenceInMilliseconds`.

### Comparison

```js
import { compare, isBefore, isSameDay, isWeekend } from 'temporal-fmt';

compare(a, b);    // -1 / 0 / 1
isBefore(a, b);
isSameDay(a, b);
isWeekend(date);
```

- `compare(a, b)` → `-1`/`0`/`1`.
- `isEqual`, `isBefore`, `isAfter`.
- `min(values)`, `max(values)`, `clamp(value, lo, hi)`, `isBetween(value, lo, hi)`.
- `isToday`, `isTomorrow`, `isYesterday`, `isSameDay`, `isSameWeek`, `isSameMonth`, `isSameQuarter`, `isSameYear`, `isWeekend`, `isWeekday`.

### Rounding

- `round(value, options)`.
- `floor(value, unit, increment?)`, `ceil(value, unit, increment?)`, `truncate(value, unit, increment?)`.
- `roundDuration(duration, options)` — throws for calendar-bound units (months, years) without a `relativeTo` reference.

### Calendar utilities

```js
import { daysInMonth, startOf, getQuarter } from 'temporal-fmt';

daysInMonth(date);
startOf(date, 'month');
getQuarter(date);
```

- `daysInMonth(value)`, `daysInYear(value)`, `monthsInYear(value)`.
- `isLeapYear(value)`, `isLeapMonth(value)` (always `false` in Gregorian).
- `dayOfYear(value)`, `weekOfYear(value)`, `weekYear(value)`.
- `getQuarter(value, options?)`, `getMonth(value)`, `getWeekday(value)`.
- `startOf(value, unit)` / `endOf(value, unit)` — `unit`: `'day' | 'month' | 'year' | 'hour' | 'minute' | 'second'`.

`getQuarter` defaults to calendar quarters (January through March is Q1). Pass `{ startMonth }` to shift the fiscal year start:

```js
getQuarter({ month: 8 });                     // 3 — calendar quarter
getQuarter({ month: 8 }, { startMonth: 7 });   // 1 — fiscal year starting July
getQuarter({ month: 8 }, { startMonth: 10 });  // 4 — fiscal year starting October (Apple's FY)
```

`startMonth` must be 1–12. Anything else throws.

**Gregorian-only limitation:** `daysInMonth`, `daysInYear`, `isLeapYear`, `monthsInYear`, `isLeapMonth`, `dayOfYear`, `weekOfYear`, and `weekYear` all apply Gregorian rules, so they give wrong answers on non-Gregorian calendars. Use the `Temporal` object's own calendar-aware properties instead:

```js
// Field-bag construction interprets the fields IN the Hebrew calendar:
// year 5784, month 10 (Sivan — ordinal numbering, Tishrei = 1), day 10.
const pd = Temporal.PlainDate.from({ year: 5784, month: 10, day: 10, calendar: 'hebrew' });
pd.daysInMonth;  // 30 (Sivan)
pd.monthsInYear; // 13 (leap year)
```

Note that `'5784-05-10[u-ca=hebrew]'` is a different thing entirely: the string is parsed as an ISO (Gregorian) date — year 5784 — and only then displayed in the Hebrew calendar, which lands in the year 9544. Field bags are the way to construct non-Gregorian dates directly.

Locale-aware formatting tokens (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`) go through `Intl.DateTimeFormat` and do respect `calendarId`:

```js
format(Temporal.PlainDate.from({ year: 5784, month: 10, day: 10, calendar: 'hebrew' }), 'MMMM d, yyyy'); // "Sivan 10, 5784"
```

## Intervals

```js
import { interval, contains, overlaps, formatRange } from 'temporal-fmt';

const iv = interval(start, end, 'closed');
contains(iv, someDate);
overlaps(ivA, ivB);
formatRange(iv, 'MMM d');
```

- `interval(start, end, bounds?)` — `bounds`: `'closed'` (default) | `'open'` | `'half-open-start'` | `'half-open-end'`.
- `contains(iv, value)`, `overlaps(a, b)`, `intersects(a, b)`.
- `isBefore(a, b)` / `isAfter(a, b)` — imported as `intervalIsBefore`/`intervalIsAfter` from the main entry, to avoid colliding with the date versions.
- `intersection(a, b)`, `union(a, b)` — return `null` when the intervals don't overlap enough to combine.
- `difference(a, b)` / `subtract(a, b)` — imported as `intervalDifference`/`intervalSubtract` from the main entry.
- `mergeIntervals(intervals)` — combines overlapping intervals into their union set.
- `splitInterval(iv, n)` — splits one interval into `n` equal sub-intervals.
- `formatRange(iv, formatStr, options?)` / `formatRangeToParts(iv, formatStr, options?)` — uses `Intl.DateTimeFormat.formatRange` where available.

## Recurrence

```js
import { recurrence, take, between } from 'temporal-fmt';

const rule = { frequency: 'weekly', interval: 1, count: 10 };
const iter = recurrence(startDate, rule);
take(iter, 5);
between(startDate, rule, rangeStart, rangeEnd);
```

- `recurrence(start, rule)` — returns an iterator with `next()`/`previous()`. `rule.frequency`: `'secondly' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'`. Also supports `interval`, `count`, `until`, weekday/month-day/positional constraints, and exclusions/inclusions (RFC 5545 RRULE model).
- `take(iter, n)` — collects the next `n` occurrences.
- `skip(iter, n)` — advances past `n` occurrences.
- `between(start, rule, rangeStart, rangeEnd)` — all occurrences within a range.
- `parseRRule(input)` / `formatRRule(rule)` — parse/format RFC 5545 RRULE text.

## Business calendars and holidays

A business-day calendar (weekends, working hours, half days) and a holiday calendar (specific excluded dates) are two separate things. To compose them, pass a holiday calendar's dates into a business calendar's options.

```js
import { createBusinessCalendar, isBusinessDay, addBusinessDays } from 'temporal-fmt';

const cal = createBusinessCalendar({ /* weekend days, holidays, working hours, half days */ });
isBusinessDay(cal, someDate);
addBusinessDays(cal, someDate, 5);
```

- `createBusinessCalendar(options?)`.
- `isBusinessDay(cal, value)`.
- `addBusinessDays(cal, value, n)` / `subtractBusinessDays(cal, value, n)`.
- `differenceInBusinessDays(cal, a, b)`.
- `nextBusinessDay(cal, value)` / `previousBusinessDay(cal, value)`.

```js
import { createHolidayCalendar, nextHoliday, holidaysBetween } from 'temporal-fmt';

const holidays = createHolidayCalendar([
  { month: 1, day: 1, name: "New Year's Day" },
  { compute: (year) => ({ month: 5, day: lastMondayOf(year, 5) }), name: 'Memorial Day' },
]);

holidays.isHoliday(someDate);
nextHoliday(holidays, someDate);
```

- `createHolidayCalendar(specs)` — each spec is a fixed `{ month, day }` or a `compute(year) => { month, day }` function for floating holidays.
- The returned calendar carries `.isHoliday(value)` and `.holidaysBetween(start, end)` as methods.
- `nextHoliday(cal, value)` / `previousHoliday(cal, value)` — capped at a 5-year lookahead/lookbehind.
- `holidaysBetween(cal, start, end)` — standalone wrapper around `cal.holidaysBetween()`.

Country-specific holiday datasets are out of scope. `createHolidayCalendar` is the abstraction; populating it is the caller's job.

## Time zones

```js
import { resolveZoned, isDST, getTransitions } from 'temporal-fmt';

resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York', { disambiguation: 'compatible' });
isDST(zonedDateTime);
getTransitions(rangeStart, rangeEnd);
```

- `resolveZoned(fields, timeZone, options?)` — constructs a `ZonedDateTime` with an explicit disambiguation mode for gaps and overlaps: `'compatible' | 'earlier' | 'later' | 'reject'`.
- `getTimeZone(value)`, `getOffset(value)`, `getOffsetNanoseconds(value)`.
- `isDST(value)` — heuristic: compares the current offset against the January offset. Correct for the Northern Hemisphere; Southern Hemisphere zones have DST in January, so it can read backwards there.
- `getNextTransition(value)` / `getPreviousTransition(value)`.
- `getTransitions(start, end)` — every DST/offset transition within a range.
- `possibleInstantsFor(fields, timeZone)` — empty for a DST gap, two for an overlap, one otherwise.

## Serialization

```js
import { parseISO, formatISO, parseRFC3339, fromUnixMilliseconds } from 'temporal-fmt';

parseISO('2026-08-04T15:45:30Z');
formatISO(value);
fromUnixMilliseconds(1754321130000);
```

- `parseISO(input)` / `formatISO(value)` — ISO 8601.
- `parseRFC3339(input)` / `formatRFC3339(value)` — RFC 3339.
- `parseRFC2822(input)` / `formatRFC2822(value)` — RFC 2822 (email/HTTP headers).
- `parseHTTPDate(input)` / `formatHTTPDate(value)` — HTTP-date headers.
- `parseSQL(input)` / `formatSQL(value)` — SQL `DATETIME`/`TIMESTAMP`.
- Epoch conversions: `fromUnixSeconds`, `fromUnixMilliseconds`, `fromUnixMicroseconds`, `fromUnixNanoseconds`, `toUnixSeconds`, `toUnixMilliseconds`, `toUnixMicroseconds`, `toUnixNanoseconds`.

## Introspection and the analyzer

```js
import { tokenInfo, listTokens, analyzeFormat, explainFormat, isValidFormat } from 'temporal-fmt';

tokenInfo('yyyy');
// {
//   meaning: 'Four-digit year (preserves sign for BCE; no truncation).',
//   formatCapable: true,
//   parseCapable: true,
//   localeSensitive: false,
//   calendarSensitive: true,
//   timezoneSensitive: false,
//   supportedTypes: ['PlainDate', 'PlainDateTime', 'ZonedDateTime', 'PlainYearMonth'],
//   roundTripSafe: true,
// }

analyzeFormat("MMMM d, yyyy 'at' h:mm a");
// { tokens, requiredFields, compatibleTypes, parseable, localeSensitive,
//   calendarSensitive, timezoneSensitive, ambiguous, roundTripSafe, warnings }
```

- `analyzeFormat(formatStr)` — full structured report.
- `explainFormat(formatStr)` — human-readable version of the same.
- `tokenInfo(name)` — metadata for one token, or `undefined` if unrecognized.
- `listTokens()` — all recognized tokens with metadata.
- `isValidFormat(formatStr)` — `true` if the tokenizer accepts the string.
- `validateFormat(formatStr)` — throws on invalid input, otherwise returns the `analyzeFormat` report.
- `tokenizeFormat(formatStr)` — raw literal/token piece list.
- `fieldForToken(token)` — which `TemporalLike` field a token reads.

`TOKEN_METADATA`, `ALL_TOKEN_NAMES`, and `FORMAT_ONLY_TOKENS` are exported directly too, for tooling that wants the raw table (`do`, `ww`, `RRRR`, `D`/`DD`/`DDD`, `LLLL`/`LLL`, `cccc`/`ccc`, `GGGG`/`G`, `zzzz`/`z`).

**Round-trip safety by token family:**

| Family | Tokens | Round-trip safe | Why |
|--------|--------|-----------------|-----|
| Year | `yyyy` | yes | Preserves sign for BCE. |
| Year | `yy` | no | Century is lost — re-derived via the `00–68`/`69–99` rule, not guaranteed to match. |
| Month | `MMMM`, `MMM`, `MM`, `M` | yes | Both numeric and name forms round-trip; name forms are locale-sensitive. |
| Day | `dd`, `d` | yes | |
| Day | `do` | no | Format-only. |
| Weekday | `EEEE`, `EEE` | yes | Cross-checked on parse — a mismatch throws rather than round-tripping wrong. |
| ISO week | `ww`, `RRRR` | n/a | Format-only — a week number can't reconstruct a specific date alone. |

## Typed errors

Main API errors are typed `TemporalFmtError` subclasses. All inherit `code`, `input`, `format`, `token`, `position`, `expected`, `actual`, `reason`.

> **Deprecated compatibility API:** `temporal-fmt/legacy` is kept around to help existing code migrate. No removal date announced, but it isn't recommended for new code. Use the main API.

For code that still depends on plain-`Error` identity or `err.name === 'Error'`:

```js
import { format, parse } from 'temporal-fmt';
import { format as legacyFormat, parse as legacyParse } from 'temporal-fmt/legacy';
```

`temporal-fmt/legacy` also provides `formatToParts`, `compileFormat`, `safeParse`, `tryParse`, `parseToParts`, `compileParser`, and `matchesFormat`. `matchesFormat` is available from the package root as well, for older imports. It checks token shape and vocabulary, not date validity, and is retained for compatibility with existing scripts.

| Class | Code | Fires when |
|-------|------|------------|
| `FormatSyntaxError` | `FORMAT_SYNTAX_ERROR` | Unterminated quote, format string over the length cap, other syntax issues. |
| `UnknownTokenError` | `UNKNOWN_TOKEN` | An unrecognized letter run was encountered. |
| `ParseMismatchError` | `PARSE_MISMATCH` | Input doesn't match the format's shape — generic catch-all. |
| `InvalidDateError` | `INVALID_DATE` | Valid structure but nonexistent date (Feb 30), or a weekday/quarter that contradicts the date. |
| `InvalidTimeError` | `INVALID_TIME` | Time out of range (hour 25, etc). |
| `InvalidOffsetError` | `INVALID_OFFSET` | Offset malformed or outside `-12:00` to `+14:00`. |
| `InvalidTimeZoneError` | `INVALID_TIME_ZONE` | Not a recognized IANA name or fixed offset. |
| `InvalidCalendarError` | `INVALID_CALENDAR` | Unsupported calendar. |
| `AmbiguousInputError` | `AMBIGUOUS_INPUT` | Input has more than one valid reading. |
| `InvalidLocaleError` | `INVALID_LOCALE` | Not a valid BCP-47 tag, or an unsupported numbering system. |
| `InvalidDurationError` | `INVALID_DURATION` | Duration string doesn't match ISO 8601 grammar, or a field is non-finite. |

### Common error messages

**"no valid pattern matches the format string and input shape"** — the input doesn't match the format string. Usually a missing separator, a wrong digit count, or `zzz` capturing something that isn't a real IANA zone ID.

**"token X requires Y, which this Temporal object doesn't have"** — the token reads a field the value doesn't carry. `format(plainDate, 'HH:mm')` throws because `PlainDate` has no hour field.

**"format string mixes 'yyyy' and 'yy' year representations"** — don't combine both year tokens in one format string.

**"format string has an incomplete date — year, month, and day tokens must all be present together"** — a partial date can't become a Temporal value. Add the missing tokens.

**"X is ambiguous — N different ways to read tokens Y are all individually valid"** — add a separator, zero-pad, or pass `{ lenient: true }`.

**"offset hours X out of range (max 14 — Kiritimati, Line Islands is +14:00)"** — the offset's hour component is past the IANA range.

**"X has no such wall-clock time on this date — it falls in a DST gap"** — the time doesn't exist. Pick a different time, or pass `{ disambiguation: 'compatible' }` to `resolveZoned`.

**"has both a 'zzz' zone (X) and an offset token (Y), but the zone's actual offset at this date/time is Z, not Y"** — the zone name and the explicit offset disagree at the parsed instant.

## Type guards

```js
import { isPlainDate, assertZonedDateTime } from 'temporal-fmt';

if (isPlainDate(value)) { /* narrowed */ }
assertZonedDateTime(value); // throws descriptively if not
```

- `isTemporal`, `isInstant`, `isPlainDate`, `isPlainTime`, `isPlainDateTime`, `isZonedDateTime`, `isPlainYearMonth`, `isPlainMonthDay`, `isDuration`.
- `assertTemporal`, `assertInstant`, `assertPlainDate`, `assertPlainTime`, `assertPlainDateTime`, `assertZonedDateTime`, `assertPlainYearMonth`, `assertPlainMonthDay`, `assertDuration` — same checks, throwing descriptively on mismatch. Useful for narrowing whatever `parse()` returns.

## Config

`createConfig(overrides?)` returns a frozen config object bundling `locale`, `calendar`, `timeZone`, `numberingSystem`, week rules, rounding, disambiguation, overflow, `parseLenient`, and `durationShowZeroValues`. `mergeWithConfig(config, perCall)` folds config defaults into a per-call options object, with per-call options winning.

## Numbering systems

Numeric tokens output Western digits by default. Override it per call:

```js
import { format, parse } from 'temporal-fmt';

format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' });                       // "٢٠٢٦-٠٨-٠٤"
parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' }).toString(); // '2026-08-04'
```

`numberingSystem` and `parseNumberingSystem` are separate options on purpose: you might want localized digits in the output without expecting them back on the input.

Pass `'auto'` to use whichever numeral system the locale itself uses:

```js
format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'ar-EG' }); // "٢٠٢٦-٠٨-٠٤"
format(date, 'yyyy-MM-dd', { numberingSystem: 'auto', locale: 'bn-BD' }); // "২০২৬-০৮-০৪"
format(date, 'yyyy-MM-dd', { numberingSystem: 'auto' });                  // "2026-08-04" — en-US is latn
```

When a locale's native system isn't supported (Tangsa digits, say), `'auto'` falls back to `'latn'`. A malformed locale tag throws. Unset still means `'latn'` everywhere.

Direct conversion utilities:

```js
import { convertDigits, convertDigitsToAscii } from 'temporal-fmt';

convertDigits('2026', 'arab');        // "٢٠٢٦"
convertDigitsToAscii('٢٠٢٦', 'arab'); // "2026"
```

- `convertDigits(s, system)`, `convertDigitsToAscii(s, system)`.
- `applyNumbering(s, options)` / `applyParseNumbering(s, options)` — the same helpers `format()`/`parse()` use internally, exposed directly.
- `SUPPORTED_NUMBERING_SYSTEMS` — `'latn' | 'adlm' | 'ahom' | 'arab' | 'arabext' | 'bali' | 'beng' | 'bhks' | 'brah' | 'cakm' | 'cham' | 'deva' | 'fullwide' | 'gong' | 'gonm' | 'gujr' | 'guru' | 'hanidec' | 'hmng' | 'hmnp' | 'java' | 'kali' | 'khmr' | 'knda' | 'lana' | 'lanatham' | 'laoo' | 'lepc' | 'limb' | 'mathbold' | 'mathdbl' | 'mathmono' | 'mathsanb' | 'mathsans' | 'mlym' | 'modi' | 'mong' | 'mroo' | 'mtei' | 'mymr' | 'mymrshan' | 'mymrtlng' | 'newa' | 'nkoo' | 'olck' | 'orya' | 'osma' | 'rohg' | 'saur' | 'shrd' | 'sind' | 'sinh' | 'sora' | 'sund' | 'takr' | 'talu' | 'tamldec' | 'telu' | 'thai' | 'tirh' | 'tibt' | 'vaii' | 'wara' | 'wcho'`.

## Extending with custom tokens

`createFormatter(options?)` builds a formatter with its own token or tokens. A custom token can override a built-in of the same name when you need different behavior, without forking the library.

## IDE tooling data

These functions feed editor tooling rather than application code:

- `getAutocompleteData()` — token autocomplete entries, grouped by family.
- `getHoverDocs()` — per-token hover documentation.
- `getInlineDiagnostics(formatStr)` — diagnostics with positions and suggested fixes.
- `previewFormat(formatStr, sample?)` — live preview string for a format.
- `getDocUrl(tokenName)` — documentation URL for a token (points at [Tokens](#tokens)).
- `DAYJS_TO_TEMPORAL_FMT` / `DATE_FNS_TO_TEMPORAL_FMT` — token conversion hints for migration tooling.

## Legacy mod documentation

Mod support was removed in 0.9.82. The package no longer discovers, loads, sandboxes, or executes mods, and the CLI went with it. Historical documentation for prior versions lives in [`LEGACY_VERSION_MODS/`](./LEGACY_VERSION_MODS/); it describes behavior that no longer exists, so don't use it as current usage guidance. The folder will be dropped from `main` once 0.10.x ships, but it stays on the `0.9.x` branch after the branch is cut.

## Subpath imports

```js
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';
import { formatDuration } from 'temporal-fmt/duration';
import { formatRelative } from 'temporal-fmt/relative';
import { interval, formatRange } from 'temporal-fmt/interval';
import { daysInMonth, startOf } from 'temporal-fmt/calendar';
import { resolveZoned, isDST } from 'temporal-fmt/timezone';
import { recurrence } from 'temporal-fmt/recurrence';
import { registerLocale } from 'temporal-fmt/locale';
```

Arithmetic, comparison, rounding, business calendars, holidays, serialization, config, type guards, typed errors, the analyzer, and IDE tooling data are available only from the main `temporal-fmt` entry. No dedicated subpaths for those yet.

`sideEffects: false` is set in `package.json`. Measured with esbuild, `import { format } from 'temporal-fmt/format'` comes to ~27KB, against ~68KB from the bare entry. If bundle size matters to you, use the subpath.

## Migrating from Day.js or date-fns

### Token mapping

| Day.js / date-fns | temporal-fmt | Notes |
|---|---|---|
| `YYYY` | `yyyy` | Lowercase here |
| `YY` | `yy` | Same |
| `MMMM`, `MMM`, `MM`, `M` | same | Identical |
| `DD`, `D` | `dd`, `d` | Lowercase here |
| `dddd` | `EEEE` | Long weekday |
| `ddd` | `EEE` | Short weekday |
| `HH`, `H`, `mm`, `m`, `ss`, `s` | same | Identical |
| `A`, `a` | `a` | Always lowercase here |
| `Z` | `XXX` | Offset with colon, `Z` for UTC |
| `ZZ` | `XX` | Offset, no colon |
| `X` | not supported | Use `fromUnixSeconds` |
| `x` | not supported | Use `fromUnixMilliseconds` |
| `P` | not supported | Write the format string out explicitly |

### API mapping

| Day.js | date-fns | temporal-fmt |
|---|---|---|
| `dayjs(str).format(fmt)` | `format(date, fmt)` | `format(temporal, fmt)` |
| `dayjs(str)` (parse) | `parseISO(str)` | `parseISO(str)` |
| `dayjs().add(n, 'day')` | `addDays(date, n)` | `add(date, n, 'days')` or `addDays(date, n)` |
| `dayjs().diff(other, 'day')` | `differenceInDays(a, b)` | `differenceInDays(a, b)` |
| `dayjs().isBefore(other)` | `isBefore(date, other)` | `isBefore(date, other)` |
| `dayjs().isAfter(other)` | `isAfter(date, other)` | `isAfter(date, other)` |
| `dayjs().isToday()` | `isToday(date)` | `isToday(date)` |
| `dayjs().isYesterday()` | `isYesterday(date)` | `isYesterday(date)` |
| `dayjs().isTomorrow()` | `isTomorrow(date)` | `isTomorrow(date)` |

### Things that will bite you

1. **Strict parsing.** Day.js silently picks one reading of ambiguous input. This library throws. Add separators, or use `{ lenient: true }`.
2. **Cross-field validation.** Weekday, quarter, and offset are checked against the parsed date. A wrong weekday label throws.
3. **No "now" fallback.** Missing input doesn't fall back to the current time.
4. **Type-preserving.** `format(plainDate, 'HH:mm')` throws, because `PlainDate` has no hour field. Day.js would silently use 0.
5. **Temporal-native, not `Date`-native.** Convert at the boundary:

```js
import { Temporal } from 'temporal-polyfill';
const pd = Temporal.PlainDate.from(jsDate.toISOString().slice(0, 10));
format(pd, 'yyyy-MM-dd');
```

### Common patterns

```js
// CSV/log timestamp parsing
const d = parse('yyyy-MM-dd HH:mm:ss', line);

// Locale-aware formatting
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' }); // "août 4, 2026"

// Relative time
formatRelativeToNow(date); // "3 days ago"

// Date arithmetic
add(date, 7, 'days'); // or addDays(date, 7)
```

### Things that don't migrate cleanly

- **Day.js's `customParseFormat` plugin** — that plugin parses leniently. Audit the callers relying on it.
- **Day.js's global locale** (`dayjs.locale('fr')`) has no equivalent here; this library takes a per-call `locale` option.
- **date-fns's locale objects** don't carry over either; this library takes BCP-47 strings.
- **`dayjs-timezone`** — use `Temporal.ZonedDateTime` and the `zzz`/offset tokens instead.

### Running both during migration

```js
import dayjs from 'dayjs';
import { format as fmtTemporal } from 'temporal-fmt';

function formatDate(date, formatStr, opts) {
  if (opts?.useTemporal) return fmtTemporal(date, formatStr, opts);
  return dayjs(date).format(formatStr);
}
```

Migrate file by file, then drop the wrapper once nothing calls the old path.

## Related tools

Both are deprecated and archived (single-maintainer bandwidth, no further updates), but the last published versions still work:

- [`eslint-plugin-temporal-fmt`](https://www.npmjs.com/package/eslint-plugin-temporal-fmt) *(deprecated, archived)* — lints format strings for common mistakes, `hh` without `a` for example. Backed by the same metadata as `analyzeFormat().warnings`.
- [`temporal-fmt-codemod`](https://github.com/DirazCoder/temporal-fmt-codemod) *(deprecated, archived)* — jscodeshift codemod that rewrites `dayjs(x).format(...)` and date-fns `format(...)` call sites across a codebase.

## Testing

The suites run 3,000+ test and smoke checks across `test/`, `vitest/`, and a consumer suite. The smoke runner packs and installs the package, checks the public subpaths in CJS and ESM, and runs consumer type probes with both `bundler` and `nodenext` resolution. If it's in this README, it has a test — `test/readme/readme-examples.test.js` executes every example in this file against the built package, importing through the same subpaths the examples show, and asserts the claimed outputs. CI also runs the full `vitest/` suite in real browsers, plus a separate Playwright suite against the built package in Chromium, Firefox (Gecko), and WebKit across Linux, Windows, and macOS.

Both the classic Node `node:test` suite (`npm run test:coverage`, c8 against `dist/`) and the full Vitest suite (`npx vitest run --coverage`, V8 against `src/`) enforce 100% statement, branch, function, and line coverage.

Each suite runs on its own: `npm test` (`test/`), `npm run test:conformance` (`conformance/`), `npm run test:unit` (`vitest/`), `npm run test:smoke` (`smoke-test/`), `npm run test:browser:unit` (the full Vitest suite in a browser), and `npm run test:browser` (Playwright against the built package). `npm run test:all` runs everything, with conformance as a separate step and browser suites in Chromium, Firefox, and WebKit. Install the Playwright browsers first (`npx playwright install`; Linux also needs `npx playwright install-deps`). To skip the browser tests, use `npm run test:all -- --no-browser`. CI uses that option because it runs the browser matrix as a separate job.

CI runs the Node and package tests on Node 20, 22, 24, and 26 across Ubuntu, Windows, and macOS. The full `vitest/` suite runs in each browser/platform combination on Chromium, Firefox (Gecko), or WebKit, and a separate Playwright suite exercises the built `dist/` package with the latest Playwright release. GitHub also runs CodeQL for GitHub Actions and JavaScript/TypeScript, along with repository dependency checks.

## Conformance fixtures

`fixtures.json` is a portable test-vector set for token-based Temporal formatters, written against a different library's token vocabulary. Each case names an `op` (`format` / `parse` / `roundtrip`), an input, a pattern, and an expected result. Any library with a `format`/`parse` pair can use it.

`conformance/temporal-fmt.test.js` adapts the portable fixture set. `conformance/reference.test.js` adds curated vectors translated from Temporal/Intl, CLDR, tzdb, recurrence, token, relative-date, and wire-format reference domains. These aren't wholesale upstream suites, and they don't claim complete standards compliance. Run them with `npm run test:conformance`; conformance stays separate from `npm test`. Sources, coverage, and exclusions are in [conformance/README.md](./conformance/README.md).

### Why this is separate from adversarial and fuzz tests

`test/adversarial.test.js` and `test/fuzz.test.js` check internal consistency under hostile input: a clean throw or a correct value, never a crash or a silently wrong result. The reference point there is the library's own logic.

The conformance suite checks against an external set of tricky-but-well-defined cases (DST transitions, leap years, offset rendering, calendar limits), where "correct" comes from the fixture, not from this library's code.

### Pattern translation

Two fixture tokens don't exist in temporal-fmt:

| Fixture token | temporal-fmt equivalent | Why |
|---|---|---|
| `ZZ` (always-signed, never `Z`) | `xxx` | Only uppercase `X`/`XX`/`XXX` collapses to `Z`. Lowercase never does, which is exactly `ZZ`'s semantics. `XXX` was tried first and is wrong — it fails cases that expect `+00:00`, not `Z`. |
| `VV` (IANA zone ID) | `zzz` | temporal-fmt's only zone-identity token. |

Everything else in the fixture set (`yyyy`, `y`, `MM`, `dd`, `HH`, `mm`, `ss`, `S`–`SSSSSSSSS`, `h`, `a`, `X`/`XX`/`XXX`) already matches temporal-fmt's vocabulary.

### `opinionated` cases

Cases flagged `"opinionated": true` encode a design choice made by the fixture's source library, not a fact about dates. The adapter still runs them; where temporal-fmt's behavior differs, it logs a divergence note instead of failing.

Two cases currently diverge, both `yy`-pivot: `extreme-year-two-digit-pivot-low` and `extreme-year-two-digit-pivot-high`. temporal-fmt refuses `yy` in any format string that isn't a complete date, so `parse("yy-MM", ...)` throws an incomplete-date error before the century-pivot question ever comes up. Both are documented design choices with their own tests.

One previously flagged case no longer diverges: **`shape-mixing-H-and-a-rejected`**. `resolveHour()` used to cross-check `H` against `a` instead of banning the combination outright, which meant `13:05 PM` was accepted. That was reversed; `H` and `a` are now refused together, matching the fixture. The fixture's `"opinion"` text still describes the old behavior, so treat it as historical.

### Fixed divergences

Everything below was once in `KNOWN_FAILURES`. That list is now empty.

**Offset seconds were dropped, not rejected.** `formatOffset()` assumed every offset was exactly 6 characters and never checked for a seconds component. A pre-1883 `America/New_York` date has offset `-04:56:02`; the old code silently produced `-0402`. Now `X`/`XX`/`XXX`/`x`/`xx` throw when the offset has a seconds component, and `xxx` passes it through.

**Offset-only `ZonedDateTime` construction was refused.** `parse()` used to build a `ZonedDateTime` from an offset token alone, no `zzz` required. That changed: an offset identifies a UTC distance, not a time zone, so a pattern with an offset token and no `zzz` now throws.

**`y` token added.** temporal-fmt previously had only `yyyy` and `yy`. `y` formats and parses at any width, sign preserved for years before ISO year 0. `buildCapturingPattern()` refuses to place `y` directly next to another digit-reading token or a digit-leading literal, rather than trying to cost-estimate an unbounded-width fragment.

**`zzz` was rejecting valid IANA aliases.** `offset-X-parse-accepts-four-digit` got misdiagnosed as a regex gap. The actual failure: `isValidTimeZone()` only checked `Intl.supportedValuesOf('timeZone')`, which lists canonical IDs but not every IANA link and alias name. `Asia/Kolkata` (a common alias for `Asia/Calcutta`) was rejected even though `Temporal.ZonedDateTime.from()` accepts it. The fix: `isValidTimeZone()` falls back to a real `ZonedDateTime.from()` call when the `Intl` fast path misses.

### Adapter notes

- `parse(formatStr, input, options)` takes `(formatStr, input)` — reversed from the fixture's field order.
- The fixture's three `expect.throws` values (`"ParseError"`, `"FormatError"`, `"InvalidPatternError"`) don't map cleanly onto temporal-fmt's subclasses. The adapter just checks that something extending `Error` was thrown.
- `target` in the fixture is informational. temporal-fmt's `parse()` infers the result shape from tokens, so the adapter never passes `target` as input.

## Benchmarks

`benchmarks/` holds a tinybench suite covering the main hot paths: format, parse, arithmetic, relative distance, serialization, comparison, and rounding.

```sh
npm run bench              # all suites
npm run bench:format       # format suite only
npm run bench:parse        # parse suite only
node benchmarks/run.mjs --suite=arithmetic,rounding
```

Each suite runs a warmup pass before measuring, so the numbers reflect cached-pattern throughput rather than cold-start cost. The format and parse suites include both cold calls and pre-compiled handles (`compileFormat`/`compileParser`) side by side, so you can see what the cache actually buys for your use case.

## Contributing

```sh
git clone https://github.com/DirazCoder/temporal-fmt.git
cd temporal-fmt
npm install
npm run build
npm run test:all
```

`npm test` runs only the classic `node:test` suite; it doesn't touch `vitest/` or the packed-package smoke suite. `npm run test:all` gives you the build, both coverage gates, the type/package/smoke checks, and the browser suites. Use `npm run test:all -- --no-browser` to skip browsers.

Build notes, if you're touching the toolchain:

- TypeScript 7.0.2+ is required. `.d.ts` generation runs as a separate `tsc` pass rather than through `tsup`, because `tsup`'s dts step uses `rollup-plugin-dts`, which calls into TypeScript's compiler API and isn't stable on 7.x. `tsup.config.ts` sets `dts: false`; `npm run build` runs `tsup && tsc --declaration --emitDeclarationOnly`. Side effect: `dist/` ends up with one `.d.ts` per source file instead of a single rolled-up `index.d.ts`.
- Tests use `temporal-polyfill/full`, not the slim build, because the Hebrew-calendar tests need the full calendar data. `parse.test.js` configures `Temporal` through `setTemporal()` rather than by mutating `globalThis.Temporal`.

## License

Apache 2.0 — see [LICENSE](./LICENSE).
