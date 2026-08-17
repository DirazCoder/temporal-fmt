> [!WARNING]
> ## 0.1.x was End of Life on 04/08/2026
>
> This version is no longer maintained and does not receive security updates.
>
> This README documents the 0.1.x release and is kept for historical and
> compatibility reference.

# temporal-fmt (v0.1.1)

Format `Temporal.PlainDate` / `PlainTime` / `PlainDateTime` / `ZonedDateTime` objects
using date-fns-style token strings.

Node 26 shipped native `Temporal`, and it's deliberately missing a custom-string
formatter — TC39 left that to userland in favor of `Intl.DateTimeFormat`. This
fills that gap if you want `'yyyy-MM-dd'` syntax like you're used to from
date-fns, moment, or dayjs.

Zero dependencies. You'll need a global `Temporal` (native in Node 26+, or bring
your own polyfill — `temporal-polyfill` works fine).

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

Quote literal text with single quotes, like `'at'` above. Use `''` if you need a
literal single quote.

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

Pass a token the input type doesn't support — `HH` on a `PlainDate`, say — and
you get a clear error instead of a silent `undefined`.

## Dev notes

`tsconfig.json` sets `ignoreDeprecations: "6.0"` to work around a tsup bug
(tsup#1388/#1389): tsup's dts build step injects a deprecated `baseUrl`
internally, and TypeScript 6+ hard-errors on it. Drop this once tsup ships a fix
upstream.

## License

MIT
