import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== '--no-browser');
if (unknownArgs.length > 0) {
  throw new Error(`test:all: unknown option(s): ${unknownArgs.join(', ')}`);
}

const skipBrowser = args.includes('--no-browser');
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('test:all must be run through npm: npm run test:all');
}

function runNpm(npmArgs, env = {}) {
  console.log(`\n> npm ${npmArgs.join(' ')}`);
  const result = spawnSync(process.execPath, [npmCli, ...npmArgs], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }
  return true;
}

const checks = [
  ['run', 'build'],
  ['run', 'test:coverage'],
  ['run', 'test:unit', '--', '--coverage'],
  ['run', 'test:types'],
  ['run', 'test:pack'],
  ['run', 'test:smoke'],
];

for (const check of checks) {
  if (!runNpm(check)) process.exit();
}

if (skipBrowser) {
  console.log('\nSkipping browser tests (--no-browser).');
  process.exit();
}

for (const browser of ['chromium', 'firefox', 'webkit']) {
  if (!runNpm(['run', 'test:browser:unit'], { VITEST_BROWSER: browser })) {
    process.exit();
  }
}

runNpm(['run', 'test:browser']);
