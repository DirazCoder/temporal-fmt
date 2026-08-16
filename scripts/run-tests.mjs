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

const files = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith('.test.js') || name.endsWith('.test.cjs'))
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
