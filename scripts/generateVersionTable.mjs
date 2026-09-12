#!/usr/bin/env node
// Regenerates scripts/versions.json from CHANGELOG.md.
//
// Why a generated table instead of computing order from the version
// string: this project's 0.9.x patch numbers aren't a consistent
// arithmetic sequence. 0.9.31 and 0.9.32 shipped as point releases
// after 0.9.3 but before 0.9.4; 0.9.41 shipped after 0.9.4 but before
// 0.9.5. A comparator that parses "0.9.41" and does math on the 41
// has no way to know that — the changelog's own release order is the
// only source of truth for "which version is newer," so that's what
// gets captured here instead of re-derived at check time.
//
// Only versions from 0.9.4 onward are included: that's the release
// that introduced mods (mods/, .tfmod, temporalFmtVersion) in the
// first place, so anything older never had a mod.json that could
// declare a range against it, and never calls checkVersionRange.
//
// The line filter below is a numeric floor on (minor, patch), not a
// string prefix like `startsWith('0.9.')` — that would silently stop
// tracking anything the day this line moves to 0.10.x. Comparing
// minor and patch as whole integers against a floor is safe: the bug
// this table exists to avoid was never "comparing numbers," it was
// treating a patch like `41` as if it meant `4.1`. `patch >= 4` for
// `minor === 9` has no such ambiguity, and once `minor > 9` the patch
// floor doesn't apply at all — 0.10.0 onward is tracked from its own
// first release with no manual edit needed here.
//
// Run this after adding a new "## x.y.z — date (`hash`)" heading to
// CHANGELOG.md, before publishing. It always regenerates the whole
// file from scratch rather than appending, so a reordered or edited
// changelog heading is reflected correctly instead of leaving a stale
// entry behind.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const CHANGELOG_PATH = fileURLToPath(new URL('CHANGELOG.md', ROOT));
const OUTPUT_PATH = fileURLToPath(new URL('scripts/versions.json', ROOT));

// Floor for the tracked line: major.minor must be at least this, and
// when minor matches exactly, patch must also clear MIN_PATCH_AT_FLOOR
// (mods didn't exist until 0.9.4 — 0.9.0..0.9.32 predate the loader).
// Once minor moves past FLOOR_MINOR (0.10.x and beyond), the whole
// line is tracked from patch 0 with no extra threshold.
const FLOOR_MAJOR = 0;
const FLOOR_MINOR = 9;
const MIN_PATCH_AT_FLOOR = 4; // first patch on FLOOR_MINOR with mod support

// Kept as a secondary sanity check, not the primary filter: this repo
// also has an 0.8.x LTS branch whose backport dates interleave with
// 0.9.x's in the changelog. The numeric line filter above already
// excludes 0.8.x on major/minor alone, so this just guards against a
// future line reusing an old date by mistake rather than doing any
// real filtering work itself.
const FLOOR_DATE = '2026-08-30'; // date of the 0.9.4 release

function isTrackedLine(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  if (major !== FLOOR_MAJOR) return major > FLOOR_MAJOR;
  if (minor !== FLOOR_MINOR) return minor > FLOOR_MINOR;
  return patch >= MIN_PATCH_AT_FLOOR;
}

const HEADING = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})(?: \((.+)\))?/;

function parseChangelog(text) {
  const releases = [];
  for (const line of text.split('\n')) {
    const match = HEADING.exec(line);
    if (!match) continue;
    const [, version, date, meta] = match;
    // meta holds commit hash(es), optionally with a trailing note like
    // "HOTFIX" or "backport of ..." — first backtick-quoted token is
    // the primary commit, the rest of meta is kept as free text.
    const commitMatch = meta ? /`([0-9a-f]{6,40})`/.exec(meta) : null;
    releases.push({ version, date, commit: commitMatch ? commitMatch[1] : null });
  }
  // CHANGELOG.md is newest-first; the table is stored oldest-first so
  // array index == release order == what compareByTable relies on.
  releases.reverse();
  return releases;
}

function main() {
  const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
  const allReleases = parseChangelog(changelog);
  // 0.8.x is a separate LTS branch (0.8.984, 0.8.985, ...) that ships
  // its own backported fixes on its own cadence. Its dates interleave
  // with 0.9.x's in the changelog, but mods only ever declare
  // temporalFmtVersion ranges against the active line, and 0.8.x never
  // shipped the mod loader in the first place — mixing the two lines
  // into one ordered table would let an 0.8.x entry sort in between
  // releases it has no real relationship to. isTrackedLine() excludes
  // it on major/minor alone; FLOOR_DATE is the belt-and-suspenders
  // check described above.
  const tracked = allReleases.filter((r) => isTrackedLine(r.version) && r.date >= FLOOR_DATE);

  if (tracked.length === 0) {
    throw new Error(`no releases on or after ${FLOOR_DATE} matching the tracked line (>= 0.${FLOOR_MINOR}.${MIN_PATCH_AT_FLOOR}) found in CHANGELOG.md — refusing to write an empty table`);
  }

  const table = {
    // Bump this if the table's shape ever changes, so old cached
    // copies fail loudly instead of being misread.
    schemaVersion: 1,
    generatedFrom: 'CHANGELOG.md',
    floorDate: FLOOR_DATE,
    // Oldest first, so releases[i] shipped before releases[i + 1].
    releases: tracked,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(table, null, 2) + '\n');
  console.log(`wrote ${tracked.length} releases (${tracked[0].version} .. ${tracked[tracked.length - 1].version}) to scripts/versions.json`);
}

main();
