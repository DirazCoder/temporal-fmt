# temporal-fmt

Format `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `ZonedDateTime` objects
using date-fns-style token strings.

Node 26 shipped native `Temporal` — and then pointedly left out a custom-string
formatter. TC39's take: use `Intl.DateTimeFormat` and leave string-token syntax
to userland. Fair enough, but if you've spent years typing `'yyyy-MM-dd'` out of
muscle memory from date-fns, moment, or dayjs, that's a rough adjustment. This
library exists so you don't have to make it.

Zero dependencies. You'll need a global `Temporal` — native on Node 26+, or
bring your own polyfill (`temporal-polyfill` works fine).

## Install

```sh
npm install temporal-fmt
```

[View on npm](https://www.npmjs.com/package/temporal-fmt)

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

**Numeric fields (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `SSS`) always come out
in Western (0-9) digits, no matter what locale you pass.** On purpose. Most
things reading this output back in — logs, APIs, filenames — want boring,
predictable ASCII digits, and locale-native numeral systems like Arabic-Indic
or Devanagari don't play nicely with this library's zero-padding logic anyway.
Need localized digits? Run the numeric pieces through `Intl.NumberFormat`
yourself.

**One more catch: this needs native `Intl`/`Temporal` interop to work.** On
Node 26+ with native `Temporal`, you're fine. On older Node with a userland
polyfill, locale-aware tokens will throw — unless you swap in the polyfill's
own `Intl` export in place of the global one. Why? Because `Intl.DateTimeFormat`
can't read fields off a non-native `Temporal` object; you'll get a
`Cannot use valueOf` error for your trouble. That's a limitation baked into how
`Intl` and `Temporal` currently talk to each other, not something this library
can paper over.

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
- Requires native `Temporal`/`Intl` interop (Node 26+) for locale-aware tokens.

## Dev notes

`tsconfig.json` sets `ignoreDeprecations: "6.0"` to work around a tsup bug
(tsup#1388/#1389). tsup's dts build step quietly injects a deprecated
`baseUrl`, and TypeScript 6+ hard-errors on it. Workaround, not a fix — drop
it the moment tsup ships a real one upstream.

Tests pull from `temporal-polyfill/full`, not the slim `temporal-polyfill` —
the Hebrew-calendar test needs the full build's calendar data, and the slim
one won't cut it. On Node < 26 without native `Temporal`, expect the
locale-aware tests to fail with `Cannot use valueOf`. Same polyfill/`Intl`
interop gap mentioned above, not a bug in the tests. Clean pass on Node 26+.

## License

MIT