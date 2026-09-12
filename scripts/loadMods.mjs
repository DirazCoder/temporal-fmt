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
//      requires/priority/permissions) plus main.mjs and, optionally, a
//      data/ directory of files main.mjs can read at register() time.
//      This exists for mods that need more than one file, so the loader
//      can learn a mod's name/requires without executing any of its
//      code — mod.json is read directly from the archive, no import()
//      happens until dependency order is already decided — and because
//      it's the only shape that can request capabilities (a loose .mjs
//      file has no manifest to declare permissions in, so it runs with
//      none; see MODS.md).
//
// Loading is two passes either way. Pass one collects every mod's
// name/requires/priority without calling register() yet (via mod.json
// for .tfmod, via a sandboxed subprocess import for .mjs — see
// scripts/modSandbox.mjs) — order can't be decided until every mod's
// declared dependencies are known. Pass two resolves a load order from
// those dependencies (priority as a tiebreak, then filename as the
// final tiebreak) and runs each mod's register() — in its own sandboxed
// subprocess with only the capabilities the user granted, its
// registrations replayed here against the real registry, tracking which
// mod touched which registration key so conflicts can be reported
// afterward.
//
// register() never runs in this process anymore. A mod that only
// registers data (a locale, a holiday set) runs in a short-lived
// subprocess that exits once its registrations have been handed back; a
// mod that installs a runtime override (overrideFormat/overrideParse/
// any ctx.override*) keeps its subprocess alive as the target of a
// synchronous pipe bridge, because that closure has to answer every
// later format()/parse() call and it can't leave the sandbox.

import { readdir, mkdtemp, rm, readFile, stat, mkdir, realpath } from 'node:fs/promises';
import { join, extname, resolve, basename, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildTrackedModContext, OverrideConflictError } from '../dist/index.js';
import { checkVersionRange } from './semverRange.mjs';
import { isValidConfigSchema, resolveConfig } from './modConfig.mjs';
import { createRequire } from 'node:module';
import {
  GRANTABLE_PERMISSIONS,
  createSandboxContext,
  describeMjsMods,
  resolvePermissions,
  runModInSandbox,
  makeOverrideBridgeImpl,
  runtimeTimeoutMs,
  memoryCeilingMb,
} from './modSandbox.mjs';
import { fromWire, rehydrateFormatterOptions, isExperimentalPermissionModel } from './modWire.mjs';

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
// `main`, the entry-point filename inside the archive, plus fields only
// .tfmod mods get to declare (loose .mjs mods have no manifest to put
// them in): `temporalFmtVersion`, a semver range or exact version this
// mod was built against; `config`, a schema for user-editable settings
// (see modConfig.mjs); and `permissions`, the capabilities the mod
// wants, each marked required or optional. All are optional — a mod that
// doesn't need any just omits them.
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
  if (v.permissions !== undefined && !(Array.isArray(v.permissions) && v.permissions.every(isValidPermissionEntry))) return false;
  return true;
}

// Two shapes say the same thing: "fs:read" (a bare capability — the
// pre-required/optional format, still accepted so nothing that used to
// hard-fail on denial silently downgrades) or { "capability": "fs:read",
// "required": true }. A missing "required" means required: a mod that
// doesn't say is asking, not wishing.
function isValidPermissionEntry(p) {
  if (typeof p === 'string') return true;
  return (
    typeof p === 'object' && p !== null &&
    typeof p.capability === 'string' &&
    (p.required === undefined || typeof p.required === 'boolean')
  );
}

function normalizePermissions(permissions) {
  return permissions.map((p) =>
    typeof p === 'string' ? { capability: p, required: true } : { capability: p.capability, required: p.required ?? true }
  );
}

