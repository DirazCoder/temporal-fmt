import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// scripts/managePermissions.mjs — the out-of-band editor for the same
// .temporal-fmt-permissions.json the load-time prompts write to. What
// matters here: it speaks the exact same file format and keys (so a grant
// made here is the grant the next load reads), and it exits cleanly when
// there's nothing to look at rather than erroring.

const MANAGE_PATH = fileURLToPath(new URL('../scripts/managePermissions.mjs', import.meta.url));
const CLI_PATH = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

function runManageIn(cwd, ...args) {
  const result = spawnSync(process.execPath, [MANAGE_PATH, ...args], { encoding: 'utf8', cwd });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status ?? 1 };
}

function newProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-perms-'));
  mkdirSync(join(dir, 'mods'));
  return dir;
}

test('managePermissions: list with no cache file says so and exits cleanly', () => {
  const dir = newProjectDir();
  const { stdout, exitCode } = runManageIn(dir, 'list');
  assert.equal(exitCode, 0);
  // No leading "/" assumption — the cache path is spelled with the
  // platform's own separators.
  assert.match(stdout, /no permission cache at .+\.temporal-fmt-permissions\.json — nothing has been answered yet/);
  rmSync(dir, { recursive: true, force: true });
});

test('managePermissions: grant/deny/list/reset round-trip one entry', () => {
  const dir = newProjectDir();
  const cachePath = join(dir, '.temporal-fmt-permissions.json');

  const granted = runManageIn(dir, 'grant', 'data-reader@1.0.0', 'fs:read');
  assert.equal(granted.exitCode, 0);
  assert.match(granted.stdout, /data-reader@1\.0\.0 → fs:read: granted/);
  assert.match(granted.stdout, /applies the next time this mod loads/);
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8'))['data-reader@1.0.0']['fs:read'], true);

  const denied = runManageIn(dir, 'deny', 'data-reader@1.0.0', 'fs:read');
  assert.equal(denied.exitCode, 0);
  assert.match(denied.stdout, /fs:read: denied/);
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8'))['data-reader@1.0.0']['fs:read'], false);

  const listed = runManageIn(dir, 'list');
  assert.equal(listed.exitCode, 0);
  assert.match(listed.stdout, /data-reader@1\.0\.0\n\s+fs:read\s+denied/);

  const reset = runManageIn(dir, 'reset', 'data-reader@1.0.0');
  assert.equal(reset.exitCode, 0);
  assert.match(reset.stdout, /cleared data-reader@1\.0\.0/);
  // The whole key is gone, not just one capability, so the next load
  // re-asks everything.
  assert.deepEqual(JSON.parse(readFileSync(cachePath, 'utf8')), {});
  assert.match(runManageIn(dir, 'list').stdout, /nothing has been answered yet/);
  rmSync(dir, { recursive: true, force: true });
});

test('managePermissions: a bare mod name means the versionless key, and reset of an unknown mod is a no-op', () => {
  const dir = newProjectDir();
  writeFileSync(join(dir, '.temporal-fmt-permissions.json'), JSON.stringify({ 'asker@': { 'fs:read': true } }));

  const reset = runManageIn(dir, 'reset', 'asker');
  assert.equal(reset.exitCode, 0);
  assert.match(reset.stdout, /cleared asker@ /);
  assert.match(runManageIn(dir, 'reset', 'nobody@9.9.9').stdout, /no cached answers for nobody@9\.9\.9 — nothing to reset/);
  rmSync(dir, { recursive: true, force: true });
});

test('managePermissions: an unknown capability is refused with the closed list', () => {
  const dir = newProjectDir();
  const { stderr, exitCode } = runManageIn(dir, 'grant', 'netty@1.0.0', 'net');
  assert.equal(exitCode, 1);
  assert.match(stderr, /"net" isn't a capability — supported: fs:read, fs:write, child-process, worker/);
  rmSync(dir, { recursive: true, force: true });
});

test('managePermissions: no command prints usage, --help does the same but exits 0', () => {
  const dir = newProjectDir();
  const bare = runManageIn(dir);
  assert.equal(bare.exitCode, 1);
  assert.match(bare.stderr, /node scripts\/managePermissions\.mjs list/);
  assert.equal(runManageIn(dir, '--help').exitCode, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('managePermissions: a grant made here is the grant the next load reads — one cache, not two', () => {
  const dir = newProjectDir();
  writeFileSync(join(dir, 'outside.txt'), 'outside-data');
  const stageDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-tfmod-stage-'));
  writeFileSync(join(stageDir, 'mod.json'), JSON.stringify({
    name: 'src-reader',
    version: '1.0.0',
    main: 'main.mjs',
    permissions: [{ capability: 'fs:read', required: true }],
  }));
  writeFileSync(join(stageDir, 'main.mjs'), `
    import { readFileSync } from 'node:fs';
    export default {
      register(ctx) {
        const data = readFileSync(${JSON.stringify(join(dir, 'outside.txt'))}, 'utf8').trim();
        ctx.registerLocaleVocab('xx-src', {
          monthLong: Array.from({ length: 12 }, (_, i) => data + '-' + (i + 1) + 'L'),
          monthShort: Array.from({ length: 12 }, (_, i) => 'S' + (i + 1)),
          weekdayLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
          dayPeriod: ['AM', 'PM'],
        });
      },
    };
  `);
  execFileSync('tar', ['-czf', join(dir, 'mods', 'src-reader.tfmod'), 'mod.json', 'main.mjs'], { cwd: stageDir });
  rmSync(stageDir, { recursive: true, force: true });

  // No cache file yet: a non-interactive load auto-denies the required
  // capability and the mod fails. Then grant it out-of-band and the same
  // load succeeds — same file, same key, same shape.
  const before = runManageIn(dir, 'list');
  assert.match(before.stdout, /nothing has been answered yet/);
  const deniedLoad = spawnSync(process.execPath, [CLI_PATH, 'format', '2026-08-04', 'MMMM', '--locale=xx-src'], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  assert.match(deniedLoad.stderr ?? '', /failed src-reader\.tfmod: denied required permission: fs:read/);

  assert.equal(runManageIn(dir, 'grant', 'src-reader@1.0.0', 'fs:read').exitCode, 0);
  const grantedLoad = spawnSync(process.execPath, [CLI_PATH, 'format', '2026-08-04', 'MMMM', '--locale=xx-src'], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  assert.match(grantedLoad.stderr ?? '', /loaded src-reader@1\.0\.0.*sandboxed: fs:read granted/);
  assert.match((grantedLoad.stdout ?? '').trim(), /^outside-data/);
  rmSync(dir, { recursive: true, force: true });
});
