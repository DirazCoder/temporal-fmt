// Thin wrapper around `node --test`, invoked instead of a shell glob
// (`node --test test/*.test.js test/*.test.cjs`) because that glob only
// resolves on shells that expand it themselves — Windows' cmd.exe and
// PowerShell don't, so `npm test` failed there outright on some Node
// versions while working on others depending on whether that Node
// version added its own glob fallback. 
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_DIR = fileURLToPath(new URL('../test/', import.meta.url));

// Tests live in domain subfolders (test/format/, test/parse/, ...), so walk recursively.
const files = readdirSync(TEST_DIR, { recursive: true })
  .map((name) => String(name).split('\\').join('/'))
  .filter((name) => name.endsWith('.test.js') || name.endsWith('.test.cjs'))
  .sort()
  .map((name) => `test/${name}`);

if (files.length === 0) {
  throw new Error(`run-tests: no .test.js or .test.cjs files found in ${TEST_DIR}`);
}

const extraArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, ['--test', ...extraArgs, ...files], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
