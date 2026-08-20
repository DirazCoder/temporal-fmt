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

## Providing `Temporal`

### Node 26+

Temporal is native and used automatically.

### Polyfill

Use a polyfill like [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) to implement Temporal
in the global namespace.

```js
import 'temporal-polyfill/global'
import { format, parse } from 'temporal-fmt';

parse(...);
```

### Bring Your Own

Set a Temporal implementation explicitly, once, before your app's first
`format()`/`parse()` call:

```js
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal, format, parse } from 'temporal-fmt';

setTemporal(Temporal); // once, before using `format` or `parse`.
```

`setTemporal()` takes precedence over native or global Temporal, and calling
it again overrides whatever was set before. Useful when you don't want to
pollute the global namespace, like for libraries.

## Usage

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

Wrap literal text in single quotes, like `'at'` above. Need an actual single
quote in your output? Use `''`.

## Parsing a string

`parse` builds a `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` /
`ZonedDateTime` out of a string, picking whichever type fits the tokens
present:

```js
import { parse } from 'temporal-fmt';

parse('yyyy-MM-dd HH:mm', '2026-08-04 15:45');    // Temporal.PlainDateTime
parse('yyyy-MM', '2026-08-04T15:45:30');          // throws — shape doesn't match
parse('yyyy-MM-dd', '2026-02-30');                // throws — not a real date
```

Because the format is unknown at runtime you will need to check the result
with `instanceof`, or manually assert/type guard it in Typescript, to narrow the type.

Since `parse` constructs a real value rather than just matching shape, it
catches an impossible date like February 30th, or a weekday name that
doesn't match the date it's paired with:

```js
parse('EEEE, yyyy-MM-dd', 'Tuesday, 2026-08-04');  // fine — that really is a Tuesday
parse('EEEE, yyyy-MM-dd', 'Monday, 2026-08-04');   // throws — it isn't
```

`parse` throws when `input` doesn't match `formatStr`'s shape at all
or throws a descriptive error if the computed date is not valid.

A few things worth knowing:

