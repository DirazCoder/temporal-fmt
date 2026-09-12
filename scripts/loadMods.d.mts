// Hand-written: loadMods.mjs is Node-only loader script, not part of the
// built library, so it doesn't go through tsup/tsc — but it ships and is
// documented as an importable subpath, so its shape is declared here for
// anyone importing it with type checking on. Keep in sync with
// scripts/loadMods.mjs.

export interface ModSandboxInfo {
  permissionsRequested: Array<{ capability: string; required: boolean }>;
  granted: string[];
  denials: Array<{ permission: string; reason: string }>;
  overrides: string[];
  timeoutMs?: number;
  memoryCeilingMb?: number;
}

export interface ModLoadReport {
  loaded: Array<{
    file: string;
    name: string;
    version?: string;
    kind: 'mjs' | 'tfmod';
    sandbox?: ModSandboxInfo;
  }>;
  downgraded: Array<{
    file: string;
    name: string;
    version?: string;
    kind: 'mjs' | 'tfmod';
    sandbox?: ModSandboxInfo;
  }>;
  failed: Array<{ file: string; reason: string }>;
  conflicts: Array<{ kind: string; key: string; mods: string[]; winner: string }>;
}

export function loadMods(dir?: string, configDir?: string): Promise<ModLoadReport>;

export function formatModLoadReport(report: ModLoadReport): string;
