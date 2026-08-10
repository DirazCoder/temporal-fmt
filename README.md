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
| SSS   | milliseconds       | 000     |
| a     | AM/PM              | PM      |
| zzz   | IANA time zone id  | America/New_York |

Try to use a token your input type doesn't support — `HH` on a `PlainDate`,
say — and you'll get a real error telling you so, not a silent `undefined`
sitting in your output waiting to confuse someone in three weeks.

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
  than guessing. `"121"` against `Md` could mean month 1/day 21 or month
  12/day 1 — both are valid, so there's no single correct reading to fall
  back to. Unambiguous inputs against the same format string still parse
  normally (`"85"` against `Md` only has one valid split). If you need glued
  numeric fields, either zero-pad them (`MM`/`dd`) or put a separator between
  them; that removes the ambiguity entirely.

## Dev notes

`tsconfig.json` sets `ignoreDeprecations: "6.0"` to work around a tsup bug
([tsup#1388](https://github.com/egoist/tsup/issues/1388)/[#1389](https://github.com/egoist/tsup/issues/1389)). tsup's dts build step quietly injects a deprecated
`baseUrl`, and TypeScript 6+ hard-errors on it. Workaround, not a fix — drop
it the moment tsup ships a real one upstream.

Tests pull from `temporal-polyfill/full`, not the slim `temporal-polyfill` —
the Hebrew-calendar test needs the full build's calendar data, and the slim
one won't cut it. Locale-aware tests pass on Node 20+ regardless of whether
`Temporal` is native or polyfilled — on native (Node 26+), formatting goes
through `Intl.DateTimeFormat` directly; on the polyfill, it falls back to
`Temporal.prototype.toLocaleString()`, which the polyfill implements itself.
`parse.test.js` configures Temporal via `setTemporal()` rather than mutating
`globalThis.Temporal` directly.

## License

MIT
