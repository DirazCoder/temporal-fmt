// Everything else in this repo tests src/ or dist/ directly. None of it
// answers the question a real consumer actually hits: after `npm install
// temporal-fmt`, does require()/import even resolve, does the exports
// map actually block subpath access, does a missing peer fail with a
// clean error, do the shipped .d.ts files typecheck under every
// moduleResolution mode a consumer might use? attw and publint (see
// test:pack) check the exports map's shape statically — neither of them
// executes code. This does: pack the real tarball, install it into one
// or more throwaway projects like a consumer would, then run it for real.
import { mkdtempSync, rmSync, mkdirSync, cpSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROBES_DIR = fileURLToPath(new URL('./probes', import.meta.url));

// npm/npx are .cmd shims on Windows, not real executables — spawnSync()
// can't invoke one directly without going through the shell. shell:true
// on Windows only; POSIX doesn't need it and shouldn't pay for it.
const isWindows = process.platform === 'win32';
const npmCmd = 'npm';
const npxCmd = 'npx';

// Windows quoting for cmd.exe: wrap in double quotes if the arg has a
// space, and escape any double quotes already in it. Good enough here
// since every arg passed through this file is either a hardcoded flag,
// a pinned version string, or an os.tmpdir() path — nothing attacker
// controlled — but doing real quoting instead of relying on shell:true's
// unescaped array-join (Node flags that as DEP0190) costs nothing.
function quoteForWindows(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function run(cmd, args, opts = {}) {
  const result = isWindows
    ? spawnSync([cmd, ...args].map(quoteForWindows).join(' '), { stdio: 'inherit', shell: true, ...opts })
    : spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with status ${result.status}`);
  }
  return result;
}

function runCaptured(cmd, args, opts = {}) {
  const result = isWindows
    ? spawnSync([cmd, ...args].map(quoteForWindows).join(' '), { encoding: 'utf8', shell: true, ...opts })
    : spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`${cmd} ${args.join(' ')} exited with status ${result.status}`);
  }
  return result.stdout;
}

// true if `cmd --version` runs without error — used to skip the pnpm
// probe on machines/CI runners that don't have it, instead of hard
// failing the whole suite over an optional package manager.
function commandExists(cmd) {
  const result = isWindows
    ? spawnSync(quoteForWindows(cmd) + ' --version', { shell: true, stdio: 'ignore' })
    : spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function writeTsconfig(dir, moduleResolution) {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: moduleResolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
          moduleResolution,
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['smoke-types.ts'],
      },
      null,
      2
    )
  );
}

const scratchDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-smoke-'));

try {
  console.log(`smoke-test: packing tarball from ${ROOT}`);
  // --pack-destination so the .tgz lands in the scratch dir, not the repo root
  const packOutput = runCaptured(npmCmd, ['pack', '--silent', '--pack-destination', scratchDir], {
    cwd: ROOT,
  });
  const tarballName = packOutput.trim().split('\n').pop();
  const tarballPath = join(scratchDir, tarballName);
  console.log(`smoke-test: packed ${tarballName}`);

  const flatProbes = readdirSync(PROBES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  // --- Main project: ESM-default ("type": "module"), npm install ---
  const projectDir = join(scratchDir, 'project');
  mkdirSync(projectDir);
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'temporal-fmt-smoke-consumer', private: true, type: 'module' }, null, 2)
  );

  console.log('smoke-test: installing packed tarball + temporal-polyfill into a scratch project');
  run(
    npmCmd,
    ['install', '--silent', '--no-audit', '--no-fund', tarballPath, 'temporal-polyfill@^1.0.4', 'typescript@^7.0.2'],
    { cwd: projectDir }
  );

  for (const name of flatProbes) {
    cpSync(join(PROBES_DIR, name), join(projectDir, name));
  }

  console.log('\nsmoke-test: running probes (npm, ESM-default project)\n');

  run('node', ['smoke-require.cjs'], { cwd: projectDir });
  run('node', ['smoke-import.mjs'], { cwd: projectDir });
  run('node', ['smoke-deep-import-blocked.cjs'], { cwd: projectDir });
  run('node', ['smoke-no-temporal.cjs'], { cwd: projectDir });

  // TS moduleResolution: "bundler" mirrors the mode attw's "bundler" row
  // checks — the most common real-world consumer setup. "nodenext" is
  // the other mode attw scores (its node16 rows) but never actually
  // runs tsc against — stricter extension/resolution rules, worth
  // executing for real in case the two modes ever disagree on this
  // package's types even though they agree on shape.
  writeTsconfig(projectDir, 'Bundler');
  run(npxCmd, ['--no-install', 'tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: projectDir });
  console.log('smoke-types.ts (moduleResolution: bundler): ok');

  writeTsconfig(projectDir, 'NodeNext');
  run(npxCmd, ['--no-install', 'tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: projectDir });
  console.log('smoke-types.ts (moduleResolution: nodenext): ok');

  // --- Second project: CJS-default (no "type" field), npm install ---
  // Exercises the ambiguous case a .cjs-extension probe can't: a plain
  // .js file's module system depends entirely on the nearest
  // package.json's "type" field, so this has to be its own project
  // rather than a file dropped into the ESM-default one above.
  const cjsDefaultProjectDir = join(scratchDir, 'cjs-default-project');
  mkdirSync(cjsDefaultProjectDir);
  writeFileSync(
    join(cjsDefaultProjectDir, 'package.json'),
    JSON.stringify({ name: 'temporal-fmt-smoke-cjs-default', private: true }, null, 2)
  );
  run(npmCmd, ['install', '--silent', '--no-audit', '--no-fund', tarballPath, 'temporal-polyfill@^1.0.4'], {
    cwd: cjsDefaultProjectDir,
  });
  cpSync(join(PROBES_DIR, 'cjs-default-project', 'smoke-cjs-default-project.js'), join(cjsDefaultProjectDir, 'smoke-cjs-default-project.js'));

  console.log('\nsmoke-test: running probes (npm, CJS-default project)\n');
  run('node', ['smoke-cjs-default-project.js'], { cwd: cjsDefaultProjectDir });

  // --- Optional: same require/import probes under pnpm's stricter,
  // symlinked node_modules layout, which resolves packages differently
  // than npm's flatter one and can surface issues npm's install won't.
  // Skipped, not failed, when pnpm isn't on the machine — this is the
  // one axis here that depends on tooling outside Node/npm itself.
  if (commandExists('pnpm')) {
    const pnpmProjectDir = join(scratchDir, 'pnpm-project');
    mkdirSync(pnpmProjectDir);
    writeFileSync(
      join(pnpmProjectDir, 'package.json'),
      JSON.stringify({ name: 'temporal-fmt-smoke-pnpm', private: true, type: 'module' }, null, 2)
    );
    run(
      'pnpm',
      ['add', '--silent', tarballPath, 'temporal-polyfill@^1.0.4'],
      { cwd: pnpmProjectDir }
    );
    cpSync(join(PROBES_DIR, 'smoke-require.cjs'), join(pnpmProjectDir, 'smoke-require.cjs'));
    cpSync(join(PROBES_DIR, 'smoke-import.mjs'), join(pnpmProjectDir, 'smoke-import.mjs'));

    console.log('\nsmoke-test: running probes (pnpm)\n');
    run('node', ['smoke-require.cjs'], { cwd: pnpmProjectDir });
    run('node', ['smoke-import.mjs'], { cwd: pnpmProjectDir });
  } else {
    console.log('\nsmoke-test: pnpm not found, skipping pnpm resolution probe');
  }

  console.log('\nsmoke-test: all probes passed');
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
