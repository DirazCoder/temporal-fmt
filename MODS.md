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
a hot path, write a mod and drop it in. It's not the right tool for
genuinely new capability — if you're building something the override surface
can't express, that's a sign to open an issue or PR the feature into the
library itself, not to keep stretching a mod to cover it. Whether a given
fix ever gets upstreamed into this repo is a separate question from whether
it works today as a mod.

## Temporal-Fmt Mod API

Tracks changes to the surface a mod talks to — `ModContext`, permissions, the
subprocess boundary. Bumps independently of the package version; check this
before assuming a mod built against an older level still works.

### Level 2 — 0.9.6

- Mods run in their own subprocess under Node's permission model, not the
  host process — no filesystem, child process, or worker access unless
  granted.
- `.tfmod` mods declare a `permissions` array in `mod.json`; the user is
  prompted once per `name@version` and the answer is cached.
- `ctx.hasPermission(capability)` for checking a grant and degrading
  gracefully instead of crashing.
- `register()` is killed after 10s, a runtime override call after 5s, and a
  subprocess is killed if its RSS crosses 512MB.
- The subprocess doesn't inherit the host's environment variables.

### Level 1 — 0.9.4

- `register(ctx, config)` running with direct `import()` access to the host
  process. No sandbox, no permissions.

## The sandbox

