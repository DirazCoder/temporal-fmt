import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

function runCli(...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err;
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}

test('CLI: format subcommand produces formatted output', () => {
  const { stdout, exitCode } = runCli('format', '2026-08-04T15:45:30', 'yyyy-MM-dd HH:mm:ss');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04 15:45:30');
});

test('CLI: parse subcommand produces ISO output', () => {
  const { stdout, exitCode } = runCli('parse', 'yyyy-MM-dd', '2026-08-04');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
});

test('CLI: inspect subcommand produces analysis output', () => {
  const { stdout, exitCode } = runCli('inspect', 'yyyy-MM-dd HH:mm');
  assert.equal(exitCode, 0);
  assert.match(stdout, /Format string:/);
  assert.match(stdout, /Tokens \(5\):/);
});

test('CLI: validate subcommand returns "valid" or "invalid"', () => {
  const valid = runCli('validate', 'yyyy-MM-dd');
  assert.equal(valid.exitCode, 0);
  assert.equal(valid.stdout.trim(), 'valid');

  const invalid = runCli('validate', "yyyy 'at");
  assert.equal(invalid.exitCode, 0);
  assert.equal(invalid.stdout.trim(), 'invalid');
});

test('CLI: --help shows usage', () => {
  const { stdout, exitCode } = runCli('--help');
  assert.equal(exitCode, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /Subcommands:/);
});

test('CLI: unknown subcommand exits non-zero', () => {
  const { exitCode, stderr } = runCli('not-a-subcommand');
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /Unknown subcommand/);
});
