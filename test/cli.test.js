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

// Runs the CLI with no arguments (interactive mode) and feeds it a
// scripted session, one line of input per REPL prompt. execFileSync's
// `input` option writes the whole string to stdin and closes it, which
// is exactly what a piped, non-interactive session looks like.
function runReplSession(inputLines) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH], {
      encoding: 'utf8',
      input: inputLines.join('\n') + '\n',
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

test('CLI: format subcommand handles an explicit numeric offset', () => {
  // A numeric offset alone isn't a timezone, so this should keep the
  // wall-clock fields as written rather than converting to UTC.
  const { stdout, exitCode } = runCli('format', '2026-08-04T15:45:30+02:00', 'yyyy-MM-dd HH:mm:ss');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04 15:45:30');
});

test('CLI: format subcommand handles a "Z"-suffixed instant', () => {
  const { stdout, exitCode } = runCli('format', '2026-08-04T15:45:30Z', 'yyyy-MM-dd HH:mm:ss zzz');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04 15:45:30 UTC');
});

test('CLI: format subcommand renders an offset token as "Z" for a "Z"-suffixed input', () => {
  const { stdout, exitCode } = runCli('format', '2026-08-04T15:45:30Z', 'yyyy-MM-dd HH:mm:ssXXX');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04 15:45:30Z');
});

test('CLI: format subcommand explains why an offset token fails on a numeric-offset input', () => {
  // parseIsoInput intentionally drops a non-"Z" numeric offset, keeping
  // only wall-clock fields (see the comment above parseIsoInput), so an
  // offset-formatting token has nothing to render. The error should say
  // why, not just that the field is missing.
  const { exitCode, stderr } = runCli('format', '2026-08-04T15:45:30+02:00', 'yyyy-MM-dd HH:mm:ssXXX');
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /has a numeric offset, but temporal-fmt drops it during parsing/);
});

test('CLI: format subcommand gives the plain error for an offset token on an offset-less input', () => {
  // A bare wall-clock input never had an offset to drop, so it should
  // NOT get the numeric-offset-specific explanation above.
  const { exitCode, stderr } = runCli('format', '2026-08-04T15:45:30', 'yyyy-MM-dd HH:mm:ssXXX');
  assert.notEqual(exitCode, 0);
  assert.doesNotMatch(stderr, /has a numeric offset/);
  assert.match(stderr, /requires "offset"/);
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

test('CLI: translate subcommand translates a Day.js format string', () => {
  const { stdout, exitCode } = runCli('translate', 'dayjs', 'YYYY-MM-DD HH:mm:ss');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), 'yyyy-MM-dd HH:mm:ss');
});

test('CLI: translate subcommand translates a date-fns format string', () => {
  const { stdout, exitCode } = runCli('translate', 'date-fns', 'EEEE, MMMM do yyyy');
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), 'EEEE, MMMM do yyyy');
});

test('CLI: translate subcommand exits non-zero on an unmapped token', () => {
  const { exitCode, stderr } = runCli('translate', 'dayjs', 'Do MMMM YYYY');
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /no Day\.js -> temporal-fmt mapping/);
});

test('CLI: translate subcommand exits non-zero for an unknown source library', () => {
  const { exitCode, stderr } = runCli('translate', 'moment', 'YYYY-MM-DD');
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /unknown source library/);
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

test('CLI: interactive mode prompts for missing arguments', () => {
  const { stdout, exitCode } = runReplSession([
    'format',
    '2026-08-04T15:45:30',
    'yyyy-MM-dd HH:mm:ss',
    'exit',
  ]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /temporal-fmt interactive mode/);
  assert.match(stdout, /2026-08-04 15:45:30/);
});

test('CLI: interactive mode accepts inline arguments without prompting', () => {
  const { stdout, exitCode } = runReplSession([
    'validate yyyy-MM-dd',
    'exit',
  ]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /valid/);
});

test('CLI: interactive mode runs multiple commands in one session', () => {
  const { stdout, exitCode } = runReplSession([
    'validate yyyy-MM-dd',
    'translate dayjs YYYY-MM-DD',
    'exit',
  ]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /valid/);
  assert.match(stdout, /yyyy-MM-dd/);
});

test('CLI: interactive mode reports errors without ending the session', () => {
  const { stdout, exitCode } = runReplSession([
    'format not-a-date yyyy-MM-dd',
    'format 2026-08-04 yyyy-MM-dd',
    'exit',
  ]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /Error: could not parse/);
  assert.match(stdout, /2026-08-04/);
});

test('CLI: interactive mode exits cleanly on stdin EOF without "exit"', () => {
  const { stdout, exitCode } = runReplSession(['validate yyyy-MM-dd']);
  assert.equal(exitCode, 0);
  assert.match(stdout, /valid/);
});

test('CLI: interactive mode "help" prints usage without ending the session', () => {
  const { stdout, exitCode } = runReplSession([
    'help',
    'validate yyyy-MM-dd',
    'exit',
  ]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /valid/);
});
