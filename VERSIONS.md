# Version Support
## Staying up to date

**Latest LTS (recommended):**

```
npm install temporal-fmt@0.8-lts
```

This is what we recommend for production: long-term stability over chasing every release. Security fixes keep coming, nothing changes under you, no surprise breakage. If you're not actively blocked on a new feature, this is the one to run.

**Latest active version:**

```
npm install temporal-fmt@latest
```

Gets new features first, but also new bugs first. Only use this if you actually need something from it.

Pin whichever one you pick in `package.json` so every install matches:

```json
"dependencies": {
  "temporal-fmt": "0.8-lts"
}
```

## Supported versions

| Version | Status |
| ------- | ------ |
| 0.9.x   | ✅ active |
| 0.8.x   | ✅ LTS |
| 0.7.x   | ❌ dead |
| < 0.7   | ❌ dead |

- **0.9.x** — active. New stuff lands here first.
- **0.8-lts** — LTS. Security fixes only, nothing new. Good if you want the older stable line or fewer changes.
- **0.7.x and older** — dead. No fixes. Upgrade.

## How LTS works

Every time a new version line goes active, the old active line becomes LTS instead of dying. That's how `0.8.x` became `0.8-lts` when `0.9.x` shipped.

**What LTS actually gets:** normally just security fixes. But once there are two LTS lines at once, the newer one also gets bug fixes — the older one stays security-only. Right now there's only one LTS line so this doesn't apply yet.

**`0.10.x` is a one-off:** when it ships, we go from 2 supported lines to 3 for one release only (0.10.x active, 0.9-lts, and 0.8-lts sticks around instead of dying). After that it goes back to normal: 1 active + 2 LTS, oldest one drops each time a new version goes active.

## Compatibility policy

Within a supported line, public APIs keep working. If something needs a redesign or a behavior change, the new version goes in alongside the old one, the docs point people to it, and the old path keeps running for existing code.

The exception is when something shouldn't have been in scope to begin with — a date-formatting library doesn't need a CLI or a mod-loading system, and those get cut even if it breaks whoever was using them. Mod loading also ran project-local code, so on top of being out of scope, it was a standing security risk — there's no version of "keep it for compatibility" that doesn't bring that back.

## What changed and might break you

- **0.3.0** — `format()` throws on strings over 1000 characters. `yy` throws on negative years instead of quietly mangling them.
- **0.7.2** — `parse()` throws if you mix 24-hour and 12-hour tokens in one format string, instead of just guessing.
- **0.8.0** — parser now caps how much ambiguity it'll chew through, and rejects giant input before it even tries. If you were feeding it weird or huge input before, it might throw now instead of grinding forever.
- **0.8.3** — `QQQ` now checks that the quarter you gave it actually matches the month/date in the same string, and throws if they don't agree.
- **0.8.3** — `registerLocaleVocab()` checks your locale data right when you register it, so bad data throws immediately instead of later when you try to use it.
- **0.9.0** — errors from the main API are typed (`TemporalFmtError` and subclasses) instead of plain `Error`. `try/catch` and `instanceof Error` continue to work, but strict checks such as `err.constructor === Error` or `err.name === 'Error'` do not. Use the `temporal-fmt/legacy` subpath to retain plain-`Error` behavior while continuing to upgrade.
- **0.9.80** — mod loading and the package CLI were removed. Neither belongs in a date-formatting library's scope, and mod loading also ran project-local code, which made it an active risk on top of that. Historical mod documentation remains in `LEGACY_VERSION_MODS/` for now — it'll be dropped from `main` once 0.10.x ships, but stays available on the `0.9.x` branch after that branch is cut.

## History

LTS as a concept started with `0.6.x` — it was the first line to get the LTS label, when `0.7.x` went active.
