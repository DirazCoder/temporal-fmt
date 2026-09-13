#!/usr/bin/env node
// Builds a .tfmod archive from a mod's directory, validating mod.json
// rules against loadMods.mjs before invoking system tar.

import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { GRANTABLE_PERMISSIONS } from './modWire.mjs';

const run = promisify(execFile);

const USAGE = `temporal-fmt mod packager

  node scripts/packageMod.mjs <mod-dir> [output.tfmod]
      Reads <mod-dir>/mod.json, checks it against the same rules
      loadMods.mjs enforces at load time, and tars the directory into a
      .tfmod archive. Output defaults to <mod-name>.tfmod in the current
      directory.

Fails before packing (nothing is written) if:
  - mod.json is missing, isn't valid JSON, or fails manifest validation
  - "main" points outside the mod directory (absolute path or ".." segment)
  - the file mod.json's "main" names doesn't exist in <mod-dir>
  - "permissions" names a capability that isn't grantable

Capabilities: ${GRANTABLE_PERMISSIONS.join(', ')}.`;

// Kept in sync by hand with loadMods.mjs's internal manifest checks.
function manifestFailure(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    return 'mod.json must be a JSON object';
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    return 'mod.json needs a non-empty "name" string';
  }
  if (typeof manifest.main !== 'string' || manifest.main.length === 0) {
    return 'mod.json needs a non-empty "main" string';
  }
  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    return '"version" must be a string';
  }
  if (
    manifest.requires !== undefined &&
    !(Array.isArray(manifest.requires) && manifest.requires.every((r) => typeof r === 'string'))
  ) {
    return '"requires" must be an array of strings';
  }
  if (manifest.priority !== undefined && typeof manifest.priority !== 'number') {
    return '"priority" must be a number';
  }
  if (manifest.temporalFmtVersion !== undefined && typeof manifest.temporalFmtVersion !== 'string') {
    return '"temporalFmtVersion" must be a string';
  }
  if (manifest.permissions !== undefined) {
    if (!Array.isArray(manifest.permissions)) return '"permissions" must be an array';
    for (const entry of manifest.permissions) {
      const capability = typeof entry === 'string' ? entry : entry?.capability;
      if (typeof capability !== 'string') {
        return '"permissions" entries must be a capability string or { capability, required }';
      }
      if (!GRANTABLE_PERMISSIONS.includes(capability)) {
        return `"permissions" names "${capability}", which isn't a capability — supported: ${GRANTABLE_PERMISSIONS.join(', ')}`;
      }
      if (typeof entry === 'object' && entry.required !== undefined && typeof entry.required !== 'boolean') {
        return `"permissions" entry for "${capability}" has a non-boolean "required"`;
      }
    }
  }
  return undefined;
}

// Matches loadMods.mjs path restriction to block files outside the mod root.
function pathEscapes(value) {
  if (isAbsolute(value)) return true;
  return value.split(/[\\/]/).includes('..');
}

async function main() {
  const [modDirArg, outputArg] = process.argv.slice(2);

  if (modDirArg === '--help' || modDirArg === '-h' || !modDirArg) {
    console.log(USAGE);
    process.exit(modDirArg ? 0 : 1);
  }

  const modDir = resolve(modDirArg);
  const manifestPath = join(modDir, 'mod.json');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    console.error(
      err.code === 'ENOENT'
        ? `no mod.json found at ${manifestPath}`
        : `couldn't read/parse ${manifestPath}: ${err.message}`
    );
    process.exit(1);
  }

  const failure = manifestFailure(manifest);
  if (failure) {
    console.error(`invalid mod.json: ${failure}`);
    process.exit(1);
  }

  if (pathEscapes(manifest.main)) {
    console.error(
      `mod.json "main" must be a relative path inside the mod directory, got "${manifest.main}" — ` +
        `a .tfmod only runs files from inside its own archive`
    );
    process.exit(1);
  }

  const mainPath = join(modDir, manifest.main);
  try {
    await stat(mainPath);
  } catch {
    console.error(`mod.json names "main": "${manifest.main}", but ${mainPath} doesn't exist`);
    process.exit(1);
  }

  const outputPath = resolve(outputArg ?? `${manifest.name}.tfmod`);
  if (!outputPath.endsWith('.tfmod')) {
    console.error(`output path must end in .tfmod, got "${outputPath}"`);
    process.exit(1);
  }

  // Uses -C to set tar's context directory so paths inside the archive remain relative.
  const members = ['mod.json', manifest.main];
  const dataDirPath = join(modDir, 'data');
  if (await stat(dataDirPath).then(() => true).catch(() => false)) {
    members.push('data');
  }

  try {
    await run('tar', ['-czf', outputPath, '-C', modDir, ...members]);
  } catch (err) {
    console.error(
      err.code === 'ENOENT'
        ? `couldn't run "tar" — it needs to be on PATH (see MODS.md's Packaging section: .tfmod extraction shells out to the system tar rather than adding a dependency)`
        : `tar failed: ${err.stderr?.trim() || err.message}`
    );
    process.exit(1);
  }

  console.log(`packaged ${manifest.name}@${manifest.version ?? '(no version)'} → ${relative(process.cwd(), outputPath)}`);
  console.log(`members: ${members.join(', ')}`);
}

main();
