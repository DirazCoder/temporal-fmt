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

`do` is format-only (parse() rejects it — the "st"/"nd"/"rd"/"th" suffix isn't structurally distinguishable from adjacent literal text in a parse context). The English-only suffix rule is on purpose — locale-aware ordinals are out of scope; `Intl.DateTimeFormat` has no part type for ordinals, and the rest of this library routes locale-specific names through it.

`Q` and `QQQ` both format and parse. On parse, they cross-check against any month/date tokens present in the same format string, the same way `EEEE` cross-checks weekday against date — throw if they disagree.

`ww` and `RRRR` are format-only. Parsing "ww"/"RRRR" back into a date requires resolving an ISO week + a weekday to a specific date, which is a different parsing surface than the token-based `parse()` here.

`RRRR` is the **ISO week-numbering year**, not the calendar year — they can differ at year boundaries. Dec 29-31 often belong to week 1 of the *next* year; Jan 1-3 often belong to week 52/53 of the *previous* year. Examples: `format(PlainDate.from('2026-12-31'), 'ww RRRR')` → `"53 2026"`; `format(PlainDate.from('2027-01-01'), 'ww RRRR')` → `"53 2026"` (Friday in ISO year 2026's week 53); `format(PlainDate.from('2027-01-04'), 'ww RRRR')` → `"01 2027"` (Monday starting ISO week 1 of 2027).

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

ojgewijgipejgiejwjpgiejig

Flipped the hell out, yanked the wrong build by mistake, republished it clean, and now npm's anti-malware lockout thinks I'm a supply chain attacker for the next 24 hours — yes, I'm unpatient crap too, so clone it and build it yourself, it's not some multi-hour C++ compile, just a quick build. This library's unaffected btw, bcz I actually didn't screw this one up hahaha, ha, ha ....... sorry nobody laughed.

(will pull this line once it's back up)


- [`eslint-plugin-temporal-fmt`](https://github.com/DirazCoder/eslint-plugin-temporal-fmt) — lints format strings for common mistakes (e.g. `hh` without `a`)
- [`temporal-fmt-codemod`](https://github.com/DirazCoder/temporal-fmt-codemod) — one-time migration tool that rewrites dayjs/date-fns calls to temporal-fmt

## License

MIT