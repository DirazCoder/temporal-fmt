# Mods (advanced, optional)

Most people don't need this. Mods are a feature for when you want to fix or
tweak something in this library without forking the whole thing — not
something you're expected to reach for day to day. If you never touch
`mods/`, nothing about normal usage changes for you.

`registerLocale`, `createHolidayCalendar`, and `createFormatter` are already
how you extend this library without forking it — the [README](./README.md)
covers them under [Locales](./README.md#locales), [Business calendars and
holidays](./README.md#business-calendars-and-holidays), and [Extending with
custom tokens](./README.md#extending-with-custom-tokens). Mods are a delivery
mechanism on top of those same functions: drop a file in a `mods/` folder,
the CLI picks it up on startup and runs it. No publishing to npm, no build
step in this repo, no manifest to register anywhere. If you've used a
Minecraft mods folder, it's the same idea — a file the host looks for and
loads, not a package the host depends on.

This exists so bugfixes and locale corrections don't have to wait on a PR
merging and a release going out. If en-GB's holiday list is wrong for your
team, a locale you need isn't covered yet, or you want to shave overhead off
a hot path, someone can write a mod and drop it in. It's not the right tool
for genuinely new capability — if a fix needs more than the override surface
can express, that's a sign to open an issue or PR the feature into the
library itself, not to keep stretching a mod to cover it.

**Building a mod isn't covered here.** For the actual API, the sandbox, and
how to package one, see [API_DOCS/LEVEL_1.md](./API_DOCS/LEVEL_1.md),
[API_DOCS/LEVEL_2.md](./API_DOCS/LEVEL_2.md), and
[API_DOCS/LEVEL_3.md](./API_DOCS/LEVEL_3.md). This document is about running
mods someone else already wrote.

## Mod API levels

Tracks the surface a mod talks to — `ModContext`, permissions, the
subprocess boundary. Bumps independently of the package version; check
which level a mod was built against before assuming it still works. A
`.tfmod` can declare the lowest level it needs via `mod.json`'s
`minApiLevel` — see [API_DOCS/LEVEL_3.md](./API_DOCS/LEVEL_3.md#declaring-the-api-level-your-mod-needs).

| Level | Version | What it added |
|---|---|---|
| 1 | 0.9.4, 0.9.41, 0.9.5 | `register(ctx, config)`, direct process access, no sandbox |
| 2 | 0.9.6+ | Subprocess sandbox, permissions, `hasPermission`, `overrideXxx` |
| 3 | unreleased | `registerFormatToken`, `ctx.log`, `ctx.reportIssue`, `minApiLevel` |

Full details for each are in [API_DOCS/LEVEL_1.md](./API_DOCS/LEVEL_1.md),
[API_DOCS/LEVEL_2.md](./API_DOCS/LEVEL_2.md), and
[API_DOCS/LEVEL_3.md](./API_DOCS/LEVEL_3.md).

## Installing a mod

Two formats show up in `mods/`, side by side:

- **A loose `.mjs` file** — one file, no manifest.
- **A `.tfmod` archive** — a packaged mod with a `mod.json` manifest, an
  entry point, and optionally its own `data/`.

Drop either in `mods/` at your project root (not inside this package's own
checkout) and run any CLI command. The loader reports what it found:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
valid
```

Each mod loads independently — one being broken doesn't stop the rest, or
the CLI command you actually ran. A missing `mods/` folder isn't a failure
either; most projects won't have one, and the loader stays quiet about it.

## Reading the load report

Four outcomes per mod:

- `loaded` — ran clean, got everything it asked for (if anything).
- `downgraded` — ran, but an optional permission it asked for was denied.
  Still functional, just with less access than it wanted.
- `failed` — didn't run at all. The report line says why: bad file, a
  required permission denied, a version mismatch, a thrown error, and so on.
- `conflict` — informational, not a failure. Two mods registered the same
  locale tag, grammar language, or token name; the report says which one
  won.

## Permissions, from the user's side

A `.tfmod` mod may ask for filesystem or process access. On first load (and
after the mod's version changes), you're prompted in the terminal:

```
temporal-fmt: allow "data-reader" to access fs:read? (y/N)
```

Your answer is cached in `.temporal-fmt-permissions.json`, next to `mods/`,
keyed by `name@version` — so you're only asked again if the mod's version
bumps, or you delete that file. To change an answer without triggering a
fresh load:

```
node scripts/managePermissions.mjs list
node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read
node scripts/managePermissions.mjs deny data-reader@1.0.0 fs:write
node scripts/managePermissions.mjs reset data-reader@1.0.0
```

What each capability actually grants, and the difference between a required
and an optional ask, is in
[API_DOCS/LEVEL_2.md](./API_DOCS/LEVEL_2.md#permissions).

## Giving a mod settings

If a mod declares configurable settings, override them by dropping a JSON
file at `config/<mod-name>.json` — next to `mods/`, not inside it, so
updating the mod's `.tfmod` never touches your settings:

```
your-project/
├── mods/
│   └── en-gb-bank-holidays.tfmod
└── config/
    └── en-gb-bank-holidays.json     — { "includeScottish": true, "yearsAhead": 10 }
```

Only keys the mod actually declares can be set; anything else is reported as
a mistake, not silently ignored. See the mod's own docs for what it accepts.

## Using mods outside the CLI

`loadMods()` lives in `scripts/loadMods.mjs`, shipped with the published
package but off the `exports` map (it's Node-only ESM, and a loader that
spawns subprocesses has no honest CommonJS twin):

```js
import { loadMods, formatModLoadReport } from './node_modules/temporal-fmt/scripts/loadMods.mjs';

const report = await loadMods(); // defaults to ./mods
if (report.loaded.length > 0 || report.downgraded.length > 0 || report.failed.length > 0) {
  console.error('temporal-fmt mods:\n' + formatModLoadReport(report));
}
```

If your bundler won't follow that path import, copy the loader out and
vendor it. For deterministic teardown of any mod subprocesses (a server that
hot-reloads mods, say), `stopModSubprocesses()` from `scripts/modSandbox.mjs`
SIGTERMs every live one.

Mod support requires `temporal-fmt` 0.9.4 or later.
