# temporal-fmt 🥶🔥

Format `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `ZonedDateTime` objects
using date-fns-style token strings.

Node 26 shipped native `Temporal` and then pointedly left out a custom-string
formatter. TC39's take: use `Intl.DateTimeFormat` and leave string-token syntax
to userland. Fair enough, but if you've spent years typing `'yyyy-MM-dd'` out of
muscle memory from date-fns, moment, or dayjs, that's a rough adjustment. This
library exists so you don't have to make it.

Zero dependencies. Native on Node 26+, or bring your own via a polyfill or
`setTemporal()`.

Locale-aware tokens need Node 20+ regardless of which path you use — native
on 26+, or falling back to the Temporal implementation's own
`toLocaleString()` otherwise. Untested below Node 20.

## Install

```sh
npm install temporal-fmt
```

[View on npm](https://www.npmjs.com/package/temporal-fmt)

## Contents

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
- [Subpath imports](#subpath-imports)
- [Migrating from Day.js or date-fns](#migrating-from-dayjs-or-date-fns)
- [Known limitations](#known-limitations)
- [Related tools](#related-tools)
- [Contributing](#contributing)
- [License](#license)

## Providing `Temporal`

### Node 26+

Temporal is native and used automatically.

### Polyfill

Use a polyfill like [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) to put Temporal on the global namespace.

```js
import 'temporal-polyfill/global'
import { format, parse } from 'temporal-fmt';

parse(...);
```

### Bring your own

Set a Temporal implementation explicitly, once, before your app's first `format()`/`parse()` call:

```js
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal, format, parse } from 'temporal-fmt';

setTemporal(Temporal); // once, before using format or parse
```

`setTemporal()` takes precedence over native or global `Temporal`, and calling it again overrides whatever was set before. Useful when you don't want to pollute the global namespace — libraries, mainly. Call it with no argument to clear the override and fall back to `globalThis.Temporal`.

Anything that constructs a `Temporal` value from scratch needs this — `parse()`, `parseISO()`, `resolveZoned()`, and a handful of others. Functions that only read fields off a value you already built (`format()`, `compare()`, `add()`) don't touch the namespace at all, so they work with any Temporal-shaped object regardless of whether you've called `setTemporal()`.

## Formatting

```js
import { format } from 'temporal-fmt';

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
import { parse } from 'temporal-fmt';

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

**Numeric fields always come out in Western (0–9) digits**, regardless of locale. On purpose — logs, APIs, and filenames reading this output back in want boring ASCII digits, and locale-native numeral systems (Arabic-Indic, Devanagari) don't play nicely with the zero-padding logic here. Need localized digits on the numeric pieces? See [Numbering systems](#numbering-systems) below, or run the output through `Intl.NumberFormat` yourself.

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
- `getQuarter(value)`, `getMonth(value)`, `getWeekday(value)`.
- `startOf(value, unit)` / `endOf(value, unit)` — `unit` is `'day' | 'month' | 'year' | 'hour' | 'minute' | 'second'`. Returns a field bag with finer fields zeroed (`startOf`) or extended to their max (`endOf`).

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

```js
import { convertDigits, convertDigitsToAscii } from 'temporal-fmt';

convertDigits('2026', 'arab');       // "٢٠٢٦"
convertDigitsToAscii('٢٠٢٦', 'arab'); // "2026"
```

- `convertDigits(s, system)` — ASCII digits to a locale's native digits.
- `convertDigitsToAscii(s, system)` — the inverse.
- `applyNumbering(s, options)` / `applyParseNumbering(s, options)` — the internal helpers `format()`/`parse()` call when you pass `{ numberingSystem }` / `{ parseNumberingSystem }` in `options`, rather than converting a formatted string yourself afterward.
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

The CLI ships in this package (`scripts/cli.mjs`) and reads/writes stdin/stdout. Run it via `npm run cli` inside a checkout of this repo, or `node scripts/cli.mjs` directly:

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

The `translate` subcommand imports a separate `temporal-fmt-codemod` package at runtime — it isn't bundled in this repo, so `translate` will fail with a module-not-found error unless that package is installed and resolvable. Every other subcommand works standalone.

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

- **Numerals are always Western digits** in numeric tokens, regardless of locale — see [Locales](#locales).
- **Locale-aware tokens need Node 20+**, native or polyfilled. Untested below that.
- **You must provide a Temporal implementation** on anything below Node 26 — see [Providing `Temporal`](#providing-temporal).
- **Pre-1582 dates and locale-aware tokens don't mix well on native Temporal (Node 26+).** `MMMM`/`MMM`/`EEEE`/`EEE` can render the wrong month or weekday for dates before roughly 1582 CE. This is an ICU limitation, not a bug here: ICU's default Gregorian calendar cutover is October 15, 1582, so `Intl.DateTimeFormat.formatToParts()` silently reinterprets earlier dates under the Julian calendar even though `Temporal` itself uses a proleptic Gregorian calendar throughout — see [tc39/ecma402#1003](https://github.com/tc39/ecma402/issues/1003). Numeric tokens never touch `Intl` and aren't affected.
- **Gluing two unpadded numeric tokens with no separator is ambiguous for some inputs**, and `parse()` throws rather than guessing (`Md`, `dM`, `Hm` against certain input). `"121"` against `yyyy-Md` could mean month 1/day 21 or month 12/day 1 — both valid, no single correct reading. Unambiguous inputs against the same format string parse fine (`"85"` against `yyyy-Md` has only one valid split). Fix it by zero-padding (`MM`/`dd`), adding a separator, or opting into `{ lenient: true }`. Note that `Md` (or `dM`/`Hm`) with no `yyyy` present always throws regardless of ambiguity — `parse()` needs year, month, and day together to build a date at all.
- **Offset tokens can't express sub-minute historical offsets.** They read `ZonedDateTime.prototype.offset`, which Temporal exposes as `+HH:MM` for any modern date. Historical LMT offsets with seconds (Europe/London before 1847 was `+00:01:15`) aren't reachable through that field, and the offset tokens' regex shapes don't include a seconds group either. Construct the `ZonedDateTime` directly if you need to round-trip one of those. Offset range is bounded to `-12:00` through `+14:00` (Baker Island to Kiritimati) — `+14:01`/`-12:01` throw even though each digit is individually plausible, since no real zone uses an offset past that range.

## Related tools

Neither of these ships as part of this repository — separate packages, install them on their own:

- [`eslint-plugin-temporal-fmt`](https://www.npmjs.com/package/eslint-plugin-temporal-fmt) — lints format strings for common mistakes (e.g. `hh` without `a`). This is what backs the `analyzeFormat(formatStr).warnings` check mentioned in [Introspection and the analyzer](#introspection-and-the-analyzer) — same underlying metadata, surfaced as a lint diagnostic instead of a runtime call.
- [`temporal-fmt-codemod`](https://www.npmjs.com/package/temporal-fmt-codemod) — one-time migration tool that rewrites Day.js/date-fns calls to `temporal-fmt`. The CLI's `translate` subcommand (see [CLI](#cli)) imports this package at runtime, so `translate` needs it installed to work.

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