A mod's code never runs in your process. Every mod — loose `.mjs` and
`.tfmod` alike — runs in its own subprocess started with Node's permission
model ([`--permission`](https://nodejs.org/api/permissions.html) on Node
22.13+, `--experimental-permission` on Node 20 and early 22, picked per
running version). With no capabilities granted, Node itself refuses the
subprocess any filesystem read, filesystem write, child process, or worker
thread access. The only way a mod affects the host is through the
`ModContext` API, serialized over an inter-process channel.

What this means concretely:

- A mod can always read its own files — the `.mjs` file itself, or the
  `.tfmod` archive's extracted contents including its `data/` directory. The
  loader has to be able to load the code, so its own location is readable by
  construction.
- Everything else needs a granted capability (see
  [Permissions](#permissions)). Denied capabilities aren't a polite request
  the mod can ignore — the subprocess literally cannot open the file,
  because Node blocks the syscall.
- The subprocess does not inherit your environment variables. `process.env`
  inside a mod contains `PATH`, `TZ`, `LANG`, and a few Windows bootstrap
  variables, nothing else. There is no grant that changes this: environment
  variables are where CI tokens and database URLs live, and the permission
  model has no flag that could gate them, so they don't arrive in the first
  place.
- Mod output still reaches you: `console.log` from a mod goes to stderr
  (the protocol channel is stdout, or on Windows the reply file).

The channel itself is platform-dependent, and the difference is visible
if you look: on macOS and Linux it's the subprocess's pipes, read directly
by file descriptor. A Windows named pipe carries no file descriptor for
the host's end — a fact of the platform, not a Node bug — so there each
mod's subprocess gets a private scratch directory under the system temp
folder and the same line protocol rides two plain files. Two consequences
worth knowing: a runtime-override call costs a few extra milliseconds on
Windows (the subprocess polls for new requests rather than being woken by
the kernel), and the subprocess necessarily holds filesystem write access
to its own scratch directory — the one place its protocol replies live —
even when `fs:write` was denied. That's the whole carve-out: mod code
still cannot write anywhere else, so the denial isn't weakened anywhere a
human keeps files.

Four things the sandbox does **not** do, said plainly rather than buried:

1. **It does not restrict network access.** Node's permission model cannot
   gate sockets on any supported version, so there is no `net` capability
   to grant or deny. A mod can still import `node:http` and make requests.
   Deleting the global `fetch` removes the most convenient path but not
   `node:http` itself. If your threat model requires no network egress, do
   not run third-party mods.
2. **It does not sandbox `createFormatter` token handlers at format time.**
   Custom tokens are rebuilt from handler source and run in the host process
   (see [Overriding functions](#overriding-functions) for the why) — treat a
   mod that registers custom tokens as trusted code for that table.
3. **It is a least-privilege control, not a defense against a determined
   attacker.** Node documents its permission model that way and this sandbox
   inherits the ceiling. One concrete gap: cross-process signaling
   (`process._debugProcess` and friends) isn't gated by the permission model
   on any supported version, so any process owned by the same OS user can
   reach any other. Containing that needs an OS-level sandbox, which is
   explicitly out of scope here.
4. **It contains runaway mods; it can't prevent them.** A wall-clock
   watchdog (10s for `register()`, 5s per runtime override call) and a
   resident-memory ceiling (512MB per subprocess, polled from the parent)
   kill a mod that hangs or balloons — killed *before* it takes the host
   down, which is containment, not prevention. The memory number is watched
   as actual RSS from the parent, so `ArrayBuffer` allocations count (a V8
   heap limit wouldn't see them) and `--max-old-space-size` set anywhere in
   the process tree can't quietly neuter it.

On Node 20 (and Node 22 before 22.13) the permission model is experimental
and the load report says so; treat sandboxing there as best-effort. On Node
22.13+ it's stable.

## Writing a mod

A mod is a `.mjs` file that default-exports an object with a `name` and a
`register(ctx, config)` function. `ctx` is the same registration API
`index.ts` exports for everyone else — `registerLocale`,
`registerLocaleVocab`, `registerRelativeGrammar`, `createFormatter`,
`createHolidayCalendar` — nothing beyond that. A mod that needs more than
those functions expose is asking for something this library doesn't support
yet, not something to route around by reaching into internals that could
shift under it without warning. `config` is `{}` for a loose `.mjs` mod —
there's no manifest to declare settings in, so there's nothing to resolve;
see [Mod settings and `config/`](#mod-settings-and-config) for mods that
need user-adjustable settings, which means packaging as `.tfmod`.

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

Put that in `mods/` at your project root (the folder the CLI is run from,
not inside this package's own checkout) and run any CLI command — the loader
reports what it found on stderr:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.mjs) [sandboxed: no permissions — a loose .mjs mod can't request any, package as .tfmod to ask for capabilities]
valid
```

`version` is optional and only shows up in that report — it's for your own
tracking, not something the loader checks. That's a different field from
`temporalFmtVersion`, which *is* checked against the installed
`temporal-fmt` version, but only exists on `.tfmod` manifests (see [Pinning
a mod to a `temporal-fmt` version](#pinning-a-mod-to-a-temporal-fmt-version))
— a loose `.mjs` mod has no manifest to declare it in.

A loose `.mjs` mod has no manifest, which also means it has no way to ask
for capabilities: it runs with **zero** permissions, and a register() that
touches `node:fs` or spawns anything fails with the access error plus an
explanation, rather than mysteriously not working. That's the trade for the
format's simplicity — anything that needs filesystem or process access has
to be a `.tfmod`.

## Packaging a mod as `.tfmod`

A loose `.mjs` file covers the common case, but it's one file — no bundled
data, and the loader has to import it in a sandbox just to find out its
`name` before deciding load order. For anything bigger than that, package
the mod as a `.tfmod` archive instead: a gzipped tar (same format as
`.tgz`, renamed for identity) containing a manifest the loader can read
without running any code, plus the mod's actual implementation:

```
en-gb-bank-holidays.tfmod
├── mod.json      — name, version, main, requires, priority, permissions, temporalFmtVersion, config
├── main.mjs      — the mod's entry point (same shape as a loose .mjs mod's default export, minus `name`/`version`/`requires`/`priority` — mod.json owns those)
└── data/         — optional: JSON files, locale tables, anything main.mjs wants to read at register() time
```

```json
// mod.json
{
  "name": "en-gb-bank-holidays",
  "version": "1.0.0",
  "main": "main.mjs",
  "requires": ["some-other-mod"],
  "priority": 0,
  "permissions": ["fs:read"],
  "temporalFmtVersion": "^0.9.0"
}
```

```js
// main.mjs
export default {
  register(ctx) {
    ctx.createHolidayCalendar([
      { month: 1, day: 1, name: "New Year's Day" },
      { month: 12, day: 25, name: 'Christmas Day' },
    ]);
  },
};
```

Build the archive with plain `tar` — no special tooling:

```sh
tar -czf en-gb-bank-holidays.tfmod mod.json main.mjs data/
```

Drop that in `mods/` alongside any loose `.mjs` mods you have; the loader
treats both formats as one pool for load-order and conflict purposes. The
report shows `mod.json`'s `name`, not anything from `main.mjs` itself:

```
$ temporal-fmt validate "yyyy-MM-dd"
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod) [sandboxed: fs:read granted]
valid
```

Why bother with an archive format at all instead of just supporting
multi-file `.mjs` mods directly: `mod.json` is metadata the loader can read
with zero code execution, which is what makes cross-mod dependency
resolution work honestly — with a loose `.mjs` mod, the loader has no choice
but to import the file (in its sandbox) to learn its `name`/`requires`,
before it even knows whether that mod should run. A `.tfmod`'s manifest is
checked, and the whole dependency graph is resolved, before `main.mjs` is
ever imported. It's also the only shape that can declare `permissions`,
`config`, or `temporalFmtVersion`, for the same reason: no manifest, no
declaration.

Failure modes are per-archive, same as loose mods — one bad `.tfmod` doesn't
block anything else in `mods/`:

- `mod.json` missing or malformed (no `name`, no `main`, or
  `requires`/`priority`/`temporalFmtVersion`/`config`/`permissions` the
  wrong type) — reported with what was expected, `main.mjs` is never
  imported.
- `mod.json` names a `main` file that isn't actually in the archive —
  reported with the missing filename.
- `mod.json` `"main"` (or the mod name) escaping the extraction directory —
  absolute paths, `..` segments, and symlinks that resolve outside are
  rejected before anything is imported. A `.tfmod` runs only files from
  inside its own archive; this is a security boundary, not a nicety.
- The archive isn't a valid gzip/tar (corrupted, wrong format, a `.tfmod`
  extension slapped on some other file) — reported with the extraction
  error.
- `main.mjs`'s default export doesn't have a `register` function — reported,
  same as a loose mod's malformed export.
- `temporalFmtVersion` doesn't match the installed `temporal-fmt` version —
  reported with the range and the actual version, `main.mjs` is never
  imported. See [Pinning a mod to a `temporal-fmt`
  version](#pinning-a-mod-to-a-temporal-fmt-version).
- `permissions` names something that isn't a capability — reported with the
  supported list. See below.

Extraction happens to a temporary directory that's cleaned up after the
load pass — nothing from a `.tfmod` sticks around on disk after the CLI
command finishes. Extraction shells out to the system `tar` binary rather
than adding a tar/gzip-parsing dependency, consistent with this package
staying dependency-free (see the [README](./README.md#providing-temporal)
for the same call made about the polyfill) — if `tar` isn't on the system
`PATH`, the archive fails to load with that reason rather than crashing the
CLI.

## Permissions

A `.tfmod` declares what it wants in `mod.json`'s `"permissions"` array,
marking each entry required or optional:

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

The closed list maps one-to-one onto what Node's permission model can
actually enforce:

| Capability | Grants |
|---|---|
| `fs:read` | reading files anywhere on the filesystem |
| `fs:write` | writing files anywhere on the filesystem |
| `child-process` | spawning child processes |
| `worker` | starting worker threads |

That's the whole list. `fs:read` and `fs:write` are deliberately coarse —
path scoping ("fs access to only `./data`") isn't something a yes/no
terminal answer can express honestly, so v1 doesn't pretend to offer it;
it's a possible follow-up if the permission model's path-scoped flags turn
out to be worth building on. `net` and `env` are absent because no flag
backs them: network access can't be restricted by the permission model (see
[The sandbox](#the-sandbox)), and environment variables are handled by
never delivering them to the subprocess at all. `addons` is absent because
native code escapes every other restriction — a mod that needs native
addons can't be sandboxed, full stop.

A bare string array (`"permissions": ["fs:read"]`) still works — it's the
format from before required/optional existed, and every entry in it is
treated as required, so nothing that used to fail on denial silently
downgrades. Leaving `"required"` out of an object entry means the same
thing: a mod that doesn't say is asking, not wishing.

On first load (and after a version bump), the loader asks about each
requested capability in the terminal:

```
temporal-fmt: allow "data-reader" to access fs:read? (y/N)
```

Empty input is "no". A non-interactive context — CI, piped stdin — can't
ask anyone, so it denies by default and says so in the report rather than
quietly granting.

**Required is a promise, so don't make it lightly.** Denying a required
capability fails the mod's load outright, with the reason in the report:

```
failed data-reader.tfmod: denied required permission: fs:read — "data-reader" won't load without it. Grant it with "node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read", or delete .temporal-fmt-permissions.json to re-ask everything.
```

From the mod-author side: only mark a capability required when the mod is
genuinely useless without it. Every required capability is another y/N
between the user and your mod doing anything, and another way for the load
to fail. Anything the mod can live without belongs in an optional entry
and a `hasPermission` branch.

**Optional means the mod runs with less, and the report says so.** Denying
an optional capability doesn't fail the load — the subprocess starts with
only what was granted, and the report line reads `downgraded` rather than
`loaded`, so "this ran, but with less access than it asked for" is visible
without reading the fine print:

```
downgraded data-reader@1.0.0 (data-reader.tfmod) [sandboxed: fs:read granted, fs:write denied (optional)]
```

**`ctx.hasPermission(capability)`** tells a mod what it actually got, so
it can degrade instead of crashing — skip loading supplementary locale
data from disk when `fs:read` was denied, rather than assuming it's there
and throwing:

```js
register(ctx) {
  let extra = {};
  if (ctx.hasPermission('fs:read')) {
    extra = JSON.parse(readFileSync('supplementary.json', 'utf8'));
  }
  ctx.registerLocaleVocab('xx-extra', baseVocabMergedWith(extra));
}
```

Nothing forces this. A mod that doesn't check and touches the missing
capability anyway fails with the permission model's access error, reported
like any other `register()` crash — the design offers graceful
degradation, it can't make an author take it. Two answers are the same
everywhere: `net` is false (it isn't a capability, see the table above),
and in a context you built in-process with `buildModContextFor()` — no
sandbox attached — everything in the table reads as true, because nothing
is gating it there.

Answers are remembered in `.temporal-fmt-permissions.json`, next to
`mods/` (like the `config/` directory — it's the host project's data about
what it has agreed to, not part of the mod). The file is keyed by
`name@version`: bump the version and you're asked again; keep the version
and the cached answer applies; delete the file and everything is asked
again. It's plain JSON, safe to edit by hand:

```json
{
  "data-reader@1.0.0": { "fs:read": true },
  "risky@2.3.0": { "fs:read": true, "fs:write": false }
}
```

To change an answer without re-triggering a load, use the management
script that ships with the package:

```
node scripts/managePermissions.mjs list
node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read
node scripts/managePermissions.mjs deny data-reader@1.0.0 fs:write
node scripts/managePermissions.mjs reset data-reader@1.0.0
```

`grant`/`deny` flip one entry, no prompt. `reset` clears a mod's cached
answers so the next load asks again — the way to reconsider without
bumping the mod's version. All of them write the same file the load-time
prompts use, so there's one cache, not two that can drift apart. Changes
apply the next time the mod loads; a process already running it is
unaffected. A mod with no `version` in its `mod.json` is addressed by its
bare name (`grant data-reader fs:read`), and `list` prints the exact key
when in doubt.

## Pinning a mod to a `temporal-fmt` version

`mod.json` can declare `temporalFmtVersion`, either an exact version
(`"0.9.32"`) or a caret range (`"^0.9.0"`, meaning ">=0.9.0, <0.10.0" —
same meaning npm gives `^` in `package.json`). If the installed
`temporal-fmt` doesn't satisfy it, the mod fails to load with the range and
the actual version, before `main.mjs` is ever imported:

```
failed holidays.tfmod: "en-gb-bank-holidays" needs temporal-fmt ^2.0.0 (>=2.0.0 <3.0.0), host is 0.9.32
```

This exists because nothing else catches the alternative: a mod built
against one version's override surface (which functions are zero-fanout and
therefore overridable — see [Overriding functions](#overriding-functions))
has no way to know if a future release moved a function it depends on, and
would otherwise fail with whatever confusing error `register()` happens to
throw, or — worse — silently do nothing if the call it expected to matter
just no longer has any effect. A declared range turns that into one clear,
pre-`register()` failure instead.

Omitting `temporalFmtVersion` is allowed — the mod loads against whatever
version is installed, same as before this field existed. Loose `.mjs` mods
have no manifest to put this in at all, so they can't declare a version
requirement; that's one real reason to prefer `.tfmod` for anything you
plan to distribute rather than just run yourself.

There's no dependency-resolution logic here, unlike `requires`/`priority` —
this is a single boolean check (does the host version satisfy the range),
not something that affects load order.

## Mod settings and `config/`

A mod can declare user-adjustable settings in `mod.json`'s `config` array,
and `register()` receives the resolved values as its second argument:

```json
// mod.json
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
// main.mjs
export default {
  register(ctx, config) {
    const years = config.yearsAhead; // 5, unless overridden below
    ctx.createHolidayCalendar(buildHolidays({ scottish: config.includeScottish, years }));
  },
};
```

Four setting types are supported: `string`, `number` (with optional
`min`/`max`), `boolean`, and `enum` (a string constrained to `choices`).
Every entry needs a `key` and a `default` — the default is what
`register()` gets if the user hasn't overridden that setting, which also
means a mod with no `config/<name>.json` file on disk at all still runs
normally, just entirely on defaults.

To override a setting, drop a JSON file at `config/<mod-name>.json` —
**next to `mods/`, not inside it** (so re-downloading or updating the
`.tfmod` never touches a user's settings, the same reason Forge keeps
`config/` and `mods/` as siblings rather than bundling settings into the
jar):

```
your-project/
├── mods/
│   └── en-gb-bank-holidays.tfmod
└── config/
    └── en-gb-bank-holidays.json     — { "includeScottish": true, "yearsAhead": 10 }
```

Only keys the schema actually declares can be set — anything else is a
mistake worth surfacing, not a silent no-op:

```
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: config key "yearsAhead" must be <= 20, got 50 (using default)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: unknown config key "includeWelsh" (not declared in this mod's schema)
```

An invalid value for a declared key falls back to that key's default rather
than failing the whole mod — one typo'd number in a config file shouldn't
take down a working mod, but it's reported so the mistake doesn't go
unnoticed either. This is deliberately not JSON Schema: no nesting, no
`$ref`, no conditional rules — just the handful of primitive shapes an
actual setting realistically is, kept dependency-free the same way
`temporalFmtVersion` checking and `.tfmod` extraction are.

Loose `.mjs` mods have no manifest to declare a schema in, so
`register()`'s second argument is always `{}` for them — same as a `.tfmod`
mod that didn't declare a `config` field at all.

## Load order, dependencies, and conflicts

By default mods load in filename order — alphabetical, deterministic, but
not something you'd want to rely on once two mods actually need to run in a
specific order relative to each other. Two fields on the mod object
control that directly:

- `requires: string[]` — other mods' `name` fields that must load (and
  finish `register()`) before this one. The loader resolves this as a
  dependency graph, not just "sort requires first" — if A requires B and B
  requires nothing, B always loads first regardless of filename.
- `priority: number` — tiebreak for mods with no dependency relationship
  to each other. Higher loads later. Defaults to `0`.

```js
export default {
  name: 'extended-en-gb-holidays',
  requires: ['en-gb-bank-holidays'],
  priority: 10,
  register(ctx) {
    // runs after en-gb-bank-holidays, and after anything else at a lower priority
  },
};
```

Two failure modes come out of this, both reported per-mod without blocking
the rest:

- **Missing dependency** — `requires` names a mod that isn't in `mods/`.
  That mod fails to load; whatever it would've registered doesn't happen,
  and other mods that don't depend on it load normally.
- **Circular dependency** — A requires B requires A (or a longer cycle).
  Every mod in the cycle fails, each reported with what it's still waiting
  on.

Registration itself is still last-write-wins, same as calling
`registerLocale` twice for the same tag outside of mods — that's existing,
intentional behavior (see [Locales](./README.md#locales)), not something
mods change. What mods add is *visibility* into it: if two mods register
the same locale tag, the same relative-time-grammar language, or the same
custom token name, the load report calls it out as a conflict and says
which one won:

```
temporal-fmt mods:
  loaded holiday-pack-a (conflict-1.mjs)
  loaded holiday-pack-b (conflict-2.mjs)
  conflict on locale "cv-CV": holiday-pack-a, holiday-pack-b — "holiday-pack-b" wins (loaded last)
```

This is informational, not a failure — both mods still loaded, the last one
to register just took the key, and now you know it happened instead of
silently getting whichever mod's filename sorted last. If that's not what
you want, `priority` is the knob: raise the one that should win, or add a
`requires` so the loser explicitly runs first and the winner's intent is
unambiguous in the mod itself, not just in a startup log line.

Mod names have to be unique across `mods/` — two files claiming the same
`name` is ambiguous the moment either one shows up in another mod's
`requires`, so the second one to load fails with which file already claimed
that name.

## Overriding functions

The five registration functions above are additive — they add a locale, a
holiday set, a token, alongside whatever's already there.
`ctx.overrideFormat` and `ctx.overrideParse` work differently: they let a
mod replace the actual `format()`/`parse()` implementation everywhere in
the library, which is what makes a real bugfix or performance mod possible
rather than just new data being registered alongside an unfixed bug.

```js
export default {
  name: 'fast-format',
  register(ctx) {
    ctx.overrideFormat((original, value, formatStr, options) => {
      // Handle the one hot-path format string yourself; fall back to the
      // real implementation for everything else.
      if (formatStr === 'yyyy-MM-dd') {
        return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
      }
      return original(value, formatStr, options);
    });
  },
};
```

`impl` always receives the real built-in as its first argument
(`original`), regardless of what else is loaded — call it to keep existing
behavior for cases you're not trying to change, or ignore it to replace the
behavior outright. The override applies consistently everywhere in the
library, not just to whoever imports the function from the package root —
`formatRange()`'s internal use of `format()`, for instance, sees it too.
Remove the mod and restart, and it's back to the unmodified built-in;
nothing about this touches the source file on disk.

**Only one mod may hold each override point.** A second override call for
the same function — from any mod, even one that `requires` the first —
fails immediately with which mod already owns it:

```
temporal-fmt mods:
  loaded override-1 (a-override1.mjs)
  failed b-override2.mjs: temporal-fmt: "format" is already overridden by mod "override-1" — mod "override-2" can't also override it. [...]
```

This is a hard failure, not last-write-wins like the registration
functions — two mods silently fighting over the same function's behavior
is a correctness bug in whatever depends on this library, not a cosmetic
surprise. There's no mechanism for two separate mod files to layer through
the same override point in sequence; if two mods both need to change a
function's behavior, one has to incorporate the other's fix directly rather
than composing through the override twice.

**How an override runs under the sandbox.** A closure can't cross a process
boundary, so a mod that installs one keeps its subprocess alive, and every
`format()`/`parse()` call in the host forwards to it and waits for the
answer — synchronously, because those are synchronous APIs and their
result has to come back inside the caller's stack frame. What that costs
and what's done about it:

- Each overridden call is one round trip to the subprocess — a couple
  of milliseconds, not the nanoseconds of an in-process function call, plus
  a few more on Windows where the channel rides files (see
  [The sandbox](#the-sandbox)). An override in a hot loop is *slower than
  no override at all*, never mind faster. If your mod's whole point is
  performance, it has to save more than the bridge costs.
- The loader learns, per format string, whether your impl just forwards to
  the built-in. Format strings your mod passes through stop paying the
  round trip entirely after the first call; only the strings you actually
  change keep crossing the process boundary. `formatRange()`'s two
  endpoints batch into a single trip.
- If the subprocess stops answering — the mod's impl hangs, crashes, or
  hits a permission violation mid-call — the host stops waiting after 5
  seconds (shown in the load report), kills the subprocess, warns on
  stderr, and falls back to the built-in behavior for the rest of the
  process. One hung mod doesn't take your formatting down with it.
- The value your impl receives is rebuilt from its fields on the other
  side. For real Temporal inputs it's rehydrated as a Temporal instance of
  the same type; if your impl mutates the value (don't), the caller won't
  see it — nothing is shared across the boundary. Values and results that
  can't survive JSON serialization degrade the way JSON does: functions
  vanish, and a `bigint` throws.

**Which functions are overridable.** `format`, `formatToParts`, and `parse`
always were. Beyond those, any function in this library that nothing *else*
in the library calls internally is also overridable — if a function has
zero internal call sites, there's no risk of some other module holding a
stale direct reference that a mod's fix would silently fail to reach, so it
gets the same `overrideXxx()` treatment. As of this version, that's:

`compileFormat`, `compileParser`, `parseRelative`, `explainFormat`,
`tokenizeFormat`, `listTokens`, `tokenInfo`, `isValidFormat`,
`validateFormat`, `fieldForToken`, `monthsInYear`, `isLeapYear`,
`isLeapMonth`, `weekOfYear`, `weekYear`, `getMonth`, `getWeekday`,
`isEqual`, `isBefore`, `isAfter`, `clamp`, `isBetween`, `isToday`,
`isTomorrow`, `isYesterday`, `isSameDay`, `isSameWeek`, `isSameMonth`,
`isSameQuarter`, `isSameYear`, `isWeekday`, `floor`, `ceil`, `truncate`,
`parseRFC3339`, `formatRFC3339`, `parseRFC2822`, `parseHTTPDate`,
`fromUnixMicroseconds`, `fromUnixNanoseconds`, `toUnixSeconds`,
`toUnixMilliseconds`, `toUnixMicroseconds`, `toUnixNanoseconds`,
`parseSQL`, `formatSQL`, `formatDurationToParts`, `parseDuration`,
`parseISODuration`, `formatISODuration`, `balanceDuration`,
`compareDuration`, `subtractDuration`, `getLocale`, `hasLocale`,
`createConfig`, `mergeWithConfig`, `listRegisteredGrammars`, `interval`,
`overlaps`, `intersection`, `union`, `mergeIntervals`, `formatRangeToParts`,
`between`, `parseRRule`, `formatRRule`, `createBusinessCalendar`,
`subtractBusinessDays`, `nextHoliday`, `previousHoliday`, `resolveZoned`,
`getNextTransition`, `getPreviousTransition`, `possibleInstantsFor`,
`getAutocompleteData`, `getHoverDocs`, `getInlineDiagnostics`,
`previewFormat`, `getDocUrl`, `translateDateFnsFormatString`.

Each follows the `ctx.overrideXxx((original, ...args) => ...)` shape shown
above for `overrideFormat`. Functions *not* in this list — `round`,
`subtract`, `difference`, `formatDistance`, and others that other parts of
this library call directly — aren't overridable this way: something else
in the codebase holds its own direct reference to them, so a mod's
override would silently miss those internal callers, which is worse than
not offering the override at all. A function moves onto this list only
when an audit confirms nothing internal still calls it directly. If you
need to change one of those, that's a real feature request for making it
internally indirect first, not something `overrideFormat`-style code can
paper over.

**Custom token handlers are the one thing that runs host-side.** A
`createFormatter()` call inside register() is setup-time: the token table
(name, field, and each handler's source text) is shipped back to the host
and the `Formatter` is rebuilt in-process, because a formatter is a hot
path and every token lookup can't pay a subprocess round trip. The loader
verifies each handler is self-contained — it revives the handler from
source and compares its output against the original's before accepting it,
and refuses the mod with a clear reason if the revival doesn't behave the
same. So: a token handler must not close over anything outside its own
body, and its code runs in the host process at format() time. That last
part is the real trade — treat formatter-token mods as trusted code, same
as you'd treat anything you run in-process.

## If you're writing the mod in TypeScript

Compile it and rename the output before it goes in `mods/` — the loader
only accepts `.mjs`. It won't run a TS file for you, and it won't skip one
quietly either: a `.ts` file sitting in `mods/` shows up in the load report
as a failure with the exact compile command to run, because a mod that
silently never loads is worse than one that fails loudly.

```sh
tsc en-gb-bank-holidays.ts --module esnext --target esnext --outDir mods
mv mods/en-gb-bank-holidays.js mods/en-gb-bank-holidays.mjs
```

If you're importing `ModContext` or `Mod` for the types while you write it,
both are exported from `temporal-fmt` itself:

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

## What happens when a mod is broken

Each mod loads independently — one throwing doesn't stop the rest from
loading, and it doesn't stop the CLI command you actually ran. Every
failure mode ends up as one line in the report:

- Wrong file extension (`.ts`, `.js`, anything but `.mjs`) — reported with
  the compile-and-rename instructions above.
- Default export isn't shaped right (missing `name`, missing `register`,
  `register` isn't a function, or `requires`/`priority` are the wrong
  type) — reported with what was expected.
- The file fails to import (a syntax error, a bad import path inside the
  mod) — reported with the underlying error message.
- Two mods claim the same `name` — reported against whichever file loaded
  second.
- A `requires` entry names a mod that isn't present, or is part of a
  dependency cycle — see [Load order, dependencies, and
  conflicts](#load-order-dependencies-and-conflicts).
- `register()` throws — reported with the thrown message, same as any other
  registration call in this library (see [Typed
  errors](./README.md#typed-errors) for what `registerLocale`/
  `createHolidayCalendar` themselves throw on bad input).
- A required permission was denied — `denied required permission: <caps>`
  plus how to change the answer, before any of the mod's code runs (see
  [Permissions](#permissions)). An *optional* permission being denied
  isn't a failure: the mod runs with what it got and the report says
  `downgraded`.
- `register()` touches a capability that wasn't granted — the permission
  model's access error, plus (for a loose `.mjs` mod) the reminder that it
  can't request any. A mod that checks `ctx.hasPermission()` first can
  skip this fate; one that doesn't, hits the wall.
- `register()` doesn't finish within 10 seconds, a runtime override
  stops answering within 5, or the subprocess grows past the 512MB
  resident-memory ceiling — the subprocess is killed, that mod fails
  (or, at runtime, falls back to the built-in with a stderr warning), and
  the rest of the load pass is unaffected. The memory watch is RSS
  polled from the parent, so `ArrayBuffer` bytes count and
  `--max-old-space-size` set in the process tree doesn't neuter it.

None of these bring down the CLI. A `mods/` folder that doesn't exist is
the common case, not a failure — most runs won't have one, and the loader
stays silent about it rather than printing "no mods found" noise on every
command.

## Using mods outside the CLI

`loadMods()` lives in `scripts/loadMods.mjs` and ships with the published
package, alongside the sandbox it runs mods in
(`scripts/modSandbox.mjs`, `scripts/modWorker.mjs`, `scripts/modWire.mjs`),
the config resolver (`scripts/modConfig.mjs`), and the permission-cache
editor (`scripts/managePermissions.mjs`). If you're embedding
`temporal-fmt` in your own app rather than using the CLI, load it at your
own startup and the same sandboxing, prompting, and reporting apply:

```js
// A path into node_modules, not a bare specifier — the loader is
// Node-only ESM and deliberately isn't in package.json "exports".
import { loadMods, formatModLoadReport } from './node_modules/temporal-fmt/scripts/loadMods.mjs';

const report = await loadMods(); // defaults to ./mods
if (report.loaded.length > 0 || report.downgraded.length > 0 || report.failed.length > 0) {
  console.error('temporal-fmt mods:\n' + formatModLoadReport(report));
}
```

Why a path and not `temporal-fmt/scripts/loadMods.mjs`: the `exports` map
promises every listed subpath has a CommonJS form for `require()`
consumers, and a mod loader that spawns subprocesses has no honest CJS
twin. So the scripts ship in the package but stay off the exports map —
importing by path is the trade. If your bundler chokes on that, the old
option still works: copy the loader out and vendor it.

A mod that installs a runtime override keeps its subprocess alive for as
long as your process might call `format()`/`parse()` — but it won't keep
your process alive: the loader drops its event-loop references after
loading, and the subprocess shuts itself down when your process exits. If
you want deterministic teardown before then (a server that hot-reloads
mods, say), `stopModSubprocesses()` from `scripts/modSandbox.mjs` SIGTERMs
every live one.

Mod support (loose `.mjs` mods, `.tfmod` archives, and everything in this
document) requires `temporal-fmt` 0.9.4 or later — that's the version it
landed in. Subprocess sandboxing arrived after that; the load report tells
you when you're on a Node version where it's still experimental.
