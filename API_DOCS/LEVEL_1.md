# Mod API — Level 1 (0.9.4, 0.9.41, 0.9.5)

`register(ctx, config)` running with direct `import()` access to the host process. No sandbox, no permissions — those start at [Level 2](./LEVEL_2.md).

## Writing a mod

A mod is a `.mjs` file that default-exports an object with `name` and `register`:

```js
// mods/en-gb-bank-holidays.mjs
export default {
  name: 'en-gb-bank-holidays',
  version: '1.0.0',
  register(ctx) {
    ctx.createHolidayCalendar([
      { month: 1, day: 1, name: "New Year's Day" },
      { month: 12, day: 25, name: 'Christmas Day' },
      { month: 12, day: 26, name: 'Boxing Day' },
    ]);
  },
};
```

Drop it in `mods/` at your project root (not inside this package's own checkout) and run any CLI command:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.mjs)
valid
```

`version` is optional, shown in the report, never checked by the loader. `config` is `{}` for a loose `.mjs` mod — no manifest, nothing to resolve.

## The `ctx` API

Five functions at this level, all additive — each adds something alongside what's already registered, none of them replace existing behavior:

| Function | Does |
|---|---|
| `registerLocale(locale, vocab)` | Add a full locale (extends an existing one or defines a new tag). |
| `registerLocaleVocab(locale, vocab)` | Add or patch a locale's vocabulary tables directly. |
| `registerRelativeGrammar(grammar)` | Add a relative-time grammar for a language. |
| `createFormatter(options?)` | Build a standalone `Formatter` with custom tokens, for calling `formatter.format(...)` yourself. |
| `createHolidayCalendar(specs)` | Build a holiday calendar from a list of specs. |

That's the whole surface here. Changing existing behavior instead of adding new data — `overrideFormat` and the rest of the `overrideXxx` family — is Level 2.

**`createFormatter` isn't a way to patch the shared `format()`/`parse()` path.** It returns its own `Formatter` object with its own `format`/`formatToParts`/`compileFormat` — nothing calls that formatter except whoever holds the reference you got back. If you want a custom token to show up for every `format()` call across the library, you need `overrideFormat` (Level 2), not this.

## Load order and conflicts

Mods load in filename order by default — alphabetical, deterministic. Two fields change that:

- `requires: string[]` — names of mods that must finish `register()` first. Resolved as a real dependency graph: if A requires B and B requires nothing, B loads first regardless of filename.
- `priority: number` — tiebreak for mods with no dependency relationship. Higher loads later. Default `0`.

```js
export default {
  name: 'extended-en-gb-holidays',
  requires: ['en-gb-bank-holidays'],
  priority: 10,
  register(ctx) {
    // runs after en-gb-bank-holidays, and after anything lower-priority
  },
};
```

Registration is last-write-wins, same as calling `registerLocale` twice outside of mods. If two mods register the same locale tag, grammar language, or token name, the load report says which one won:

```
temporal-fmt mods:
  loaded holiday-pack-a (conflict-1.mjs)
  loaded holiday-pack-b (conflict-2.mjs)
  conflict on locale "cv-CV": holiday-pack-a, holiday-pack-b — "holiday-pack-b" wins (loaded last)
```

Not a failure — both loaded. To control which one wins, raise `priority` on the one that should, or make the loser `require` the winner so the intent lives in the mod, not just the log.

Mod names must be unique across `mods/`. Two files claiming the same name — the second one to load fails, naming the file that already holds it.

## Packaging as `.tfmod`

A loose `.mjs` file is one file with no bundled data, and the loader has to `import()` it just to learn its name before deciding load order. Package it as a `.tfmod` instead — a manifest the loader can read with zero code execution, plus your implementation:

```
en-gb-bank-holidays/
├── mod.json      — name, version, main, requires, priority, temporalFmtVersion, config
├── main.mjs      — same shape as a loose mod's default export, minus name/version/requires/priority
└── data/         — optional: anything main.mjs wants to read at register() time
```

```json
// mod.json
{
  "name": "en-gb-bank-holidays",
  "version": "1.0.0",
  "main": "main.mjs",
  "requires": ["some-other-mod"],
  "priority": 0,
  "temporalFmtVersion": "^0.9.0"
}
```

Build it with the repo's own script rather than hand-rolling `tar`:

```
node scripts/packageMod.mjs <mod-dir> [output.tfmod]
```

It reads `<mod-dir>/mod.json`, checks it against the same validation the loader runs at load time, and writes the archive (defaulting to `<mod-name>.tfmod` in the current directory). It fails loudly, before anything is written, if `mod.json` is missing or malformed, if `main` names a file that isn't in `<mod-dir>`, or if `tar` isn't on `PATH` — this script shells out to the system `tar` rather than adding a dependency.

Drop the result in `mods/` next to any loose `.mjs` mods; the loader treats both as one pool for load order and conflicts.

Manifest fields beyond `name`/`main` — `permissions`, `config`, `temporalFmtVersion` — and everything about the sandbox they interact with are covered in [LEVEL_2.md](./LEVEL_2.md), since permissions didn't exist until that level.

## Writing a mod in TypeScript

Compile it and rename the output before it goes in `mods/` — the loader only accepts `.mjs`, and a `.ts` file sitting in `mods/` is reported as a failure with the compile command to run rather than being silently skipped:

```sh
tsc en-gb-bank-holidays.ts --module esnext --target esnext --outDir mods
mv mods/en-gb-bank-holidays.js mods/en-gb-bank-holidays.mjs
```

`Mod` and `ModContext` types are exported from `temporal-fmt` itself:

```ts
import type { Mod, ModContext } from 'temporal-fmt';

const mod: Mod = {
  name: 'en-gb-bank-holidays',
  register(ctx: ModContext) {
    ctx.createHolidayCalendar([{ month: 1, day: 1, name: "New Year's Day" }]);
  },
};

export default mod;
```

## When a mod is broken

Each mod loads independently. One failing doesn't stop the rest, or the CLI command you ran.

- Wrong file extension (not `.mjs`) — reported with the compile-and-rename fix above.
- Default export malformed (no `name`, no `register`, `register` isn't a function, `requires`/`priority` wrong type) — reported with what was expected.
- Import fails (syntax error, bad import path) — reported with the underlying error.
- Duplicate `name` — reported against whichever file loaded second.
- Missing or circular `requires` — reported with what's still waiting on what.
- `register()` throws — reported with the thrown message.

A missing `mods/` folder isn't a failure. Most projects won't have one, and the loader stays quiet rather than printing "no mods found" on every run.

## Using mods outside the CLI

`loadMods()` lives in `scripts/loadMods.mjs`, shipped with the published package but off the `exports` map (it's Node-only ESM, and a loader that spawns subprocesses has no honest CommonJS twin):

```js
import { loadMods, formatModLoadReport } from './node_modules/temporal-fmt/scripts/loadMods.mjs';

const report = await loadMods(); // defaults to ./mods
if (report.loaded.length > 0 || report.downgraded.length > 0 || report.failed.length > 0) {
  console.error('temporal-fmt mods:\n' + formatModLoadReport(report));
}
```

If your bundler won't follow that path import, copy the loader out and vendor it — it's a self-contained file.

Mod support (loose `.mjs` mods, `.tfmod` archives) requires `temporal-fmt` 0.9.4 or later.
