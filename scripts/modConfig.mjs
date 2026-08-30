// Per-mod user config, Minecraft-Forge-style: a mod declares a schema
// in mod.json (name, type, default, optional bounds/choices), the user
// edits a plain JSON file to override any of those, and register() gets
// the merged result as its second argument. No config file means every
// setting just uses its default — nothing to write, nothing to break.
//
// Deliberately not JSON Schema. JSON Schema covers cases (nested
// objects, $refs, conditional validation) this loader has no use for,
// and pulling in a validator library would be a second, bigger
// contradiction of the same dependency-free design `tar`/`semverRange`
// already explain. This handles exactly the four primitive kinds a mod
// setting realistically is: string, number, boolean, and enum (a
// string constrained to a fixed set of choices).

const VALID_TYPES = new Set(['string', 'number', 'boolean', 'enum']);

// Shape-checks one schema entry from mod.json's "config" array. Doesn't
// check the default's value against min/max/choices here — that
// happens once, uniformly, in validateValue, so there's one place that
// enforces bounds instead of two that could drift apart.
export function isValidConfigSchema(schema) {
  if (!Array.isArray(schema)) return false;
  const seenKeys = new Set();
  for (const entry of schema) {
    if (typeof entry !== 'object' || entry === null) return false;
    if (typeof entry.key !== 'string' || entry.key.length === 0) return false;
    if (seenKeys.has(entry.key)) return false;
    seenKeys.add(entry.key);
    if (!VALID_TYPES.has(entry.type)) return false;
    if (!('default' in entry)) return false;
    if (entry.type === 'enum') {
      if (!Array.isArray(entry.choices) || entry.choices.length === 0) return false;
      if (!entry.choices.every((c) => typeof c === 'string')) return false;
    }
    if (entry.type === 'number') {
      if (entry.min !== undefined && typeof entry.min !== 'number') return false;
      if (entry.max !== undefined && typeof entry.max !== 'number') return false;
    }
  }
  return true;
}

// Checks one runtime value against its schema entry. Returns a reason
// string on failure, undefined on success — mirrors the loader's
// existing `{ file, reason }` failure shape rather than throwing, since
// a bad user-supplied config value is an expected, reportable outcome,
// not a bug.
function validateValue(entry, value) {
  switch (entry.type) {
    case 'string':
      return typeof value === 'string' ? undefined : `must be a string`;
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `must be a boolean`;
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return `must be a number`;
      if (entry.min !== undefined && value < entry.min) return `must be >= ${entry.min}`;
      if (entry.max !== undefined && value > entry.max) return `must be <= ${entry.max}`;
      return undefined;
    }
    case 'enum':
      return entry.choices.includes(value) ? undefined : `must be one of: ${entry.choices.join(', ')}`;
    default:
      return `unknown schema type "${entry.type}"`;
  }
}

// Merges user-supplied overrides onto schema defaults. Unknown keys in
// the user's file are reported, not silently dropped — a typo'd
// setting name should surface, not fail open into "did nothing."
export function resolveConfig(schema, userOverrides) {
  const result = {};
  const errors = [];
  const schemaKeys = new Set(schema.map((e) => e.key));

  for (const entry of schema) {
    result[entry.key] = entry.default;
  }

  if (userOverrides && typeof userOverrides === 'object') {
    for (const [key, value] of Object.entries(userOverrides)) {
      if (!schemaKeys.has(key)) {
        errors.push(`unknown config key "${key}" (not declared in this mod's schema)`);
        continue;
      }
      const entry = schema.find((e) => e.key === key);
      const problem = validateValue(entry, value);
      if (problem) {
        errors.push(`config key "${key}" ${problem}, got ${JSON.stringify(value)}`);
        continue;
      }
      result[key] = value;
    }
  }

  return { config: result, errors };
}
