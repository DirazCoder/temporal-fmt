# Mod API — Level 1 (0.9.4, 0.9.41, 0.9.5)

A mod is a file that runs `register(ctx, config)` once at load time. At this level, that means direct `import()` access to the host process — no sandbox, no permission checks, no subprocess boundary. A mod at this level can do anything the process running `temporal-fmt` can do.

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

`name` is required and must be unique across everything in `mods/`. `version` is optional, shown in the load report, never checked or enforced by the loader — it's informational unless you also declare `temporalFmtVersion` (see [Version pinning](#version-pinning) below). `register` is required and must be a function; it receives `ctx` (the `ModContext` — see below) and `config` (always `{}` for a loose `.mjs` mod, since there's no manifest to hold a config schema).

Drop the file in `mods/` at your project root — not inside this package's own checkout — and run any CLI command:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.mjs)
valid
```

A missing `mods/` folder isn't a failure or a warning. Most projects won't have one, and the loader stays quiet rather than printing "no mods found" on every run.

## The `ctx` API

Five functions at this level, all additive — each adds something alongside what's already registered or built in. None of them replace existing library behavior; that capability doesn't exist yet at this level.

| Function | Does |
|---|---|
| `registerLocale(locale, vocab)` | Add a full locale — either a new tag or an extension of one that already exists. |
| `registerLocaleVocab(locale, vocab)` | Add or patch a locale's vocabulary tables (month names, weekday names, and so on) directly. |
| `registerRelativeGrammar(grammar)` | Add a relative-time grammar (how a language phrases "3 days ago", "in 2 hours") for a language. |
| `createFormatter(options?)` | Build a standalone `Formatter` object with its own custom token table, for calling `formatter.format(...)` / `formatter.formatToParts(...)` / `formatter.compileFormat(...)` yourself. |
| `createHolidayCalendar(specs)` | Build a holiday calendar from a list of `{ month, day, name }` specs (or more complex recurrence specs — same shape the library's own holiday calendars use). |

That's the entire surface at this level. There's no way to change what `format()`, `parse()`, or any other built-in function does — only to add new locales, grammars, formatters, and calendars alongside them.

**`createFormatter` is scoped to the object it returns, not global.** It builds a self-contained `Formatter` with its own `format`/`formatToParts`/`compileFormat` methods and its own token table (`options.tokens`, an array of `{ name, handler, field }`). Custom tokens you pass in there are visible only to whoever calls methods on that specific `Formatter` object — they do not show up if some other part of your code (or another mod) calls the library's own top-level `format()` function. If your goal is "make a new token available everywhere `format()` is called in the process," this function can't do that — there's no mechanism at this level for changing what the library's own `format()` sees.

```js
register(ctx) {
  const formatter = ctx.createFormatter({
    tokens: [
      { name: 'PIRATE', handler: (t) => (t.month % 2 === 0 ? 'Arr!' : 'Yarrr!'), field: 'month' },
    ],
  });
  // formatter.format(someDate, 'PIRATE, yyyy') works.
  // The library's own format(someDate, 'PIRATE, yyyy') does not know about PIRATE.
}
```

## Load order and conflicts

Mods load in filename order by default — alphabetical, deterministic. Two manifest-independent fields on the mod itself change that:

- `requires: string[]` — names of other mods that must finish `register()` before this one starts. Resolved as a real dependency graph: if A requires B and B requires nothing, B loads first regardless of what the filenames would otherwise suggest.
- `priority: number` — a tiebreak for mods that have no dependency relationship with each other. Higher priority loads later. Default is `0`.

```js
export default {
  name: 'extended-en-gb-holidays',
  requires: ['en-gb-bank-holidays'],
  priority: 10,
  register(ctx) {
    // Runs after en-gb-bank-holidays finishes, and after anything
    // with a lower priority than 10.
  },
};
```

A missing dependency, or a dependency cycle (A requires B, B requires A), fails the mods involved — reported with which name is still waiting on what.

Registration itself is last-write-wins — the same behavior you'd get calling `registerLocale` twice yourself outside of any mod system. If two mods register the same locale tag or the same relative-grammar language, the load report says which one won:

```
temporal-fmt mods:
  loaded holiday-pack-a (conflict-1.mjs)
  loaded holiday-pack-b (conflict-2.mjs)
  conflict on locale "cv-CV": holiday-pack-a, holiday-pack-b — "holiday-pack-b" wins (loaded last)
```

This is not a failure — both mods loaded successfully, and the second one's registration simply overwrote the first's for that specific key. To control which one wins, either raise `priority` on the one that should win (so it loads later and its registration is the one left standing), or have the loser declare `requires: ['winner-name']` so the ordering intent lives in the mod's own manifest rather than only in the log output.

Mod names must be unique across all of `mods/`. If two files claim the same `name`, the second one to load fails, and the failure names the file that already holds that name.

## Packaging as `.tfmod`

A loose `.mjs` file works, but it's one file with no bundled data alongside it, and the loader has to actually `import()` it just to learn its `name` before it can even decide load order. Packaging as a `.tfmod` archive instead gives the loader a manifest it can read with zero code execution, plus your implementation and any data files it needs:

```
en-gb-bank-holidays/
├── mod.json      — name, version, main, requires, priority, temporalFmtVersion
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

