# Mod API — Level 2 (0.9.6, 0.9.61)

A mod is a file that runs `register(ctx, config)` once at load time. As of this level, that no longer means direct access to the host process — every mod runs in its own subprocess under a permission sandbox, and the only way it affects the host is through `ModContext`, serialized across the subprocess boundary. This level also adds the ability to change existing library behavior (not just add new data), per-mod user settings, and version pinning.

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

`name` is required and must be unique across everything in `mods/`. `version` is optional, shown in the load report, never enforced by the loader on its own — it's informational unless you also declare `temporalFmtVersion` (see [Pinning to a `temporal-fmt` version](#pinning-to-a-temporal-fmt-version)). `register` is required and must be a function; it receives `ctx` (the `ModContext`) and `config` (resolved settings — see [Mod settings and `config/`](#mod-settings-and-config), or always `{}` for a loose `.mjs` mod, which has no manifest to declare settings in).

Drop the file in `mods/` at your project root — not inside this package's own checkout — and run any CLI command:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.mjs)
valid
```

A missing `mods/` folder isn't a failure or a warning — the loader stays quiet rather than printing "no mods found" on every run.

## The sandbox

Every mod — loose `.mjs` and `.tfmod` alike — runs in its own subprocess started with Node's permission model ([`--permission`](https://nodejs.org/api/permissions.html) on Node 22.13+, `--experimental-permission` on Node 20 and early 22). With nothing granted, Node refuses that subprocess any filesystem read, filesystem write, child process, or worker thread access. The only way a mod affects the host process is through the functions on `ctx`, each of which serializes its arguments across an inter-process channel.

What that means in practice:

- A mod can always read its own files — the `.mjs` file itself, or a `.tfmod`'s extracted contents including `data/`. The loader has to load the code, so its own location is readable by construction.
- Everything else needs a granted capability (see [Permissions](#permissions) below) — a denied capability isn't a polite request the mod can choose to ignore, Node blocks the actual syscall.
- The subprocess doesn't inherit your environment variables. `process.env` inside a mod contains `PATH`, `TZ`, `LANG`, and a few Windows bootstrap variables, nothing else — there's no grant that changes this, since env vars are where secrets typically live and the permission model has no flag to gate them specifically.
- `console.log` (or any other direct write to stdout) from inside a mod goes to stderr instead — the protocol channel between the subprocess and the host uses stdout (or, on Windows, a reply file), so a mod's own console output can't be allowed to collide with it.

The channel itself is platform-dependent, visible if you look closely: on macOS and Linux it's the subprocess's own stdio pipes, read directly by the host via file descriptor. Windows named pipes don't expose a file descriptor the host's end can hold onto — a fact of the platform, not a bug — so on Windows each mod's subprocess gets a private scratch directory under the system temp folder, and the same line-based protocol rides two plain files instead of a pipe. Two consequences worth knowing if you're on Windows: a runtime override call (see [Overriding functions](#overriding-functions)) costs a few extra milliseconds there, since the subprocess has to poll for new requests rather than being woken by the kernel; and the subprocess necessarily holds filesystem write access to its own scratch directory — the one place its protocol replies live — even when `fs:write` itself was denied. That's the entire carve-out: mod code still cannot write anywhere else on disk, so the denial isn't weakened anywhere a human would actually keep files.

Four things the sandbox does **not** do:

1. **It does not restrict network access.** No Node permission-model flag gates sockets on any currently supported version. A mod can still `import('node:http')` (or any networking module) and make requests freely. If your threat model requires no network egress from mods, don't run third-party mods at all — there's no flag to grant or deny here.
2. **It does not sandbox custom format-token handlers at format time.** Custom tokens registered through `createFormatter` (or, from Level 3 onward, `registerFormatToken`) are rebuilt from their handler's source text and actually run in the host process, not the subprocess — a formatter is a hot path, and paying a subprocess round trip on every single token lookup isn't viable. Treat a mod that registers custom token handlers as trusted code for that table, the same as you'd treat any code you ran directly in-process.
3. **It's a least-privilege control, not a defense against a fully determined attacker.** Node documents its own permission model the same way, and this sandbox inherits that ceiling rather than exceeding it.
4. **It contains a runaway mod, it doesn't prevent one from starting.** A 10-second watchdog on `register()`, a 5-second watchdog on each runtime override call, and a 512MB resident-memory ceiling per subprocess will kill a mod that hangs or balloons — killed before it can take the host process down with it, which is containment, not prevention.

On Node 20, and on Node 22 before 22.13, the permission model itself is still experimental, and the load report says so. On Node 22.13 and later it's stable.

## The `ctx` API

Nine data-registration functions, plus `hasPermission`, plus the full `overrideXxx` family for changing existing behavior:

| Function | Does |
|---|---|
| `registerLocale(locale, vocab)` | Add a full locale — either a new tag or an extension of one that already exists. |
| `registerLocaleVocab(locale, vocab)` | Add or patch a locale's vocabulary tables directly. |
| `registerRelativeGrammar(grammar)` | Add a relative-time grammar for a language. |
| `createFormatter(options?)` | Build a standalone `Formatter` with its own custom token table, for calling `formatter.format(...)` yourself. |
| `createHolidayCalendar(specs)` | Build a holiday calendar from a list of specs. |
| `hasPermission(capability)` | Whether this mod's subprocess actually has a given capability — see [Permissions](#permissions). |
| `overrideFormat`, `overrideParse`, and ~80 more `overrideXxx` functions | Replace the actual implementation of an existing library function everywhere it's called — see [Overriding functions](#overriding-functions). |

The first five are unchanged from before this level and remain purely additive — they add something alongside what's already registered, none of them replace anything. `createFormatter` in particular still only affects the standalone `Formatter` object it returns: custom tokens passed to `options.tokens` are visible only to whoever calls methods on that specific object, never to the library's own top-level `format()`. If you want a token available to every `format()` call in the process rather than just your own `Formatter` instance, `overrideFormat` (below) is the tool for that at this level.

### Permissions

A `.tfmod` declares what it wants in `mod.json`'s `permissions` array, marking each entry required or optional:

```json
{
  "name": "data-reader",
  "version": "1.0.0",
  "main": "main.mjs",
  "permissions": [
    { "capability": "fs:read", "required": true },
    { "capability": "fs:write", "required": false }
  ]
}
```

| Capability | Grants |
|---|---|
| `fs:read` | reading files anywhere on the filesystem |
| `fs:write` | writing files anywhere on the filesystem |
| `child-process` | spawning child processes |
| `worker` | starting worker threads |

That's the complete list. `fs:read`/`fs:write` are coarse on purpose — path scoping isn't something a yes/no prompt can express honestly, so the grant is filesystem-wide or nothing. `net` and `env` don't exist as capabilities at all: network access can't be restricted by the permission model on any current Node version, and environment variables are simply never delivered to the subprocess in the first place, so there's nothing meaningful to gate. `addons` doesn't exist either — native code escapes every other restriction the sandbox provides, so there's no honest way to grant it "a little."

A bare string array (`"permissions": ["fs:read"]`) still works and is treated as the pre-required/optional format — every entry required. Leaving `required` off an object entry means the same thing: required is the default, not optional.

On first load (and again after a version bump), the loader asks in the terminal:

```
temporal-fmt: allow "data-reader" to access fs:read? (y/N)
```

Empty input means no. A non-interactive context (CI, piped stdin) can't ask at all, so it denies by default and says so in the load report.

**Required is a promise the mod is making about itself.** Denying a required capability fails the mod's load outright, before `register()` ever runs:

```
failed data-reader.tfmod: denied required permission: fs:read — "data-reader" won't load without it. Grant it with "node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read", or delete .temporal-fmt-permissions.json to re-ask everything.
```

Only mark a capability required when the mod is genuinely useless without it — every required capability is another prompt the person running the CLI has to say yes to, and another way the load can fail outright. Anything the mod can live without belongs as optional, paired with a `hasPermission` check inside `register()`.

**Optional means the mod runs with less, and the load report says so, without failing the load.** Denying an optional capability produces a "downgraded" load, not a failed one:

```
downgraded data-reader@1.0.0 (data-reader.tfmod) [sandboxed: fs:read granted, fs:write denied (optional)]
```

#### `ctx.hasPermission(capability)`

Tells a mod what it actually got, so it can degrade gracefully instead of crashing when it hits the sandbox wall:

```js
register(ctx) {
  let extra = {};
  if (ctx.hasPermission('fs:read')) {
    extra = JSON.parse(readFileSync('supplementary.json', 'utf8'));
  }
  ctx.registerLocaleVocab('xx-extra', baseVocabMergedWith(extra));
}
```

`capability` is one of `'fs:read' | 'fs:write' | 'child-process' | 'worker'`. Nothing forces you to call this — a mod that skips the check and touches the missing capability anyway fails with the permission model's own access-denied error, reported the same way any other `register()` crash would be. `hasPermission('net')` (or any string outside the four real capabilities) always reads `false`, since `net` isn't a real capability to begin with. Outside the sandbox entirely — a context built in-process with `buildModContextFor()`, with no subprocess involved — every real capability reads `true`, since nothing is gating anything.

#### Managing cached permission answers

Answers to the permission prompt live in `.temporal-fmt-permissions.json`, next to `mods/`, keyed by `name@version`:

```json
{
  "data-reader@1.0.0": { "fs:read": true },
  "risky@2.3.0": { "fs:read": true, "fs:write": false }
}
```

Bump the mod's `version` and you're asked again on next load. Keep the version the same and the cached answer applies without re-asking. Delete the whole file and everything is asked again from scratch. To change one answer without waiting for a fresh load:

```
node scripts/managePermissions.mjs list
node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read
node scripts/managePermissions.mjs deny data-reader@1.0.0 fs:write
node scripts/managePermissions.mjs reset data-reader@1.0.0
```

`grant`/`deny` flip one entry immediately, with no prompt. `reset` clears a mod's cached answers so the next load re-asks everything for it — useful for reconsidering a decision without needing to bump the mod's version just to trigger a re-ask. All of these commands write the same file the load-time prompts read from, so there's exactly one cache, never two that could drift apart. A mod with no `version` field is addressed by its bare name in these commands; `list` prints the exact key to use either way.

## Pinning to a `temporal-fmt` version

`mod.json` can declare `temporalFmtVersion` — an exact version (`"0.9.32"`) or a caret range (`"^0.9.0"`, meaning `>=0.9.0 <0.10.0`, the same semantics as npm's `^`). If the installed `temporal-fmt` doesn't satisfy it, the mod fails before `main.mjs` is ever imported:

```
failed holidays.tfmod: "en-gb-bank-holidays" needs temporal-fmt ^2.0.0 (>=2.0.0 <3.0.0), host is 0.9.32
```

This exists because a mod built against one version's override surface has no way to know, on its own, whether some later release moved or removed a function it depends on — without this check, a mismatch would fail with whatever confusing error `register()` happens to throw, or worse, silently do nothing at all.

Omitting `temporalFmtVersion` is allowed — the mod loads against whatever's installed, with no version check at all. Loose `.mjs` mods have no manifest to put this field in — one real reason to prefer `.tfmod` for anything you plan to distribute to other people. This is a single pass/fail check against the package's version number, not dependency resolution — it has no effect on load order between mods.

## Mod settings and `config/`

Declare user-adjustable settings in `mod.json`'s `config` array; `register()` receives the resolved values as its second argument:

```json
{
  "name": "en-gb-bank-holidays",
  "main": "main.mjs",
  "config": [
    { "key": "includeScottish", "type": "boolean", "default": false },
    { "key": "observedRule", "type": "enum", "default": "nearest-weekday", "choices": ["nearest-weekday", "strict-date"] },
    { "key": "yearsAhead", "type": "number", "default": 5, "min": 1, "max": 20 }
  ]
}
```

```js
export default {
  register(ctx, config) {
    const years = config.yearsAhead; // 5, unless overridden
    ctx.createHolidayCalendar(buildHolidays({ scottish: config.includeScottish, years }));
  },
};
```

Four setting types are supported: `string`, `number` (with optional `min`/`max` bounds), `boolean`, and `enum` (a string constrained to a `choices` list). Every entry needs a `key` and a `default` — the default is exactly what `register()` receives when nothing overrides it, so a mod with no `config/<name>.json` file on disk still runs correctly, entirely on its declared defaults.

Override a setting at `config/<mod-name>.json`, next to `mods/` — not inside it, so that updating or replacing the `.tfmod` file never touches a person's existing settings:

```
your-project/
├── mods/
│   └── en-gb-bank-holidays.tfmod
└── config/
    └── en-gb-bank-holidays.json     — { "includeScottish": true, "yearsAhead": 10 }
