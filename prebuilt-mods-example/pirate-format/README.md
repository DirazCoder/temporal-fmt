# pirate-format

A `temporal-fmt` mod that adds a `PIRATE` format string — pass it to `format()`
and get the day of the week back in pirate-speak instead of a real weekday
name. That's the whole mod. It's a joke, not a feature.

```js
format(now, 'PIRATE')
// -> "Landlubber Day"   (if today's Saturday)
```

## Install

Drop `pirate-format.tfmod` into your project's `mods/` folder (the folder
your CLI runs from, not inside `temporal-fmt`'s own checkout) and run any CLI
command. No permissions requested, so there's nothing to approve.

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded pirate-format@1.0.0 (pirate-format.tfmod) [sandboxed: no permissions requested] [format override via subprocess, 5s timeout, 512MB memory ceiling]
valid
```

## Requires

Mod API Level 2 (`temporal-fmt` 0.9.6+). `mod.json` pins
`"temporalFmtVersion": "^0.9.6"`, so the loader refuses to load this against
anything older instead of failing weird later.

## Heads up: one override slot per process

This mod calls `ctx.overrideFormat()`, and `temporal-fmt` only lets one mod
hold that override at a time — a second mod calling it fails to load with a
"already overridden by" error. If you're also running `retro-format` or
`leet-format` from this same author, **only run one of the three at once.**
Drop just the one you want in `mods/`. Mixing them isn't supported right now,
and there's no plan to merge them into one mod — three tiny single-purpose
files is more honest about what each one does than one mod juggling three
unrelated format strings.

## Why overrideFormat and not a custom token

`createFormatter()` looked like the obvious tool for a fake token like
`PIRATE`, but it doesn't work from a mod — the `Formatter` it returns is
local to the mod's own subprocess, nothing else in the library ever calls
into it, so `format(now, 'PIRATE')` from your app would just print the
literal string `PIRATE` back at you. `overrideFormat` is the only override
point that's actually wired into every `format()` call in the library, so
that's what this uses instead, same pattern as any real formatting fix would
use.

Everything that isn't the `PIRATE` string passes straight through to the
real `format()` untouched — this mod doesn't touch normal formatting.

## License

Apache-2.0, see `LICENSE`.
