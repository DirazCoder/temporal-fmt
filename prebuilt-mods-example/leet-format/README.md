# leet-format

A `temporal-fmt` mod that adds a `LEET` format string — renders the year as
leetspeak digits (0→O, 1→I, 3→E, 4→A, 5→S, 7→T, everything else stays a
number).

```js
format(now, 'LEET')
// -> "2O26"
```

## Install

Drop `leet-format.tfmod` into your project's `mods/` folder (the folder your
CLI runs from, not inside `temporal-fmt`'s own checkout) and run any CLI
command. No permissions requested.

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded leet-format@1.0.0 (leet-format.tfmod) [sandboxed: no permissions requested] [format override via subprocess, 5s timeout, 512MB memory ceiling]
valid
```

## Requires

Mod API Level 2 (`temporal-fmt` 0.9.6+). `mod.json` pins
`"temporalFmtVersion": "^0.9.6"`.

## Heads up: one override slot per process

This mod calls `ctx.overrideFormat()`, and only one mod can hold that
override at a time — a second mod also calling `overrideFormat()` fails to
load with an "already overridden by" error. If you're also running
`pirate-format` or `retro-format` from this author, **only run one of the
three at once.** Drop just the one you want in `mods/`.

## Why overrideFormat and not a custom token

First pass at this used `createFormatter()` with a custom `LEET` token,
which seemed like the right tool — turns out it's not: the `Formatter` a mod
builds with `createFormatter()` is local to that call, nothing in the
library's actual `format()` path ever looks at it. So `format(now, 'LEET')`
called from outside the mod would've just returned the literal string
`"LEET"`. Switched to `overrideFormat`, which is the one override point
that's genuinely wired into every `format()` call, and checked in the string
directly instead of going through a token at all.

## License

Apache-2.0, see `LICENSE`.
