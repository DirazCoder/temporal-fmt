// Loads community mods from a folder — drop a .mjs file in mods/, it
// gets picked up on startup and registered against the library through
// ModContext (see src/modApi.ts). Modeled on the Minecraft-style "mods
// folder" convention: no manifest step, no publishing to a registry,
// just a file on disk that the host looks for and runs.
//
// This lives in scripts/, not src/, on purpose. readdir/dynamic-import
// are Node-only, and src/ is what gets published and bundled for
// non-Node consumers too (tsup builds esm+cjs, ships a .d.ts) — pulling
// fs/path into that surface would mean anyone importing plain format()
// drags in Node-only code they never asked for. The CLI is already
// Node-only, so this is the right layer for it.
//
// Two on-disk shapes are accepted:
//
//   1. A loose .mjs file — the original, still-simplest case. TypeScript
//      mods have to be compiled and renamed first — the loader can't run
//      a TS transpile step itself without pulling in a compiler as a
//      dependency, which the rest of this package deliberately avoids
//      (see README -> Providing Temporal for the same reasoning applied
//      to the polyfill). A .ts file sitting in mods/ fails loudly with a
//      message telling the author to build it, rather than getting
//      silently skipped — silent skip is how someone loses an afternoon
//      wondering why their mod never ran.
//
//   2. A .tfmod archive — a gzipped tar (same format as .tgz, renamed
//      for identity) containing mod.json (metadata: name/version/main/
//      requires/priority) plus main.mjs and, optionally, a data/
//      directory of files main.mjs can read at register() time. This
//      exists for mods that need more than one file, and so the loader
//      can learn a mod's name/requires without executing any of its
//      code — mod.json is read directly from the archive, no import()
//      happens until dependency order is already decided. Loose .mjs
//      mods don't get this: the loader has to import() them just to
//      read `name` off the default export, which is fine at the current
//      "few files, run once at CLI startup" scale but wouldn't be if
//      this needed to list installed mods without running any of them.
//
// Loading is two passes either way. Pass one collects every mod's
// name/requires/priority without calling register() yet (via mod.json
// for .tfmod, via import() for .mjs) — order can't be decided until
// every mod's declared dependencies are known. Pass two resolves a load
// order from those dependencies (priority as a tiebreak, then filename
// as the final tiebreak) and only then imports (for .tfmod) and runs
// each mod's register() in that order, tracking which mod touched which
// registration key so conflicts can be reported afterward.

import { readdir, mkdtemp, rm, readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildTrackedModContext, isMod, OverrideConflictError } from '../dist/index.js';
import { checkVersionRange } from './semverRange.mjs';
import { isValidConfigSchema, resolveConfig } from './modConfig.mjs';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);

// Read once at module load, not per-mod — the host version can't
// change mid-process. createRequire is the simplest way to read JSON
// from an ESM file without an import-assertion syntax that varies
// across the Node versions this loader needs to run on.
const HOST_VERSION = createRequire(import.meta.url)('../package.json').version;

// Same order of magnitude as MAX_CUSTOM_VOCABS in src/localeRegistry.ts —
// a mods folder with thousands of entries is either a mistake (pointed
// at the wrong directory) or someone testing the loader's limits, not a
// real use case.
const MAX_MOD_FILES = 500;

// Extraction shells out to the system `tar` rather than adding a tar/
// gzip-parsing dependency — this package stays dependency-free by
// design (see README -> Providing Temporal for the same call made about
// the Temporal polyfill), and `tar` is effectively universal on systems
// that would run a Node CLI. If it's missing, the .tfmod fails with a
// clear reason instead of a cryptic ENOENT from execFile.
async function extractTfmod(archivePath, destDir) {
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir]);
}

// Validates the shape the loader actually reads off mod.json — a subset
// of Mod's fields (no `register`, since mod.json is data, not code) plus
// `main`, the entry-point filename inside the archive, plus two fields
// only .tfmod mods get to declare (loose .mjs mods have no manifest to
// put them in): `temporalFmtVersion`, a semver range or exact version
// this mod was built against; and `config`, a schema for user-editable
// settings (see modConfig.mjs). Both are optional — a mod that doesn't
// need either just omits them.
function isValidManifest(value) {
  if (typeof value !== 'object' || value === null) return false;
  const v = value;
  if (typeof v.name !== 'string' || v.name.length === 0) return false;
  if (typeof v.main !== 'string' || v.main.length === 0) return false;
  if (v.version !== undefined && typeof v.version !== 'string') return false;
  if (v.requires !== undefined && !(Array.isArray(v.requires) && v.requires.every((r) => typeof r === 'string'))) return false;
  if (v.priority !== undefined && typeof v.priority !== 'number') return false;
  if (v.temporalFmtVersion !== undefined && typeof v.temporalFmtVersion !== 'string') return false;
  if (v.config !== undefined && !isValidConfigSchema(v.config)) return false;
  return true;
}

