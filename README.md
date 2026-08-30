# temporal-fmt 🥶🔥

![coverage](https://img.shields.io/badge/coverage-100%25%20(c8)-brightgreen?style=flat-square)
[![format subpath size](https://img.shields.io/bundlephobia/minzip/temporal-fmt?path=format&label=format%20subpath)](https://bundlephobia.com/package/temporal-fmt)
[![parse subpath size](https://img.shields.io/bundlephobia/minzip/temporal-fmt?path=parse&label=parse%20subpath)](https://bundlephobia.com/package/temporal-fmt)

Format and parse `Temporal` values (`PlainDate`, `PlainTime`, `PlainDateTime`,
`ZonedDateTime`) using date-fns-style tokens, with real validation — bad input
throws instead of silently returning garbage. Locale-aware, no deps.

Node 26 shipped native `Temporal` and then pointedly left out a custom-string
formatter. TC39's take: use `Intl.DateTimeFormat` and leave string-token syntax
to userland. Fair enough, but if you've spent years typing `'yyyy-MM-dd'` out of
muscle memory from date-fns, moment, or dayjs, that's a rough adjustment. This
library exists so you don't have to make it.

Zero dependencies. Native on Node 26+, or bring your own via a polyfill or
`setTemporal()`. Import from a subpath (`temporal-fmt/format`, `temporal-fmt/parse`,
etc.) to pull in only what you use — see [Subpath imports](#subpath-imports).

Locale-aware tokens need Node 20+ regardless of which path you use — native
on 26+, or falling back to the Temporal implementation's own
`toLocaleString()` otherwise. Untested below Node 20.

## Install

```sh
npm install temporal-fmt
```

[View on npm](https://www.npmjs.com/package/temporal-fmt)

## Get started

```js
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';

const date = Temporal.PlainDate.from('2026-08-04');
format(date, 'yyyy-MM-dd');                       // "2026-08-04"

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');    // Temporal.PlainDateTime
```

That's the whole library for most use cases — `format(temporal, formatStr)` in, `parse(formatStr, input)` out, same shape as date-fns or Day.js. Import from the subpaths (`temporal-fmt/format`, `temporal-fmt/parse`) shown above, not the bare `temporal-fmt` package — a bundler only ships what you actually call that way. Measured with esbuild: ~27KB for `format` alone via the subpath, versus ~68KB for the same function pulled from the bare import.

Below Node 26, `Temporal` isn't global yet, so you'll need a polyfill first — see [Providing `Temporal`](#providing-temporal). On Node 26+ the snippet above just works.

The package looks large on npm — locales, recurrence, business calendars, timezone disambiguation, an analyzer, config layers, a CLI — but none of that is required reading or required bundle weight. It's there behind its own subpaths for when you need it; see [Subpath imports](#subpath-imports) for the full list and [Formatting](#formatting)/[Parsing](#parsing) for the details on the two functions above.

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
- [CLI](#cli)
- [Mods](#mods)
- [Subpath imports](#subpath-imports)
- [Migrating from Day.js or date-fns](#migrating-from-dayjs-or-date-fns)
- [Known limitations](#known-limitations)
- [Related tools](#related-tools)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Providing `Temporal`

### Node 26+

Temporal is native and used automatically.

### Polyfill

Use a polyfill like [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) to put Temporal on the global namespace.

```js
import 'temporal-polyfill/global'
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';

parse(...);
```

### Bring your own

Set a Temporal implementation explicitly, once, before your app's first `format()`/`parse()` call:

```js
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from 'temporal-fmt';
import { format } from 'temporal-fmt/format';
import { parse } from 'temporal-fmt/parse';

setTemporal(Temporal); // once, before using format or parse
```

`setTemporal()` takes precedence over native or global `Temporal`, and calling it again overrides whatever was set before. Useful when you don't want to pollute the global namespace — libraries, mainly. Call it with no argument to clear the override and fall back to `globalThis.Temporal`.

Anything that constructs a `Temporal` value from scratch needs this — `parse()`, `parseISO()`, `resolveZoned()`, and a handful of others. Functions that only read fields off a value you already built (`format()`, `compare()`, `add()`) don't touch the namespace at all, so they work with any Temporal-shaped object regardless of whether you've called `setTemporal()`.

## Formatting

```js
import { format } from 'temporal-fmt/format';

const date = Temporal.PlainDate.from('2026-08-04');
format(date, 'yyyy-MM-dd');           // "2026-08-04"
format(date, 'MMMM d, yyyy');         // "August 4, 2026"

const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
format(dt, "MMM d, yyyy 'at' h:mm a"); // "Aug 4, 2026 at 3:45 PM"

const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30-04:00[America/New_York]');
format(zdt, 'yyyy-MM-dd HH:mm zzz');   // "2026-08-04 15:45 America/New_York"
```

Wrap literal text in single quotes, like `'at'` above. Need an actual single quote in your output? Use `''`.

Try a token your input type doesn't support — `HH` on a `PlainDate`, say — and you get a real error telling you so, not a silent `undefined` sitting in your output waiting to confuse someone in three weeks.

- `format(temporal, formatStr, options?)` — formats a Temporal value against a token string. Returns a string.
- `formatToParts(temporal, formatStr, options?)` — same, but returns an array of `{ type: 'literal' | 'token', value, token? }` parts instead of a joined string. Mirrors the shape of `Intl.DateTimeFormat.formatToParts`, useful if you want to style each piece separately (e.g. one `<span>` per token in a DOM output).
- `compileFormat(formatStr)` — pre-tokenizes a format string once and returns an object with `.format()`/`.formatToParts()` methods, plus `.pieces` and `.formatStr` for inspection. Format strings are already tokenize-cached internally (LRU, 500 entries), so this mainly buys you up-front validation — a bad format string throws at compile time instead of on first use — and a place to hold onto the compiled form explicitly.

## Parsing

`parse()` builds a real `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `ZonedDateTime` out of a string, picking whichever type fits the tokens present:

```js
import { parse } from 'temporal-fmt/parse';

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');    // Temporal.PlainDateTime
parse('yyyy-MM', '2026-08-04T15:45:30');          // throws — shape doesn't match
parse('yyyy-MM-dd', '2026-02-30');                // throws — not a real date
```

Because the return type depends on which tokens are present in the format string, and that's unknown at compile time, you'll need `instanceof` or your own type guard to narrow it in TypeScript — see [Type guards](#type-guards).

Since `parse()` constructs a real value rather than just matching shape, it also catches contradictions a shape-only regex would miss — an impossible date like February 30th, or a weekday label that disagrees with the date it's paired with:

```js
parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');  // fine — that really is a Tuesday
parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04');   // throws — it isn't
```

`parse()` throws when `input` doesn't match `formatStr`'s shape at all, and throws a more specific error when the shape matches but the resulting date/time is invalid.

Three other entry points, same underlying logic, different failure handling:

- `safeParse(formatStr, input, options?)` — never throws. Returns `{ ok: true, value }` or `{ ok: false, error: TemporalFmtError }`.
- `tryParse(formatStr, input, options?)` — never throws. Returns the value, or `undefined` on any failure.
- `parseToParts(formatStr, input, options?)` — returns the matched token groups with their positions in the input string, instead of constructing a value. Useful for highlighting what matched where.
- `compileParser(formatStr, options?)` — pre-compiles a parser for repeated use against the same format string.

A few things worth knowing about how `parse()` behaves:

- **`yy` (2-digit year)** follows the POSIX [strptime](https://www.man7.org/linux//man-pages/man3/strptime.3p.html) convention: `00–68` becomes `2000–2068`, `69–99` becomes `1900–1999`. Opinionated, but it's what makes `yy` deterministic without an external reference date.
- **`hh`/`h` (12-hour) without an `a` token throws.** Same if a format string mixes `HH`/`H` with `hh`/`h`, even when both agree on the hour — `parse()` won't guess which one is authoritative, so pick one.
- **`HH`/`H` combined with `a` is allowed, and cross-checked.** `parse('HH:mm a', '13:05 PM')` succeeds since 13:05 can only mean PM, but `parse('HH:mm a', '01:05 PM')` throws — the day period contradicts the hour. Different case from the point above: there's only one hour token here, `a` is just confirming it.
- **`a` (AM/PM) is case-insensitive** — `pm`, `Pm`, `PM` all parse the same. Month and weekday names (`MMMM`, `EEEE`, etc.) stay case-sensitive; only the day-period marker is folded.
- **`S` through `SSSSSSSSS` reach micro/nanosecond precision**, not just milliseconds. `SSS` is the familiar 3-digit ms case; wider tokens expose whatever sub-millisecond precision the `Temporal` value actually carries, so you can round-trip machine-generated timestamps (DB exports, instrumentation logs) without silently truncating. Format truncates to the requested width (never rounds); parse right-pads short input — `SSSSSSSSS` reading `.5` means 500ms-worth of nanoseconds (`500000000`), not 5 nanoseconds.
- **`MMMM`/`MMM` assume a 12-month calendar.** The name vocabulary is generated from 12 Gregorian reference dates, so a calendar with a leap month (Hebrew's 13-month leap years, for instance) isn't fully covered by month *names*. Numeric `yyyy-MM-dd` round-trips are unaffected.

### Ambiguous input and lenient mode

By default, `parse()` throws when a glued numeric run (e.g. `"121"` against `yyyy-Md`) has more than one valid split. It refuses to guess — silently picking one would return a value that's indistinguishable from a different, equally valid reading of the same input.

```js
parse('yyyy-Md', '2026-121')                              // throws — ambiguous
```

Pass `{ lenient: true }` to opt into a documented heuristic instead:

```js
parse('yyyy-Md', '2026-121', { lenient: true }).toString() // '2026-12-01'
```

**Heuristic**: if one of the tokens in the ambiguous run is `d` (day), prefer the split where the day value is ≤ 12. The reasoning: someone who glues a run like `"121"` into an `Md` format is more likely to mean Dec 1 (M=12, d=1) than Jan 21 (M=1, d=21) — if they meant Jan 21, they'd more often write it with a separator or padding (`"1/21"`, `"01/21"`). It's not a guarantee, which is exactly why it's opt-in. When the heuristic doesn't narrow it down (both splits have day ≤ 12), or when there's no `d` token in the run at all (e.g. `Hm`), it falls back to the first valid split — deterministic, but arbitrary. Default behavior (lenient unset or `false`) is unchanged either way.

### Offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`)

The six offset tokens only work on `ZonedDateTime`. On a `PlainDate`/`PlainTime`/`PlainDateTime` they throw the same "requires offset, which this Temporal object doesn't have" error every other field-typed token throws when its field is missing.

Uppercase (`X`/`XX`/`XXX`) collapses `+00:00` to `Z` for UTC. Lowercase (`x`/`xx`/`xxx`) always emits a numeric offset, even for UTC (`+00`, `+0000`, `+00:00`). The single-letter forms (`X`/`x`) drop minutes when they're zero (`+05` rather than `+0500`) and append them with no colon when non-zero (`+0530`) — the LDML spec's "hours required, minutes optional when zero" rule.

On parse, an offset token needs a full date and time to anchor the instant — same rule `zzz` enforces. With an offset token and no `zzz`, the resulting `ZonedDateTime`'s `timeZoneId` is the offset string itself (e.g. `"+09:00"`). With **both** `zzz` and an offset token, it's a cross-check: `zzz` wins for the result's `timeZoneId` (the IANA name is the meaningful label), and the offset token's value must match that zone's actual offset at the parsed instant. Disagreement throws rather than silently picking one — `parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 America/New_York +09:00')` throws, because August in New York is `-04:00`, not `+09:00`.

Range: `-12:00` to `+14:00`, the IANA-supported range. Out-of-range values throw a descriptive error naming the bound.

## Locales

Pass a BCP 47 locale tag via `options.locale` and month names, weekday names, and AM/PM markers all localize. Defaults to `'en-US'`.

```js
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' });   // "août 4, 2026"
format(date, 'EEEE d MMMM', { locale: 'ar-EG' });    // Arabic weekday/month names
format(dt, 'h:mm a', { locale: 'ja-JP' });            // "3:45 午後"
```

The named-vocabulary tokens (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`) go through `Intl.DateTimeFormat` under the hood, so non-Gregorian calendars work as long as the `Temporal` object already carries one:

```js
const hebrewDate = date.withCalendar('hebrew');
format(hebrewDate, 'MMMM d, yyyy');   // "Av 21, 5786"
```

Numeric tokens (`yyyy`, `MM`, `dd`) read straight off the object's already-calendar-specific fields, so the formatting logic itself is calendar-agnostic — they never touch `Intl`.

The same locale handling applies to `parse()`:

```js
parse('MMMM d, yyyy', 'août 4, 2026', { locale: 'fr-FR' });
parse('h:mm a', '3:45 午後', { locale: 'ja-JP' });
parse('yyyy-MM-dd', '5786-11-21', { locale: 'en-u-ca-hebrew' }); // -u-ca- extension parses into that calendar
```

**Numeric fields come out in Western (0–9) digits by default**, regardless of locale — passing `{ locale: 'ar-EG' }` alone doesn't switch `yyyy`/`MM`/`dd` to Arabic-Indic digits, only the named-vocabulary tokens above. That's on purpose: logs, APIs, and filenames reading this output back in generally want boring ASCII digits, so locale doesn't silently drag the numeric tokens along with it. If you specifically want localized digits on the numeric pieces, that's a separate, explicit opt-in — see [Numbering systems](#numbering-systems) below.

### Registering custom vocabulary

`Intl` doesn't cover every locale well — the standing example here is a 13-month Hebrew leap year, where `Intl`'s 12-month vocabulary can't name the extra month. Two registration functions cover this, at different levels of detail.

**`registerLocaleVocab(locale, vocab)`** — base vocabulary: months, weekdays, day periods only.

```js
import { registerLocaleVocab } from 'temporal-fmt';

registerLocaleVocab('en-u-ca-hebrew-leap', {
  monthLong: ['Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul', 'Tishrei', 'Marcheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II'],
  monthShort: ['Nis', 'Iyy', 'Siv', 'Tam', 'Av', 'Elu', 'Tish', 'Chesh', 'Kis', 'Tev', 'Shv', 'Ad1', 'Ad2'],
  weekdayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dayPeriod: ['AM', 'PM'],
});

const date = Temporal.PlainDate.from('2026-08-04').withCalendar('hebrew');
format(date, 'MMMM d, yyyy', { locale: 'en-u-ca-hebrew-leap' }); // "Av 4, 5786" (or similar)
```

**`registerLocale(locale, vocab)`** — extended vocabulary: everything `registerLocaleVocab` covers, plus quarters, eras, ordinals, duration units, and relative-time language:

```js
import { registerLocale } from 'temporal-fmt';

registerLocale('test-locale-1', {
  // base vocab (required)
  monthLong: [/* 12 entries */],
  monthShort: [/* 12 entries */],
  weekdayLong: [/* 7 entries */],
  weekdayShort: [/* 7 entries */],
  dayPeriod: ['AM', 'PM'],
  // extended vocab (optional)
  quartersLong: ['First', 'Second', 'Third', 'Fourth'],
  quartersShort: ['Q1', 'Q2', 'Q3', 'Q4'],
  erasLong: ['BCE', 'CE'],
  erasShort: ['BC', 'AD'],
  ordinals: ['st', 'nd', 'rd', 'th'],
  durationUnits: { years: ['year', 'years'] /* , ... */ },
  relativeTime: { past: 'ago', future: 'in', now: 'now' },
});
```

`getLocale(locale)` returns the registered extended vocab if there is one, otherwise the `Intl`-derived base vocab — deterministic, keyed off the canonical locale tag (lowercased via `Intl.Locale`). `hasLocale(locale)` checks whether an entry is registered without pulling the fallback.

Validation on both functions is strict: wrong array lengths (12 months, 7 weekdays, 2 day periods), empty strings, duplicate entries, and identical AM/PM day periods (which would leave `parse()` unable to distinguish them) all throw at registration time, not later during format/parse. Registering invalidates the cache entry for that locale key immediately, so the next call picks up the new vocab — `registerLocaleVocab`/`registerLocale` are the only global mutation points in the library; every other locale option is per-call.

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
| `EEEE` | Long weekday name, locale-aware. Cross-checked against the date on parse | `Tuesday` |
| `EEE` | Short weekday name, locale-aware. Cross-checked on parse | `Tue` |
| `HH` | Two-digit hour, 24-hour, zero-padded | `15` |
| `H` | One- or two-digit hour, 24-hour | `15` |
| `hh` | Two-digit hour, 12-hour, zero-padded. Needs `a` on parse | `03` |
| `h` | One- or two-digit hour, 12-hour. Needs `a` on parse | `3` |
| `mm` | Two-digit minute, zero-padded | `45` |
| `m` | One- or two-digit minute | `45` |
| `ss` | Two-digit second, zero-padded | `30` |
| `s` | One- or two-digit second | `30` |
| `S` … `SSSSSSSSS` | Fractional second, 1–9 digits (tenths through nanoseconds) | `SSS` → `000` |
| `a` | Day period, locale-aware, case-insensitive on parse | `PM` |
| `zzz` | IANA time zone id, or fixed offset. Needs full date+time on parse | `America/New_York` |
| `zzzz` | Localized long time zone name. Format-only | `Eastern Standard Time` |
| `z` | Localized short time zone name. Format-only | `EST` |
| `X` | UTC offset, short, `Z` for UTC | `+05` / `+0530` / `Z` |
| `XX` | UTC offset, no colon, `Z` for UTC | `+0500` / `Z` |
| `XXX` | UTC offset, with colon, `Z` for UTC | `+05:00` / `Z` |
| `x` | Same as `X`, never `Z` | `+05` / `+0530` / `+00` |
| `xx` | Same as `XX`, never `Z` | `+0500` / `+0000` |
| `xxx` | Same as `XXX`, never `Z` | `+05:00` / `+00:00` |
| `Q` | Quarter, digit (1–4). Cross-checked against month on parse | `3` |
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

Every token's structured metadata — round-trip safety, locale/calendar/timezone sensitivity, which Temporal types it works on — is available at runtime via `tokenInfo(name)` or the full `TOKEN_METADATA` table; see [Introspection and the analyzer](#introspection-and-the-analyzer).

**`do`** is format-only — `parse()` rejects it, since the "st"/"nd"/"rd"/"th" suffix isn't structurally distinguishable from adjacent literal text once you're matching against arbitrary input. The English-only suffix rule is deliberate too: locale-aware ordinals are out of scope, since `Intl.DateTimeFormat` has no part type for ordinals and the rest of this library routes locale-specific names through it.

**`Q`/`QQQ`** both format and parse, cross-checking against any month/date tokens present in the same string — same contract `EEEE` uses for weekday.

**`ww`/`RRRR`** are format-only: parsing a week number back into a specific date needs a weekday or a full date to disambiguate, which is a different parsing surface than what `parse()` does here. `RRRR` is the ISO week-numbering year, not the calendar year — they diverge at year boundaries. `format(PlainDate.from('2026-12-31'), 'ww RRRR')` → `"53 2026"`; `format(PlainDate.from('2027-01-01'), 'ww RRRR')` → `"53 2026"` (that Friday belongs to ISO year 2026's week 53); `format(PlainDate.from('2027-01-04'), 'ww RRRR')` → `"01 2027"` (Monday starting ISO week 1 of 2027).

**`LLLL`/`LLL`/`cccc`/`ccc`** are the stand-alone forms (nominative case in Slavic locales, where the regular month/weekday forms decline by grammatical case). They render identically to `MMMM`/`MMM`/`EEEE`/`EEE` in most locales — the distinction only shows up in languages with case-marked calendar vocabulary.

## Duration formatting

`formatDuration(duration, formatStr, options?)` formats a `Temporal.Duration` (or a plain field bag `{ years, months, weeks, days, hours, minutes, seconds, milliseconds }`) with its own duration-specific token set. A duration doesn't sit on a calendar — no year/month/day position the way a `PlainDate` has — so the date/time token table above doesn't apply here.

Each unit has three forms, increasing in verbosity:

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

Short and long forms are plural-aware (singular at 1, plural otherwise).

```js
import { formatDuration } from 'temporal-fmt';

formatDuration({ years: 2, months: 3 }, 'yyy ooo')     // "2 years 3 months"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm')   // "2 hours 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'h:mm')      // "2:30"
```

**Zero-value handling**: zero-value units are omitted by default. `formatDuration({ hours: 2 }, 'hhh mmm')` returns `"2 hours "` — the trailing space is the literal separator from the format string, and cleaning that up is on the caller, not the library. Pass `{ showZeroValues: true }` to render zero-value units anyway.

**Locale-aware unit names**: pass `{ locale }` to localize short/long forms via `Intl.NumberFormat`'s `style: 'unit'` mode, the same approach `formatDistance` uses for `Intl.RelativeTimeFormat`. Numeric-only tokens (`y`, `o`, `w`, ...) always stay ASCII digits, matching the rest of the library's convention.

```js
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' }) // "2 heures 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'es-ES' }) // "2 horas 30 minutos"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'de-DE' }) // "2 Stunden 30 Minuten"
```

Without a `locale`, output comes from a hand-rolled English singular/plural table — this is the default path and it's additive, so existing calls with no `locale` are unaffected. Note that passing `locale: 'en-US'` explicitly isn't identical to omitting it — `Intl`'s spacing conventions differ from the hand-rolled table (`"2 hr"` vs `"2h"`). Pick whichever matches what you need.

### Other duration functions

- `formatDurationToParts(duration, formatStr, options?)` — `formatDuration`, but returns parts instead of a joined string.
- `parseDuration(input, formatStr, options?)` — the inverse of `formatDuration`: parses a formatted string back into duration fields.
- `parseISODuration(input)` / `formatISODuration(duration)` — parse/format the ISO 8601 duration grammar (`P1Y2M3DT4H5M6S`).
- `balanceDuration(duration)` — normalizes fields into their natural ranges (e.g. 90 minutes → 1 hour 30 minutes).
- `totalDuration(duration, unit)` — sums a duration's absolute fields into a single number in the target unit (`'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds'`).
- `compareDuration(a, b)` — `-1`/`0`/`1` by total absolute length.
- `addDuration(a, b)` / `subtractDuration(a, b)` — field-by-field sum/difference.
- `roundDuration(duration, options)` — round a duration to a unit; see [Date arithmetic, comparison, and rounding](#date-arithmetic-comparison-and-rounding).

## Relative time

Two different things live under this heading — pick based on what you want back.

### `formatDistance` — "3 days ago"

`formatDistance(date1, date2, options?)` returns a human-readable relative-time string, delegating unit names and pluralization to `Intl.RelativeTimeFormat`.

```js
import { formatDistance } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04');
const yesterday = Temporal.PlainDate.from('2026-08-03');

formatDistance(today, yesterday)                         // "yesterday" (numeric: 'auto')
formatDistance(today, yesterday, { numeric: 'always' })   // "1 day ago"
formatDistance(today, today)                              // "now"
formatDistance(today, today.add({ days: 2 }), { locale: 'fr-FR' }) // "dans 2 jours"
```

**Direction**: `diff = date1 - date2`. Positive → date1 is in the future relative to date2 → "in X". Negative → date1 is in the past → "X ago". Swap the arguments to flip it.

**Unit-selection cutoffs** (defaults below; override any subset per call via `{ cutoffs }`):

| abs(diff) | Unit | Default cutoff |
|-----------|------|-----------------|
| < 60 seconds | seconds | `seconds: 60` |
| < 60 minutes | minutes | `minutes: 60` |
| < 24 hours | hours | `hours: 24` |
| < 30 days | days | `days: 30` |
| < 365 days | months | `months: 365` (expressed in days — see below) |
| otherwise | years | — |

30 days approximates a month, 365 approximates a year — the same cutoffs date-fns uses, trimmed to the units `Intl.RelativeTimeFormat` supports across engines. The `months` cutoff is expressed in days rather than a month count because "a month" isn't a fixed number of days; that lets a caller say "treat anything under 90 days as months" without having to pick a definition of month first. Unspecified boundaries fall back to the defaults. Non-monotonic boundaries (e.g. `seconds: 300, minutes: 1`, which would make the minutes branch unreachable) and non-positive values throw descriptively rather than producing confusing downstream output.

```js
formatDistance(in5d, today)                                 // "in 5 days" (default cutoffs)
formatDistance(in14d, today, { cutoffs: { days: 10 } })      // "this month" (14d > 10d)
formatDistance(in200d, today, { cutoffs: { months: 100 } })  // "this year" (200d > 100d)
formatDistance(in30d, today)                                  // "next month" (right at the default 30d boundary)
```

Accepts `PlainDate`, `PlainDateTime`, or `ZonedDateTime`. A `PlainDate` is treated as midnight when diffed against a `PlainDateTime`. Throws on `PlainTime` (no anchor date to diff against) and on partial-date shapes (e.g. `{ year: 2026 }` with no month/day).

`formatDistanceToNow(date, options?)` is `formatDistance(date, now)`, reading the system clock at call time so you don't have to build the reference value yourself:

```js
import { formatDistanceToNow } from 'temporal-fmt';

formatDistanceToNow(threeHoursAgo)  // "3 hours ago"
formatDistanceToNow(tomorrow)       // "in 1 day" (numeric: 'auto' reads "tomorrow")
```

It reads full wall-clock time (hour through millisecond) off the system clock, not just the calendar date — `formatRelativeToNow` below only needs day resolution, but `formatDistance`'s unit selection is millisecond-resolution, so a date-only reference here would misclassify anything under 24 hours old. The reference is captured fresh on every call, never cached, so back-to-back calls reflect whatever "now" actually is at each call site.

### `formatRelative` / `formatRelativeToNow` — "yesterday", "last week"

`formatRelative(date1, date2, options?)` returns a calendar-relative label ("yesterday", "tomorrow", "last week") rather than `formatDistance`'s numeric-distance phrasing. `formatRelativeToNow(date, options?)` is `formatRelative(date, now)`.

## Natural-language date parsing

`parseRelative(input, referenceDate, options?)` resolves common relative-date phrases against a reference date, returning a `Temporal.PlainDate`. English by default; pass `{ locale: 'es' }` / `'fr'` / `'de'` (or any tag with that language subtag) to route to the matching grammar.

Supported phrase classes:

- **weekday references**: "next Tuesday", "last Friday", "this Monday"
- **relative day offsets**: "today", "tomorrow", "yesterday"
- **relative unit offsets**: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago"
- **month-day without year**: "March 5th", "Aug 4" (resolved to the next occurrence)

Each language grammar is its own module — phrase patterns and vocabulary aren't shared across languages, only the matching engine and resolution helpers are.

| Phrase class | en | es | fr | de |
|--------------|----|----|----|----|
| today | `today` | `hoy` | `aujourd'hui` | `heute` |
| tomorrow | `tomorrow` | `mañana` | `demain` | `morgen` |
| yesterday | `yesterday` | `ayer` | `hier` | `gestern` |
| next Tuesday | `next Tuesday` | `el próximo martes` / `martes próximo` | `mardi prochain` | `nächsten Dienstag` |
| last Tuesday | `last Tuesday` | `el martes pasado` | `mardi dernier` | `letzten Dienstag` |
| this Wednesday | `this Wednesday` | `este miércoles` | `ce mercredi` | `diesen Mittwoch` |
| in 3 days | `in 3 days` | `en 3 días` | `dans 3 jours` | `in 3 Tagen` |
| 2 weeks ago | `2 weeks ago` | `hace 2 semanas` | `il y a 2 semaines` | `vor 2 Wochen` |
| March 5 | `March 5th` | `5 de marzo` | `5 mars` | `5. März` |

Diacritics are stripped before matching (NFD normalization + combining-mark removal), so `"miercoles"` matches the same as `"miércoles"`, `"aout"` as `"août"`, `"naechsten"` as `"nächsten"`. German umlaut transliterations (`ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`) are expanded too, so `"5. Maerz"` resolves the same as `"5. März"`.

```js
import { parseRelative } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04'); // Tuesday
parseRelative('today', today).toString()             // '2026-08-04'
parseRelative('tomorrow', today).toString()           // '2026-08-05'
parseRelative('next Tuesday', today).toString()       // '2026-08-11' (7 days out, not today)
parseRelative('last Friday', today).toString()        // '2026-07-31'
parseRelative('in 3 days', today).toString()           // '2026-08-07'
parseRelative('2 weeks ago', today).toString()         // '2026-07-21'
parseRelative('March 5th', today).toString()           // '2027-03-05' (next occurrence)

parseRelative('mañana', today, { locale: 'es-ES' }).toString()           // '2026-08-05'
parseRelative('el próximo martes', today, { locale: 'es-ES' }).toString() // '2026-08-11'
parseRelative('demain', today, { locale: 'fr-FR' }).toString()           // '2026-08-05'
parseRelative('mardi prochain', today, { locale: 'fr-FR' }).toString()   // '2026-08-11'
parseRelative('morgen', today, { locale: 'de-DE' }).toString()           // '2026-08-05'
parseRelative('nächsten Dienstag', today, { locale: 'de-DE' }).toString() // '2026-08-11'
```

**Ambiguous-case choices** (documented, not inferred):

- **"next Tuesday" said on a Tuesday** = 7 days out, not today. "this Tuesday" handles the same-week case, so the two phrases stay distinct.
- **"last Tuesday" said on a Tuesday** = 7 days ago (symmetric with "next").
- **"March 5th" without a year** = next occurrence. Today's date returns today; a past date this year rolls to next year. The alternative — nearest in time, past or future — would make "March 5th" said on March 6 return yesterday, which is the wrong call for the typical "next birthday"/"next deadline" use.
- **"5 days" without "in" or "ago"** = throws, same strict-refusal contract as `parse()`. The equivalent bare phrase in any supported language (`"3 días"`, `"3 jours"`, `"3 Tage"`) throws with a localized message pointing at the disambiguated forms.

The "next X on X = 7 days out, not today" convention holds across all four supported languages by design, not by accident — if a future grammar's natural phrasing resolves differently, that's meant to be called out explicitly in that grammar's own documentation.

`parseRelative` throws a descriptive error for any phrase it doesn't recognize, naming the supported categories. Accepts `PlainDate`, `PlainDateTime`, or `ZonedDateTime` as the reference (needs `dayOfWeek` to compute weekday offsets); throws on `PlainTime`.

### Typo tolerance (`{ fuzzy: true }`)

Strict matching is the default for the same reason `parse()` throws on ambiguous input rather than guessing — a wrong guess that looks plausible is worse than a hard stop. But if you're taking free-text input from a person instead of a controlled phrase set, typos are routine, not exceptional. `{ fuzzy: true }` opts into correcting them:

```js
parseRelative('tommorow', today, { fuzzy: true }).toString()      // '2026-08-05'
parseRelative('next tuesady', today, { fuzzy: true }).toString()  // '2026-08-11'
parseRelative('tommorow', today);                                  // throws — fuzzy is opt-in
```

It works by tokenizing the input on whitespace and, for any word that isn't already an exact match against the English vocabulary (weekday names, month names, and marker words like "next"/"ago"/"days"), finding the closest vocabulary word within edit distance 2 and substituting it before re-running the exact matcher. Distance 2 covers the common cases — a dropped letter ("tommorow") is distance 1, a transposed pair ("tuesady") is distance 2 under plain Levenshtein — without opening the door to correcting a word into something only vaguely similar.

Numbers are never touched by fuzzy correction, on purpose: `"5 dyas"` fuzzy-corrects to `"5 days"` and then still throws the usual past-or-future ambiguity error, since "in"/"ago" disambiguation is a separate, stricter contract this option doesn't relax. Digit typos are also a much easier way to silently produce a wrong date than a weekday-name typo is, so they stay out of scope here.

Fuzzy mode is English-only for now. The other three grammars have enough positional and multi-word-marker variation — French's "il y a", Spanish's pre/post weekday-modifier forms — that one word-substitution corrector doesn't fit all of them without per-language tuning this doesn't attempt yet. Combining `{ fuzzy: true }` with a non-English `locale` throws a scope-limited error rather than silently skipping the correction pass, so a caller relying on it for, say, French input gets a clear signal instead of a confusing "doesn't recognize" error with no indication fuzzy matching never ran.

**Adding a language**: `registerRelativeGrammar(grammar)` registers a new language's phrase patterns without touching the built-in four. `listRegisteredGrammars()` lists what's currently registered.

## Date arithmetic, comparison, and rounding

### Arithmetic

```js
import { add, subtract, difference, addDays, differenceInHours } from 'temporal-fmt';

add(date, 3, 'days');
subtract(date, 1, 'months');
difference(a, b, 'hours');
```

- `add(value, amount, unit)` / `subtract(value, amount, unit)` — `unit` is one of `'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds'`.
- Per-unit wrappers for both directions: `addYears`, `addMonths`, `addWeeks`, `addDays`, `addHours`, `addMinutes`, `addSeconds`, `addMilliseconds`, and the matching `subtract*` set.
- `difference(a, b, unit)` — integer count of unit boundaries crossed between two values.
- Per-unit wrappers: `differenceInYears`, `differenceInMonths`, `differenceInWeeks`, `differenceInDays`, `differenceInHours`, `differenceInMinutes`, `differenceInSeconds`, `differenceInMilliseconds`.

### Comparison

```js
import { compare, isBefore, isSameDay, isWeekend } from 'temporal-fmt';

compare(a, b);       // -1 / 0 / 1
isBefore(a, b);
isSameDay(a, b);
isWeekend(date);
```

- `compare(a, b)` → `-1`/`0`/`1`.
- `isEqual`, `isBefore`, `isAfter`.
- `min(values)`, `max(values)`, `clamp(value, lo, hi)`, `isBetween(value, lo, hi)`.
- Semantic helpers: `isToday`, `isTomorrow`, `isYesterday`, `isSameDay`, `isSameWeek`, `isSameMonth`, `isSameQuarter`, `isSameYear`, `isWeekend`, `isWeekday`.

### Rounding

- `round(value, options)` — round to a unit with a rounding mode.
- `floor(value, unit, increment?)`, `ceil(value, unit, increment?)`, `truncate(value, unit, increment?)`.
- `roundDuration(duration, options)` — the duration equivalent; throws for calendar-bound units (months, years) without a `relativeTo` reference, since those units aren't a fixed length on their own.

### Calendar utilities

```js
import { daysInMonth, startOf, getQuarter } from 'temporal-fmt';

daysInMonth(date);
startOf(date, 'month');
getQuarter(date);
```

- `daysInMonth(value)`, `daysInYear(value)`, `monthsInYear(value)`.
- `isLeapYear(value)`, `isLeapMonth(value)` (Gregorian: `isLeapMonth` always returns `false`).
- `dayOfYear(value)`, `weekOfYear(value)`, `weekYear(value)`.
- `getQuarter(value, options?)`, `getMonth(value)`, `getWeekday(value)`.
- `startOf(value, unit)` / `endOf(value, unit)` — `unit` is `'day' | 'month' | 'year' | 'hour' | 'minute' | 'second'`. Returns a field bag with finer fields zeroed (`startOf`) or extended to their max (`endOf`).

`getQuarter` defaults to calendar quarters (Jan–Mar = Q1, same as the `Q`/`QQQ` format tokens), but a fiscal year rarely starts in January. Pass `{ startMonth }` to shift which month counts as fiscal month 1:

```js
import { getQuarter } from 'temporal-fmt';

getQuarter({ month: 8 });                     // 3 — calendar quarter (default)
getQuarter({ month: 8 }, { startMonth: 7 });   // 1 — fiscal year starting July (UK/India-style)
getQuarter({ month: 8 }, { startMonth: 10 });  // 4 — fiscal year starting October (Apple's FY)
```

`startMonth` must be an integer 1–12; anything else throws rather than silently defaulting. This is a separate function from the `Q`/`QQQ` tokens, not a shared implementation — those tokens compute quarter inline from month and have no fiscal-offset option, so a fiscal quarter number isn't currently something `format()`/`parse()` can render or round-trip through a token string. Use `getQuarter` directly for fiscal reporting and reach for the tokens only when you actually want calendar quarters in formatted output.

**Gregorian-only, documented limitation**: `daysInMonth`, `daysInYear`, `isLeapYear`, `monthsInYear` (always 12), `isLeapMonth` (always `false`), `dayOfYear`, `weekOfYear`, and `weekYear` all use Gregorian rules and will give wrong answers on non-Gregorian calendars (Hebrew, Islamic, etc.). For those, use the `Temporal` value's own calendar-aware properties directly instead:

```js
const pd = Temporal.PlainDate.from('5784-05-10[u-ca=hebrew]');
pd.daysInMonth;  // 30 (Sivan)
pd.monthsInYear; // 13 (leap year)
```

Locale-aware *formatting* tokens (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`) don't have this limitation — they go through `Intl.DateTimeFormat`, which does respect `calendarId`:

```js
format(Temporal.PlainDate.from('5784-05-10[u-ca=hebrew]'), 'MMMM d, yyyy'); // "Sivan 10, 5784"
```

## Intervals

```js
import { interval, contains, overlaps, formatRange } from 'temporal-fmt';

const iv = interval(start, end, 'closed');
contains(iv, someDate);
overlaps(ivA, ivB);
formatRange(iv, 'MMM d');
```

- `interval(start, end, bounds?)` — `bounds` is one of `'closed'` (default) | `'open'` | `'half-open-start'` | `'half-open-end'`.
- `contains(iv, value)`, `overlaps(a, b)`, `intersects(a, b)`.
- `isBefore(a, b)` / `isAfter(a, b)` — interval-to-interval ordering (imported as `intervalIsBefore`/`intervalIsAfter` when pulled from the main entry point, to avoid colliding with the date `isBefore`/`isAfter` above).
- `intersection(a, b)`, `union(a, b)` — return `null` when the intervals don't overlap enough to combine.
- `difference(a, b)` / `subtract(a, b)` — imported as `intervalDifference`/`intervalSubtract` from the main entry point, same collision-avoidance reasoning.
- `mergeIntervals(intervals)` — combines a list of overlapping intervals into their union set.
- `splitInterval(iv, n)` — splits one interval into `n` equal sub-intervals.
- `formatRange(iv, formatStr, options?)` / `formatRangeToParts(iv, formatStr, options?)` — format an interval as a range string, using `Intl.DateTimeFormat.formatRange` where available.

## Recurrence

```js
import { recurrence, take, between } from 'temporal-fmt';

const rule = { freq: 'weekly', interval: 1, count: 10 };
const iter = recurrence(startDate, rule);
take(iter, 5);                              // first 5 occurrences
between(startDate, rule, rangeStart, rangeEnd); // occurrences within a window
```

- `recurrence(start, rule)` — returns an iterator with `next()`/`previous()`. `rule.freq` is one of `'secondly' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'`; the rule shape also supports `interval`, `count`, `until`, weekday/month-day/positional constraints, and exclusions/inclusions, mirroring RFC 5545's RRULE model.
- `take(iter, n)` — collects the next `n` occurrences.
- `skip(iter, n)` — advances past `n` occurrences.
- `between(start, rule, rangeStart, rangeEnd)` — all occurrences within a range, without manually iterating.
- `parseRRule(input)` / `formatRRule(rule)` — parse/format the RFC 5545 RRULE text format, for interop with calendar systems that speak it.

## Business calendars and holidays

Two related but separate pieces: a business-day calendar (weekends, working hours, half days) and a holiday calendar (which specific dates are excluded). Compose them by handing a holiday calendar's dates to a business calendar's options.

```js
import { createBusinessCalendar, isBusinessDay, addBusinessDays } from 'temporal-fmt';

const cal = createBusinessCalendar({ /* weekend days, holidays, working hours, half days */ });
isBusinessDay(cal, someDate);
addBusinessDays(cal, someDate, 5);
```

- `createBusinessCalendar(options?)` — configure weekend days, holidays, working hours, and half days.
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

- `createHolidayCalendar(specs)` — each spec is either a fixed `{ month, day }` or a `compute(year) => { month, day }` function for floating holidays ("last Monday of May"-style rules).
- The returned calendar has `.isHoliday(value)` and `.holidaysBetween(start, end)` as methods on the object itself — they aren't standalone exports.
- `nextHoliday(cal, value)` / `previousHoliday(cal, value)` — standalone helpers that call `.isHoliday()` under the hood, capped at a 5-year lookahead/lookbehind.
- `holidaysBetween(cal, start, end)` — standalone wrapper delegating to `cal.holidaysBetween(start, end)`, for callers who'd rather not reach into the calendar object directly.

Country-specific holiday datasets are intentionally out of scope for this package — `createHolidayCalendar` is the abstraction; populating it with, say, US federal holidays is left to the caller or a separate package.

## Time zones

```js
import { resolveZoned, isDST, getTransitions } from 'temporal-fmt';

resolveZoned({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York', { disambiguation: 'compatible' });
isDST(zonedDateTime);
getTransitions(rangeStart, rangeEnd);
```

- `resolveZoned(fields, timeZone, options?)` — constructs a `ZonedDateTime` with an explicit disambiguation mode for gaps/overlaps: `'compatible' | 'earlier' | 'later' | 'reject'`.
- `getTimeZone(value)`, `getOffset(value)`, `getOffsetNanoseconds(value)`.
- `isDST(value)` — a heuristic that compares the value's current offset against its January offset. Correct for the common (Northern Hemisphere) case; Southern Hemisphere zones have DST in January, so this can read backwards there — there's no reliable hemisphere lookup built in.
- `getNextTransition(value)` / `getPreviousTransition(value)` — the nearest DST (or other offset) transition in either direction.
- `getTransitions(start, end)` — every transition within a range.
- `possibleInstantsFor(fields, timeZone)` — the list of possible instants for a given wall-clock time in a zone: empty for a DST gap (the time never happened), two for an overlap (the time happened twice), one otherwise.

## Serialization

```js
import { parseISO, formatISO, parseRFC3339, fromUnixMilliseconds } from 'temporal-fmt';

parseISO('2026-08-04T15:45:30Z');
formatISO(value);
fromUnixMilliseconds(1754321130000);
```

- `parseISO(input)` / `formatISO(value)` — ISO 8601.
- `parseRFC3339(input)` / `formatRFC3339(value)` — RFC 3339 (ISO 8601's stricter internet-facing cousin).
- `parseRFC2822(input)` / `formatRFC2822(value)` — RFC 2822 (email/HTTP-header-style dates).
- `parseHTTPDate(input)` / `formatHTTPDate(value)` — the HTTP-date format used in `Date`/`Last-Modified` headers.
- `parseSQL(input)` / `formatSQL(value)` — SQL `DATETIME`/`TIMESTAMP` style.
- Epoch conversions, both directions, at second/millisecond/microsecond/nanosecond resolution: `fromUnixSeconds`, `fromUnixMilliseconds`, `fromUnixMicroseconds`, `fromUnixNanoseconds`, `toUnixSeconds`, `toUnixMilliseconds`, `toUnixMicroseconds`, `toUnixNanoseconds`.

## Introspection and the analyzer

Every token carries structured metadata, and there's a small analysis layer over format strings themselves.

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

- `analyzeFormat(formatStr)` — the full structured report shown above.
- `explainFormat(formatStr)` — a human-readable rendering of the same analysis.
- `tokenInfo(name)` — metadata for one token, or `undefined` if it's not recognized.
- `listTokens()` — every recognized token, paired with its metadata.
- `isValidFormat(formatStr)` — `true` iff the tokenizer accepts the string.
- `validateFormat(formatStr)` — throws on an invalid format string; otherwise returns the same analysis `analyzeFormat` does.
- `tokenizeFormat(formatStr)` — the raw literal/token piece list, if you want to walk it yourself.
- `fieldForToken(token)` — which `TemporalLike` field a given token reads.

`TOKEN_METADATA` (the full table `tokenInfo`/`listTokens` read from) and `ALL_TOKEN_NAMES` are also exported directly, for callers — [`eslint-plugin-temporal-fmt`](#related-tools), specifically — that want the raw table rather than going through the wrapper functions. `FORMAT_ONLY_TOKENS` lists the tokens `parse()` rejects (`do`, `ww`, `RRRR`, `D`/`DD`/`DDD`, `LLLL`/`LLL`, `cccc`/`ccc`, `GGGG`/`G`, `zzzz`/`z`).

**Round-trip safety, by family:**

| Family | Tokens | Round-trip safe | Why |
|--------|--------|------------------|-----|
| Year | `yyyy` | yes | Preserves sign for BCE. |
| Year | `yy` | no | Century is lost — `parse` re-derives it via the `00–68`/`69–99` rule, which isn't guaranteed to match the original century. |
| Month | `MMMM`, `MMM`, `MM`, `M` | yes | Numeric and name forms both round-trip; only the name forms are locale-sensitive. |
| Day | `dd`, `d` | yes | |
| Day | `do` | no | Format-only — the ordinal suffix isn't parseable back out. |
| Weekday | `EEEE`, `EEE` | yes | Cross-checked against the parsed date, so a mismatch throws rather than round-tripping silently wrong. |
| ISO week | `ww`, `RRRR` | n/a | Format-only — a week number alone can't reconstruct a specific date. |

## Typed errors

Two shapes of error come out of this library: plain `Error` objects with a descriptive message (most throw sites in `format()`/`parse()`), and `TemporalFmtError` subclasses (the typed surface `safeParse()`/`tryParse()` classify into).

All subclasses inherit structured fields from `TemporalFmtError`: `code`, `input`, `format`, `token`, `position`, `expected`, `actual`, `reason`.

| Class | Code | Fires when |
|-------|------|------------|
| `FormatSyntaxError` | `FORMAT_SYNTAX_ERROR` | Unterminated quote, format string over the length cap, other syntax issues. |
| `UnknownTokenError` | `UNKNOWN_TOKEN` | An unrecognized letter run was encountered. |
| `ParseMismatchError` | `PARSE_MISMATCH` | Input doesn't match the format's shape — generic catch-all. |
| `InvalidDateError` | `INVALID_DATE` | Structurally valid but nonexistent date (Feb 30), or a weekday/quarter that contradicts the date. |
| `InvalidTimeError` | `INVALID_TIME` | Time out of range (hour 25, etc). |
| `InvalidOffsetError` | `INVALID_OFFSET` | Offset malformed or outside the IANA range (`-12:00` to `+14:00`). |
| `InvalidTimeZoneError` | `INVALID_TIME_ZONE` | Not a recognized IANA name or fixed offset. |
| `InvalidCalendarError` | `INVALID_CALENDAR` | Unsupported calendar. |
| `AmbiguousInputError` | `AMBIGUOUS_INPUT` | Input has more than one valid reading (e.g. `Md` against `"121"`). |
| `InvalidLocaleError` | `INVALID_LOCALE` | Not a valid BCP-47 tag, or an unsupported numbering system. |
| `InvalidDurationError` | `INVALID_DURATION` | Duration string doesn't match the ISO 8601 grammar, or a field is non-finite. |

### Reading the common ones

**"no valid pattern matches the format string and input shape"** — input doesn't match the format string at all. Usually a missing separator, wrong digit count for a fixed-width token, or a `zzz` capture that isn't a real IANA zone id.

**"token X requires Y, which this Temporal object doesn't have"** — a token reading a field the value doesn't carry. Classic case: `format(plainDate, 'HH:mm')` — `PlainDate` has no hour field. Use `PlainDateTime`, or a date-only format string.

**"format string mixes 'yyyy' and 'yy' year representations"** — don't combine the two year tokens in one format string.

**"format string has an incomplete date — year, month, and day tokens must all be present together"** — a partial date (year-only) can't become a Temporal value. Add the missing tokens, or use a different format.

**"X is ambiguous — N different ways to read tokens Y are all individually valid"** — adjacent unpadded numeric tokens with no separator (`Md` against `"121"`) split more than one way. Add a separator (`M-d`), zero-pad (`MM-dd`), or opt into `{ lenient: true }`.

**"offset hours X in 'Y' out of range (max 14 — Kiritimati, Line Islands is +14:00)"** — the offset's hour component is past the IANA-supported range.

**"X has no such wall-clock time on this date — it falls in a DST gap"** — the input describes a wall-clock time that doesn't exist (a spring-forward gap). Pick a different time, or pass `{ disambiguation: 'compatible' }` and let `resolveZoned` choose an instant.

**"has both a 'zzz' zone (X) and an offset token (Y), but the zone's actual offset at this date/time is Z, not Y"** — the format asks for a zone name and an explicit offset, and they disagree at the parsed instant. Fix the input so they agree.

## Type guards

```js
import { isPlainDate, assertZonedDateTime } from 'temporal-fmt';

if (isPlainDate(value)) { /* narrowed */ }
assertZonedDateTime(value); // throws descriptively if it isn't one
```

- `isTemporal(value)`, `isInstant(value)`, `isPlainDate(value)`, `isPlainTime(value)`, `isPlainDateTime(value)`, `isZonedDateTime(value)`, `isPlainYearMonth(value)`, `isPlainMonthDay(value)`, `isDuration(value)`.
- `assertTemporal`, `assertInstant`, `assertPlainDate`, `assertPlainTime`, `assertPlainDateTime`, `assertZonedDateTime`, `assertPlainYearMonth`, `assertPlainMonthDay`, `assertDuration` — same checks, throwing descriptively on mismatch instead of returning a boolean. Useful for narrowing the `unknown` that `parse()` hands back.

## Config

`createConfig(overrides?)` returns a frozen config object bundling `locale`, `calendar`, `timeZone`, `numberingSystem`, week rules, rounding, disambiguation, overflow, `parseLenient`, and `durationShowZeroValues` defaults — a way to set defaults once instead of passing the same options to every call. `mergeWithConfig(config, perCall)` folds a config's defaults into a specific call's options, with the per-call options taking precedence.

## Numbering systems

The [Locales](#locales) section above notes that numeric tokens always render Western digits by default — that's still the default, but it's opt-out rather than fixed, via `{ numberingSystem }` on `format()` and `{ parseNumberingSystem }` on `parse()`:

```js
import { format, parse } from 'temporal-fmt';

format(date, 'yyyy-MM-dd', { numberingSystem: 'arab' });                       // "٢٠٢٦-٠٨-٠٤"
parse('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' }).toString(); // '2026-08-04'
```

The two option names are deliberately different (`numberingSystem` vs. `parseNumberingSystem`), not a naming inconsistency — the two directions aren't always symmetric. You might want Arabic-Indic digits in your UI output without expecting Arabic-Indic digits back on input, or the reverse, so a caller mixing `format()` and `parse()` options in one config object can set each independently. `formatToParts()` applies numbering per-part rather than once at the end, so a caller styling individual token parts (one `<span>` per token, say) still gets correctly-transliterated digits in each part instead of plain ASCII. An unsupported system name throws immediately rather than silently falling back to `'latn'`.

If you'd rather convert digits yourself instead of going through `format()`/`parse()`'s options — say, transliterating a string that came from somewhere else entirely — the underlying conversion is available directly:

```js
import { convertDigits, convertDigitsToAscii } from 'temporal-fmt';

convertDigits('2026', 'arab');       // "٢٠٢٦"
convertDigitsToAscii('٢٠٢٦', 'arab'); // "2026"
```

- `convertDigits(s, system)` — ASCII digits to a locale's native digits.
- `convertDigitsToAscii(s, system)` — the inverse.
- `applyNumbering(s, options)` / `applyParseNumbering(s, options)` — the same helpers `format()`/`parse()` call internally for `{ numberingSystem }` / `{ parseNumberingSystem }`, exposed directly for anyone building their own formatting layer on top rather than going through `format()`/`parse()`.
- `SUPPORTED_NUMBERING_SYSTEMS` — the set of supported system names (`'latn' | 'arab' | 'deva' | 'beng' | 'guru' | 'gujr' | 'orya' | 'tamldec' | 'telu' | 'knda' | 'mlym' | 'fullwide' | 'hanidec'`).

## Extending with custom tokens

`createFormatter(options?)` builds a formatter object with its own custom token(s), which can override a built-in token of the same name if you need different behavior for it. Useful for house-style formats a plain token string can't express, without forking the library.

## IDE tooling data

A handful of functions exist specifically to feed editor tooling — autocomplete, hover docs, inline diagnostics — rather than for use in application code directly:

- `getAutocompleteData()` — token autocomplete entries, grouped by family.
- `getHoverDocs()` — per-token hover documentation.
- `getInlineDiagnostics(formatStr)` — diagnostics with position and suggested fixes for a given format string.
- `previewFormat(formatStr, sample?)` — a live preview string for a format, given an optional sample value.
- `getDocUrl(tokenName)` — a documentation URL for a token, currently pointing at this README's [Tokens](#tokens) section.
- `DAYJS_TO_TEMPORAL_FMT` / `DATE_FNS_TO_TEMPORAL_FMT` — token conversion hint tables, the same ones the CLI's `translate` subcommand and any migration tooling draw from.

## CLI

The CLI ships in this package (`scripts/cli.mjs`) and reads/writes stdin/stdout. Run it via `npm run cli` inside a checkout of this repo, or `node scripts/cli.mjs` directly. Called with a subcommand it runs once and exits, same as any Unix tool — fine for scripts and CI:

On Node 26+ the CLI uses native `Temporal` and needs nothing extra. Below that, it looks for a globally-installed [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) and exits with an install hint if it can't find one — `temporal-fmt` itself ships with zero dependencies, so this one's on you: `npm install temporal-polyfill`.

```sh
temporal-fmt format "2026-08-04T15:45:30" "yyyy-MM-dd HH:mm:ss"
temporal-fmt parse "yyyy-MM-dd" "2026-08-04"
temporal-fmt inspect "MMMM d, yyyy 'at' h:mm a"
temporal-fmt validate "yyyy-MM-dd HH:mm:ss"
temporal-fmt translate dayjs "YYYY-MM-DD HH:mm:ss"
```

| Subcommand | What it does |
|------------|---------------|
| `format <iso-input> <format-string> [--locale=LOCALE]` | Formats an ISO date/time input against the given format string. |
| `parse <format-string> <input> [--locale=LOCALE] [--lenient]` | Parses input against a format string, prints the resulting ISO value. |
| `inspect <format-string>` | Prints `explainFormat`'s report on a format string. |
| `validate <format-string>` | Prints `valid` or `invalid`. |
| `translate <source-lib> <format-string>` | Translates a Day.js or date-fns format string to `temporal-fmt` tokens. |

`translate` is implemented in-repo (`src/codemod.ts`) against the same token tables the IDE tooling data uses — no external package, no runtime dependency beyond this library itself. It throws on tokens with no `temporal-fmt` equivalent (`Do`/`P`/etc. — see the [migration table](#token-mapping)) rather than guessing.

### Interactive mode

Run `temporal-fmt` with no arguments to start a REPL:

```
$ temporal-fmt
temporal-fmt interactive mode. Type a subcommand, "help", or "exit".
temporal-fmt> format
ISO input: 2026-08-04T15:45:30
Format string: yyyy-MM-dd HH:mm:ss
2026-08-04 15:45:30
temporal-fmt> exit
```

Type a subcommand with all its arguments inline (`validate yyyy-MM-dd`) or just the subcommand name — the REPL prompts for whatever's missing, one field at a time. Errors print and the session keeps going; `exit`, `quit`, or Ctrl+D ends it. This is the same subcommand logic as one-shot mode, just wrapped in a loop that asks instead of exiting on a missing argument — one-shot stays there for scripting, and doesn't touch the REPL machinery.

## Mods

`registerLocale`, `createHolidayCalendar`, and `createFormatter` are already how you extend this library without forking it — [Locales](#locales), [Business calendars and holidays](#business-calendars-and-holidays), and [Extending with custom tokens](#extending-with-custom-tokens) all cover them. Mods are just a delivery mechanism on top of those same functions: drop a file in a `mods/` folder, the CLI picks it up on startup and runs it. No publishing to npm, no build step in this repo, no manifest to register anywhere. If you've used a Minecraft mods folder, it's the same idea — a file the host looks for and loads, not a package the host depends on.

This exists so bugfixes and locale corrections don't have to wait on a PR merging and a release going out. If en-GB's holiday list is wrong for your team, or a locale you need isn't covered yet, write a mod and drop it in. Whether it ever gets upstreamed into this repo is a separate question from whether it works today.

### Writing a mod

A mod is a `.mjs` file that default-exports an object with a `name` and a `register(ctx, config)` function. `ctx` is the same registration API `index.ts` exports for everyone else — `registerLocale`, `registerLocaleVocab`, `registerRelativeGrammar`, `createFormatter`, `createHolidayCalendar` — nothing beyond that. A mod that needs more than those five functions expose is asking for something this library doesn't support yet, not something to route around by reaching into internals that could shift under it without warning. `config` is `{}` for a loose `.mjs` mod — there's no manifest to declare settings in, so there's nothing to resolve; see [Mod settings and `config/`](#mod-settings-and-config) for mods that need user-adjustable settings, which means packaging as `.tfmod`.

```js
// mods/en-gb-bank-holidays.mjs
export default {
  name: 'en-gb-bank-holidays',
  version: '1.0.0',
  register(ctx) {
    ctx.createHolidayCalendar([
      { month: 1, day: 1, name: "New Year's Day" },
      { month: 12, day: 25, name: 'Christmas Day' },
      { month: 12, day: 26, name: 'Boxing Day' },
    ]);
  },
};
```

Put that in `mods/` at your project root (the folder the CLI is run from, not inside this package's own checkout) and run any CLI command — the loader reports what it found on stderr:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.mjs)
valid
```

`version` is optional and only shows up in that report — it's for your own tracking, not something the loader checks. That's a different field from `temporalFmtVersion`, which *is* checked against the installed `temporal-fmt` version, but only exists on `.tfmod` manifests (see [Pinning a mod to a `temporal-fmt` version](#pinning-a-mod-to-a-temporal-fmt-version)) — a loose `.mjs` mod has no manifest to declare it in.

### Packaging a mod as `.tfmod`

A loose `.mjs` file covers the common case, but it's one file — no bundled data, and the loader has to `import()` it just to find out its `name` before deciding load order. For anything bigger than that, package the mod as a `.tfmod` archive instead: a gzipped tar (same format as `.tgz`, renamed for identity) containing a manifest the loader can read without running any code, plus the mod's actual implementation:

```
en-gb-bank-holidays.tfmod
├── mod.json      — name, version, main, requires, priority, temporalFmtVersion, config
├── main.mjs      — the mod's entry point (same shape as a loose .mjs mod's default export, minus `name`/`version`/`requires`/`priority` — mod.json owns those)
└── data/         — optional: JSON files, locale tables, anything main.mjs wants to read at register() time
```

```json
// mod.json
{
  "name": "en-gb-bank-holidays",
  "version": "1.0.0",
  "main": "main.mjs",
  "requires": ["some-other-mod"],
  "priority": 0,
  "temporalFmtVersion": "^0.9.0"
}
```

```js
// main.mjs
export default {
  register(ctx) {
    ctx.createHolidayCalendar([
      { month: 1, day: 1, name: "New Year's Day" },
      { month: 12, day: 25, name: 'Christmas Day' },
    ]);
  },
};
```

Build the archive with plain `tar` — no special tooling:

```sh
tar -czf en-gb-bank-holidays.tfmod mod.json main.mjs data/
```

Drop that in `mods/` alongside any loose `.mjs` mods you have; the loader treats both formats as one pool for load-order and conflict purposes. The report shows `mod.json`'s `name`, not anything from `main.mjs` itself:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
valid
```

Why bother with an archive format at all instead of just supporting multi-file `.mjs` mods directly: `mod.json` is metadata the loader can read with zero code execution, which is what makes cross-mod dependency resolution work honestly — with a loose `.mjs` mod, the loader has no choice but to `import()` the file to learn its `name`/`requires`, before it even knows whether that mod should run. A `.tfmod`'s manifest is checked, and the whole dependency graph is resolved, before `main.mjs` is ever imported. At the current few-mods-loaded-once-at-CLI-startup scale that distinction mostly doesn't matter — but it's the honest reason the format exists rather than "loose files but with a folder," and it's what a "list what's installed without running any of it" feature would build on if that ever comes up.

Failure modes are per-archive, same as loose mods — one bad `.tfmod` doesn't block anything else in `mods/`:

- `mod.json` missing or malformed (no `name`, no `main`, or `requires`/`priority`/`temporalFmtVersion`/`config` the wrong type) — reported with what was expected, `main.mjs` is never imported.
- `mod.json` names a `main` file that isn't actually in the archive — reported with the missing filename.
- The archive isn't a valid gzip/tar (corrupted, wrong format, a `.tfmod` extension slapped on some other file) — reported with the extraction error.
- `main.mjs`'s default export doesn't have a `register` function — reported, same as a loose mod's malformed export.
- `temporalFmtVersion` doesn't match the installed `temporal-fmt` version — reported with the range and the actual version, `main.mjs` is never imported. See [Pinning a mod to a `temporal-fmt` version](#pinning-a-mod-to-a-temporal-fmt-version).

Extraction happens to a temporary directory that's cleaned up after the load pass — nothing from a `.tfmod` sticks around on disk after the CLI command finishes. Extraction shells out to the system `tar` binary rather than adding a tar/gzip-parsing dependency, consistent with this package staying dependency-free (see [Providing `Temporal`](#providing-temporal) for the same call made about the polyfill) — if `tar` isn't on the system `PATH`, the archive fails to load with that reason rather than crashing the CLI.

### Pinning a mod to a `temporal-fmt` version

`mod.json` can declare `temporalFmtVersion`, either an exact version (`"0.9.32"`) or a caret range (`"^0.9.0"`, meaning ">=0.9.0, <0.10.0" — same meaning npm gives `^` in `package.json`). If the installed `temporal-fmt` doesn't satisfy it, the mod fails to load with the range and the actual version, before `main.mjs` is ever imported:

```
failed holidays.tfmod: "en-gb-bank-holidays" needs temporal-fmt ^2.0.0 (>=2.0.0 <3.0.0), host is 0.9.32
```

This exists because nothing else catches the alternative: a mod built against one version's override surface (which functions are zero-fanout and therefore overridable — see [Overriding functions](#overriding-functions)) has no way to know if a future release moved a function it depends on, and would otherwise fail with whatever confusing error `register()` happens to throw, or — worse — silently do nothing if the call it expected to matter just no longer has any effect. A declared range turns that into one clear, pre-`register()` failure instead.

Omitting `temporalFmtVersion` is allowed — the mod loads against whatever version is installed, same as before this field existed. Loose `.mjs` mods have no manifest to put this in at all, so they can't declare a version requirement; that's one real reason to prefer `.tfmod` for anything you plan to distribute rather than just run yourself.

There's no dependency-resolution logic here, unlike `requires`/`priority` — this is a single boolean check (does the host version satisfy the range), not something that affects load order.

### Mod settings and `config/`

A mod can declare user-adjustable settings in `mod.json`'s `config` array, and `register()` receives the resolved values as its second argument:

```json
// mod.json
{
  "name": "en-gb-bank-holidays",
  "main": "main.mjs",
  "config": [
    { "key": "includeScottish", "type": "boolean", "default": false },
    { "key": "observedRule", "type": "enum", "default": "nearest-weekday", "choices": ["nearest-weekday", "strict-date"] },
    { "key": "yearsAhead", "type": "number", "default": 5, "min": 1, "max": 20 }
  ]
}
```

```js
// main.mjs
export default {
  register(ctx, config) {
    const years = config.yearsAhead; // 5, unless overridden below
    ctx.createHolidayCalendar(buildHolidays({ scottish: config.includeScottish, years }));
  },
};
```

Four setting types are supported: `string`, `number` (with optional `min`/`max`), `boolean`, and `enum` (a string constrained to `choices`). Every entry needs a `key` and a `default` — the default is what `register()` gets if the user hasn't overridden that setting, which also means a mod with no `config/<name>.json` file on disk at all still runs normally, just entirely on defaults.

To override a setting, drop a JSON file at `config/<mod-name>.json` — **next to `mods/`, not inside it** (so re-downloading or updating the `.tfmod` never touches a user's settings, the same reason Forge keeps `config/` and `mods/` as siblings rather than bundling settings into the jar):

```
your-project/
├── mods/
│   └── en-gb-bank-holidays.tfmod
└── config/
    └── en-gb-bank-holidays.json     — { "includeScottish": true, "yearsAhead": 10 }
```

Only keys the schema actually declares can be set — anything else is a mistake worth surfacing, not a silent no-op:

```
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: config key "yearsAhead" must be <= 20, got 50 (using default)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: unknown config key "includeWelsh" (not declared in this mod's schema)
```

An invalid value for a declared key falls back to that key's default rather than failing the whole mod — one typo'd number in a config file shouldn't take down a working mod, but it's reported so the mistake doesn't go unnoticed either. This is deliberately not JSON Schema: no nesting, no `$ref`, no conditional rules — just the handful of primitive shapes an actual setting realistically is, kept dependency-free the same way `temporalFmtVersion` checking and `.tfmod` extraction are.

Loose `.mjs` mods have no manifest to declare a schema in, so `register()`'s second argument is always `{}` for them — same as a `.tfmod` mod that didn't declare a `config` field at all.

### Load order, dependencies, and conflicts

By default mods load in filename order — alphabetical, deterministic, but not something you'd want to rely on once two mods actually need to run in a specific order relative to each other. Two fields on the mod object control that directly:

- `requires: string[]` — other mods' `name` fields that must load (and finish `register()`) before this one. The loader resolves this as a dependency graph, not just "sort requires first" — if A requires B and B requires nothing, B always loads first regardless of filename.
- `priority: number` — tiebreak for mods with no dependency relationship to each other. Higher loads later. Defaults to `0`.

```js
export default {
  name: 'extended-en-gb-holidays',
  requires: ['en-gb-bank-holidays'],
  priority: 10,
  register(ctx) {
    // runs after en-gb-bank-holidays, and after anything else at a lower priority
  },
};
```

Two failure modes come out of this, both reported per-mod without blocking the rest:

- **Missing dependency** — `requires` names a mod that isn't in `mods/`. That mod fails to load; whatever it would've registered doesn't happen, and other mods that don't depend on it load normally.
- **Circular dependency** — A requires B requires A (or a longer cycle). Every mod in the cycle fails, each reported with what it's still waiting on.

Registration itself is still last-write-wins, same as calling `registerLocale` twice for the same tag outside of mods — that's existing, intentional behavior (see [Locales](#locales)), not something mods change. What mods add is *visibility* into it: if two mods register the same locale tag, the same relative-time-grammar language, or the same custom token name, the load report calls it out as a conflict and says which one won:

```
temporal-fmt mods:
  loaded holiday-pack-a (conflict-1.mjs)
  loaded holiday-pack-b (conflict-2.mjs)
  conflict on locale "cv-CV": holiday-pack-a, holiday-pack-b — "holiday-pack-b" wins (loaded last)
```

This is informational, not a failure — both mods still loaded, the last one to register just took the key, and now you know it happened instead of silently getting whichever mod's filename sorted last. If that's not what you want, `priority` is the knob: raise the one that should win, or add a `requires` so the loser explicitly runs first and the winner's intent is unambiguous in the mod itself, not just in a startup log line.

Mod names have to be unique across `mods/` — two files claiming the same `name` is ambiguous the moment either one shows up in another mod's `requires`, so the second one to load fails with which file already claimed that name.

### Overriding functions

The five registration functions above are additive — they add a locale, a holiday set, a token, alongside whatever's already there. `ctx.overrideFormat` and `ctx.overrideParse` work differently: they let a mod replace the actual `format()`/`parse()` implementation everywhere in the library, which is what makes a real bugfix or performance mod possible rather than just new data being registered alongside an unfixed bug.

```js
export default {
  name: 'fast-format',
  register(ctx) {
    ctx.overrideFormat((original, value, formatStr, options) => {
      // Handle the one hot-path format string yourself; fall back to the
      // real implementation for everything else.
      if (formatStr === 'yyyy-MM-dd') {
        return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
      }
      return original(value, formatStr, options);
    });
  },
};
```

`impl` always receives the real built-in as its first argument (`original`), regardless of what else is loaded — call it to keep existing behavior for cases you're not trying to change, or ignore it to replace the behavior outright. The override applies consistently everywhere in the library, not just to whoever imports the function from the package root — `formatRange()`'s internal use of `format()`, for instance, sees it too. Remove the mod and restart, and it's back to the unmodified built-in; nothing about this touches the source file on disk.

**Only one mod may hold each override point.** A second override call for the same function — from any mod, even one that `requires` the first — fails immediately with which mod already owns it:

```
temporal-fmt mods:
  loaded override-1 (a-override1.mjs)
  failed b-override2.mjs: temporal-fmt: "format" is already overridden by mod "override-1" — mod "override-2" can't also override it. [...]
```

This is a hard failure, not last-write-wins like the registration functions — two mods silently fighting over the same function's behavior is a correctness bug in whatever depends on this library, not a cosmetic surprise. There's no mechanism for two separate mod files to layer through the same override point in sequence; if two mods both need to change a function's behavior, one has to incorporate the other's fix directly rather than composing through the override twice.

**Which functions are overridable.** `format`, `formatToParts`, and `parse` always were. Beyond those, any function in this library that nothing *else* in the library calls internally is also overridable — if a function has zero internal call sites, there's no risk of some other module holding a stale direct reference that a mod's fix would silently fail to reach, so it gets the same `overrideXxx()` treatment. As of this version, that's:

`compileFormat`, `compileParser`, `parseRelative`, `explainFormat`, `tokenizeFormat`, `listTokens`, `tokenInfo`, `isValidFormat`, `validateFormat`, `fieldForToken`, `monthsInYear`, `isLeapYear`, `isLeapMonth`, `weekOfYear`, `weekYear`, `getMonth`, `getWeekday`, `isEqual`, `isBefore`, `isAfter`, `clamp`, `isBetween`, `isToday`, `isTomorrow`, `isYesterday`, `isSameDay`, `isSameWeek`, `isSameMonth`, `isSameQuarter`, `isSameYear`, `isWeekday`, `floor`, `ceil`, `truncate`, `parseRFC3339`, `formatRFC3339`, `parseRFC2822`, `parseHTTPDate`, `fromUnixMicroseconds`, `fromUnixNanoseconds`, `toUnixSeconds`, `toUnixMilliseconds`, `toUnixMicroseconds`, `toUnixNanoseconds`, `parseSQL`, `formatSQL`, `formatDurationToParts`, `parseDuration`, `parseISODuration`, `formatISODuration`, `balanceDuration`, `compareDuration`, `subtractDuration`, `getLocale`, `hasLocale`, `createConfig`, `mergeWithConfig`, `listRegisteredGrammars`, `interval`, `overlaps`, `intersection`, `union`, `mergeIntervals`, `formatRangeToParts`, `between`, `parseRRule`, `formatRRule`, `createBusinessCalendar`, `subtractBusinessDays`, `nextHoliday`, `previousHoliday`, `resolveZoned`, `getNextTransition`, `getPreviousTransition`, `possibleInstantsFor`, `getAutocompleteData`, `getHoverDocs`, `getInlineDiagnostics`, `previewFormat`, `getDocUrl`, `translateDateFnsFormatString`.

Each follows the `ctx.overrideXxx((original, ...args) => ...)` shape shown above for `overrideFormat`. Functions *not* in this list — `round`, `subtract`, `difference`, `formatDistance`, and others that other parts of this library call directly — aren't overridable this way: something else in the codebase holds its own direct reference to them, so a mod's override would silently miss those internal callers, which is worse than not offering the override at all. A function moves onto this list only when an audit confirms nothing internal still calls it directly. If you need to change one of those, that's a real feature request for making it internally indirect first, not something `overrideFormat`-style code can paper over.

### If you're writing the mod in TypeScript

Compile it and rename the output before it goes in `mods/` — the loader only accepts `.mjs`. It won't run a TS file for you, and it won't skip one quietly either: a `.ts` file sitting in `mods/` shows up in the load report as a failure with the exact compile command to run, because a mod that silently never loads is worse than one that fails loudly.

```sh
tsc en-gb-bank-holidays.ts --module esnext --target esnext --outDir mods
mv mods/en-gb-bank-holidays.js mods/en-gb-bank-holidays.mjs
```

If you're importing `ModContext` or `Mod` for the types while you write it, both are exported from `temporal-fmt` itself:

```ts
import type { Mod, ModContext } from 'temporal-fmt';

const mod: Mod = {
  name: 'en-gb-bank-holidays',
  register(ctx: ModContext) {
    ctx.createHolidayCalendar([{ month: 1, day: 1, name: "New Year's Day" }]);
  },
};

export default mod;
```

### What happens when a mod is broken

Each mod loads independently — one throwing doesn't stop the rest from loading, and it doesn't stop the CLI command you actually ran. Every failure mode ends up as one line in the report:

- Wrong file extension (`.ts`, `.js`, anything but `.mjs`) — reported with the compile-and-rename instructions above.
- Default export isn't shaped right (missing `name`, missing `register`, `register` isn't a function, or `requires`/`priority` are the wrong type) — reported with what was expected.
- The file fails to import (a syntax error, a bad import path inside the mod) — reported with the underlying error message.
- Two mods claim the same `name` — reported against whichever file loaded second.
- A `requires` entry names a mod that isn't present, or is part of a dependency cycle — see [Load order, dependencies, and conflicts](#load-order-dependencies-and-conflicts).
- `register()` throws — reported with the thrown message, same as any other registration call in this library (see [Typed errors](#typed-errors) for what `registerLocale`/`createHolidayCalendar` themselves throw on bad input).

None of these bring down the CLI. A `mods/` folder that doesn't exist is the common case, not a failure — most runs won't have one, and the loader stays silent about it rather than printing "no mods found" noise on every command.

### Using mods outside the CLI

`loadMods()` only exists in `scripts/loadMods.mjs`, not in the published library — it needs `fs`/`path`, and this package stays dependency-free and Node-agnostic on its actual import surface (`import { format } from 'temporal-fmt'` shouldn't drag in filesystem code for someone using this in a browser). If you're embedding `temporal-fmt` in your own app rather than using the CLI, copy that loader (or write your own — it's about 60 lines) and call it at your own startup with `buildModContext()` and `isMod()` from the library, which *are* published.

## Subpath imports

Each capability area is also available as a subpath import, for anyone who wants a slice of the package rather than the whole thing:

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

The rest of the API (arithmetic, comparison, rounding, intervals-adjacent helpers not listed above, business calendars, holidays, serialization, config, type guards, typed errors, the analyzer, and IDE tooling data) is only available from the main `temporal-fmt` entry point — there's no dedicated subpath for those yet.

`sideEffects: false` is set in `package.json`, so a bundler with tree-shaking enabled genuinely drops what you don't import. Measured with esbuild: `import { format } from 'temporal-fmt/format'` bundles to ~27KB, versus ~68KB for the same single function pulled from the bare `temporal-fmt` entry — the main entry point re-exports everything, so anything imported from it drags the whole graph along regardless of what you actually call. If bundle size matters for your use case, import from the subpath, not the package root.

## Migrating from Day.js or date-fns

### Token mapping

Most date-fns/Day.js tokens map directly. The differences:

| Source (Day.js / date-fns) | temporal-fmt | Notes |
|---|---|---|
| `YYYY` | `yyyy` | Lowercase here |
| `YY` | `yy` | Same |
| `MMMM`, `MMM`, `MM`, `M` | same | Identical |
| `DD`, `D` | `dd`, `d` | Lowercase here |
| `dddd` | `EEEE` | Long weekday |
| `ddd` | `EEE` | Short weekday |
| `HH`, `H`, `mm`, `m`, `ss`, `s` | same | Identical |
| `A`, `a` | `a` | Always lowercase here |
| `Z` | `XXX` | Numeric UTC offset with colon, `Z` for UTC |
| `ZZ` | `XX` | Numeric UTC offset, no colon |
| `X` | not supported | Unix timestamp — use `fromUnixSeconds` instead |
| `x` | not supported | Unix ms timestamp — use `fromUnixMilliseconds` instead |
| `P` | not supported | Localized long format — write the format string out explicitly |

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

### Behavioral differences that will bite you if you skip this

1. **Strict parsing by default.** Day.js silently picks one reading of ambiguous input; this library throws. For glued numeric ambiguity (`Md` against `"121"`), add separators or opt into `{ lenient: true }`.
2. **Cross-field validation.** Weekday, quarter, and offset are cross-checked against the parsed date — a `Monday` label that disagrees with the actual date throws here, where Day.js would let it slide.
3. **No silent "now" fallback.** Missing input doesn't fall back to the current time; pass an explicit value.
4. **Type-preserving.** `format(plainDate, 'HH:mm')` throws — `PlainDate` has no hour field. Day.js would silently use 0. Use `PlainDateTime`, or a date-only format string.
5. **Temporal-native, not `Date`-native.** Operates on `PlainDate`/`PlainDateTime`/`ZonedDateTime`/etc, not the legacy `Date` object. Convert at the boundary:

```js
import { Temporal } from 'temporal-polyfill';
const pd = Temporal.PlainDate.from(jsDate.toISOString().slice(0, 10));
format(pd, 'yyyy-MM-dd');
```

### Common patterns, before and after

```js
// CSV/log timestamp parsing
// Before: const d = dayjs(line, 'YYYY-MM-DD HH:mm:ss');
const d = parse('yyyy-MM-dd HH:mm:ss', line);

// Locale-aware formatting
// Before: dayjs(date).locale('fr').format('MMMM D, YYYY');
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' }); // "août 4, 2026"

// Relative time
// Before: dayjs(date).fromNow(); // "3 days ago"
formatRelativeToNow(date); // "3 days ago"

// Date arithmetic
// Before: dayjs(date).add(7, 'day');
add(date, 7, 'days'); // or addDays(date, 7)
```

### Things that don't migrate cleanly

- Day.js's `dayjs.extend(customParseFormat)` — that plugin parses leniently; this library's `parse()` is strict by default. Audit callers relying on the lenient behavior.
- Day.js's mutable global locale (`dayjs.locale('fr')`) — this library uses per-call `locale` options, no global mutation.
- date-fns's `format` with a locale *object* parameter — this library takes BCP-47 strings.
- `dayjs-timezone` — use `Temporal.ZonedDateTime` and the `zzz`/offset tokens instead.

### Running both during migration

```js
import dayjs from 'dayjs';
import { format as fmtTemporal } from 'temporal-fmt';

function formatDate(date, formatStr, opts) {
  if (opts?.useTemporal) return fmtTemporal(date, formatStr, opts);
  return dayjs(date).format(formatStr);
}
```

Migrate file by file, dropping the wrapper once nothing calls the old path anymore.

## Known limitations

- **Numerals default to Western digits** in numeric tokens, regardless of locale, unless you opt into `{ numberingSystem }` / `{ parseNumberingSystem }` — see [Numbering systems](#numbering-systems).
- **Locale-aware tokens need Node 20+**, native or polyfilled. Untested below that.
- **You must provide a Temporal implementation** on anything below Node 26 — see [Providing `Temporal`](#providing-temporal).
- **Pre-1582 dates and locale-aware tokens don't mix well on native Temporal (Node 26+).** `MMMM`/`MMM`/`EEEE`/`EEE` can render the wrong month or weekday for dates before roughly 1582 CE. This is an ICU limitation, not a bug here: ICU's default Gregorian calendar cutover is October 15, 1582, so `Intl.DateTimeFormat.formatToParts()` silently reinterprets earlier dates under the Julian calendar even though `Temporal` itself uses a proleptic Gregorian calendar throughout — see [tc39/ecma402#1003](https://github.com/tc39/ecma402/issues/1003). Numeric tokens never touch `Intl` and aren't affected.
- **Gluing two unpadded numeric tokens with no separator is ambiguous for some inputs**, and `parse()` throws rather than guessing (`Md`, `dM`, `Hm` against certain input). `"121"` against `yyyy-Md` could mean month 1/day 21 or month 12/day 1 — both valid, no single correct reading. Unambiguous inputs against the same format string parse fine (`"85"` against `yyyy-Md` has only one valid split). Fix it by zero-padding (`MM`/`dd`), adding a separator, or opting into `{ lenient: true }`. Note that `Md` (or `dM`/`Hm`) with no `yyyy` present always throws regardless of ambiguity — `parse()` needs year, month, and day together to build a date at all.
- **Offset tokens can't express sub-minute historical offsets.** They read `ZonedDateTime.prototype.offset`, which Temporal exposes as `+HH:MM` for any modern date. Historical LMT offsets with seconds (Europe/London before 1847 was `+00:01:15`) aren't reachable through that field, and the offset tokens' regex shapes don't include a seconds group either. Construct the `ZonedDateTime` directly if you need to round-trip one of those. Offset range is bounded to `-12:00` through `+14:00` (Baker Island to Kiritimati) — `+14:01`/`-12:01` throw even though each digit is individually plausible, since no real zone uses an offset past that range.

## Related tools

Neither of these ships as part of this repository — separate packages, install them on their own:

- [`eslint-plugin-temporal-fmt`](https://www.npmjs.com/package/eslint-plugin-temporal-fmt) — lints format strings for common mistakes (e.g. `hh` without `a`). This is what backs the `analyzeFormat(formatStr).warnings` check mentioned in [Introspection and the analyzer](#introspection-and-the-analyzer) — same underlying metadata, surfaced as a lint diagnostic instead of a runtime call.
- [`temporal-fmt-codemod`](https://github.com/DirazCoder/temporal-fmt-codemod) — a jscodeshift AST codemod that rewrites `dayjs(x).format(...)`/date-fns `format(...)` *call sites* across a codebase, not just format-string literals. A different job from the CLI's `translate` subcommand (see [CLI](#cli)), which only translates a format string you hand it and doesn't touch call sites; use this instead if you're migrating an entire codebase and want the calls themselves rewritten.

## Testing

This library is heavily tested. The `node:test` suite (`test/*.test.js`) runs 1300+ cases covering hand-picked scenarios, fuzzing, and adversarial input, alongside a separate `vitest/` suite unit-testing internals directly. On top of that there's a dedicated conformance suite, smoke tests that check the package actually resolves correctly under CJS/ESM/bundler/nodenext, and type tests. If it's mentioned in this README, it's backed by a test — not just a docstring.

# Conformance fixtures

`fixtures.json` is a portable, library-agnostic test-vector set for
token-based Temporal formatters. It's written against a different
library's token vocabulary, not temporal-fmt's — the fixtures are
data, not code. Each case names an `op` (`format` / `parse` /
`roundtrip`), an input, a pattern, and an expected result, so any
library with a `format`/`parse` pair can be pointed at it.

`test/conformance.test.js` is the temporal-fmt-specific adapter. It
translates fixture patterns into temporal-fmt's actual tokens, runs
the cases against `format()`/`parse()`, and checks the result.

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
| `ZZ` (always-signed offset, never `Z`) | `xxx` | Only the **uppercase** `X`/`XX`/`XXX` family collapses `+00:00` to `Z` (see `formatOffset()` in `src/tokens.ts`). Lowercase never does, which is exactly `ZZ`'s semantics. Mapping `ZZ` to `XXX` was tried first and is wrong — it fails `offset-ZZ-format-utc-not-Z` and `zone-utc-roundtrip`, both of which expect `+00:00`, not `Z`. |
| `VV` (IANA zone id) | `zzz` | temporal-fmt's only zone-identity token. |

Translation happens in `translatePattern()` and skips anything inside
a quoted literal span. Everything else in the fixture set — `yyyy`,
`y`, `MM`, `dd`, `HH`, `mm`, `ss`, `S`..`SSSSSSSSS`, `h`, `a`,
`X`/`XX`/`XXX` — already matches temporal-fmt's vocabulary directly.

## `opinionated` cases

Some cases are flagged `"opinionated": true` right in the fixture.
These encode a design choice of the fixture's source library, not a
fact about dates, and temporal-fmt is allowed to disagree with them.
The adapter still runs them — if temporal-fmt's behavior differs, it
logs a divergence note (printed at the end of the run) instead of
failing the suite.

Two cases currently diverge, both `yy`-pivot ones —
`extreme-year-two-digit-pivot-low` and
`extreme-year-two-digit-pivot-high`. temporal-fmt refuses `yy` in any
format string that isn't a complete date (`yyyy`/`yy` + month + day),
so `parse("yy-MM", ...)` throws an incomplete-date error before the
question of *which* century a 2-digit year should resolve to ever
comes up. The fixture's position — that bare `yy-MM` should resolve
via the 00-68/69-99 ECMAScript pivot — is a convention, not a fact
about dates; a library is free to pick a different pivot, or, as here,
decline to guess a century from `yy` alone at all. Both are documented
design choices with their own passing tests
(`test/parse.test.js`, `yy pivot: ...`), not something in scope to
"fix" by adopting the fixture's convention.

One other flagged case no longer diverges:
**`shape-mixing-H-and-a-rejected`**. `resolveHour()`
(`src/parse.ts`) used to cross-check `H` against `a` instead of
banning the combination outright, so `13:05 PM` was accepted (13:00 is
consistent with PM) and only a genuine contradiction like `01:05 PM`
threw. That choice has since been reverted — `H` and `a` are now
refused together outright, unconditionally, matching the fixture. The
fixture's own `"opinion"` text on that case still describes the old
behavior; it's fixture data, not something this adapter edits, so
treat the `opinionated` flag there as historical rather than current.

## History: divergences that have since been fixed

Everything below was once tracked in `KNOWN_FAILURES` at the top of
`test/conformance.test.js`. That set is currently empty — every
previously-found divergence has been resolved, either by fixing a
real bug or by deliberately adopting the fixture's convention over a
prior design choice. Kept here for context on what changed and why,
in case any of it needs revisiting.

**Fixed — real bug: offset seconds were dropped, not rejected.**
`formatOffset()` (`src/tokens.ts`) assumed every offset string was
exactly 6 characters — sign, `HH`, `:`, `MM` — and never checked for a
seconds component. Verified against a real `Temporal.ZonedDateTime`
for a pre-1900 `America/New_York` date: the actual offset is
`-04:56:02`, 9 characters, because pre-1883 New York ran on local mean
time. The old code read that string's middle two digits as minutes,
so `X` silently produced `-0402` (wrong) instead of refusing. Now:
`X`/`XX`/`XXX`/`x`/`xx` throw when the offset has a seconds component
(none of them have anywhere to put it), and `xxx` — the variant that
plays `ZZ`'s "always-signed, never-Z" role — passes the full value
through unchanged.
- `offset-sub-minute-rejected-by-X`
- `offset-sub-minute-passes-through-ZZ`

**Changed — offset-only `ZonedDateTime` construction, previously
supported on purpose, is now refused.** `parse()` used to build a
`ZonedDateTime` from an offset token alone, no `zzz` zone required.
That was deliberate, not an oversight, but the fixture's position — an
offset identifies a moment's distance from UTC, not a time zone, so
building a `ZonedDateTime` from one alone papers over that distinction
— was adopted instead. A pattern with an offset token and no `zzz` now
throws; add `zzz` to the pattern (or parse into a
`PlainDateTime`/`PlainDate`/`PlainTime` if a zone genuinely isn't
needed).
- `zone-required-for-zoneddatetime`
- `zone-offset-token-rejected-on-plain-type`

**Added — `y` token (unpadded, variable-width year).** temporal-fmt
previously had only `yyyy` (fixed 4 digits) and `yy` (2-digit,
truncated). `y` formats and parses a year at any width, sign preserved
for years before ISO year 0 — same semantics as `yyyy` minus the
fixed width. It has no bounded fallback the way `yyyy` does when
something digit-consuming follows (`yyyy` can fall back to an exact
4-digit fragment in that case; `y` being unpadded is the entire point
of the token, so there's no narrower shape that still means the same
thing). `buildCapturingPattern()` (`src/parsePattern.ts`) refuses at
build time to place `y` directly next to another digit-reading token
or a digit-leading literal, rather than trying to estimate an
ambiguity cost for an unbounded-width fragment — there's no finite
number of "width choices" to charge for "any number of digits."
- `extreme-year-max-supported`
- `extreme-year-negative`
- `extreme-year-past-max-rejected` — previously passed even without a
  real `y` token, because "no valid pattern matches" for the
  then-unrecognized token happened to also throw. Now genuinely tests
  275761 CE rejection, via the real max-year check on `y`'s parsed
  value.

**Fixed — misdiagnosed as a regex gap; the actual cause was `zzz`
rejecting valid IANA zone aliases.** `offset-X-parse-accepts-four-digit`
expects `X` to parse a 4-digit offset body (`+0530`) alongside a `zzz`
zone. This was originally filed as "the capturing regex for `X` in
`pattern.ts` doesn't offer the 4-digit shape as an alternative" — that
diagnosis was wrong. The `X` regex fragment matches `+0530` correctly
in isolation; the actual failure was `isValidTimeZone()`
(`src/pattern.ts`) rejecting the fixture's zone name, `Asia/Kolkata`.
`isValidTimeZone()` only checked `Intl.supportedValuesOf('timeZone')`,
which lists canonical zone ids but not every IANA link/alias name —
`Asia/Kolkata` is a legitimate, commonly-used alias for
`Asia/Calcutta` that some ICU builds' `supportedValuesOf()` omits.
Confirmed against `temporal-polyfill` directly:
`Temporal.ZonedDateTime.from()` resolves `Asia/Kolkata` without
complaint, so `parse()` was refusing input its own downstream
construction step would have accepted. `isValidTimeZone()` now falls
back to asking `Temporal` itself (a real `ZonedDateTime.from()` call)
when the fast-path `Intl` lookup misses, rather than trusting only the
`Intl` list.

## Adapter mapping notes

- `parse(formatStr, input, options)` takes `(formatStr, input)` —
  reversed from the fixture's `pattern`/`input` field order.
- temporal-fmt does have a typed error hierarchy (`TemporalFmtError`
  and its subclasses in `src/errors.ts`), but the fixture's three
  `expect.throws` values (`"ParseError"`, `"FormatError"`,
  `"InvalidPatternError"`) don't map cleanly onto temporal-fmt's
  dozen-plus subclasses, so the adapter doesn't try — it just checks
  that something extending `Error` was thrown.
- `target` in the fixture is informational only. temporal-fmt's
  `parse()` infers the result shape from which fields the pattern
  captures, so the adapter never passes `target` as an input.

## Contributing

```sh
git clone https://github.com/DirazCoder/temporal-fmt.git
cd temporal-fmt
npm install
npm run build
npm run test:all
```

`npm test` only runs the `node:test` suite under `test/*.test.js` — hand-picked, fuzz, adversarial, and perf cases exercising the public API end to end. It doesn't touch `vitest/`, which unit-tests internals directly (`enumerateValidSplits()`, the function that resolves ambiguous glued numeric runs, being the one most worth having covered — a bug in one of its edge cases can dodge every example in the main suite without being the specific input any of them happens to use). Run `npm run test:all` instead, which also builds first and runs the type tests (`test:types`) — it's the only single command that covers everything CI runs. Plain `npm test` will pass locally even with a broken `vitest/` suite.

A couple of build-specific notes if you're touching the toolchain:

- Building requires TypeScript 7.0.2+, but `.d.ts` generation runs as a separate `tsc` pass rather than through `tsup` — `tsup`'s dts step bundles types via `rollup-plugin-dts`, which calls into TypeScript's compiler API, and that API isn't stable yet on 7.x. `tsup.config.ts` sets `dts: false` and `npm run build` runs `tsup && tsc --declaration --emitDeclarationOnly` instead. One side effect: `dist/` has one `.d.ts` per source file rather than a single rolled-up `index.d.ts` — same exported API, different file layout.
- Tests pull from `temporal-polyfill/full`, not the slim `temporal-polyfill` — the Hebrew-calendar tests need the full build's calendar data. Locale-aware tests pass on Node 20+ regardless of native vs. polyfilled `Temporal`: native goes through `Intl.DateTimeFormat` directly, the polyfill falls back to its own `toLocaleString()`. `parse.test.js` configures `Temporal` via `setTemporal()` rather than mutating `globalThis.Temporal` directly.

## License

MIT — see [LICENSE](./LICENSE).