`name` and `main` are required. `version`, `requires`, `priority`, and `temporalFmtVersion` are optional and mean the same thing they mean for a loose `.mjs` mod, plus what's described in [Version pinning](#version-pinning) below.

`main.mjs`'s default export drops `name`, `version`, `requires`, and `priority` — those live in `mod.json` instead, since the loader needs to read them without running any code:

```js
// main.mjs
export default {
  register(ctx, config) {
    ctx.createHolidayCalendar([
      { month: 1, day: 1, name: "New Year's Day" },
    ]);
  },
};
```

Build the archive with the repo's own script rather than hand-rolling `tar`:

```
node scripts/packageMod.mjs <mod-dir> [output.tfmod]
```

It reads `<mod-dir>/mod.json`, checks it against the exact same validation the loader runs at load time, and writes the archive — defaulting to `<mod-name>.tfmod` in the current directory if you don't give it an explicit output path. It fails loudly, before anything is written, if `mod.json` is missing or malformed, if `main` names a file that isn't actually present in `<mod-dir>`, or if `tar` isn't on `PATH` (this script shells out to the system `tar` rather than adding a bundled dependency).

Drop the resulting `.tfmod` file in `mods/`, next to any loose `.mjs` mods you also have — the loader treats both kinds as one pool for load order and conflict detection; nothing about ordering or conflicts cares which format a mod came in.

## Version pinning

A `.tfmod`'s `mod.json` can declare `temporalFmtVersion` — a semver range or exact version string saying which version(s) of the `temporal-fmt` package this mod was built against and tested with:

```json
{ "name": "pinned-example", "main": "main.mjs", "temporalFmtVersion": "^0.9.4" }
```

Supported range forms: an exact version (`"0.9.4"`), a caret range (`"^0.9.4"`, meaning that version or any later one with the same major version), or `">="`/`"<="`/`">"`/`"<"` comparisons. If the host's installed `temporal-fmt` version doesn't satisfy the range, the mod fails at load time, before `register()` ever runs:

```
temporal-fmt mods:
  failed pinned.tfmod: "pinned-bad" needs temporal-fmt ^5.0.0, host has 0.9.5
```

This is checked purely against the package's own version number. A loose `.mjs` mod has no manifest to put this field in, so it can't declare a version pin — it always runs regardless of the host's `temporal-fmt` version, for better or worse.

## Writing a mod in TypeScript

Compile it and rename the output before it goes in `mods/` — the loader only accepts files ending in `.mjs`. A `.ts` file sitting directly in `mods/` is reported as a failure with the compile command to run, rather than being silently skipped:

```sh
tsc en-gb-bank-holidays.ts --module esnext --target esnext --outDir mods
mv mods/en-gb-bank-holidays.js mods/en-gb-bank-holidays.mjs
```

`Mod` and `ModContext` types are exported from `temporal-fmt` itself, so a TypeScript-authored mod gets full autocomplete and type checking on `ctx`:

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

Each mod loads independently. One mod failing to load doesn't stop any other mod, or the CLI command you actually ran — the command still runs, just without that one mod's contributions.

- Wrong file extension (not `.mjs`) — reported with the compile-and-rename fix shown above.
- Default export malformed — no `name`, no `register`, `register` isn't a function, or `requires`/`priority` are the wrong type — reported with what was actually expected.
- The file fails to import (syntax error, a bad import path inside it) — reported with the underlying error message.
- Duplicate `name` across two files — reported against whichever file loaded second.
- A `requires` entry that doesn't exist, or a dependency cycle — reported with what's still waiting on what.
- `register()` itself throws — reported with the thrown error's message.
- (`.tfmod` only) The archive is corrupt, isn't actually gzip, or `mod.json` is missing/malformed/fails validation — reported before `main.mjs` is ever imported.
- (`.tfmod` only) `mod.json`'s `main` field names a file that isn't present in the archive — reported with that specific reason.
- (`.tfmod` only) `temporalFmtVersion` doesn't match the host's actual package version — reported before `register()` runs, naming the required range and the host's actual version.

## Using mods outside the CLI

`loadMods()` lives in `scripts/loadMods.mjs`, shipped with the published package but deliberately kept off the package's `exports` map — it's Node-only ESM, and (from later levels onward) it spawns subprocesses, which has no honest CommonJS equivalent to offer instead:

```js
import { loadMods, formatModLoadReport } from './node_modules/temporal-fmt/scripts/loadMods.mjs';

const report = await loadMods(); // defaults to ./mods relative to cwd
if (report.loaded.length > 0 || report.failed.length > 0) {
  console.error('temporal-fmt mods:\n' + formatModLoadReport(report));
}
```

`report.loaded` and `report.failed` are arrays describing what happened to each mod; `formatModLoadReport` turns the whole report into the same human-readable text the CLI prints. If your bundler won't follow that relative path import into `node_modules`, copy the loader file out and vendor it directly — it's self-contained and doesn't assume it's running from inside `node_modules`.

Mod support (loose `.mjs` mods, `.tfmod` archives, everything on this page) requires `temporal-fmt` 0.9.4 or later.