async function importMjsMods(absDir, mjsFiles) {
  const entries = [];
  const failed = [];
  for (const file of mjsFiles) {
    const fullPath = join(absDir, file);
    let mod;
    try {
      const imported = await import(pathToFileURL(fullPath).href);
      mod = imported.default;
    } catch (err) {
      failed.push({ file, reason: `failed to import: ${err.message}` });
      continue;
    }
    if (!isMod(mod)) {
      failed.push({
        file,
        reason: 'default export must be an object with a "name" string, a "register" function, and — if present — "requires" as a string array and "priority" as a number',
      });
      continue;
    }
    entries.push({ file, kind: 'mjs', mod, importPath: fullPath, configSchema: undefined });
  }
  return { entries, failed };
}

// Extracts every .tfmod into its own subdirectory of `scratchDir` and
// reads mod.json out of each — no main.mjs gets imported here. That's
// the whole point of the manifest: the loader can find out a mod's
// name/requires (needed for pass-two ordering) without running any of
// the mod's own code first.
async function readTfmodManifests(absDir, tfmodFiles, scratchDir) {
  const entries = [];
  const failed = [];
  for (const file of tfmodFiles) {
    const archivePath = join(absDir, file);
    const extractDir = join(scratchDir, basename(file, '.tfmod'));
    try {
      // fs.mkdir with recursive:true instead of spawning the `mkdir`
      // binary — `mkdir -p` doesn't exist as an executable on Windows
      // (cmd.exe's mkdir is a shell builtin, not something spawn() can
      // find on PATH), so this failed every .tfmod extraction there with
      // ENOENT even though it worked fine on POSIX. fs.promises.mkdir is
      // the actual cross-platform primitive for this, no subprocess or
      // shell needed.
      await mkdir(extractDir, { recursive: true });
      await extractTfmod(archivePath, extractDir);
    } catch (err) {
      failed.push({ file, reason: `couldn't extract archive: ${err.message}` });
      continue;
    }

    let manifest;
    try {
      const raw = await readFile(join(extractDir, 'mod.json'), 'utf8');
      manifest = JSON.parse(raw);
    } catch (err) {
      failed.push({ file, reason: `couldn't read mod.json from archive: ${err.message}` });
      continue;
    }

    if (!isValidManifest(manifest)) {
      failed.push({
        file,
        reason:
          'mod.json must have a "name" string and a "main" string, and — if present — "version" as a string, "requires" as a string array, "priority" as a number, "temporalFmtVersion" as a string, and "config" as a valid settings schema',
      });
      continue;
    }

    // Checked here, before dependency ordering or register() ever run,
    // so a version mismatch fails this one mod cleanly instead of
    // surfacing later as a confusing runtime error from code that
    // assumed an API this host version doesn't have.
    if (manifest.temporalFmtVersion !== undefined) {
      const versionCheck = checkVersionRange(HOST_VERSION, manifest.temporalFmtVersion);
      if (!versionCheck.ok) {
        failed.push({ file, reason: `"${manifest.name}" ${versionCheck.reason}` });
        continue;
      }
    }

    const mainPath = join(extractDir, manifest.main);
    try {
      await stat(mainPath);
    } catch {
      failed.push({ file, reason: `mod.json names "main": "${manifest.main}", but that file isn't in the archive` });
      continue;
    }

    entries.push({
      file,
      kind: 'tfmod',
      mod: { name: manifest.name, version: manifest.version, requires: manifest.requires, priority: manifest.priority },
      importPath: mainPath,
      configSchema: manifest.config,
    });
  }
  return { entries, failed };
}

