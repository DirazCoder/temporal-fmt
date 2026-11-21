import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFORMANCE_DIR = fileURLToPath(new URL('../conformance/', import.meta.url));
const files = readdirSync(CONFORMANCE_DIR, { recursive: true })
  .map((name) => String(name).split('\\').join('/'))
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => `conformance/${name}`);

if (files.length === 0) {
  throw new Error(`run-conformance: no .test.js files found in ${CONFORMANCE_DIR}`);
}

const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
