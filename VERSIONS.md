# Version Support

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.7.x   | ❌ |
| < 0.7   | ❌ |

`0.7.x` and anything older is end of life. No more fixes — upgrade.

## How LTS works

Every time a new version line goes active, the old active line becomes LTS instead of dying — that's how `0.8.x` became `0.8-lts` when `0.9.x` shipped.

What LTS actually gets: normally just security fixes. Once there are two LTS lines at the same time, the newer one also gets bug fixes — the older one stays security-only. Right now there's only one LTS line, so this doesn't apply yet.

`0.10.x` is a one-off: when it ships, we go from 2 supported lines to 3 for that release only — `0.10.x` active, `0.9-lts`, and `0.8-lts` sticks around instead of dying. After that it's back to normal: 1 active + 2 LTS, oldest one drops each time a new version goes active.

## What changed and might break you

- **`0.3.0`** — `format()` throws on strings over 1000 characters. `yy` throws on negative years instead of quietly mangling them.
- **`0.7.2`** — `parse()` throws if you mix 24-hour and 12-hour tokens in one format string, instead of just guessing.
- **`0.8.0`** — parser now caps how much ambiguity it'll chew through, and rejects giant input before it even tries. If you were feeding it weird or huge input before, it might throw now instead of grinding forever.
- **`0.8.0`** — added support for fixed-offset timezone IDs. Bad timezone IDs still fail like before.
- **`0.8.3`** — added `do`, `Q`, `QQQ`, `ww`, `RRRR` tokens, plus new functions (`formatDuration`, `formatDistance`, `parseRelative`) and a new opt-in `lenient` mode for `parse()`. Nothing existing changes unless you turn the new stuff on.
- **`0.8.3`** — `QQQ` now checks that the quarter you gave it actually matches the month/date in the same string, and throws if they don't agree.
- **`0.8.3`** — `registerLocaleVocab()` checks your locale data right when you register it, so bad data throws immediately instead of later when you try to use it.
- **`0.8.6`** — nothing breaking. New options are all opt-in.
- **`0.9.0`** — errors are now real typed classes (`TemporalFmtError` and subclasses) instead of plain `Error`. Your `try/catch` still works fine, and `instanceof Error` still passes. The only thing that breaks: if you specifically check `err.constructor === Error` or `err.name === 'Error'`, that check now fails, because `err.name` is something like `'FormatSyntaxError'` instead. If that's you, stay on `0.8-lts`.

## History

LTS as a concept started with `0.6.x` — it was the first line to get the LTS label, when `0.7.x` went active.