// Kahn's algorithm for the dependency order, with a `ready` queue kept
// sorted by (priority ascending, original file order) so ties resolve
// the same way every run.
function resolveLoadOrder(entries) {
  const byName = new Map(entries.map((e) => [e.mod.name, e]));
  const originalIndex = new Map(entries.map((e, i) => [e.mod.name, i]));
  const failed = [];
  const indegree = new Map(entries.map((e) => [e.mod.name, 0]));
  const dependents = new Map(entries.map((e) => [e.mod.name, []]));
  const missingDep = new Set();

  for (const e of entries) {
    for (const dep of e.mod.requires ?? []) {
      if (!byName.has(dep)) {
        failed.push({ file: e.file, reason: `requires "${dep}", which isn't present in mods/` });
        missingDep.add(e.mod.name);
        continue;
      }
      indegree.set(e.mod.name, indegree.get(e.mod.name) + 1);
      dependents.get(dep).push(e.mod.name);
    }
  }

  // A mod with a missing dependency is already excluded from the run.
  // Dropping it from the graph means it can't gate mods that don't
  // depend on it, and it won't get reported a second time by the cycle
  // check below.
  const remaining = entries.filter((e) => !missingDep.has(e.mod.name));

  const sortKey = (e) => [e.mod.priority ?? 0, originalIndex.get(e.mod.name)];
  const readyBefore = (a, b) => {
    const [ap, ai] = sortKey(a);
    const [bp, bi] = sortKey(b);
    return ap !== bp ? ap - bp : ai - bi;
  };

  const ready = remaining.filter((e) => indegree.get(e.mod.name) === 0).sort(readyBefore);
  const order = [];

  while (ready.length > 0) {
    const next = ready.shift();
    order.push(next);
    for (const depName of dependents.get(next.mod.name)) {
      indegree.set(depName, indegree.get(depName) - 1);
      if (indegree.get(depName) === 0) {
        const depEntry = byName.get(depName);
        const insertAt = ready.findIndex((e) => readyBefore(depEntry, e) < 0);
        if (insertAt === -1) ready.push(depEntry);
        else ready.splice(insertAt, 0, depEntry);
      }
    }
  }

  if (order.length < remaining.length) {
    // Whatever's left has indegree > 0 with nothing left to unlock it —
    // a cycle. Report each stuck mod with who it's still waiting on, so
    // the author doesn't have to reconstruct the cycle by hand.
    const orderedNames = new Set(order.map((e) => e.mod.name));
    for (const e of remaining) {
      if (orderedNames.has(e.mod.name)) continue;
      const waitingOn = (e.mod.requires ?? []).filter((dep) => !orderedNames.has(dep) && byName.has(dep));
      failed.push({ file: e.file, reason: `circular dependency — still waiting on: ${waitingOn.join(', ')}` });
    }
  }

  return { order, failed };
}

