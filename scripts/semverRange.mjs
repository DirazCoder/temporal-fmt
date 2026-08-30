// Minimal semver comparison, scoped to what mod.json actually needs:
// checking a host version against a caret range ("^0.9.0") or an exact
// version ("0.9.32"). Not a general semver library — no `||`, no `~`,
// no `x`/`*` ranges, no build metadata. The package stays dependency-
// free by design (see loadMods.mjs's note on `tar`), and a mod author
// declaring "^0.9.0" only ever needs caret semantics, so a full range
// grammar would be unused surface, not safety.
//
// Caret semantics follow npm's own rule: the leftmost non-zero
// component is the one that must not change.
//   ^1.2.3  -> >=1.2.3 <2.0.0
//   ^0.2.3  -> >=0.2.3 <0.3.0   (0.x: minor is the breaking boundary)
//   ^0.0.3  -> >=0.0.3 <0.0.4   (0.0.x: patch is the breaking boundary)

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function caretUpperBound(v) {
  if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0 };
  if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: v.patch + 1 };
}

// Returns { ok: true } or { ok: false, reason } — reason is written for
// direct use in a loadMods.mjs `failed` entry, not just a boolean.
export function checkVersionRange(hostVersion, declaredRange) {
  const host = parseVersion(hostVersion);
  if (!host) {
    return { ok: false, reason: `couldn't parse host library version "${hostVersion}" as semver` };
  }

  const range = declaredRange.trim();

  if (range.startsWith('^')) {
    const floor = parseVersion(range.slice(1));
    if (!floor) return { ok: false, reason: `couldn't parse "${range}" as a caret range` };
    const ceiling = caretUpperBound(floor);
    const aboveFloor = compareVersions(host, floor) >= 0;
    const belowCeiling = compareVersions(host, ceiling) < 0;
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
  if (compareVersions(host, exact) === 0) return { ok: true };
  return { ok: false, reason: `needs temporal-fmt exactly ${range}, host is ${hostVersion}` };
}
