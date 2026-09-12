// Version comparison scoped to what mod.json actually needs: checking
// a host version against a caret range ("^0.9.0") or an exact version
// ("0.9.32"). Not a general semver library — no `||`, no `~`, no
// `x`/`*` ranges, no build metadata.
//
// Why this isn't plain numeric comparison: this project's 0.9.x patch
// numbers don't form a consistent arithmetic sequence. 0.9.31 and
// 0.9.32 shipped as point releases after 0.9.3 but before 0.9.4;
// 0.9.41 shipped after 0.9.4 but before 0.9.5. Comparing "41" and "5"
// as integers says 0.9.41 is newer — comparing release dates says the
// opposite. scripts/versions.json (generated from CHANGELOG.md by
// scripts/generateVersionTable.mjs) is the actual release order, and
// ordering any two *known* versions is a table lookup against it, not
// arithmetic on the version string.
//
// Caret ranges are the one place this still needs numeric parsing:
// "^0.9.0"'s upper bound (0.10.0) is a version that may not exist in
// the table yet, so the ceiling has to be computed the normal semver
// way. Once floor/ceiling are known, checking where the host falls
// relative to them is back to table lookups.
//
// Caret semantics follow npm's own rule: the leftmost non-zero
// component is the one that must not change.
//   ^1.2.3  -> >=1.2.3 <2.0.0
//   ^0.2.3  -> >=0.2.3 <0.3.0   (0.x: minor is the breaking boundary)
//   ^0.0.3  -> >=0.0.3 <0.0.4   (0.0.x: patch is the breaking boundary)

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const VERSION_TABLE = require('./versions.json');

// version string -> index in release order (0 = oldest tracked).
const RELEASE_INDEX = new Map(VERSION_TABLE.releases.map((r, i) => [r.version, i]));

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), raw: match[0] };
}

// Ordered comparison for two versions that both appear in the release
// table. Returns null (not -1/0/1) when either side isn't tracked —
// callers must handle that separately, since "not in the table" isn't
// the same claim as "these are equal" or any ordering at all.
function compareTracked(a, b) {
  const ai = RELEASE_INDEX.get(a.raw);
  const bi = RELEASE_INDEX.get(b.raw);
  if (ai === undefined || bi === undefined) return null;
  return ai - bi;
}

function caretUpperBound(v) {
  if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0, raw: `${v.major + 1}.0.0` };
  if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0, raw: `0.${v.minor + 1}.0` };
  return { major: 0, minor: 0, patch: v.patch + 1, raw: `0.0.${v.patch + 1}` };
}

// A version below the whole tracked window (e.g. pre-mods 0.9.0..0.9.32,
// or anything on the 0.8.x LTS line) needs *some* answer for range
// checks even though it's not in the table — it's unambiguously older
// than everything mods.json ever declares a floor against, so it's
// always "too old", never "in range" and never "in range's ceiling".
// This only needs to answer "is this outside the tracked window", not
// give a real position within it, so it doesn't need the arithmetic
// this whole file exists to avoid — it only fires for a version the
// table has no opinion on, and there every host in that state is
// equally out of range regardless of its specific number.
function isBeforeTrackedWindow(v) {
  if (RELEASE_INDEX.has(v.raw)) return false;
  const oldest = parseVersion(VERSION_TABLE.releases[0].version);
  if (v.major !== oldest.major) return v.major < oldest.major;
  if (v.minor !== oldest.minor) return v.minor < oldest.minor;
  // Same major.minor as the oldest tracked release but not itself
  // tracked: only reachable by the pre-mods 0.9.0..0.9.32 releases,
  // all of which predate 0.9.4 (the oldest tracked entry).
  return true;
}

// Returns { ok: true } or { ok: false, reason } — reason is written for
// direct use in a loadMods.mjs `failed` entry, not just a boolean.
export function checkVersionRange(hostVersion, declaredRange) {
  const host = parseVersion(hostVersion);
  if (!host) {
    return { ok: false, reason: `couldn't parse host library version "${hostVersion}" as semver` };
  }
  if (!RELEASE_INDEX.has(host.raw) && !isBeforeTrackedWindow(host)) {
    return {
      ok: false,
      reason: `host library version "${hostVersion}" isn't in scripts/versions.json — run scripts/generateVersionTable.mjs after adding it to CHANGELOG.md`,
    };
  }

  const range = declaredRange.trim();

  if (range.startsWith('^')) {
    const floor = parseVersion(range.slice(1));
    if (!floor) return { ok: false, reason: `couldn't parse "${range}" as a caret range` };
    const ceiling = caretUpperBound(floor);

    // host is definitely too old whenever it predates the tracked
    // window (pre-0.9.4, or the 0.8.x LTS line) — no floor in this
    // scheme can be older than that, so it never satisfies a caret.
    if (isBeforeTrackedWindow(host)) {
      return {
        ok: false,
        reason: `needs temporal-fmt ${range} (>=${floor.major}.${floor.minor}.${floor.patch} <${ceiling.major}.${ceiling.minor}.${ceiling.patch}), host is ${hostVersion}`,
      };
    }

    // The floor is who this table exists for: it's virtually always a
    // real, already-shipped version (mod authors write "^0.9.5"
    // because 0.9.5 exists), so it needs a table lookup, not
    // arithmetic — that's the entire point. Only fall back to
    // structural comparison if the floor genuinely isn't a tracked
    // release (a typo, or a version declared ahead of its own
    // release) — in that narrow case there's no recorded order to
    // consult, and structural comparison is the least-wrong fallback,
    // not a routine path.
    const aboveFloor = RELEASE_INDEX.has(floor.raw)
      ? compareTracked(host, floor) >= 0
      : structuralCompare(host, floor) >= 0;

    // The ceiling is a different case: caretUpperBound() computes it
    // as "+1 on the breaking component," which by construction is
    // almost always a version nobody has released yet (0.10.0 doesn't
    // exist just because 0.9.x mods declare ^0.9.0). There's no table
    // entry to look up for a version that hasn't shipped, so this one
    // is structural on purpose, not a gap — the "out of numeric order"
    // problem this table solves only applies to versions that have
    // actually shipped and can ship out of turn; an unreleased ceiling
    // can't have shipped out of turn yet.
    const belowCeiling = RELEASE_INDEX.has(ceiling.raw)
      ? compareTracked(host, ceiling) < 0
      : structuralCompare(host, ceiling) < 0;

    if (aboveFloor && belowCeiling) return { ok: true };
    return {
      ok: false,
      reason: `needs temporal-fmt ${range} (>=${floor.major}.${floor.minor}.${floor.patch} <${ceiling.major}.${ceiling.minor}.${ceiling.patch}), host is ${hostVersion}`,
    };
  }

  // No caret prefix: treat as an exact match on major.minor.patch, since
  // that's the only other case mod.json is documented to accept.
  const exact = parseVersion(range);
  if (!exact) return { ok: false, reason: `couldn't parse "${range}" as a version — use an exact version ("0.9.32") or a caret range ("^0.9.0")` };
  if (host.raw === exact.raw) return { ok: true };
  return { ok: false, reason: `needs temporal-fmt exactly ${range}, host is ${hostVersion}` };
}

function structuralCompare(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