// User config files live next to mods/, not inside it — config is the
// host machine's data (which mods/*.tfmod are just installed software),
// and keeping it out of mods/ means re-downloading or updating a
// .tfmod never touches a user's settings. Default sibling location:
// dir's parent + "config", so the common "./mods" + "./config" pairing
// needs no extra argument, but any dir can still pass its own.
async function readUserConfig(configDir, modName) {
  const configPath = join(configDir, `${modName}.json`);
  try {
    const raw = await readFile(configPath, 'utf8');
    return { value: JSON.parse(raw), path: configPath, existed: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { value: undefined, path: configPath, existed: false };
    // Malformed JSON or a permissions error is worth surfacing as a
    // failure for this mod rather than silently falling back to
    // defaults — a config file that exists but can't be read is very
    // likely a mistake the user wants to know about.
    return { value: undefined, path: configPath, existed: true, error: err.message };
  }
}

export async function loadMods(dir = './mods', configDir = join(resolve(dir), '..', 'config')) {
  const report = { loaded: [], failed: [], conflicts: [] };
  const absDir = resolve(dir);
  const absConfigDir = resolve(configDir);

  let dirEntries;
  try {
    dirEntries = await readdir(absDir);
  } catch (err) {
    // No mods/ folder is the common case, not an error — most installs
    // won't have one. Anything else (permissions, a file where a
    // directory should be) is worth surfacing.
    if (err.code === 'ENOENT') return report;
    report.failed.push({ file: absDir, reason: `couldn't read mods directory: ${err.message}` });
    return report;
  }

  if (dirEntries.length > MAX_MOD_FILES) {
    report.failed.push({
      file: absDir,
      reason: `mods directory has ${dirEntries.length} entries, more than the ${MAX_MOD_FILES}-file limit — check this is the right folder`,
    });
    return report;
  }

  for (const file of dirEntries.filter((f) => extname(f) === '.ts')) {
    report.failed.push({
      file,
      reason: 'mods must be .mjs, not .ts — compile it first (tsc file.ts --module esnext --target esnext) and rename the output to .mjs',
    });
  }

  const mjsFiles = dirEntries.filter((f) => extname(f) === '.mjs').sort();
  const tfmodFiles = dirEntries.filter((f) => extname(f) === '.tfmod').sort();

  // .tfmod archives get extracted to a scratch dir under the OS temp
  // directory, cleaned up once this call is done regardless of outcome
  // — extraction is a side effect of loading, not something that should
  // accumulate on disk across runs.
  let scratchDir = null;
  let mjsEntries = [];
  let tfmodEntries = [];
  try {
    const mjsResult = await importMjsMods(absDir, mjsFiles);
    mjsEntries = mjsResult.entries;
    report.failed.push(...mjsResult.failed);

    if (tfmodFiles.length > 0) {
      scratchDir = await mkdtemp(join(tmpdir(), 'temporal-fmt-tfmod-'));
      const tfmodResult = await readTfmodManifests(absDir, tfmodFiles, scratchDir);
      tfmodEntries = tfmodResult.entries;
      report.failed.push(...tfmodResult.failed);
    }

    const entries = [...mjsEntries, ...tfmodEntries];

    // Duplicate mod names would make the dependency graph ambiguous — a
    // `requires: ['x']` is meaningless if two files both call themselves
    // "x". Catch this before graph resolution rather than let whichever
    // one a Map happened to see last quietly win. Duplicates across the
    // two formats (an .mjs and a .tfmod both named "x") collide the same
    // way as two of the same format would.
    const seenNames = new Map();
    const uniqueEntries = [];
    for (const e of entries) {
      const prior = seenNames.get(e.mod.name);
      if (prior) {
        report.failed.push({ file: e.file, reason: `mod name "${e.mod.name}" is already used by ${prior} — mod names must be unique across mods/` });
        continue;
      }
      seenNames.set(e.mod.name, e.file);
      uniqueEntries.push(e);
    }

    const { order, failed: orderFailures } = resolveLoadOrder(uniqueEntries);
    report.failed.push(...orderFailures);

    const registeredBy = new Map(); // "kind:key" -> [{ file, name }]

    for (const entry of order) {
      const { file, kind, mod, importPath, configSchema } = entry;
      let registerFn = mod.register;

      // .tfmod entries only had their manifest read in pass one — the
      // actual register() function lives in main.mjs, imported now that
      // load order is settled and this mod is confirmed to run.
      if (kind === 'tfmod') {
        let imported;
        try {
          imported = await import(pathToFileURL(importPath).href);
        } catch (err) {
          report.failed.push({ file, reason: `failed to import "${mod.name}"'s main file: ${err.message}` });
          continue;
        }
        const mainExport = imported.default;
        if (typeof mainExport?.register !== 'function') {
          report.failed.push({ file, reason: `"${mod.name}"'s main file's default export must have a "register" function` });
          continue;
        }
        registerFn = mainExport.register;
      }

      // Config only applies to .tfmod mods with a declared schema — a
      // loose .mjs mod has no manifest to put a schema in, so it always
      // gets {}, same as a .tfmod mod that didn't declare one. Every
      // mod's register() can rely on a second argument existing;
      // whether it has any keys depends on whether the mod asked for
      // any.
      let resolvedConfig = {};
      if (configSchema) {
        const userConfig = await readUserConfig(absConfigDir, mod.name);
        if (userConfig.error) {
          report.failed.push({ file, reason: `couldn't read config/${mod.name}.json: ${userConfig.error}` });
          continue;
        }
        const { config, errors } = resolveConfig(configSchema, userConfig.value);
        resolvedConfig = config;
        // Bad individual keys don't fail the whole mod — they fall back
        // to that key's default (see resolveConfig) and get reported
        // here so the user can fix their config file, same spirit as a
        // conflict report: surfaced, not silently swallowed, but not a
        // hard stop either.
        for (const errorMsg of errors) {
          report.failed.push({ file: userConfig.path, reason: `${mod.name}: ${errorMsg} (using default)` });
        }
      }

      const touched = [];
      const trackedCtx = buildTrackedModContext(mod.name, (regKey) => touched.push(regKey));

      try {
        await registerFn(trackedCtx, resolvedConfig);
      } catch (err) {
        if (err instanceof OverrideConflictError) {
          report.failed.push({ file, reason: err.message });
        } else {
          report.failed.push({ file, reason: `register() threw: ${err.message}` });
        }
        continue;
      }

      for (const { kind: regKind, key } of touched) {
        const mapKey = `${regKind}:${key}`;
        if (!registeredBy.has(mapKey)) registeredBy.set(mapKey, []);
        registeredBy.get(mapKey).push({ file, name: mod.name });
      }

      report.loaded.push({ file, name: mod.name, version: mod.version });
    }

    for (const [mapKey, registrants] of registeredBy) {
      if (registrants.length < 2) continue;
      const [regKind, key] = mapKey.split(':');
      report.conflicts.push({
        kind: regKind,
        key,
        mods: registrants.map((r) => r.name),
        winner: registrants[registrants.length - 1].name,
      });
    }

    return report;
  } finally {
    if (scratchDir) {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function formatModLoadReport(report) {
  const lines = [];
  for (const m of report.loaded) {
    lines.push(`  loaded ${m.name}${m.version ? `@${m.version}` : ''} (${m.file})`);
  }
  for (const f of report.failed) {
    lines.push(`  failed ${f.file}: ${f.reason}`);
  }
  for (const c of report.conflicts ?? []) {
    lines.push(`  conflict on ${c.kind} "${c.key}": ${c.mods.join(', ')} — "${c.winner}" wins (loaded last)`);
  }
  return lines.join('\n');
}
