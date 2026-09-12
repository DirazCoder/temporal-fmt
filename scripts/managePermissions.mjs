#!/usr/bin/env node
// Reads and edits the mod permission cache — the same
// .temporal-fmt-permissions.json the load-time prompts write to — without
// having to re-trigger a load. One source of truth: this script never
// keeps state of its own, it just flips entries in that file, and a change
// only matters the next time the mod loads (nothing running is reached
// into; a loaded subprocess already has its flags).

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GRANTABLE_PERMISSIONS } from './modWire.mjs';

// Sibling of mods/, mirroring where loadMods() keeps it (see the comment
// there: host-project data about what the project agreed to).
const CACHE_PATH = join(resolve('./mods'), '..', '.temporal-fmt-permissions.json');

const USAGE = `temporal-fmt permission cache

  node scripts/managePermissions.mjs list
      Every mod in the cache, each capability, granted or denied.

  node scripts/managePermissions.mjs grant <mod>[@<version>] <capability>
  node scripts/managePermissions.mjs deny <mod>[@<version>] <capability>
      Flip one answer without a prompt. A mod without a version in its
      mod.json is addressed by its bare name.

  node scripts/managePermissions.mjs reset <mod>[@<version>]
      Clear the cached answers for that mod/version, so the next load
      asks again.

Capabilities: ${GRANTABLE_PERMISSIONS.join(', ')}.
Cache file:   ${CACHE_PATH} (plain JSON, safe to edit or delete by hand).
Answers apply the next time the mod loads — this script doesn't reach into
a process that's already running.`;

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeCache(cache) {
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

// The key the loader would use for this argument. A key typed exactly as
// `list` prints it wins, so anything odd (a name containing @, say) still
// has an unambiguous spelling; otherwise a bare name means the versionless
// key the loader uses for a mod.json with no "version" field.
function cacheKeyOf(arg, cache) {
  if (cache && Object.hasOwn(cache, arg)) return arg;
  return arg.includes('@') ? arg : `${arg}@`;
}

const [command, modArg, capabilityArg] = process.argv.slice(2);

if (command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}

if (command !== 'list' && command !== 'grant' && command !== 'deny' && command !== 'reset') {
  console.error(USAGE);
  process.exit(1);
}

if (command === 'list') {
  const cache = await readCache();
  if (cache === null || Object.keys(cache).length === 0) {
    console.log(`no permission cache at ${CACHE_PATH} — nothing has been answered yet`);
    process.exit(0);
  }
  const lines = [];
  for (const key of Object.keys(cache).sort()) {
    lines.push(key);
    for (const [capability, granted] of Object.entries(cache[key])) {
      lines.push(`  ${capability.padEnd(14)} ${granted ? 'granted' : 'denied'}`);
    }
  }
  console.log(lines.join('\n'));
  process.exit(0);
}

if (command === 'reset') {
  if (!modArg) {
    console.error('reset needs a mod: reset <mod>[@<version>]');
    process.exit(1);
  }
  const cache = await readCache();
  const key = cacheKeyOf(modArg, cache);
  if (cache === null || !Object.hasOwn(cache, key)) {
    console.log(`no cached answers for ${key} — nothing to reset`);
    process.exit(0);
  }
  delete cache[key];
  await writeCache(cache);
  console.log(`cleared ${key} from ${CACHE_PATH} — the next load asks again`);
  process.exit(0);
}

// grant / deny from here on.
if (!modArg || !capabilityArg) {
  console.error(`${command} needs a mod and a capability: ${command} <mod>[@<version>] <capability>`);
  process.exit(1);
}
if (!GRANTABLE_PERMISSIONS.includes(capabilityArg)) {
  console.error(
    `"${capabilityArg}" isn't a capability — supported: ${GRANTABLE_PERMISSIONS.join(', ')}. ` +
      `net and env are absent because Node's permission model can't restrict them on any supported version.`
  );
  process.exit(1);
}

const cache = await readCache() ?? {};
const key = cacheKeyOf(modArg, cache);
if (!Object.hasOwn(cache, key)) cache[key] = {};
cache[key][capabilityArg] = command === 'grant';
await writeCache(cache);
const state = Object.entries(cache[key])
  .map(([capability, granted]) => `${capability}: ${granted ? 'granted' : 'denied'}`)
  .join(', ');
console.log(`${key} → ${state}`);
console.log('applies the next time this mod loads — a process already running it is unaffected');
