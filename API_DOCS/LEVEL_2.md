# Mod API — Level 2 (0.9.6+)

Mods run in their own subprocess under Node's permission model, not the host process — no filesystem, child process, or worker access unless granted. This level adds everything that comes with that: permissions, `hasPermission`, per-mod settings, version pinning, and the full `overrideXxx` family for changing existing behavior instead of just adding new data.

## The sandbox

Every mod — loose `.mjs` and `.tfmod` alike — runs in its own subprocess started with Node's permission model ([`--permission`](https://nodejs.org/api/permissions.html) on Node 22.13+, `--experimental-permission` on Node 20 and early 22). With nothing granted, Node refuses the subprocess any filesystem read, filesystem write, child process, or worker thread access. The only way a mod affects the host is through `ModContext`, serialized over an inter-process channel.

What that means in practice:

- A mod can always read its own files — the `.mjs` file itself, or a `.tfmod`'s extracted contents including `data/`. The loader has to load the code, so its own location is readable by construction.
- Everything else needs a granted capability (see [Permissions](#permissions)) — denied capabilities aren't a polite request the mod can ignore, Node blocks the syscall.
- The subprocess doesn't inherit your environment variables. `process.env` inside a mod contains `PATH`, `TZ`, `LANG`, and a few Windows bootstrap variables, nothing else — there's no grant that changes this, since env vars are where secrets live and the permission model has no flag to gate them.
- `console.log` from a mod goes to stderr (the protocol channel is stdout, or on Windows the reply file).

Four things the sandbox does **not** do:

1. **It does not restrict network access.** No Node permission-model flag gates sockets on any supported version. A mod can still `import('node:http')` and make requests. If your threat model needs no network egress, don't run third-party mods.
2. **It does not sandbox `createFormatter` token handlers at format time.** Custom tokens are rebuilt from handler source and run in the host process (see [Which functions are overridable](#which-functions-are-overridable) for why) — treat a mod that registers custom tokens as trusted code for that table.
3. **It's a least-privilege control, not a defense against a determined attacker.** Node documents its permission model that way, and this sandbox inherits the ceiling.
4. **It contains runaway mods, it doesn't prevent them.** A 10-second watchdog on `register()`, a 5-second watchdog per runtime override call, and a 512MB resident-memory ceiling per subprocess kill a mod that hangs or balloons — killed before it takes the host down, which is containment, not prevention.

On Node 20 (and Node 22 before 22.13) the permission model is experimental and the load report says so. On Node 22.13+ it's stable.

## Permissions

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

That's the whole list. `fs:read`/`fs:write` are coarse on purpose — path scoping isn't something a yes/no prompt can express honestly. `net` and `env` don't exist as capabilities: network access can't be restricted by the permission model at all, and environment variables are simply never delivered to the subprocess. `addons` doesn't exist either — native code escapes every other restriction, so there's no meaningful way to grant it "a little."

A bare string array (`"permissions": ["fs:read"]`) still works — the pre-required/optional format, every entry treated as required. Leaving `required` off an object entry means the same thing.

On first load (and after a version bump), the loader asks in the terminal:

```
temporal-fmt: allow "data-reader" to access fs:read? (y/N)
```

Empty input is "no." A non-interactive context (CI, piped stdin) can't ask, so it denies by default and says so in the report.

**Required is a promise.** Denying a required capability fails the mod's load outright:

```
failed data-reader.tfmod: denied required permission: fs:read — "data-reader" won't load without it. Grant it with "node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read", or delete .temporal-fmt-permissions.json to re-ask everything.
```

Only mark a capability required when the mod is genuinely useless without it — every required capability is another prompt the user has to say yes to, and another way the load can fail. Anything the mod can live without belongs as optional plus a `hasPermission` check.

**Optional means the mod runs with less, and the report says so.** Denying an optional capability doesn't fail the load:

```
downgraded data-reader@1.0.0 (data-reader.tfmod) [sandboxed: fs:read granted, fs:write denied (optional)]
```

### `ctx.hasPermission(capability)`

Tells a mod what it actually got, so it can degrade instead of crashing:

```js
register(ctx) {
  let extra = {};
  if (ctx.hasPermission('fs:read')) {
    extra = JSON.parse(readFileSync('supplementary.json', 'utf8'));
  }
  ctx.registerLocaleVocab('xx-extra', baseVocabMergedWith(extra));
}
```

Nothing forces this — a mod that skips the check and touches the missing capability anyway fails with the permission model's access error, reported like any other `register()` crash. `net` always reads `false` (it isn't a real capability). Outside the sandbox — a context built in-process with `buildModContextFor()` — everything reads `true`, since nothing is gating it.

### Managing cached answers

Answers live in `.temporal-fmt-permissions.json`, next to `mods/`, keyed by `name@version`:

```json
{
  "data-reader@1.0.0": { "fs:read": true },
  "risky@2.3.0": { "fs:read": true, "fs:write": false }
}
```

Bump the mod's version and you're asked again. Keep it and the cached answer applies. Delete the file and everything is asked again. To change an answer without a fresh load:

```
node scripts/managePermissions.mjs list
node scripts/managePermissions.mjs grant data-reader@1.0.0 fs:read
node scripts/managePermissions.mjs deny data-reader@1.0.0 fs:write
node scripts/managePermissions.mjs reset data-reader@1.0.0
```

`grant`/`deny` flip one entry with no prompt. `reset` clears a mod's cached answers so the next load re-asks — for reconsidering without bumping the version. All of these write the same file the load-time prompts read, so there's one cache, not two that can drift. A mod with no `version` field is addressed by its bare name; `list` prints the exact key.

## Pinning to a `temporal-fmt` version

`mod.json` can declare `temporalFmtVersion` — an exact version (`"0.9.32"`) or a caret range (`"^0.9.0"`, meaning `>=0.9.0 <0.10.0`, same as npm's `^`). If the installed `temporal-fmt` doesn't satisfy it, the mod fails before `main.mjs` is ever imported:

```
failed holidays.tfmod: "en-gb-bank-holidays" needs temporal-fmt ^2.0.0 (>=2.0.0 <3.0.0), host is 0.9.32
```

This exists because a mod built against one version's override surface has no way to know if a later release moved a function it depends on — without this check it would fail with whatever confusing error `register()` throws, or worse, silently do nothing.

Omitting `temporalFmtVersion` is allowed — the mod loads against whatever's installed. Loose `.mjs` mods have no manifest to put this in at all, one real reason to prefer `.tfmod` for anything you plan to distribute. This is a single boolean check, not dependency resolution — it has no effect on load order.

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

Four setting types: `string`, `number` (optional `min`/`max`), `boolean`, `enum` (a string constrained to `choices`). Every entry needs a `key` and a `default` — the default is what `register()` gets with no override, so a mod with no `config/<name>.json` on disk still runs, entirely on defaults.

Override a setting at `config/<mod-name>.json`, next to `mods/`, not inside it (updating the `.tfmod` never touches a user's settings this way):

```
your-project/
├── mods/
│   └── en-gb-bank-holidays.tfmod
└── config/
    └── en-gb-bank-holidays.json     — { "includeScottish": true, "yearsAhead": 10 }
```

Only declared keys can be set:

```
temporal-fmt mods:
  loaded en-gb-bank-holidays@1.0.0 (en-gb-bank-holidays.tfmod)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: config key "yearsAhead" must be <= 20, got 50 (using default)
  failed config/en-gb-bank-holidays.json: en-gb-bank-holidays: unknown config key "includeWelsh" (not declared in this mod's schema)
```

An invalid value falls back to that key's default rather than failing the whole mod — reported, but not fatal. This is deliberately not JSON Schema: no nesting, no `$ref`, just the handful of primitive shapes a setting realistically needs.

Loose `.mjs` mods have no manifest to declare a schema in, so `register()`'s second argument is always `{}` for them.

## Overriding functions

The registration functions from Level 1 are additive. `ctx.overrideFormat`, `ctx.overrideParse`, and the rest of the `overrideXxx` family work differently — they replace the actual implementation everywhere in the library, which is what makes a real bugfix or performance mod possible instead of just new data sitting next to an unfixed bug.

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

`impl` always receives the real built-in as `original`, regardless of what else is loaded — call it to keep existing behavior for cases you're not changing, or ignore it to replace the behavior outright. The override applies everywhere in the library, including internal call sites (`formatRange()`'s use of `format()`, for instance). Remove the mod and it's back to the unmodified built-in — nothing touches the source on disk.

**Only one mod may hold each override point.** A second override call for the same function, from any mod, fails immediately:

```
temporal-fmt mods:
  loaded override-1 (a-override1.mjs)
  failed b-override2.mjs: temporal-fmt: "format" is already overridden by mod "override-1" — mod "override-2" can't also override it. [...]
```

Hard failure, not last-write-wins — two mods silently fighting over the same function's behavior is a correctness bug, not a cosmetic surprise. If two mods both need to change one function, one has to incorporate the other's fix directly; there's no mechanism to layer two overrides on the same point.

### How an override runs under the sandbox

A closure can't cross a process boundary, so a mod that installs an override keeps its subprocess alive, and every `format()`/`parse()` call in the host forwards to it and waits — synchronously, since these are synchronous APIs.

- Each overridden call is one round trip to the subprocess — milliseconds, not nanoseconds, more on Windows where the channel rides files. An override in a hot loop is *slower* than no override at all; if your mod's whole point is performance, it has to save more than the bridge costs.
- The loader learns, per format string, whether your impl just forwards to the built-in. Strings your mod passes through stop paying the round trip after the first call; only the strings you actually change keep crossing the boundary. `formatRange()`'s two endpoints batch into one trip.
- If the subprocess stops answering — hangs, crashes, hits a permission violation mid-call — the host stops waiting after 5 seconds, kills the subprocess, warns on stderr, and falls back to the built-in for the rest of the process.
- The value your impl receives is rebuilt from its fields on the other side. Real Temporal inputs come back as the same Temporal type; if your impl mutates the value (don't), the caller won't see it. Anything that can't survive JSON serialization degrades the way JSON does — functions vanish, `bigint` throws.

### Which functions are overridable

`format`, `formatToParts`, and `parse` always were. Beyond those: any function nothing *else* in the library calls internally, since a mod's override can't be silently missed by some other module holding a stale direct reference. As of this level, that's every one of these, each following the same `ctx.overrideXxx((original, ...args) => ...)` shape:

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

Functions *not* on this list — `round`, `subtract`, `difference`, `formatDistance`, and others something else in the codebase calls directly — aren't overridable this way, since a mod's override would silently miss those internal callers. A function joins this list only once an audit confirms nothing internal calls it directly anymore. Needing to change one of those is a real feature request for making it internally indirect first, not something to route around.

### Custom token handlers run host-side

A `createFormatter()` call inside `register()` is setup-time: the token table (name, field, and each handler's source text) ships back to the host and the `Formatter` is rebuilt in-process, since a formatter is a hot path and every token lookup can't pay a subprocess round trip. The loader revives each handler from source, compares its output against the original, and refuses the mod if the revival doesn't match. So: a token handler must not close over anything outside its own body, and it runs in the host process at `format()` time — treat formatter-token mods as trusted code, same as anything you'd run in-process directly.

## When a mod is broken (permission and sandbox failures)

Everything from [LEVEL_1.md](./LEVEL_1.md#when-a-mod-is-broken) still applies. Level 2 adds:

- A required permission was denied — `denied required permission: <caps>` plus how to change the answer, before any mod code runs. An optional permission being denied isn't a failure: the mod runs with what it got, reported as `downgraded`.
- `register()` touches a capability that wasn't granted — the permission model's access error, plus (for a loose `.mjs` mod) a reminder that it can't request any at all. Checking `ctx.hasPermission()` first avoids this; skipping the check hits the wall.
- `register()` doesn't finish within 10 seconds, a runtime override call stops answering within 5, or the subprocess crosses the 512MB resident-memory ceiling — the subprocess is killed, that mod fails (or at runtime, falls back to the built-in with a stderr warning), and the rest of the load pass is unaffected.

## Using mods outside the CLI

Same as Level 1's [`loadMods()`](./LEVEL_1.md#using-mods-outside-the-cli), plus the sandbox pieces that ship alongside it: `scripts/modSandbox.mjs`, `scripts/modWorker.mjs`, `scripts/modWire.mjs` run the subprocess side, `scripts/modConfig.mjs` resolves `config/`, and `scripts/managePermissions.mjs` edits the permission cache.

A mod with a runtime override keeps its subprocess alive as long as your process might call `format()`/`parse()`, but it won't keep your process alive — the loader drops its event-loop references after loading, and the subprocess shuts itself down when your process exits. For deterministic teardown before then (a server that hot-reloads mods), call `stopModSubprocesses()` from `scripts/modSandbox.mjs` to SIGTERM every live one.

Subprocess sandboxing landed after 0.9.4; the load report tells you when you're on a Node version where the permission model is still experimental.
