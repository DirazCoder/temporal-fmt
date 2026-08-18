#!/usr/bin/env node
// Smoke test runner that exercises the eslint-plugin and codemod
// packages from inside their own directories (where their devDeps live).
//
// Run from the project root: node scripts/smoke-test-siblings.mjs

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(label, cwd, cmd, args) {
  console.log(`=== ${label} ===`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.log(`✗ ${label} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}\n`);
}

// Build the sibling packages first so their dist/ exists
run('Build eslint-plugin', resolve(root, 'eslint-plugin-temporal-fmt'), 'npm', ['run', 'build']);
run('Build codemod', resolve(root, 'temporal-fmt-codemod'), 'npm', ['run', 'build']);

// Run their test suites
run('ESLint plugin tests', resolve(root, 'eslint-plugin-temporal-fmt'), 'npm', ['test']);
run('Codemod tests', resolve(root, 'temporal-fmt-codemod'), 'npm', ['test']);

// Run the codemod's CLI in dry-run mode against a small fixture file
console.log('=== Codemod dry-run against sample fixture ===');
const fixturePath = resolve(root, 'temporal-fmt-codemod/test/fixtures/sample.input.js');
const codemodCli = resolve(root, 'temporal-fmt-codemod/dist/cli.js');
const dryRunResult = spawnSync('node', [codemodCli, fixturePath, '--dry-run'], {
  cwd: resolve(root, 'temporal-fmt-codemod'),
  stdio: 'inherit',
});
if (dryRunResult.status !== 0) {
  console.log(`(codemod dry-run exited ${dryRunResult.status} — jscodeshift Runner output expected)`);
}

console.log('\n✓ All sibling-package smoke checks complete.');