- **`yy` (2-digit year)** emulates POSIX-style [strptime](https://www.man7.org/linux//man-pages/man3/strptime.3p.html): `00–68`
  becomes `2000–2068`, `69–99` becomes `1900–1999`.
  - this is an opinionated tradeoff but ensures `yy` is deterministic without an external date reference
- **`hh`/`h` (12-hour) without an `a` token throws** — same if a format string mixes `HH`/`H` with `hh`/`h`,
  even when both agree on the same hour. `parse` won't guess which one is authoritative; pick one.
- **`HH`/`H` combined with `a` is allowed, and cross-checked** — `parse('HH:mm a', '13:05 PM')` succeeds since
  13:05 can only mean PM, but `parse('HH:mm a', '01:05 PM')` throws: the day period contradicts the hour.
  This is different from mixing `HH` with `hh`/`h` above — there's only one hour token here, `a` just confirms it.
- **`a` (AM/PM) matches case-insensitively** — `pm`, `Pm`, and `PM` all parse the same way. Month and weekday
  names (`MMMM`, `EEEE`, etc.) stay case-sensitive; only the day-period marker is case-folded.
- **`S` through `SSSSSSSSS` reach micro/nanosecond precision, not just milliseconds.** `SSS` is unchanged (3-digit
  ms). Wider tokens expose whatever sub-millisecond precision the `Temporal` value actually carries — useful for
  round-tripping machine-generated timestamps (DB exports, instrumentation logs) without silently truncating to
  ms. Format truncates to the requested width (never rounds); parse right-pads short input, so `SSSSSSSSS` reading
  `.5` means 500ms-worth of nanoseconds (`500000000`), not 5 nanoseconds.
- **`MMMM`/`MMM` name matching assumes a 12-month calendar** — the vocabulary
  it matches against is generated from 12 Gregorian reference dates, so a
  calendar with a leap month (e.g. Hebrew's 13-month leap years) isn't fully
  covered by month *names*. Numeric `yyyy-MM-dd` round-trips aren't affected.

## Locale support

Pass a BCP 47 locale tag as a third argument and month names, weekday names,
and AM/PM markers all localize accordingly. Defaults to `'en-US'` if you don't.

```js
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' });   // "août 4, 2026"
format(date, 'EEEE d MMMM', { locale: 'ar-EG' });    // Arabic weekday/month names
format(dt, 'h:mm a', { locale: 'ja-JP' });            // "3:45 午後"
```

The named fields (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`) go through
`Intl.DateTimeFormat` under the hood, which means non-Gregorian calendars
work too, as long as the `Temporal` object is already carrying one:

```js
const hebrewDate = date.withCalendar('hebrew');
format(hebrewDate, 'MMMM d, yyyy');   // "Av 21, 5786"
```

The above holds true for `parse` as well:

```js
parse('MMMM d, yyyy','août 4, 2026', { locale: 'fr-FR' });
parse('h:mm a', '3:45 午後', { locale: 'ja-JP' });
// `-u-ca-` calendar extension parses into that calendar
parse('yyyy-MM-dd', '5786-11-21', { locale: 'en-u-ca-hebrew' });
```

**Numeric fields (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `SSS`) always come out
in Western (0-9) digits, no matter what locale you pass.** On purpose. Most
things reading this output back in — logs, APIs, filenames — want boring,
predictable ASCII digits, and locale-native numeral systems like Arabic-Indic
or Devanagari don't play nicely with this library's zero-padding logic anyway.
Need localized digits? Run the numeric pieces through `Intl.NumberFormat`
yourself.

## Tokens

| Token | Meaning            | Example |
|-------|--------------------|---------|
| yyyy  | 4-digit year       | 2026    |
| yy    | 2-digit year       | 26      |
| MMMM  | full month name    | August  |
| MMM   | short month name   | Aug     |
| MM    | 2-digit month      | 08      |
| M     | month              | 8       |
| dd    | 2-digit day        | 04      |
| d     | day                | 4       |
| do    | ordinal day (English-only: 1st, 2nd, 3rd, 4th, ... 11th/12th/13th, ... 21st) | 4th |
| EEEE  | full weekday       | Tuesday |
| EEE   | short weekday      | Tue     |
| HH    | 2-digit hour (24h) | 15      |
| H     | hour (24h)         | 15      |
| hh    | 2-digit hour (12h) | 03      |
| h     | hour (12h)         | 3       |
| mm    | 2-digit minute     | 45      |
| m     | minute             | 45      |
| ss    | 2-digit second     | 30      |
| s     | second             | 30      |
| SSS   | milliseconds (3 digits) | 000 |
| SSSSSSSSS...S | fractional second, 1-9 digits — `S` through `SSSSSSSSS`. `SSS` is the common 3-digit millisecond case; wider widths reach micro/nanosecond precision. Format slices from the underlying nanosecond value (never rounds); parse right-pads whatever digits it captured (`.5` under `SSSSSSSSS` means 500,000,000ns, not 5ns) | `SSSSSSSSS` → 123456789 |
| a     | AM/PM (case-insensitive on parse) | PM |
| Q     | numeric quarter (1-4) | 3    |
| QQQ   | quarter with "Q" prefix (Q1, Q2, Q3, Q4) | Q3 |
| ww    | ISO 8601 week (01-53), format-only | 32 |
| RRRR  | ISO 8601 week-numbering year, format-only | 2026 |
| zzz   | IANA time zone id  | America/New_York |
| X     | UTC offset, hours only (or `Z` for UTC); minutes appended when non-zero, no colon | `+05` / `+0530` / `Z` |
| XX    | UTC offset, hours+minutes, no colon (or `Z`) | `+0500` / `Z` |
| XXX   | UTC offset, hours+minutes with colon (or `Z`) | `+05:00` / `Z` |
| x     | same widths as `X` but never `Z` — always numeric, even for UTC | `+05` / `+0530` / `+00` |
| xx    | same as `XX` but never `Z` | `+0500` / `+0000` |
| xxx   | same as `XXX` but never `Z` | `+05:00` / `+00:00` |

`do` is format-only (parse() rejects it — the "st"/"nd"/"rd"/"th" suffix isn't structurally distinguishable from adjacent literal text in a parse context). The English-only suffix rule is on purpose — locale-aware ordinals are out of scope; `Intl.DateTimeFormat` has no part type for ordinals, and the rest of this library routes locale-specific names through it.

`Q` and `QQQ` both format and parse. On parse, they cross-check against any month/date tokens present in the same format string, the same way `EEEE` cross-checks weekday against date — throw if they disagree.

`ww` and `RRRR` are format-only. Parsing "ww"/"RRRR" back into a date requires resolving an ISO week + a weekday to a specific date, which is a different parsing surface than the token-based `parse()` here.

`RRRR` is the **ISO week-numbering year**, not the calendar year — they can differ at year boundaries. Dec 29-31 often belong to week 1 of the *next* year; Jan 1-3 often belong to week 52/53 of the *previous* year. Examples: `format(PlainDate.from('2026-12-31'), 'ww RRRR')` → `"53 2026"`; `format(PlainDate.from('2027-01-01'), 'ww RRRR')` → `"53 2026"` (Friday in ISO year 2026's week 53); `format(PlainDate.from('2027-01-04'), 'ww RRRR')` → `"01 2027"` (Monday starting ISO week 1 of 2027).

The six offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`) are the standard date-fns/Unicode-LDML UTC offset family. They only work on `ZonedDateTime`; on a `PlainDate`/`PlainTime`/`PlainDateTime` they throw the same "requires offset, which this Temporal object doesn't have" error the other field-typed tokens throw when their field is missing. Uppercase variants (`X`/`XX`/`XXX`) collapse `+00:00` to `Z` for UTC; lowercase variants (`x`/`xx`/`xxx`) always emit a numeric offset, even for UTC (`+00`, `+0000`, `+00:00`). `X` and `x` (single-letter) drop minutes when zero (`+05` rather than `+0500`) and append them with no colon when non-zero (`+0530`) — matches the LDML spec's "hours required, minutes optional when zero" rule.

On parse, an offset token requires a full date and time (year, month, day, and at least one time token) to anchor the instant, same rule `zzz` already enforces. A pattern with an offset token but no `zzz` produces a `ZonedDateTime` whose `timeZoneId` is the offset string itself (e.g. `"+09:00"`). A pattern with **both** `zzz` and an offset token is a cross-check: `zzz` wins for the result's `timeZoneId` (the IANA name is the meaningful label; the offset is a derived fact about that zone at this instant), and the offset token's value must match the zone's actual offset at the parsed wall-clock instant. If they disagree — e.g. `yyyy-MM-dd HH:mm zzz XXX` against `2026-08-04 15:45 America/New_York +09:00` (August in New York is `-04:00`, not `+09:00`) — parse() throws rather than silently picking one, same contract as the EEEE-vs-date and Q-vs-month cross-checks elsewhere in this library. Range checks: `-12:00` to `+14:00` (the IANA-supported range). Out-of-range values throw a descriptive error naming the bound, not a generic "no valid pattern matches".

Try to use a token your input type doesn't support — `HH` on a `PlainDate`,
say — and you'll get a real error telling you so, not a silent `undefined`
sitting in your output waiting to confuse someone in three weeks.

## Duration formatting

`formatDuration(duration, formatStr, options?)` formats a `Temporal.Duration` (or a plain field bag `{ years, months, weeks, days, hours, minutes, seconds, milliseconds }`) with a duration-specific token set. A duration doesn't sit on a calendar — it has no year/month/day position the way a PlainDate does — so the date/time token table above doesn't apply.

Token grammar: each unit has three forms, in increasing verbosity.

| Token | Form | Example |
|-------|------|---------|
| `y` / `yy` / `yyy` | numeric / short / long (years) | `2` / `2yr` / `2 years` |
| `o` / `oo` / `ooo` | numeric / short / long (months) | `2` / `2mo` / `2 months` |
| `w` / `ww` / `www` | weeks | `2` / `2wk` / `2 weeks` |
| `d` / `dd` / `ddd` | days | `2` / `2d` / `2 days` |
| `h` / `hh` / `hhh` | hours | `2` / `2h` / `2 hours` |
| `m` / `mm` / `mmm` | minutes | `2` / `2m` / `2 minutes` |
| `s` / `ss` / `sss` | seconds | `2` / `2s` / `2 seconds` |
| `S` / `SS` / `SSS` | milliseconds | `2` / `2ms` / `2 milliseconds` |

The short and long forms are plural-aware (singular for value 1, plural otherwise).

```js
import { formatDuration } from 'temporal-fmt';

formatDuration({ years: 2, months: 3 }, 'yyy ooo')      // "2 years 3 months"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm')   // "2 hours 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'h:mm')      // "2:30"
```

**Zero-value handling**: by default, zero-value units are omitted from the output. `formatDuration({ hours: 2 }, 'hhh mmm')` returns `"2 hours "` (the trailing space is the literal separator from the format string — the codemod doesn't do separator cleanup; the caller is responsible for structuring the format string). Pass `{ showZeroValues: true }` to force zero-value units to render.

**Locale-aware unit names**: pass a `locale` option to localize the short/long forms via `Intl.NumberFormat`'s `style: 'unit'` mode — same approach `formatDistance` uses for `Intl.RelativeTimeFormat`. Numeric-only tokens (`y`, `o`, `w`, ...) stay ASCII digits regardless of locale, matching the rest of the library's "numbers stay Western" convention.

```js
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'fr-FR' }) // "2 heures 30 minutes"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'es-ES' }) // "2 horas 30 minutos"
formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale: 'de-DE' }) // "2 Stunden 30 Minuten"
formatDuration({ milliseconds: 5 }, 'SSS', { locale: 'fr-FR' })           // "5 millisecondes"
```

Without a `locale`, the original English hardcoded singular/plural table is used — byte-identical to previous versions. This is additive: existing calls with no `locale` produce the same output as before. (Passing `locale: 'en-US'` explicitly is *not* identical to no-locale — Intl's spacing differs from the hand-rolled English table, e.g. `"2 hr"` vs `"2h"`. Pick the path that matches your needs.)

Milliseconds *are* supported by `Intl.NumberFormat`'s unit list on every Node version this library targets — confirmed against the current Intl spec, not assumed. The original task brief flagged this as a possible gap; empirically it isn't.

## Relative time: formatDistance

`formatDistance(date1, date2, options?)` returns a human-readable relative-time string — "3 days ago", "in 2 hours", "now". Delegates unit names and pluralization to `Intl.RelativeTimeFormat` so the output localizes the same way the rest of the library's locale-aware tokens do.

```js
import { formatDistance } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04');
const yesterday = Temporal.PlainDate.from('2026-08-03');

formatDistance(today, yesterday)              // "yesterday" (numeric: 'auto')
formatDistance(today, yesterday, { numeric: 'always' }) // "1 day ago"
formatDistance(today, today)                    // "now"
formatDistance(today, today.add({ days: 2 }), { locale: 'fr-FR' }) // "dans 2 jours"
```

**Direction convention**: `diff = date1 - date2`. Positive diff → date1 is in the future relative to date2 → "in X". Negative diff → date1 is in the past → "X ago". Swap the args to flip the direction.

**Unit-selection cutoffs** (defaults documented below; per-call override via the `cutoffs` option):

| abs(diff) | Unit | Default cutoff |
|-----------|------|----------------|
| < 60 seconds | seconds | `seconds: 60` |
| < 60 minutes | minutes | `minutes: 60` |
| < 24 hours | hours | `hours: 24` |
| < 30 days | days | `days: 30` |
| < 365 days | months | `months: 365` (in days — see note) |
| otherwise | years | — |

30 days is an approximation of a month (calendar months are 28-31 days); 365 days is an approximation of a year. These are the same cutoffs date-fns uses, trimmed to the units `Intl.RelativeTimeFormat` supports across engines.

The `months` cutoff is in days, not months — "months" itself isn't a fixed number of days, so the months→years boundary is expressed as a day count, matching how the original hardcoded table expressed the same boundary (`30 * MS_PER_DAY` for days, `365 * MS_PER_DAY` for the months cap). This lets a caller say "treat anything under 90 days as months" rather than "anything under 3 months as months" (which would require picking a definition of "month").

Override any subset of the boundaries per call. Unspecified boundaries fall back to the defaults above. Throws descriptively on non-monotonic boundaries (e.g. `seconds: 300, minutes: 1` — 300s > 1min, so the seconds branch would always win and the minutes branch would be unreachable) or non-positive values, rather than producing confusing output downstream.

```js
formatDistance(in5d, today)                                     // "in 5 days" (default cutoffs)
formatDistance(in14d, today, { cutoffs: { days: 10 } })         // "this month" (14d > 10d)
formatDistance(in200d, today, { cutoffs: { months: 100 } })     // "this year" (200d > 100d)
formatDistance(in30d, today)                                    // "next month" (exactly at default 30d boundary → next unit up)
```

Accepts `Temporal.PlainDate`, `PlainDateTime`, or `ZonedDateTime`. A `PlainDate` is treated as midnight when diffing against a `PlainDateTime`. Throws on `PlainTime` (no anchor date to diff against) and on partial-date shapes (e.g. `{ year: 2026 }` with no month/day).

## Lenient parse mode

By default, `parse()` throws when an ambiguous glued numeric run (e.g. `"121"` against `yyyy-Md`) has more than one valid split. The library refuses to guess — silently picking one would mean returning a value indistinguishable from a different, equally-valid value the same input could describe.

Pass `{ lenient: true }` to opt into a documented heuristic that picks one split instead of throwing:

```js
parse('yyyy-Md', '2026-121')                              // throws — ambiguous
parse('yyyy-Md', '2026-121', { lenient: true }).toString() // '2026-12-01'
```

**Heuristic**: when one of the tokens in the ambiguous run is `d` (day), prefer the split where the day value is ≤ 12. Rationale: when a person writes a glued run like `"121"` for an `Md` format string, they're more likely to mean "Dec 1" (M=12, d=1) than "Jan 21" (M=1, d=21) — if they meant Jan 21, they'd more often have written it as `"1/21"` or `"01/21"` with a separator or padding. This isn't a guarantee (which is exactly why lenient mode is opt-in), but it's a reasonable default when the caller has explicitly asked us to guess.

When the heuristic doesn't narrow (e.g. both splits have day ≤ 12), falls back to the first valid split from `enumerateValidSplits()` — deterministic but necessarily arbitrary. When no `d` token is in the run (e.g. `Hm`), the heuristic doesn't apply; falls back to first split.

The default behavior (lenient unset or `false`) is unchanged — this is strictly additive.

## Custom locale vocabularies

`registerLocaleVocab(locale, vocab)` lets callers supply their own month/weekday/day-period vocabulary for a locale key `Intl` doesn't cover well. The known limitation this addresses: a 13-month Hebrew leap year silently loses a month because `Intl`'s 12-month vocabulary can't name it.

```js
import { registerLocaleVocab, format, parse } from 'temporal-fmt';

registerLocaleVocab('en-u-ca-hebrew-leap', {
  monthLong: ['Nisan','Iyar','Sivan','Tammuz','Av','Elul','Tishrei','Marcheshvan','Kislev','Tevet','Shevat','Adar I','Adar II'],
  monthShort: ['Nis','Iyy','Siv','Tam','Av','Elu','Tish','Chesh','Kis','Tev','Shv','Ad1','Ad2'],
  weekdayLong: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  weekdayShort: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  dayPeriod: ['AM','PM'],
});

const date = Temporal.PlainDate.from('2026-08-04').withCalendar('hebrew');
format(date, 'MMMM d, yyyy', { locale: 'en-u-ca-hebrew-leap' }) // "Av 4, 5786" (or similar)
```

Validation is strict: throws descriptively on wrong array lengths (must be 12 months, 7 weekdays, 2 day periods), empty strings, duplicate entries, and identical AM/PM day periods (which would make `parse()` unable to tell AM from PM). All errors surface at registration time, not later during format/parse.

Registered vocab takes precedence over the `Intl`-derived vocab for that locale key, for both `format()` and `parse()`.

## parseRelative: natural-language date parsing

`parseRelative(input, referenceDate, options?)` resolves common relative-date phrases against a reference date, returning a `Temporal.PlainDate`. English by default; pass `locale: 'es'` / `'fr'` / `'de'` (or any locale tag with that language subtag) to route to the corresponding grammar.

Supported phrases:

- **weekday references**: "next Tuesday", "last Friday", "this Monday"
- **relative day offsets**: "today", "tomorrow", "yesterday"
- **relative unit offsets**: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago"
- **month-day without year**: "March 5th", "Aug 4" (resolved to next occurrence)

Per-language equivalents (each grammar is its own module — phrase patterns and vocabulary are NOT shared across languages, only the matching engine and the resolution helpers are):

| Phrase class | es | fr | de |
|--------------|----|----|-----|
| today | `hoy` | `aujourd'hui` | `heute` |
| tomorrow | `mañana` | `demain` | `morgen` |
| yesterday | `ayer` | `hier` | `gestern` |
| next Tuesday | `el próximo martes` / `martes próximo` | `mardi prochain` | `nächsten Dienstag` |
| last Tuesday | `el martes pasado` | `mardi dernier` | `letzten Dienstag` |
| this Wednesday | `este miércoles` | `ce mercredi` | `diesen Mittwoch` |
| in 3 days | `en 3 días` | `dans 3 jours` | `in 3 Tagen` |
| 2 weeks ago | `hace 2 semanas` | `il y a 2 semaines` | `vor 2 Wochen` |
| March 5 | `5 de marzo` | `5 mars` | `5. März` |

Diacritics are stripped before matching (NFD + combining-mark removal), so `"miercoles"` matches the same as `"miércoles"`, `"aout"` as `"août"`, `"naechsten"` as `"nächsten"`. German umlaut transliterations (`ä` → `ae`, `ö` → `oe`, `ü` → `ue`, `ß` → `ss`) are also expanded, so `"5. Maerz"` resolves the same as `"5. März"`.

```js
import { parseRelative } from 'temporal-fmt';

const today = Temporal.PlainDate.from('2026-08-04'); // Tuesday
parseRelative('today', today).toString()                  // '2026-08-04'
parseRelative('tomorrow', today).toString()                // '2026-08-05'
parseRelative('next Tuesday', today).toString()            // '2026-08-11' (7 days out, not today)
parseRelative('last Friday', today).toString()            // '2026-07-31'
parseRelative('in 3 days', today).toString()               // '2026-08-07'
parseRelative('2 weeks ago', today).toString()             // '2026-07-21'
parseRelative('March 5th', today).toString()              // '2027-03-05' (next occurrence)
```

Per-language examples:

```js
parseRelative('mañana', today, { locale: 'es-ES' }).toString()              // '2026-08-05'
parseRelative('el próximo martes', today, { locale: 'es-ES' }).toString()    // '2026-08-11'
parseRelative('5 de marzo', today, { locale: 'es-ES' }).toString()           // '2027-03-05'

parseRelative('demain', today, { locale: 'fr-FR' }).toString()              // '2026-08-05'
parseRelative('mardi prochain', today, { locale: 'fr-FR' }).toString()      // '2026-08-11'
parseRelative('5 mars', today, { locale: 'fr-FR' }).toString()               // '2027-03-05'

parseRelative('morgen', today, { locale: 'de-DE' }).toString()              // '2026-08-05'
parseRelative('nächsten Dienstag', today, { locale: 'de-DE' }).toString()  // '2026-08-11'
parseRelative('5. März', today, { locale: 'de-DE' }).toString()              // '2027-03-05'
```

**Ambiguous-case choices** (documented, not inferred):

- **"next Tuesday" said on a Tuesday** = 7 days out, not today. "this Tuesday" handles the same-week case, so "next Tuesday" staying strictly-future gives the two phrases distinct, non-overlapping meanings.
- **"last Tuesday" said on a Tuesday** = 7 days ago (strictly-past, symmetric to "next").
- **"March 5th" without a year** = next occurrence. Future-leaning: today's date returns today; a past date this year returns next year's occurrence. (The alternative — "nearest in time, past or future" — would mean "March 5th" said on March 6 returns yesterday, which is counterintuitive for the typical "next birthday"/"next deadline" use case.)
- **"5 days" without "in" or "ago"** = throws. Past or future? parseRelative refuses to guess — same contract as `parse()`'s strict mode. Per-language equivalent: bare `"3 días"` / `"3 jours"` / `"3 Tage"` all throw with a localized error message pointing at the disambiguation options (`"en 3 días"`/`"hace 3 días"`, etc.).

**Cross-language consistency on the same-day-of-week ambiguity**: the "next X on X = 7 days out, not today" convention holds across all four supported languages (en/es/fr/de). The natural phrasing in each language (`"next Tuesday"` / `"el próximo martes"` / `"mardi prochain"` / `"nächsten Dienstag"`) all resolve to strictly-future-next-week when said on the named weekday. This is a deliberate cross-language convention, not an accident of implementation — if a future language grammar's natural phrasing for "next X" resolves differently by convention, document it in that grammar's section and the README here.

Throws a descriptive error for any phrase it doesn't recognize, naming the supported categories in the message. Accepts `PlainDate`, `PlainDateTime`, or `ZonedDateTime` as the reference (needs `dayOfWeek` to compute weekday offsets). Throws on `PlainTime`.

## Subpath imports

Each capability area is also available as a subpath import, if you only need a slice and want a smaller bundle:

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

## API reference

The core surface stays zero-runtime-dependency; everything below is exported from the main entry point (and, per the subpath list above, from its matching slice).

### Formatting

- `format(temporal, formatStr, options?)` — format a Temporal value using a date-fns-style token string.
- `formatToParts(temporal, formatStr, options?)` — same, but returns an array of `{type, value, token?}` parts.
- `compileFormat(formatStr)` — pre-compile a format string for repeated use.

### Parsing

- `parse(formatStr, input, options?)` — strict parse; throws on ambiguity, contradiction, or invalid date.
- `safeParse(formatStr, input, options?)` — returns `{ ok: true, value }` or `{ ok: false, error: TemporalFmtError }`.
- `tryParse(formatStr, input, options?)` — best-effort; returns the value or `undefined`.
- `parseToParts(formatStr, input, options?)` — return matched token groups with positions.
- `compileParser(formatStr, options?)` — pre-compile a parser.

### Introspection

- `analyzeFormat(formatStr)` — returns `{ tokens, requiredFields, compatibleTypes, parseable, localeSensitive, calendarSensitive, timezoneSensitive, ambiguous, roundTripSafe, warnings }`.
- `explainFormat(formatStr)` — human-readable rendering of `analyzeFormat`.
- `tokenInfo(name)` — metadata for one token, or undefined.
- `listTokens()` — every recognized token with metadata.
- `isValidFormat(formatStr)` — true iff tokenize() accepts the string.
- `validateFormat(formatStr)` — throws on invalid; returns the analysis.

### Type guards

- `isTemporal(value)`, `isInstant(value)`, `isPlainDate(value)`, `isPlainTime(value)`, `isPlainDateTime(value)`, `isZonedDateTime(value)`, `isPlainYearMonth(value)`, `isPlainMonthDay(value)`, `isDuration(value)`.
- `assertX(value)` variants throw descriptively on type mismatch.

### Typed errors

- `TemporalFmtError` — base class with `code`, `input`, `format`, `token`, `position`, `expected`, `actual`, `reason`.
- Subclasses: `FormatSyntaxError`, `UnknownTokenError`, `ParseMismatchError`, `InvalidDateError`, `InvalidTimeError`, `InvalidOffsetError`, `InvalidTimeZoneError`, `InvalidCalendarError`, `AmbiguousInputError`, `InvalidLocaleError`, `InvalidDurationError`.
- See [Error reference](#error-reference) below for what triggers each one.

### Duration APIs

- `formatDuration(duration, formatStr, options?)` — duration-specific token grammar (see [Duration formatting](#duration-formatting) above).
- `formatDurationToParts(duration, formatStr, options?)` — same, as parts.
- `parseDuration(input, formatStr, options?)` — inverse of `formatDuration`.
- `parseISODuration(input)` — parse `P[n]Y[n]M[n]W[n]DT[n]H[n]M[n]S` ISO 8601 duration.
- `formatISODuration(duration)` — inverse of `parseISODuration`.
- `balanceDuration(duration)` — normalize fields to their natural ranges.
- `roundDuration(duration, options)` — round to a unit; throws for calendar-bound units without a relativeTo.
- `totalDuration(duration, unit)` — sum absolute fields into the target unit.
- `compareDuration(a, b)` — `-1/0/1` by total absolute length.
- `addDuration(a, b)`, `subtractDuration(a, b)` — field-by-field sum/difference.

### Relative time

- `formatDistance(date1, date2, options?)` — "3 days ago", "in 2 hours" (see [Relative time](#relative-time-formatdistance) above).
- `formatRelative(date1, date2, options?)` — calendar-relative ("yesterday", "tomorrow", "last week").
- `formatRelativeToNow(date, options?)` — `formatRelative(date, now)`.

### Calendar utilities

- `daysInMonth(value)`, `daysInYear(value)`, `monthsInYear(value)`.
- `isLeapYear(value)`, `isLeapMonth(value)` (Gregorian returns false).
- `dayOfYear(value)`, `weekOfYear(value)`, `weekYear(value)`.
- `getQuarter(value)`, `getMonth(value)`, `getWeekday(value)`.
- `startOf(value, unit)`, `endOf(value, unit)` — returns a new field bag with finer fields zeroed/extended.
- See [Calendar guide](#calendar-guide) below for Gregorian-only caveats.

### Date arithmetic

- `add(value, amount, unit)`, `subtract(value, amount, unit)`.
- Per-unit wrappers: `addYears`, `addMonths`, `addWeeks`, `addDays`, `addHours`, `addMinutes`, `addSeconds`, `addMilliseconds` (and `subtract*` variants).
- `difference(a, b, unit)` — integer count of unit boundaries.
- Per-unit wrappers: `differenceInYears`, …, `differenceInMilliseconds`.

### Rounding

- `round(value, options)` — round to a unit with a mode.
- `floor(value, unit, increment?)`, `ceil(value, unit, increment?)`, `truncate(value, unit, increment?)`.

### Comparison

- `compare(a, b)` → `-1/0/1`.
- `isEqual`, `isBefore`, `isAfter`.
- `min(values)`, `max(values)`, `clamp(value, lo, hi)`, `isBetween(value, lo, hi)`.
- Semantic helpers: `isToday`, `isTomorrow`, `isYesterday`, `isSameDay`, `isSameWeek`, `isSameMonth`, `isSameQuarter`, `isSameYear`, `isWeekend`, `isWeekday`.

### Intervals

- `interval(start, end, bounds?)` — bounds: `'closed'` | `'open'` | `'half-open-start'` | `'half-open-end'`.
- `intervalContains(iv, value)`, `overlaps(a, b)`, `intersects(a, b)`, `intervalIsBefore(a, b)`, `intervalIsAfter(a, b)`.
- `intersection(a, b)`, `union(a, b)`, `intervalDifference(a, b)`, `intervalSubtract(a, b)`.
- `mergeIntervals(intervals)` — combine overlapping.
- `splitInterval(iv, n)` — N equal sub-intervals.
- `formatRange(iv, formatStr, options?)`, `formatRangeToParts(iv, formatStr, options?)` — uses `Intl.DateTimeFormat.formatRange` when available.

### Timezone subsystem

- `resolveZoned(fields, timeZone, options?)` — construct a `ZonedDateTime` with disambiguation mode (`compatible` | `earlier` | `later` | `reject`).
- `getTimeZone(value)`, `getOffset(value)`, `getOffsetNanoseconds(value)`.
- `isDST(value)` — heuristic, compares current offset to January offset.
- `getNextTransition(value)`, `getPreviousTransition(value)`, `getTransitions(start, end)`.
- `possibleInstantsFor(fields, timeZone)` — returns the list of possible instants (0 for gaps, 2 for overlaps, 1 otherwise).

### Recurrence

- `recurrence(start, rule)` — returns an iterator with `next()` and `previous()`.
- `take(iter, n)` — collect N occurrences.
- `skip(iter, n)` — skip N occurrences.
- `between(start, rule, rangeStart, rangeEnd)` — occurrences in range.
- `parseRRule(str)`, `formatRRule(rule)` — RFC 5545 interop.

### Business calendar

- `createBusinessCalendar(options?)` — customize weekend, holidays, working hours, half days.
- `isBusinessDay(cal, value)`, `addBusinessDays(cal, value, n)`, `subtractBusinessDays(cal, value, n)`.
- `differenceInBusinessDays(cal, a, b)`, `nextBusinessDay(cal, value)`, `previousBusinessDay(cal, value)`.

### Holiday framework

- `createHolidayCalendar(specs)` — fixed-date and computed holidays.
- `isHoliday(cal, value)`, `nextHoliday(cal, value)`, `previousHoliday(cal, value)`, `holidaysBetween(cal, start, end)`.

### Serialization

- `parseISO(input)`, `formatISO(value)`.
- `parseRFC3339(input)`, `formatRFC3339(value)`.
- `parseRFC2822(input)`, `formatRFC2822(value)`.
- `parseHTTPDate(input)`, `formatHTTPDate(value)`.
- `parseSQL(input)`, `formatSQL(value)`.
- Epoch: `fromUnixSeconds`, `fromUnixMilliseconds`, `fromUnixMicroseconds`, `fromUnixNanoseconds`, `toUnixSeconds`, `toUnixMilliseconds`, `toUnixMicroseconds`, `toUnixNanoseconds`.

### Locale

- `registerLocale(locale, vocab)` — register extended vocabulary (months, weekdays, day periods, quarters, eras, ordinals, duration units, relative-time language).
- `getLocale(locale)`, `hasLocale(locale)`.
- `registerLocaleVocab(locale, vocab)` — base vocabulary (months/weekdays/day periods) only. See [Locale guide](#locale-guide) below.

### Numbering systems

- `convertDigits(s, system)` — ASCII digits to a locale's native digits.
- `convertDigitsToAscii(s, system)` — inverse.
- `SUPPORTED_NUMBERING_SYSTEMS` — set of supported system names.

### Configuration

- `createConfig(overrides?)` — frozen config with locale/calendar/timezone/numberingSystem/weekRules/rounding/disambiguation/overflow/parseLenient/durationShowZeroValues.
- `mergeWithConfig(config, perCall)` — fold config defaults into per-call options.

### Extensibility

- `createFormatter(options?)` — create a formatter with custom tokens (overrides built-ins of the same name).

### Natural-language parsing

- `parseRelative(input, reference, options?)` — built-in EN/ES/FR/DE grammars (see [parseRelative](#parserelative-natural-language-date-parsing) above).
- `registerRelativeGrammar(grammar)` — add a new language.

### IDE tooling data

- `getAutocompleteData()` — token autocomplete entries with family grouping.
- `getHoverDocs()` — per-token hover documentation.
- `getInlineDiagnostics(formatStr)` — diagnostics with position + suggested fixes.
- `previewFormat(formatStr, sample?)` — live preview string.
- `getDocUrl(tokenName)` — anchor link into this README's [Token reference](#token-reference) section. (Pre-consolidation, this pointed into a standalone `docs/` folder — if you're on an older version, update accordingly.)
- `DAYJS_TO_TEMPORAL_FMT`, `DATE_FNS_TO_TEMPORAL_FMT` — token conversion hints.

### CLI

Run via `npm run cli` or `node scripts/cli.mjs`:

```sh
temporal-fmt format "2026-08-04T15:45:30" "yyyy-MM-dd HH:mm:ss"
temporal-fmt parse "yyyy-MM-dd" "2026-08-04"
temporal-fmt inspect "MMMM d, yyyy 'at' h:mm a"
temporal-fmt validate "yyyy-MM-dd HH:mm:ss"
temporal-fmt translate dayjs "YYYY-MM-DD HH:mm:ss"
```

## Token reference

Beyond the format/parse/example columns in the [Tokens](#tokens) table above, every token carries structured metadata — round-trip safety, locale sensitivity, which Temporal types it works on — accessible via `tokenInfo(name)` or `TOKEN_METADATA`.

### Round-trip safety by family

| Family | Tokens | Round-trip safe | Notes |
|--------|--------|------------------|-------|
| Year | `yyyy` | yes | Preserves sign for BCE. |
| Year | `yy` | no | Century is lost — `parse` re-derives it via the `00–68`/`69–99` rule documented above, which isn't guaranteed to match the original century. |
| Month | `MMMM`, `MMM`, `MM`, `M` | yes | Numeric and name forms all round-trip; only `MMMM`/`MMM` are locale-sensitive. |
| Day | `dd`, `d` | yes | |
| Day | `do` | no | Format-only — the "st"/"nd"/"rd"/"th" suffix isn't parseable back out. |
| Weekday | `EEEE`, `EEE` | yes | Cross-checked against the parsed date, so a mismatched weekday throws rather than silently round-tripping wrong. |
| ISO week | `ww`, `RRRR` | n/a | Format-only — a week number alone can't reconstruct a specific date. |

### Format-only tokens (parse rejects)

`format()` accepts these; `parse()` throws a clear, descriptive error if you try to use them for parsing:

- `do` — ordinal suffix isn't structurally distinguishable from adjacent literal text.
- `ww`, `RRRR` — week alone can't reconstruct a date without a disambiguator (a weekday, or the year+month+day).

Run `analyzeFormat(formatStr).warnings` to catch these statically before you hit the runtime error. The ESLint plugin (see [Related tools](#related-tools)) surfaces the same check as a `formatOnlyToken` diagnostic.

### Inspecting metadata at runtime

```js
import { TOKEN_METADATA, tokenInfo, listTokens } from 'temporal-fmt';

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
```

This metadata is the same source of truth the ESLint plugin and the codemod consume, so `tokenInfo()`/`listTokens()` output won't drift from what those tools actually enforce.

## Parsing: additional detail

The [Parsing a string](#parsing-a-string) section above covers the core contract. A few more things that come up in practice:

**Return type depends on which tokens are present:**

| Tokens present | Result type |
|---|---|
| year + month + day only | `Temporal.PlainDate` |
| time fields only (hour, minute, second) | `Temporal.PlainTime` |
| full date + time, no zone | `Temporal.PlainDateTime` |
| any of the above + `zzz` or an offset token | `Temporal.ZonedDateTime` |

**`safeParse` and `tryParse`** — for input you don't trust and don't want to wrap in try/catch:

```js
import { safeParse, tryParse } from 'temporal-fmt';

const r = safeParse('yyyy-MM-dd', userInput);
if (r.ok) {
  console.log(r.value.toString());
} else {
  console.log(r.error.code); // 'INVALID_DATE' / 'PARSE_MISMATCH' / ...
}

const v = tryParse('yyyy-MM-dd', userInput);
if (v) { /* ... */ }
```

**`parseToParts`** returns matched token groups and positions before any Temporal value gets constructed — useful for building a custom result type or doing your own cross-checks:

```js
parseToParts('yyyy-MM-dd HH:mm', '2026-08-04 15:45');
// → [
//   { token: 'yyyy', raw: '2026', position: 0 },
//   { token: 'MM', raw: '08', position: 5 },
//   { token: 'dd', raw: '04', position: 8 },
//   { token: 'HH', raw: '15', position: 11 },
//   { token: 'mm', raw: '45', position: 14 },
// ]
```

**Calendar-aware parsing** — a locale with a `-u-ca-` extension parses into that calendar directly:

```js
parse('yyyy-MM-dd', '5784-05-10', { locale: 'en-u-ca-hebrew' });
// → Temporal.PlainDate with calendarId 'hebrew'
```

## Error reference

Every error thrown by `temporal-fmt` is either a plain `Error` with a descriptive message (the legacy throw sites in `parse()` and `format()`) or a `TemporalFmtError` subclass (the typed-error surface exposed via `safeParse()` and `tryParse()`).

### Typed error classes

All inherit from `TemporalFmtError`, which carries structured fields: `code`, `input`, `format`, `token`, `position`, `expected`, `actual`, `reason`.

| Class | Code | When it fires |
|-------|------|---------------|
| `FormatSyntaxError` | `FORMAT_SYNTAX_ERROR` | Unterminated quote, format string exceeds length cap, other syntax issues. |
| `UnknownTokenError` | `UNKNOWN_TOKEN` | An unrecognized letter run was encountered. |
| `ParseMismatchError` | `PARSE_MISMATCH` | Input doesn't match the format's shape; generic catch-all. |
| `InvalidDateError` | `INVALID_DATE` | Date is structurally valid but doesn't exist (Feb 30), weekday/quarter contradicts date, etc. |
| `InvalidTimeError` | `INVALID_TIME` | Time is out of range (hour 25, etc.). |
| `InvalidOffsetError` | `INVALID_OFFSET` | Offset is malformed or out of IANA range (-12:00 to +14:00). |
| `InvalidTimeZoneError` | `INVALID_TIME_ZONE` | Time zone isn't a recognized IANA name or fixed offset. |
| `InvalidCalendarError` | `INVALID_CALENDAR` | Calendar isn't supported. |
| `AmbiguousInputError` | `AMBIGUOUS_INPUT` | Input has more than one valid reading (e.g. "Md" against "121"). |
| `InvalidLocaleError` | `INVALID_LOCALE` | Locale isn't a valid BCP-47 tag, or the numbering system isn't supported. |
| `InvalidDurationError` | `INVALID_DURATION` | Duration string doesn't match the ISO 8601 grammar, or a field value is non-finite. |

`safeParse()` classifies the underlying throw into the matching `TemporalFmtError` subclass internally — see `src/errors.ts` if you need the exact classification logic.

### Common error patterns

**"no valid pattern matches the format string and input shape"** — the input doesn't match the format string at all. Usually a missing separator, wrong digit count for a fixed-width token, or a `zzz` token that captured something that isn't a real IANA zone id.

**"token X requires Y, which this Temporal object doesn't have"** — you used a token that reads a field the value doesn't carry. Common case: `format(plainDate, 'HH:mm')` — `PlainDate` has no hour field. Switch to `PlainDateTime` or use a date-only format string.

**"format string mixes 'yyyy' and 'yy' year representations"** — don't mix the two year tokens in the same format string. Pick one.

**"format string has an incomplete date — year, month, and day tokens must all be present together"** — a partial date (year-only, say) isn't constructible as a Temporal value. Add the missing tokens, or use a different format.

**"X is ambiguous — N different ways to read tokens Y are all individually valid"** — adjacent unpadded numeric tokens with no separator (e.g. `Md` against `121`) can split multiple ways. Add a separator (`M-d`), use padded forms (`MM-dd`), or opt into `{ lenient: true }`.

**"offset hours X in 'Y' out of range (max 14 — Kiritimati, Line Islands is +14:00)"** — the offset's hour component exceeds the IANA-supported range of -12 to +14.

**"X has no such wall-clock time on this date — it falls in a DST gap"** — the input describes a wall-clock time that doesn't exist (a spring-forward gap). Pick a different time, or pass `{ disambiguation: 'compatible' }` to let Temporal choose an instant.

**"has both a 'zzz' zone (X) and an offset token (Y), but the zone's actual offset at this date/time is Z, not Y"** — the format string asks for both a zone name and an explicit offset, and the parsed offset disagrees with the zone's actual offset at that instant. Keep them consistent in the input.

## Locale guide

The [Locale support](#locale-support) section above covers the common case — passing a `locale` option to `format`/`parse`. This section covers registering your own vocabulary.

`temporal-fmt` uses `Intl.DateTimeFormat` as the default source for locale-aware token output (`MMMM`, `MMM`, `EEEE`, `EEE`, `a`). For locales Intl doesn't cover well — or where you want different vocabulary — register a custom one.

**`registerLocaleVocab` (base)** — months, weekdays, and day periods only:

```js
import { registerLocaleVocab } from 'temporal-fmt';

registerLocaleVocab('en-u-ca-hebrew-leap', {
  monthLong: ['Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul', 'Tishrei', 'Marcheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II'],
  monthShort: ['Nis', 'Iyy', 'Siv', 'Tam', 'Av', 'Elu', 'Tish', 'Chesh', 'Kis', 'Tev', 'Shv', 'Ad1', 'Ad2'],
  weekdayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  dayPeriod: ['AM', 'PM'],
});
```

After registration, `format()` and `parse()` use the registered vocab for that locale key.

**`registerLocale` (extended)** — for vocabulary beyond months/weekdays/day-periods: quarters, eras, ordinals, duration units, relative-time language:

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

**Locale fallback** — `getLocale(locale)` returns the extended vocab if one's registered, otherwise the Intl-derived base vocab. Fallback is deterministic: the canonical locale key (lowercased via `Intl.Locale`) is looked up, and Intl is used if there's no entry.

**Deterministic output** — all locale options are per-call. `registerLocaleVocab` and `registerLocale` are the only global mutation points, and they invalidate the cache entry for the affected locale so subsequent calls pick up the new vocab immediately. Built-in behavior stays deterministic regardless of what's registered elsewhere in your app.

## Calendar guide

`temporal-fmt`'s calendar utilities operate on Temporal's calendar-aware types. By default, the helpers assume the `iso8601` (Gregorian) calendar — that's what `TemporalLike` fields carry for the overwhelming majority of callers.

**Gregorian-only helpers (documented limitation).** The following use Gregorian arithmetic and will produce wrong results on non-Gregorian calendars (Hebrew, Islamic, etc.):

- `daysInMonth`, `daysInYear`, `isLeapYear` — Gregorian month lengths and leap year rules.
- `monthsInYear` — returns 12 unconditionally.
- `isLeapMonth` — returns false unconditionally.
- `dayOfYear` — Gregorian day-of-year.
- `weekOfYear`, `weekYear` — ISO 8601 week numbering.

For non-Gregorian calendars, pass the value to `Temporal.PlainDate` directly and use its own calendar-aware methods instead:

```js
const pd = Temporal.PlainDate.from('5784-05-10[u-ca=hebrew]');
console.log(pd.daysInMonth);  // 30 (Sivan)
console.log(pd.monthsInYear); // 13 (leap year)
```

**Locale-aware tokens ARE calendar-aware**, unlike the helpers above. `MMMM`, `MMM`, `EEEE`, `EEE`, `a` go through `Intl.DateTimeFormat`, which respects the value's `calendarId`:

```js
const hebrewDate = Temporal.PlainDate.from('5784-05-10[u-ca=hebrew]');
format(hebrewDate, 'MMMM d, yyyy');
// → "Sivan 10, 5784"
```

Numeric tokens (`yyyy`, `MM`, `dd`) read straight off the object's ISO fields — calendar-specific in the sense that the underlying Temporal value carries calendar-specific field values, but the formatting logic itself is calendar-agnostic.

**Custom calendar vocabulary.** For calendars Intl doesn't cover (Hebrew leap months, for instance), register one via `registerLocaleVocab` — see [Locale guide](#locale-guide) above for the full vocab surface and validation rules.

## Migration guide

`temporal-fmt` is designed to make migration from Day.js and date-fns straightforward. The token grammar is largely compatible, and the codemod automates the bulk of the work.

### Automated migration

The `temporal-fmt-codemod` package includes AST transforms for Day.js and date-fns:

```sh
npx temporal-fmt-codemod --source=dayjs path/to/src
npx temporal-fmt-codemod --source=date-fns path/to/src
```

It's conservative: it only transforms call sites where the format string is a plain string literal, and only rewrites tokens with known-safe mappings. Unmappable tokens leave a `TODO(temporal-fmt-codemod)` comment.

For a one-off translation without running the full codemod, use the CLI:

```sh
npx temporal-fmt translate dayjs "YYYY-MM-DD HH:mm:ss"
# → "yyyy-MM-dd HH:mm:ss"
```

### Manual migration: token mapping

Most date-fns/Day.js tokens are identical to `temporal-fmt` tokens. The differences:

| Source (Day.js / date-fns) | temporal-fmt | Notes |
|---|---|---|
| `YYYY` | `yyyy` | Lowercase in temporal-fmt |
| `YY` | `yy` | Same |
| `MMMM`, `MMM`, `MM`, `M` | same | Identical |
| `DD`, `D` | `dd`, `d` | Lowercase in temporal-fmt |
| `dddd` | `EEEE` | Long weekday |
| `ddd` | `EEE` | Short weekday |
| `HH`, `H`, `mm`, `m`, `ss`, `s` | same | Identical |
| `A`, `a` | `a` | Always lowercase in temporal-fmt |
| `Z` | `XXX` | Numeric UTC offset with colon, Z for UTC |
| `ZZ` | `XX` | Numeric UTC offset no colon |
| `X` | (not supported) | Unix timestamp — convert via `fromUnixSeconds` instead |
| `x` | (not supported) | Unix ms timestamp — convert via `fromUnixMilliseconds` |
| `P` | (not supported) | Localized long format — write the format string explicitly |

### Manual migration: API mapping

| Day.js | date-fns | temporal-fmt |
|---|---|---|
| `dayjs(str).format(fmt)` | `format(date, fmt)` | `format(temporal, fmt)` |
| `dayjs(str)` (parse) | `parseISO(str)` | `parseISO(str)` |
| `dayjs().add(n, 'day')` | `addDays(date, n)` | `add(date, n, 'days')` or `addDays(date, n)` |
| `dayjs().diff(other, 'day')` | `differenceInDays(a, b)` | `differenceInDays(a, b)` |
| `dayjs().isBefore(other)` | `isBefore(date, other)` | `isBefore(date, other)` |
| `dayjs().isAfter(other)` | `isAfter(date, other)` | `isAfter(date, other)` |
| `dayjs.duration(...)` | `intervalToDuration(...)` | `Temporal.Duration.from(...)` |
| `dayjs().isToday()` | `isToday(date)` | `isToday(date)` |
| `dayjs().isYesterday()` | `isYesterday(date)` | `isYesterday(date)` |
| `dayjs().isTomorrow()` | `isTomorrow(date)` | `isTomorrow(date)` |

### Key behavioral differences

1. **Strict parsing.** `temporal-fmt` throws on ambiguous input by default. Day.js silently picks one reading. For ambiguous glued numeric tokens (`Md` against `121`, say), either add separators or use `{ lenient: true }`.
2. **Cross-field validation.** `temporal-fmt` cross-checks weekday, quarter, and offset against the parsed date. Day.js doesn't — a `Monday` label that disagrees with the actual date will throw here.
3. **No silent defaults.** `temporal-fmt` doesn't fall back to "now" when input is missing. Pass an explicit value.
4. **Type-preserving.** `format(plainDate, 'HH:mm')` throws — `PlainDate` has no hour field. Day.js silently uses 0. Pass a `PlainDateTime`, or use a date-only format.
5. **Temporal-native.** The library operates on Temporal types (`PlainDate`, `PlainDateTime`, `ZonedDateTime`, etc.), not on JS `Date`. Convert at the boundary:

```js
import { Temporal } from 'temporal-polyfill';
const pd = Temporal.PlainDate.from(jsDate.toISOString().slice(0, 10));
const formatted = format(pd, 'yyyy-MM-dd');
```

### Common migration patterns

**CSV/log timestamp parsing:**

```js
// Before (Day.js)
const d = dayjs(line, 'YYYY-MM-DD HH:mm:ss');
// After
const d = parse('yyyy-MM-dd HH:mm:ss', line);
```

**Locale-aware formatting:**

```js
// Before
dayjs(date).locale('fr').format('MMMM D, YYYY');
// After
format(date, 'MMMM d, yyyy', { locale: 'fr-FR' });
// → "août 4, 2026"
```

**Relative time:**

```js
// Before
dayjs(date).fromNow(); // "3 days ago"
// After
formatRelativeToNow(date); // "3 days ago"
```

**Date arithmetic:**

```js
// Before
dayjs(date).add(7, 'day');
// After
add(date, 7, 'days');
// or: addDays(date, 7)
```

### Things that don't migrate cleanly

- Day.js's `dayjs.extend(customParseFormat)` plugin behavior — `temporal-fmt`'s parse is strict, the plugin is lenient. Audit any callers relying on lenient parsing.
- Day.js's mutable locale registration (`dayjs.locale('fr')`) — `temporal-fmt` uses per-call `locale` options, no global mutation.
- date-fns's `format` with a locale object parameter — `temporal-fmt` uses BCP-47 strings, not locale objects.
- Timezone-aware formatting via `dayjs-timezone` — use `Temporal.ZonedDateTime` and the `zzz`/`XXX` tokens instead.

### Running both during migration

Both libraries can coexist. Wrap migration in a feature flag:

```js
import dayjs from 'dayjs';
import { format as fmtTemporal } from 'temporal-fmt';

function formatDate(date, formatStr, opts) {
  if (opts?.useTemporal) {
    return fmtTemporal(date, formatStr, opts);
  }
  return dayjs(date).format(formatStr);
}
```

Run the codemod per-file when ready, then drop the wrapper.

## Other guides

A few narrower topics — business calendars, intervals, recurrence, durations, timezones, serialization, performance, security, and the ESLint plugin/codemod internals — don't have write-ups of their own yet beyond what's covered above and in the [API reference](#api-reference). The test files (`test/*.test.js`) are the best source for concrete usage of any of these; each one is effectively a usage guide for its corresponding module.

## Known limitations

- Numeral systems are always Western digits — see [Locale support](#locale-support).
- Locale-aware tokens need Node 20+, native or polyfilled. Untested below Node 20.
- As mentioned above, you must [provide a Temporal implementation](#providing-temporal)
  if it is not natively provided (Node 26+)
- On engines with native `Temporal` support (Node 26+), locale-aware tokens
  (`MMMM`/`MMM`/`EEEE`/`EEE`) can render the wrong month or weekday for dates
  before around 1582 CE. This is a known ICU limitation, not a bug in this
  library: ICU's default Gregorian calendar cutover is October 15, 1582, so
  `Intl.DateTimeFormat.formatToParts()` silently reinterprets earlier dates
  under the Julian calendar, even though `Temporal` itself uses a proleptic
  Gregorian calendar throughout — see
  [tc39/ecma402#1003](https://github.com/tc39/ecma402/issues/1003). Numeric
  tokens (`yyyy`/`MM`/`dd`) never go through `Intl` and aren't affected.
- Gluing two unpadded numeric tokens with no separator between them (e.g.
  `Md`, `dM`, `Hm`) is ambiguous for some inputs, and `parse()` throws rather
  than guessing. `"121"` against `yyyy-Md` could mean month 1/day 21 or month
  12/day 1 — both are valid, so there's no single correct reading to fall
  back to. Unambiguous inputs against the same format string still parse
  normally (`"85"` against `yyyy-Md` only has one valid split). If you need
  glued numeric fields, either zero-pad them (`MM`/`dd`) or put a separator
  between them; that removes the ambiguity entirely.

  Note: `Md` (or `dM`/`Hm`) alone, with no `yyyy`, always throws —
  `parse()` requires year, month, and day together to build a date, so a
  bare `Md` format string is incomplete regardless of ambiguity. The
  examples above use `yyyy-Md` for exactly this reason.

- Offset tokens (`X`/`XX`/`XXX`/`x`/`xx`/`xxx`) read `ZonedDateTime.prototype.offset`, which Temporal exposes as a `+HH:MM` string for any modern date. Historical LMT (Local Mean Time) offsets with seconds — e.g. Europe/London before 1847, when it was `+00:01:15` — aren't reachable through that field, and the regex shapes the offset tokens accept don't include a seconds group either. If you need to round-trip a sub-minute historical offset, you're outside what the offset tokens can express; construct the `ZonedDateTime` directly.

  Range is bounded to `-12:00` through `+14:00`, the IANA-supported range (Baker Island at `-12:00`, Kiritimati at `+14:00`). `+14:01` and `-12:01` throw with a descriptive error even though each piece alone is in bounds — the overall offset exceeds the maximum any real zone uses.

## Dev notes

Building requires TypeScript 7.0.2+ but `.d.ts` generation runs as a separate
`tsc` pass, not through tsup. tsup's dts step bundles types via
`rollup-plugin-dts`, which calls into TypeScript's compiler API — the API
isn't stable yet on 7.x ([targeted for
7.1](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)),
so it crashes on 7.0.2. `tsup.config.ts` sets `dts: false` and `build` runs
`tsup && tsc --declaration --emitDeclarationOnly` instead. One side effect:
`dist/` now has one `.d.ts` per source file instead of a single rolled-up
`index.d.ts` — same exported API, different file layout. Revert to `dts:
true` once tsup/rollup-plugin-dts catch up.

Tests pull from `temporal-polyfill/full`, not the slim `temporal-polyfill` —
the Hebrew-calendar test needs the full build's calendar data, and the slim
one won't cut it. Locale-aware tests pass on Node 20+ regardless of whether
`Temporal` is native or polyfilled — on native (Node 26+), formatting goes
through `Intl.DateTimeFormat` directly; on the polyfill, it falls back to
`Temporal.prototype.toLocaleString()`, which the polyfill implements itself.
`parse.test.js` configures Temporal via `setTemporal()` rather than mutating
`globalThis.Temporal` directly.

Run `npm run test:all`, not just `npm test`. `npm test` only runs the
`node:test` suite in `test/*.test.js` — hand-picked, fuzz, adversarial, and
perf cases that exercise the public API end to end. It doesn't touch
`vitest/`, which unit-tests internals like `enumerateValidSplits()`
directly. That function resolves ambiguous glued numeric runs (does `"112"`
against `['M', 'd']` mean month 1/day 12, or month 11/day 2?), and a bug
in its edge cases — an empty token list, a range-boundary off-by-one — can
easily dodge every `parse()` example in the main suite without ever being
the specific input one of them happens to use. `test:all` also runs the
type tests (`test:types`), so it's the only single command that actually
covers everything. CI runs `test:all` for this reason; running plain `npm
test` locally will pass even with a broken `vitest/` suite.

## Related tools

- [`eslint-plugin-temporal-fmt`](https://www.npmjs.com/package/eslint-plugin-temporal-fmt) — lints format strings for common mistakes (e.g. `hh` without `a`)
- [`temporal-fmt-codemod`](https://www.npmjs.com/package/temporal-fmt-codemod) — one-time migration tool that rewrites dayjs/date-fns calls to temporal-fmt

## License

MIT