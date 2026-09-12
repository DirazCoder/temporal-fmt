// Hand-written: modSandbox.mjs is Node-only loader script, not part of the
// built library, so it doesn't go through tsup/tsc — but it ships and is
// documented as an importable subpath, so its shape is declared here for
// anyone importing it with type checking on. Keep in sync with
// scripts/modSandbox.mjs.

export function stopModSubprocesses(): void;

export function setupTimeoutMs(): number;

export function runtimeTimeoutMs(): number;

export function memoryCeilingMb(): number;
