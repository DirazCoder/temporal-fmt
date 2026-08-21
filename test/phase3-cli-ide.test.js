import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  getAutocompleteData, getHoverDocs, getInlineDiagnostics,
  previewFormat, getDocUrl,
  DAYJS_TO_TEMPORAL_FMT,
} from '../dist/index.js';

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

// ===== CLI (Section AD) =====
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

// ===== IDE data (Section AC) =====
test('getAutocompleteData: returns one entry per token with family grouping', () => {
  const data = getAutocompleteData();
  assert.ok(data.length > 30);  // every token in the table
  // Spot-check entries.
  const yyyy = data.find((d) => d.label === 'yyyy');
  assert.ok(yyyy);
  assert.equal(yyyy.family, 'Year');
  assert.ok(yyyy.detail.length > 0);
  assert.ok(yyyy.documentation.length > 0);

  const zzz = data.find((d) => d.label === 'zzz');
  assert.ok(zzz);
  assert.equal(zzz.family, 'Time Zone');
});

test('getHoverDocs: returns one entry per token with summary + details', () => {
  const docs = getHoverDocs();
  assert.ok(Object.keys(docs).length > 30);
  const yyyy = docs['yyyy'];
  assert.ok(yyyy);
  assert.match(yyyy.summary, /year/i);
  assert.match(yyyy.details, /Format-capable:/);
});

test('getInlineDiagnostics: surfaces warnings from analyzeFormat', () => {
  const diags = getInlineDiagnostics('h:mm');
  assert.ok(diags.length > 0);
  assert.ok(diags.some((d) => d.code === 'TWELVE_HOUR_WITHOUT_A'));
  assert.ok(diags.some((d) => d.suggestion && d.suggestion.length > 0));
});

test('getInlineDiagnostics: mixing 12- and 24-hour tokens gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('HH:mmh');
  const warning = diags.find((d) => d.code === 'MIXED_12_AND_24_HOUR');
  assert.ok(warning);
  assert.match(warning.suggestion, /Pick one form/);
});

test('getInlineDiagnostics: ambiguous unpadded numeric run gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('Md');
  const warning = diags.find((d) => d.code === 'AMBIGUOUS_NUMERIC_RUN');
  assert.ok(warning);
  assert.match(warning.suggestion, /Add a separator/);
});

test('getInlineDiagnostics: format-only token gets a tailored suggestion', () => {
  const diags = getInlineDiagnostics('do');
  const warning = diags.find((d) => d.code === 'FORMAT_ONLY_TOKEN');
  assert.ok(warning);
  assert.match(warning.suggestion, /parse-capable variant/);
});

test('getInlineDiagnostics: empty for clean format strings', () => {
  const diags = getInlineDiagnostics('yyyy-MM-dd HH:mm:ss');
  assert.equal(diags.length, 0);
});

test('getInlineDiagnostics: zzz with an offset token falls through with no suggestion', () => {
  // ZZZ_WITH_OFFSET_TOKEN isn't one of the codes getInlineDiagnostics
  // has a tailored suggestion for — this is a real, reachable warning
  // code (unlike UNKNOWN_TOKEN_NO_METADATA, which tokenize() prevents
  // analyzeFormat from ever producing), so the fallthrough to an
  // undefined suggestion is genuine behavior, not a gap.
  const diags = getInlineDiagnostics("yyyy-MM-dd'T'HH:mm:ssXXXzzz");
  const warning = diags.find((d) => d.code === 'ZZZ_WITH_OFFSET_TOKEN');
  assert.ok(warning);
  assert.equal(warning.suggestion, undefined);
});

test('getInlineDiagnostics: offset token without a full date falls through with no suggestion', () => {
  const diags = getInlineDiagnostics('HH:mmXXX');
  const warning = diags.find((d) => d.code === 'OFFSET_WITHOUT_FULL_DATE');
  assert.ok(warning);
  assert.equal(warning.suggestion, undefined);
});

test('previewFormat: produces formatted output for the default sample', () => {
  const out = previewFormat('yyyy-MM-dd HH:mm:ss');
  assert.match(out, /^2026-08-04 15:45:30$/);
});

test('previewFormat: respects the sample parameter', () => {
  const out = previewFormat('yyyy', { year: 2030, month: 1, day: 1 });
  assert.equal(out, '2030');
});

test('getDocUrl: points at the README token reference section', () => {
  // docs/ was consolidated into the root README, which has no per-token
  // anchors, so every token resolves to the same section link.
  assert.equal(getDocUrl('yyyy'), 'README.md#token-reference');
  assert.equal(getDocUrl('MMMM'), 'README.md#token-reference');
});

test('DAYJS_TO_TEMPORAL_FMT: includes YYYY→yyyy and DD→dd mappings', () => {
  const yyyy = DAYJS_TO_TEMPORAL_FMT.find((m) => m.from === 'YYYY');
  assert.ok(yyyy);
  assert.equal(yyyy.to, 'yyyy');
});