```

Only keys the mod actually declared in its schema can be set this way:

```
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: config key "yearsAhead" must be <= 20, got 50 (using default)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: unknown config key "includeWelsh" (not declared in this mod's schema)
```

An invalid value falls back to that key's declared default rather than failing the whole mod's load — reported, but not fatal. This is deliberately not JSON Schema: no nesting, no `$ref`, just the small handful of primitive shapes a setting realistically needs.

Loose `.mjs` mods have no manifest to declare a config schema in at all, so `register()`'s second argument is always `{}` for them, with no way to accept user-adjustable settings.

## Overriding functions

The five registration functions are additive, as they were before this level. `ctx.overrideFormat`, `ctx.overrideParse`, and the rest of the `overrideXxx` family work completely differently — they replace the actual implementation everywhere in the library, which is what makes a real bugfix or performance mod possible instead of just new data sitting next to an unfixed bug.

```js
export default {
  name: 'fast-format',
  register(ctx) {
    ctx.overrideFormat((original, value, formatStr, options) => {
      if (formatStr === 'yyyy-MM-dd') {
        return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
      }
      return original(value, formatStr, options);
    });
  },
};
```

`impl` always receives the real, unmodified built-in as its first argument (`original`), regardless of what else is loaded — call it to preserve existing behavior for any case you're not specifically changing, or ignore it entirely to replace the behavior outright. The override applies everywhere in the library once installed, including internal call sites (`formatRange()`'s own use of `format()`, for instance, is affected too). Remove the mod and everything reverts to the unmodified built-in — nothing about this ever touches the source on disk.

**Only one mod may hold each override point at a time.** A second override call for the same function — whether from a different mod or the same one calling twice — fails immediately:

```
temporal-fmt mods:
  loaded override-1 (a-override1.mjs)
  failed b-override2.mjs: temporal-fmt: "format" is already overridden by mod "override-1" — mod "override-2" can't also override it. [...]
```

This is a hard failure, not last-write-wins — two mods silently fighting over the same function's behavior would be a correctness bug, not a cosmetic surprise a load report line can just note and move past. If two mods both need to change the same function, one has to incorporate the other's fix directly into its own override; there's no mechanism to layer two independent overrides onto one override point.

### How an override runs under the sandbox

A closure can't cross a process boundary, so a mod that installs an override keeps its subprocess alive after `register()` finishes, and every subsequent `format()`/`parse()` call in the host process forwards to that subprocess and waits for the answer — synchronously, since these are synchronous APIs from the caller's point of view.

- Each overridden call is one round trip to the subprocess — milliseconds, not nanoseconds, and more than that on Windows, where the channel rides files instead of a pipe. An override placed in a hot loop is *slower* than having no override at all; if your mod's entire point is a performance improvement, that improvement has to outweigh the bridge cost itself.
- The loader learns, per distinct format string, whether your implementation just forwards straight to the built-in for that string. Strings your mod passes straight through stop paying the round trip after the first call; only the strings you actually change keep crossing the boundary on every call. `formatRange()`'s two endpoints batch together into one round trip rather than two.
- If the subprocess stops answering — it hangs, crashes, or hits a permission violation partway through a call — the host stops waiting after 5 seconds, kills the subprocess, prints a warning to stderr, and falls back to the unmodified built-in for the remainder of the process's lifetime.
- The value your implementation receives back is rebuilt from its individual fields on the other side of the boundary. Real Temporal-typed inputs come back as the same Temporal type they went in as; if your implementation mutates the value it received (don't do this), the original caller on the host side won't see that mutation. Anything that can't survive JSON serialization degrades the way `JSON.stringify` itself degrades things — functions vanish entirely, and a `bigint` anywhere in the value throws.

### Which functions are overridable

`format`, `formatToParts`, and `parse` always were overridable, from the moment this level existed. Beyond those three: any function that nothing *else* inside the library calls internally, since a mod's override could otherwise be silently missed by some other internal module holding a direct, un-overridden reference to the original. As of this level, that's every one of these, each following the identical `ctx.overrideXxx((original, ...args) => ...)` shape:

```
compileFormat, compileParser, parseRelative, explainFormat, tokenizeFormat,
listTokens, tokenInfo, isValidFormat, validateFormat, fieldForToken,
monthsInYear, isLeapYear, isLeapMonth, weekOfYear, weekYear, getMonth,
getWeekday, isEqual, isBefore, isAfter, clamp, isBetween, isToday,
isTomorrow, isYesterday, isSameDay, isSameWeek, isSameMonth, isSameQuarter,
isSameYear, isWeekday, floor, ceil, truncate, parseRFC3339, formatRFC3339,
parseRFC2822, parseHTTPDate, fromUnixMicroseconds, fromUnixNanoseconds,
toUnixSeconds, toUnixMilliseconds, toUnixMicroseconds, toUnixNanoseconds,
parseSQL, formatSQL, formatDurationToParts, parseDuration, parseISODuration,
formatISODuration, balanceDuration, compareDuration, subtractDuration,
getLocale, hasLocale, createConfig, mergeWithConfig, listRegisteredGrammars,
interval, overlaps, intersection, union, mergeIntervals, formatRangeToParts,
between, parseRRule, formatRRule, createBusinessCalendar,
subtractBusinessDays, nextHoliday, previousHoliday, resolveZoned,
getNextTransition, getPreviousTransition, possibleInstantsFor,
getAutocompleteData, getHoverDocs, getInlineDiagnostics, previewFormat,
getDocUrl, translateDateFnsFormatString
```

Functions *not* on this list — `round`, `subtract`, `difference`, `formatDistance`, and a handful of others something else in the codebase calls directly — aren't overridable this way, since a mod's override would silently miss those internal callers and produce inconsistent behavior. A function joins this list only once an audit confirms nothing internal calls it directly anymore. Needing to change the behavior of one of those functions today is a real feature request for making it internally indirect first, not something to try to route around.

### Custom token handlers run host-side, not sandboxed

A `createFormatter()` call inside `register()` is setup-time work: the token table (each token's name, field, and the handler's own source text) ships back to the host process, and the `Formatter` object is rebuilt there — a formatter is meant to be a hot path, and every single token lookup can't realistically pay a subprocess round trip. The loader revives each handler from its source text using `new Function`, calls both the original and the revived version with the same probe input, and refuses the mod's load if the two don't produce matching output. Practically: a token handler must not close over anything outside its own function body (it won't survive being rebuilt from source text alone in a different process), and once accepted, it runs in the host process at `format()` time — treat any mod that registers custom token handlers as trusted code, the same as you'd treat something you ran directly in-process yourself.

## When a mod is broken

Each mod loads independently. One mod failing doesn't stop any other mod, or the CLI command you actually ran.

From the base loading process, unrelated to the sandbox specifically:
- Wrong file extension (not `.mjs`) — reported with the fix (compile to `.mjs` and place it in `mods/`).
- Default export malformed (no `name`, no `register`, `register` isn't a function, `requires`/`priority` wrong type) — reported with what was expected.
- Import fails (syntax error, bad import path) — reported with the underlying error.
- Duplicate `name` — reported against whichever file loaded second.
- Missing or circular `requires` — reported with what's still waiting on what.
- (`.tfmod` only) A corrupt archive, or `mod.json` missing/malformed — reported before `main.mjs` is imported.
- (`.tfmod` only) `mod.json`'s `main` names a file absent from the archive — reported with that reason.
- (`.tfmod` only) `temporalFmtVersion` doesn't match the host's version — reported before `register()` runs.

Specific to this level's sandbox and permissions:
- A required permission was denied — `denied required permission: <caps>` plus how to change the answer, reported before any mod code runs at all. An optional permission being denied isn't a failure on its own — the mod runs with what it got, reported as `downgraded` rather than `loaded` or `failed`.
- `register()` touches a capability that wasn't granted — the permission model's own access-denied error, plus (for a loose `.mjs` mod specifically) a reminder that a loose mod can't request any permissions at all, since it has no manifest to declare them in. Checking `ctx.hasPermission()` first avoids this entirely; skipping the check just means hitting the wall directly.
- `register()` doesn't finish within 10 seconds, a runtime override call stops answering within 5 seconds, or the subprocess crosses the 512MB resident-memory ceiling — the subprocess is killed, that one mod fails (or, if this happens at runtime rather than setup, the affected function falls back to the built-in with a stderr warning), and the rest of the load pass continues unaffected.
- `register()` itself throws — reported with the thrown error's message, same as at any other level.

## Using mods outside the CLI

`loadMods()` lives in `scripts/loadMods.mjs`, shipped with the published package but deliberately off the package's `exports` map — it's Node-only ESM, and a loader that spawns subprocesses has no honest CommonJS twin to offer instead:

```js
import { loadMods, formatModLoadReport } from './node_modules/temporal-fmt/scripts/loadMods.mjs';

const report = await loadMods(); // defaults to ./mods
if (report.loaded.length > 0 || report.downgraded.length > 0 || report.failed.length > 0) {
  console.error('temporal-fmt mods:\n' + formatModLoadReport(report));
}
```

`report.loaded`, `report.downgraded`, and `report.failed` are arrays describing what happened to each mod; `formatModLoadReport` turns the whole report into the same human-readable text the CLI prints. If your bundler won't follow that relative path import into `node_modules`, copy the loader file out and vendor it directly — it's self-contained.

The sandbox pieces ship alongside the loader: `scripts/modSandbox.mjs` and `scripts/modWorker.mjs` run the two sides of the subprocess boundary, `scripts/modWire.mjs` defines the shared serialization format both sides use, `scripts/modConfig.mjs` resolves `config/` overrides against a mod's declared schema, and `scripts/managePermissions.mjs` edits the permission cache from the command line.

A mod with a runtime override keeps its subprocess alive for as long as your process might still call `format()`/`parse()`, but it won't keep your own process alive on its own — the loader drops its event-loop references after loading finishes, and the subprocess shuts itself down when your process exits. For deterministic teardown before that point (a long-running server that hot-reloads its mods, for instance), call `stopModSubprocesses()` from `scripts/modSandbox.mjs` to send SIGTERM to every currently-live one.

Subprocess sandboxing, everything on this page, requires `temporal-fmt` 0.9.6 or later. On a Node version where the permission model is still experimental, the load report says so explicitly.