// Containment check for paths that come out of a .tfmod manifest. The
// manifest's "main" (and the mod name, for config lookups) is
// attacker-controlled archive data — the loader's documented contract is
// that a .tfmod is self-contained: code comes from inside the extraction
// dir, config comes from inside the config dir. Without this check a
// manifest could declare "main": "../../../some/file/outside.mjs" and
// have the loader import() a file that isn't part of the archive the
// user installed (breaking the "archive contents == executed code"
// review assumption), or a mod name like "../../secrets" that reads a
// config JSON from outside the config tree. Absolute paths, traversal
// segments, and symlinks that resolve outside the sandbox are all
// rejected before stat/import/read ever happens.
function isContainedInside(baseDir, targetPath) {
  // resolve() collapses `..` segments textually and, when the target is
  // absolute, discards the base entirely — either way the result is a
  // canonical absolute path to compare against the base with
  // path.relative: anything outside base prefixes with `..` (or lands on
  // a different absolute root), which is exactly what we reject.
  const base = resolve(baseDir);
  const target = resolve(baseDir, targetPath);
  const rel = relative(base, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// Validates the two manifest-controlled strings that reach the
// filesystem: mod.json's "main" (imported as code) and the mod name
// (used to find config/<name>.json). Returns a failure reason string on
// a bad value, undefined on a good one.
function manifestPathFailure(kind, value) {
  if (isAbsolute(value)) {
    return `mod.json "${kind}" must be a relative path inside the archive, got an absolute path "${value}"`;
  }
  if (value.split(/[\\/]/).includes('..')) {
    return `mod.json "${kind}" must not contain ".." path segments (got "${value}") — a .tfmod mod runs only files from inside its own archive`;
  }
  return undefined;
}

// Extracts every .tfmod into its own subdirectory of `scratchDir` and
// reads mod.json out of each — no main.mjs gets imported here. That's
// the whole point of the manifest: the loader can find out a mod's
// name/requires/permissions (needed for pass-two ordering and the
// permission prompts) without running any of the mod's own code first.
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
          'mod.json must have a "name" string and a "main" string, and — if present — "version" as a string, "requires" as a string array, "priority" as a number, "temporalFmtVersion" as a string, "config" as a valid settings schema, and "permissions" as an array of capabilities or { capability, required } entries',
      });
      continue;
    }

    const permissions = normalizePermissions(manifest.permissions ?? []);

    // The permission list is closed on purpose. Anything a mod declares
    // that no flag can back would be a permission the loader claims to
    // enforce but can't, so this fails the mod with the full set of what
    // exists and why the common absences (network, environment) don't.
    const unknown = permissions.filter((p) => !GRANTABLE_PERMISSIONS.includes(p.capability)).map((p) => p.capability);
    if (unknown.length > 0) {
      failed.push({
        file,
        reason:
          `mod.json "permissions" includes ${unknown.map((p) => `"${p}"`).join(', ')} — supported capabilities are ` +
          `${GRANTABLE_PERMISSIONS.join(', ')}. Network access isn't offered because Node's permission model can't restrict it ` +
          `on any supported version, and environment variables can't be granted, only scrubbed (they are).`,
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

    // "main" is archive-controlled data — reject absolute paths and
    // traversal segments before join/stat/import can escape the
    // extraction dir (see manifestPathFailure). This is a security
    // boundary, not a nicety: the loader promises that a .tfmod only
    // executes code from inside its own archive.
    const mainFailure = manifestPathFailure('main', manifest.main);
    if (mainFailure) {
      failed.push({ file, reason: mainFailure });
      continue;
    }

    const mainPath = join(extractDir, manifest.main);
    try {
      await stat(mainPath);
    } catch {
      failed.push({ file, reason: `mod.json names "main": "${manifest.main}", but that file isn't in the archive` });
      continue;
    }
    // stat() follows symlinks — a tar member could be a symlink pointing
    // outside the extraction dir. Re-check containment on the resolved
    // real path so import() can't follow a link out of the sandbox even
    // though the textual path looked clean.
    const realMain = await realpath(mainPath).catch(() => mainPath);
    const realExtractDir = await realpath(extractDir).catch(() => extractDir);
    if (!isContainedInside(realExtractDir, realMain)) {
      failed.push({
        file,
        reason: `mod.json "main" ("${manifest.main}") resolves outside the mod's extraction directory — a .tfmod mod runs only files from inside its own archive`,
      });
      continue;
    }

    entries.push({
      file,
      kind: 'tfmod',
      mod: { name: manifest.name, version: manifest.version, requires: manifest.requires, priority: manifest.priority },
      // realMain/realExtractDir, not the raw paths: spawnWorker() grants
      // --allow-fs-read on the realpath'd extraction dir (see realRoot()
      // in modSandbox.mjs), because the OS temp dir is itself a symlink
      // on macOS (/tmp -> /private/tmp, /var -> /private/var) and on some
      // Windows setups. If the worker then imports the raw, non-realpath
      // path, Node's permission model sees a path outside what was
      // granted and refuses it — the grant and the access have to agree
      // on which side of the symlink they're both talking about.
      importPath: realMain,
      extractDir: realExtractDir,
      configSchema: manifest.config,
      permissions,
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
        else ready.splice(insertAt, 1, depEntry);
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
  // modName is archive-controlled (mod.json's "name") — it becomes part
  // of a filesystem path here, so traversal/absolute forms are rejected
  // before the read. The mod could read any file itself once its code
  // runs, but config loading happens BEFORE register() (and for mods that
  // fail validation entirely), so this path stays locked down on
  // principle: the loader shouldn't hand archive data a read of files
  // outside the config tree it owns.
  const configFailure = manifestPathFailure('name', modName);
  if (configFailure) {
    return { value: undefined, path: join(configDir, `${modName}.json`), existed: false, error: configFailure };
  }
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

// A loose .mjs mod hitting a denied capability gets this appended to
// its failure line. The permission model's own error ("Access to this
// API has been restricted") doesn't say why nothing was granted or how
// to change it, and a mod that can't run is exactly the moment to.
function zeroPermissionHint(reason) {
  if (!/Access to this API has been restricted/.test(reason)) return reason;
  return (
    `${reason} — this mod has no granted capabilities (a loose .mjs mod can't request any). ` +
    `Package it as a .tfmod with a "permissions" field to ask for what it needs.`
  );
}

export async function loadMods(dir = './mods', configDir = join(resolve(dir), '..', 'config')) {
  const report = { loaded: [], downgraded: [], failed: [], conflicts: [] };
  const absDir = resolve(dir);
  const absConfigDir = resolve(configDir);
  // Permission answers live next to mods/, like config/ does: it's the
  // host project's data about what it has agreed to, not part of the
  // mods themselves, and keeping it beside the folder means it's the
  // same "delete this to start over" story as the config dir.
  const permissionsPath = join(resolve(dir), '..', '.temporal-fmt-permissions.json');
  const sandboxCtx = await createSandboxContext();

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
    // Pass one for .mjs: each file is imported inside its own
    // zero-permission subprocess, which reports the default export's
    // name/requires/priority back and exits. Nothing about a mod's
    // top-level code has ever been safe to assume, and now none of it
    // runs in this process even for discovery.
    const mjsResult = await describeMjsMods(absDir, mjsFiles, sandboxCtx);
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
    // Registrations so far this pass, in load order — each subprocess
    // replays them locally so a mod that reads earlier state (a grammar
    // built on another mod's vocab, say) sees what it would have
    // in-process.
    let priorRegistrations = [];

    for (const entry of order) {
      const { file, kind, mod, importPath, configSchema, permissions } = entry;

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

      // The permission gate, before any mod code runs: each requested
      // capability is either already answered for this exact
      // name@version (cache), asked of the user now (default no on
      // empty input, or when there's no terminal to ask), or denied.
      // Loose .mjs mods never get here with requests — they have no
      // manifest — and run with nothing granted.
      let grantedPermissions = new Set();
      let denials = [];
      if (permissions.length > 0) {
        const resolved = await resolvePermissions({
          modName: mod.name,
          version: mod.version,
          requested: permissions.map((p) => p.capability),
          cachePath: permissionsPath,
        });
        grantedPermissions = resolved.granted;
        denials = resolved.denials;

        // A denied required capability is a hard no: the mod said it can't
        // do its job without this, so running it with the capability
        // missing would just move the failure somewhere more confusing.
        // Fail it here, same as an unhandled crash, before any of its
        // code gets a process.
        const requiredDenied = permissions.filter((p) => p.required && !grantedPermissions.has(p.capability));
        if (requiredDenied.length > 0) {
          const caps = requiredDenied.map((p) => p.capability).join(', ');
          const autoDenied = requiredDenied.some((p) =>
            denials.find((d) => d.permission === p.capability)?.reason.startsWith('no terminal')
          );
          const grantCommand = requiredDenied.length === 1
            ? `node scripts/managePermissions.mjs grant ${mod.name}${mod.version ? `@${mod.version}` : ''} ${caps}`
            : 'node scripts/managePermissions.mjs grant <mod> <capability> (one per denied capability)';
          report.failed.push({
            file,
            reason:
              `denied required permission: ${caps} — "${mod.name}" won't load without it` +
              (autoDenied ? ' (denied automatically: no terminal to ask)' : '') +
              `. Grant it with "${grantCommand}", or delete .temporal-fmt-permissions.json to re-ask everything.`,
          });
          continue;
        }
      }

      // Anything denied at this point is optional — the mod runs with
      // what it got, and the report says downgraded rather than loaded so
      // "it ran with less than it asked for" is scannable at a glance.
      const downgraded = permissions.some((p) => !p.required && !grantedPermissions.has(p.capability));

      const sandboxRun = await runModInSandbox({
        kind,
        modPath: importPath,
        modName: mod.name,
        modReadRoot: kind === 'tfmod' ? entry.extractDir : absDir,
        grantedPermissions,
        config: resolvedConfig,
        priorRegistrations,
        sandboxCtx,
      });

      if (!sandboxRun.ok) {
        const reason = kind === 'mjs' ? zeroPermissionHint(sandboxRun.reason) : sandboxRun.reason;
        report.failed.push({ file, reason });
        continue;
      }

      // Host-side replay: the subprocess recorded what register()
      // called, and this is where it actually takes effect — through
      // the same tracked context an in-process mod would have used, so
      // conflict detection, override exclusivity, and the report all
      // behave exactly as they did before sandboxing.
      const touched = [];
      const trackedCtx = buildTrackedModContext(mod.name, (regKey) => touched.push(regKey));
      try {
        for (const record of sandboxRun.registrations) {
          if (record.fn === 'createFormatter') {
            trackedCtx.createFormatter(rehydrateFormatterOptions(record.args[0]));
          } else {
            trackedCtx[record.fn](...record.args.map((a) => fromWire(a, sandboxCtx.hostTemporal)));
          }
        }
        for (const fnName of sandboxRun.overrides) {
          const method = `override${fnName[0].toUpperCase()}${fnName.slice(1)}`;
          trackedCtx[method](makeOverrideBridgeImpl(sandboxRun.bridge, fnName, mod.name, sandboxCtx));
        }
      } catch (err) {
        if (err instanceof OverrideConflictError) {
          report.failed.push({ file, reason: err.message });
        } else {
          report.failed.push({ file, reason: `replaying "${mod.name}"'s registrations failed: ${err.message}` });
        }
        continue;
      }

      for (const { kind: regKind, key } of touched) {
        const mapKey = `${regKind}:${key}`;
        if (!registeredBy.has(mapKey)) registeredBy.set(mapKey, []);
        registeredBy.get(mapKey).push({ file, name: mod.name });
      }

      priorRegistrations = [...priorRegistrations, ...sandboxRun.registrations];

      (downgraded ? report.downgraded : report.loaded).push({
        file,
        name: mod.name,
        version: mod.version,
        kind,
        sandbox: {
          permissionsRequested: permissions,
          granted: [...grantedPermissions],
          denials,
          overrides: sandboxRun.overrides,
          timeoutMs: sandboxRun.overrides.length > 0 ? runtimeTimeoutMs() : undefined,
          memoryCeilingMb: sandboxRun.overrides.length > 0 ? memoryCeilingMb() : undefined,
        },
      });
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
  const anyMods = (report.loaded.length > 0 || report.downgraded?.length > 0 || report.failed.length > 0);
  if (anyMods && isExperimentalPermissionModel()) {
    lines.push('  (sandboxing is experimental on this Node version — Node\'s permission model stabilized in 22.13)');
  }
  for (const m of report.loaded) {
    lines.push(`  loaded ${m.name}${m.version ? `@${m.version}` : ''} (${m.file})${sandboxSuffix(m)}`);
  }
  for (const m of report.downgraded ?? []) {
    lines.push(`  downgraded ${m.name}${m.version ? `@${m.version}` : ''} (${m.file})${sandboxSuffix(m)}`);
  }
  for (const f of report.failed) {
    lines.push(`  failed ${f.file}: ${f.reason}`);
  }
  for (const c of report.conflicts ?? []) {
    lines.push(`  conflict on ${c.kind} "${c.key}": ${c.mods.join(', ')} — "${c.winner}" wins (loaded last)`);
  }
  return lines.join('\n');
}

function sandboxSuffix(m) {
  if (!m.sandbox) return '';
  const { permissionsRequested, granted, denials, overrides, timeoutMs, memoryCeilingMb: ceilingMb } = m.sandbox;

  let permissionPart;
  if (permissionsRequested.length === 0) {
    permissionPart = m.kind === 'mjs'
      ? 'sandboxed: no permissions — a loose .mjs mod can\'t request any, package as .tfmod to ask for capabilities'
      : 'sandboxed: no permissions requested';
  } else {
    const bits = permissionsRequested.map((p) =>
      granted.includes(p.capability)
        ? `${p.capability} granted`
        : `${p.capability} denied (optional)`
    );
    permissionPart = `sandboxed: ${bits.join(', ')}`;
    const unprompted = denials.filter((d) => d.reason.startsWith('no terminal'));
    if (unprompted.length > 0) {
      permissionPart += ` (${unprompted.length} denied with no terminal to ask — re-run interactively or answer once in ${'.temporal-fmt-permissions.json'})`;
    }
  }

  const parts = [permissionPart];
  if (overrides.length > 0) {
    const timeoutLabel = timeoutMs < 1000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs / 1000)}s`;
    const watched = `${timeoutLabel} timeout, ${ceilingMb}MB memory ceiling`;
    parts.push(`${overrides.join(', ')} override${overrides.length > 1 ? 's' : ''} via subprocess, ${watched}`);
  }
  return ` [${parts.join('] [')}]`;
}
