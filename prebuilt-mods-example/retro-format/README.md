# retro-format

A `temporal-fmt` mod that adds a `RETRO` format string for a fake 8-bit
digital-clock look. Everything else formats normally.

```js
format(now, 'RETRO')
// -> "[ 14:05:09 ]·.·:*:·.·"
```

## Install

Drop `retro-format.tfmod` into your project's `mods/` folder (the folder
your CLI runs from, not inside `temporal-fmt`'s own checkout) and run any CLI
command. No permissions requested.

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded retro-format@1.0.0 (retro-format.tfmod) [sandboxed: no permissions requested] [format override via subprocess, 5s timeout, 512MB memory ceiling]
valid
```

## Requires

Mod API Level 2 (`temporal-fmt` 0.9.6+). `mod.json` pins
`"temporalFmtVersion": "^0.9.6"`.

## Heads up: one override slot per process

This mod calls `ctx.overrideFormat()`, and only one mod can hold that
override at a time in a given process — a second mod also calling
`overrideFormat()` fails to load. If you're also running `pirate-format` or
`leet-format` from this author, **only run one of the three at once.** Drop
just the one you want in `mods/`.

## How it works

`overrideFormat` gets called with the real built-in `format()` as its first
argument. This mod checks if the format string is literally `'RETRO'` — if
not, it just calls through to the original and returns whatever that gives
back, so nothing about normal formatting changes. If it is `'RETRO'`, it
builds the string itself from `value.hour`/`value.minute`/`value.second`
instead of going through the token pipeline at all.

## License

Apache-2.0, see `LICENSE`.
