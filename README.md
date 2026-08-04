# temporal-fmt

Format `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `ZonedDateTime` objects
using date-fns-style token strings.

Native `Temporal` shipped in Node 26 and modern browsers, but it deliberately has
no custom-string formatter — the TC39 authors punted that to userland in favor of
`Intl.DateTimeFormat`. This fills that specific gap for people who want the
`'yyyy-MM-dd'`-style syntax they already know from date-fns / moment / dayjs.

Zero dependencies. Requires a global `Temporal` (native in Node 26+, or bring your
own polyfill like `temporal-polyfill`).

## Install

```sh
npm install temporal-fmt
```

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

Quote literal text with single quotes: `'at'`. Use `''` for a literal single quote.

## Tokens

| Token | Meaning          | Example |
|-------|------------------|---------|
| yyyy  | 4-digit year     | 2026    |
| yy    | 2-digit year     | 26      |
| MMMM  | full month name  | August  |
| MMM   | short month name | Aug     |
| MM    | 2-digit month    | 08      |
| M     | month            | 8       |
| dd    | 2-digit day      | 04      |
| d     | day              | 4       |
| EEEE  | full weekday     | Tuesday |
| EEE   | short weekday    | Tue     |
| HH    | 2-digit hour (24h) | 15    |
| H     | hour (24h)       | 15      |
| hh    | 2-digit hour (12h) | 03    |
| h     | hour (12h)       | 3       |
| mm    | 2-digit minute   | 45      |
| m     | minute           | 45      |
| ss    | 2-digit second   | 30      |
| s     | second           | 30      |
| SSS   | milliseconds     | 000     |
| a     | AM/PM            | PM      |
| zzz   | IANA time zone id | America/New_York |

Passing a token the input type doesn't support (e.g. `HH` on a `PlainDate`) throws
a clear error instead of silently printing `undefined`.

## Dev notes

`tsconfig.json` sets `ignoreDeprecations: "6.0"` as a workaround for a tsup bug
(tsup#1388/#1389) — tsup's dts build step injects a deprecated `baseUrl` internally,
which TypeScript 6+ hard-errors on. Remove this once tsup ships a fix upstream.

## License

MIT