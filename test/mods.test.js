import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, execFileSync as execFileSyncTar } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Builds a real .tfmod (gzipped tar) from an in-memory file map, using
// the system `tar` binary — the same mechanism scripts/loadMods.mjs
// uses to extract it, so these tests exercise the real archive format
// rather than a loader-specific mock of one.
function buildTfmod(destPath, files) {
  const stageDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-tfmod-stage-'));
  for (const [name, contents] of Object.entries(files)) {
    const filePath = join(stageDir, name);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, contents);
  }
  execFileSyncTar('tar', ['-czf', destPath, ...Object.keys(files)], { cwd: stageDir });
  rmSync(stageDir, { recursive: true, force: true });
}

const CLI_PATH = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

// Each test gets its own throwaway mods/ dir and runs the CLI as a
// fresh subprocess against it. Subprocess isolation is doing real work
// here, not just convenience: format()/parse() overrides live in
// module-level state (see src/runtime.ts), so if these tests shared a
// process, one test's overrideFormat() would leak into the next.
function withModsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, 'mods', name), contents);
  }
  return dir;
}

function runCliIn(cwd, ...args) {
  // execFileSync only returns stdout on success and swallows stderr
  // entirely unless it's captured explicitly — the mod-load report goes
  // to stderr even on a successful (exit 0) run, so plain execFileSync
  // isn't enough here the way it was for cli.test.js's stdout-only
  // assertions. spawnSync captures both regardless of exit code.
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd,
    // NO_COLOR/FORCE_COLOR=0: several callers assert on exact stdout
    // (e.g. `2026-08-04!!!`), and whether a subprocess's stdout gets
    // ANSI-colorized depends on the OS/terminal, not on anything this
    // test controls — pin it off so the assertions are deterministic
    // everywhere the suite runs.
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.status ?? 1 };
}

const FORMAT_ARGS = ['format', '2026-08-04T15:45:30', 'yyyy-MM-dd'];

// Every override point ModContext exposes, in the order buildModContextFor
// defines them (see src/modApi.ts) — used to build one register() body
// that calls all 83, so a single test proves every generated override
// wrapper runs without throwing rather than needing 83 near-identical
// test blocks or process spawns for what's otherwise identical code
// (see generate.mjs and runtime.ts's createOverridable).
const ALL_OVERRIDE_POINTS = ["Format","Parse","CompileFormat","CompileParser","ParseRelative","ExplainFormat","TokenizeFormat","ListTokens","TokenInfo","IsValidFormat","ValidateFormat","FieldForToken","MonthsInYear","IsLeapYear","IsLeapMonth","WeekOfYear","WeekYear","GetMonth","GetWeekday","IsEqual","IsBefore","IsAfter","Clamp","IsBetween","IsToday","IsTomorrow","IsYesterday","IsSameDay","IsSameWeek","IsSameMonth","IsSameQuarter","IsSameYear","IsWeekday","Floor","Ceil","Truncate","ParseRFC3339","FormatRFC3339","ParseRFC2822","ParseHTTPDate","FromUnixMicroseconds","FromUnixNanoseconds","ToUnixSeconds","ToUnixMilliseconds","ToUnixMicroseconds","ToUnixNanoseconds","ParseSQL","FormatSQL","FormatDurationToParts","ParseDuration","ParseISODuration","FormatISODuration","BalanceDuration","CompareDuration","SubtractDuration","GetLocale","HasLocale","CreateConfig","MergeWithConfig","ListRegisteredGrammars","Interval","Overlaps","Intersection","Union","MergeIntervals","FormatRangeToParts","Between","ParseRRule","FormatRRule","CreateBusinessCalendar","SubtractBusinessDays","NextHoliday","PreviousHoliday","ResolveZoned","GetNextTransition","GetPreviousTransition","PossibleInstantsFor","GetAutocompleteData","GetHoverDocs","GetInlineDiagnostics","PreviewFormat","GetDocUrl","TranslateDateFnsFormatString"];
const ALL_OVERRIDE_CALLS = ALL_OVERRIDE_POINTS.map((n) => `        ctx.override${n}((original) => original);`).join('\n');

const VALID_MONTHS = JSON.stringify(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);
const VALID_WEEKDAYS = JSON.stringify(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);

test('mods: no mods/ folder produces zero extra stderr output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.equal(stderr, '');
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a valid mod loads and is reported on stderr, stdout stays clean', () => {
  const dir = withModsDir({
    'holiday.mjs': `
      export default {
        name: 'holiday-pack',
        register(ctx) {
          ctx.createHolidayCalendar([{ month: 12, day: 25, name: 'Christmas' }]);
        }
      };
    `,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.match(stderr, /loaded holiday-pack \(holiday\.mjs\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a .ts file in mods/ fails loudly with a compile instruction, does not block other mods', () => {
  const dir = withModsDir({
    'bad.ts': `export default { name: 'x' };`,
    'good.mjs': `export default { name: 'good', register() {} };`,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.match(stderr, /failed bad\.ts:.*must be \.mjs, not \.ts/);
  assert.match(stderr, /compile it first/);
  assert.match(stderr, /loaded good \(good\.mjs\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a malformed default export is rejected with a specific reason, not silently skipped', () => {
  const dir = withModsDir({
    'malformed.mjs': `export default { notAMod: true };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed malformed\.mjs:.*must be an object with a "name" string/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a register() throw is caught per-mod and does not take down the process or other mods', () => {
  const dir = withModsDir({
    'broken.mjs': `export default { name: 'broken', register() { throw new Error('boom'); } };`,
    'fine.mjs': `export default { name: 'fine', register() {} };`,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.match(stderr, /failed broken\.mjs: register\(\) threw: boom/);
  assert.match(stderr, /loaded fine \(fine\.mjs\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: dependency order overrides alphabetical filename order', () => {
  const dir = withModsDir({
    // Filename sorts before "a-base.mjs" alphabetically, but declares
    // a dependency on it — it must still load second.
    'z-dependent.mjs': `export default { name: 'dependent', requires: ['base'], register() {} };`,
    'a-base.mjs': `export default { name: 'base', register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  const baseIdx = stderr.indexOf('loaded base');
  const dependentIdx = stderr.indexOf('loaded dependent');
  assert.ok(baseIdx > -1 && dependentIdx > -1, 'both mods should report as loaded');
  assert.ok(baseIdx < dependentIdx, 'base must load before dependent despite filename order');
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a missing dependency fails only the dependent mod, named specifically', () => {
  const dir = withModsDir({
    'needs-ghost.mjs': `export default { name: 'needs-ghost', requires: ['ghost'], register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed needs-ghost\.mjs: requires "ghost", which isn't present in mods\//);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a circular dependency fails every mod in the cycle with what it is still waiting on', () => {
  const dir = withModsDir({
    'cyc-a.mjs': `export default { name: 'cyc-a', requires: ['cyc-b'], register() {} };`,
    'cyc-b.mjs': `export default { name: 'cyc-b', requires: ['cyc-a'], register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed cyc-a\.mjs: circular dependency — still waiting on: cyc-b/);
  assert.match(stderr, /failed cyc-b\.mjs: circular dependency — still waiting on: cyc-a/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: duplicate mod names are rejected rather than silently colliding', () => {
  const dir = withModsDir({
    'first.mjs': `export default { name: 'dupe', register() {} };`,
    'second.mjs': `export default { name: 'dupe', register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /mod name "dupe" is already used by (first|second)\.mjs/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: two mods registering the same locale tag report a conflict, higher priority wins', () => {
  const dir = withModsDir({
    'a-low.mjs': `export default {
      name: 'low-pri', priority: 0,
      register(ctx) {
        ctx.registerLocaleVocab('xx-XX', {
          monthLong: ${VALID_MONTHS}, monthShort: ${VALID_MONTHS},
          weekdayLong: ${VALID_WEEKDAYS}, weekdayShort: ${VALID_WEEKDAYS},
          dayPeriod: ['AM', 'PM'],
        });
      }
    };`,
    'b-high.mjs': `export default {
      name: 'high-pri', priority: 5,
      register(ctx) {
        ctx.registerLocaleVocab('xx-XX', {
          monthLong: ${VALID_MONTHS}, monthShort: ${VALID_MONTHS},
          weekdayLong: ${VALID_WEEKDAYS}, weekdayShort: ${VALID_WEEKDAYS},
          dayPeriod: ['AM', 'PM'],
        });
      }
    };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded low-pri \(a-low\.mjs\)/);
  assert.match(stderr, /loaded high-pri \(b-high\.mjs\)/);
  assert.match(stderr, /conflict on localeVocab "xx-XX": low-pri, high-pri — "high-pri" wins \(loaded last\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: overrideFormat applies to both the public export and internal callers like formatRange', () => {
  // This scratch script needs `temporal-polyfill` and this repo's own
  // dist/ to resolve, which only works if it runs from inside the repo
  // (module resolution walks up from the script's own location to find
  // node_modules) — a /tmp dir has neither. The mods/ dir it loads from
  // can still be an arbitrary temp dir; only the runner script itself
  // needs to live in-repo.
  const modsDir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  writeFileSync(
    join(modsDir, 'shout.mjs'),
    `export default {
      name: 'shout',
      register(ctx) {
        ctx.overrideFormat((original, ...args) => original(...args).toUpperCase() + '!');
      }
    };`,
  );
  const scratchDir = mkdtempSync(join(fileURLToPath(new URL('..', import.meta.url)), '.tmp-mods-test-'));
  const script = `
    import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
    import { loadMods } from ${JSON.stringify(new URL('../scripts/loadMods.mjs', import.meta.url).href)};
    import { format, interval, formatRange } from ${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)};
    const Temporal = globalThis.Temporal ?? PolyfillTemporal;
    await loadMods(${JSON.stringify(modsDir)});
    // MMM needs a real Temporal object (toLocaleString), not a plain
    // field bag, for locale-aware month names.
    const d1 = Temporal.PlainDate.from('2026-08-04');
    const d2 = Temporal.PlainDate.from('2026-08-06');
    console.log(format(d1, 'MMM d'));
    console.log(formatRange(interval(d1, d2), 'MMM d'));
  `;
  const scriptPath = join(scratchDir, 'run.mjs');
  writeFileSync(scriptPath, script);
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
    rmSync(modsDir, { recursive: true, force: true });
  }
  const lines = stdout.trim().split('\n');
  // Both the direct format() call and interval.ts's internal use of
  // format() via formatRange() must reflect the override — that's the
  // entire point of routing through the runtime.ts registry instead of
  // only re-exporting a swapped binding from index.ts.
  assert.match(lines[0], /^AUG 4!$/);
  assert.match(lines[1], /AUG 4!.*–.*AUG 6!/);
});

test('mods: a second overrideFormat() call from another mod collides and fails, first mod still wins', () => {
  const dir = withModsDir({
    'a-override1.mjs': `export default {
      name: 'override-1',
      register(ctx) { ctx.overrideFormat((original, ...args) => original(...args) + '!!!'); }
    };`,
    'b-override2.mjs': `export default {
      name: 'override-2',
      register(ctx) { ctx.overrideFormat((original, ...args) => original(...args) + '???'); }
    };`,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04!!!');
  assert.match(stderr, /loaded override-1 \(a-override1\.mjs\)/);
  assert.match(stderr, /failed b-override2\.mjs:.*already overridden by mod "override-1"/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: removing the mod file restores original behavior on the next run (no persisted state)', () => {
  const dir = withModsDir({
    'shout.mjs': `export default {
      name: 'shout',
      register(ctx) { ctx.overrideFormat((original, ...args) => original(...args) + '!!!'); }
    };`,
  });
  const withMod = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(withMod.stdout.trim(), '2026-08-04!!!');

  rmSync(join(dir, 'mods', 'shout.mjs'));
  const withoutMod = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(withoutMod.stdout.trim(), '2026-08-04');
  rmSync(dir, { recursive: true, force: true });
});

// Every one of the 83 override points on ModContext follows one
// generated shape (see modApi.ts's buildModContextFor and
// generate.mjs) — get the current impl, install a wrapper under this
// mod's name. A single mod calling all 83 in its own register() proves
// every one of those bodies actually runs without throwing, in one
// subprocess rather than 83 — a fresh CLI invocation per override would
// be the same coverage for ~83x the process-spawn cost, with nothing
// gained since none of these calls depend on another one's state.
test('mods: a mod can call every one of the 83 override points without any of them throwing', () => {
  const dir = withModsDir({
    'all-overrides.mjs': `export default {
      name: 'all-overrides',
      register(ctx) {
${ALL_OVERRIDE_CALLS}
      }
    };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded all-overrides \(all-overrides\.mjs\)/);
  rmSync(dir, { recursive: true, force: true });
});

// A second mod hitting any of the same 83 points must collide the same
// way overrideFormat/overrideParse already do — every point shares the
// same single-owner enforcement (runtime.ts's createOverridable), this
// just spot-checks a generated one (overrideFloor) rather than
// re-proving the mechanism for all 83, since the collision logic is
// identical code (createOverridable) regardless of which point calls it.
test('mods: a second mod overriding the same generated point (overrideFloor) collides like overrideFormat does', () => {
  const dir = withModsDir({
    'a-floor1.mjs': `export default {
      name: 'floor-1',
      register(ctx) { ctx.overrideFloor((original, ...args) => original(...args)); }
    };`,
    'b-floor2.mjs': `export default {
      name: 'floor-2',
      register(ctx) { ctx.overrideFloor((original, ...args) => original(...args)); }
    };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded floor-1 \(a-floor1\.mjs\)/);
  assert.match(stderr, /failed b-floor2\.mjs:.*already overridden by mod "floor-1"/);
  rmSync(dir, { recursive: true, force: true });
});

// buildModContext() (no mod-name argument) isn't reachable through
// loadMods.mjs at all — it's the public escape hatch for callers
// outside the mod-loading pipeline (tests, ad-hoc scripts, see its own
// doc comment in modApi.ts) — so it needs its own direct-import check
// rather than a CLI-based one.
test('buildModContext: usable directly (outside the mod loader) and reports as "(unattributed)" on conflict', () => {
  const scratchDir = mkdtempSync(join(fileURLToPath(new URL('..', import.meta.url)), '.tmp-mods-test-'));
  const script = `
    import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
    import { buildModContext } from ${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)};
    const ctx = buildModContext();
    ctx.overrideFloor((original, ...args) => original(...args));
    try {
      buildModContext().overrideFloor((original, ...args) => original(...args));
      console.log('NO_THROW');
    } catch (err) {
      console.log(err.message);
    }
  `;
  const scriptPath = join(scratchDir, 'run.mjs');
  writeFileSync(scriptPath, script);
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  assert.match(stdout, /already overridden by mod "\(unattributed\)"/);
});

// isMod's four validation branches that a normal "load a mod" test
// never exercises, because every mod fixture elsewhere in this file is
// either fully valid or missing a top-level required field — nothing
// else specifically supplies a malformed `requires` array element or a
// non-numeric `priority` on an otherwise-valid mod.
test('mods: isMod rejects a requires array containing a non-string element', () => {
  const dir = withModsDir({
    'bad.mjs': `export default { name: 'bad', register() {}, requires: ['ok', 42] };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed bad\.mjs:.*"requires" as a string array/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: isMod rejects a non-numeric priority', () => {
  const dir = withModsDir({
    'bad.mjs': `export default { name: 'bad', register() {}, priority: '1' };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed bad\.mjs:.*"priority" as a number/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: isMod rejects null as a mod', () => {
  // isMod's `typeof value !== 'object'` check alone would incorrectly
  // accept null (typeof null === 'object' in JS) — this exercises the
  // separate `value === null` branch that catches it. A .mjs file can't
  // literally default-export the primitive `null` and still be valid
  // JS to import, so this goes through isMod directly rather than the
  // CLI/loader path used by the other isMod checks above.
  const scratchDir = mkdtempSync(join(fileURLToPath(new URL('..', import.meta.url)), '.tmp-mods-test-'));
  const script = `
    import { isMod } from ${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)};
    console.log(isMod(null));
    console.log(isMod('not-a-mod'));
  `;
  const scriptPath = join(scratchDir, 'run.mjs');
  writeFileSync(scriptPath, script);
  let stdout;
  try {
    // NO_COLOR/FORCE_COLOR=0 keep this deterministic across platforms —
    // without it, a subprocess that decides its stdout is a color-capable
    // TTY (which varies by OS/terminal, not by anything this test
    // controls) wraps `false` in ANSI escape codes, and the plain-string
    // assertion below would fail on colorized output alone.
    stdout = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  assert.equal(stdout.trim(), 'false\nfalse');
});

test('.tfmod: a valid archive extracts, reads mod.json, and runs main.mjs\'s register()', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'holidays.tfmod'), {
    'mod.json': JSON.stringify({ name: 'en-gb-bank-holidays', version: '1.0.0', main: 'main.mjs' }),
    'main.mjs': `export default {
      register(ctx) {
        ctx.createHolidayCalendar([{ month: 12, day: 26, name: 'Boxing Day' }]);
      }
    };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  // The report should use mod.json's name, not anything from main.mjs's
  // own export (main.mjs's default export has no `name` field at all —
  // that's mod.json's job for a packaged mod).
  assert.match(stderr, /loaded en-gb-bank-holidays@1\.0\.0 \(holidays\.tfmod\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: dependency ordering works across a loose .mjs mod and a packaged mod', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(
    join(dir, 'mods', 'a-loose-base.mjs'),
    `export default { name: 'loose-base', register() {} };`,
  );
  buildTfmod(join(dir, 'mods', 'z-packaged.tfmod'), {
    'mod.json': JSON.stringify({ name: 'packaged-dependent', main: 'main.mjs', requires: ['loose-base'] }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  const baseIdx = stderr.indexOf('loaded loose-base');
  const dependentIdx = stderr.indexOf('loaded packaged-dependent');
  assert.ok(baseIdx > -1 && dependentIdx > -1);
  assert.ok(baseIdx < dependentIdx, 'the .mjs dependency must load before the .tfmod that requires it');
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: a manifest missing required fields fails that archive without executing any of its code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'bad-manifest.tfmod'), {
    'mod.json': JSON.stringify({ name: 'no-main' }), // missing required "main"
    // If this ever got imported despite the bad manifest, it would
    // print PROOF_OF_EXECUTION — asserting its absence from stdout is
    // the actual check that mod.json is validated before any code runs.
    'main.mjs': `console.log('PROOF_OF_EXECUTION'); export default { register() {} };`,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout, /PROOF_OF_EXECUTION/);
  assert.match(stderr, /failed bad-manifest\.tfmod:.*must have a "name" string and a "main" string/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: mod.json naming a "main" file absent from the archive fails with a specific reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'ghost-main.tfmod'), {
    'mod.json': JSON.stringify({ name: 'ghost-main', main: 'nope.mjs' }),
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed ghost-main\.tfmod:.*names "main": "nope\.mjs", but that file isn't in the archive/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: a corrupt or non-gzip file with a .tfmod extension fails that mod, does not crash the process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, 'mods', 'fake.tfmod'), 'not a real archive');
  writeFileSync(join(dir, 'mods', 'fine.mjs'), `export default { name: 'fine', register() {} };`);
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.equal(stdout.trim(), '2026-08-04');
  assert.match(stderr, /failed fake\.tfmod: couldn't extract archive/);
  assert.match(stderr, /loaded fine \(fine\.mjs\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: duplicate names across an .mjs mod and a .tfmod mod are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  writeFileSync(join(dir, 'mods', 'first.mjs'), `export default { name: 'dupe', register() {} };`);
  buildTfmod(join(dir, 'mods', 'second.tfmod'), {
    'mod.json': JSON.stringify({ name: 'dupe', main: 'main.mjs' }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /mod name "dupe" is already used by (first\.mjs|second\.tfmod)/);
  rmSync(dir, { recursive: true, force: true });
});

test('mods: a mods/ directory over the file-count limit fails with a clear reason instead of silently truncating', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  for (let i = 0; i < 501; i++) {
    writeFileSync(join(dir, 'mods', `mod-${i}.mjs`), `export default { name: 'm${i}', register() {} };`);
  }
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /more than the 500-file limit/);
  rmSync(dir, { recursive: true, force: true });
}, { timeout: 30000 });

// --- temporalFmtVersion pinning ---

test('.tfmod: a satisfied temporalFmtVersion range loads normally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'pinned.tfmod'), {
    'mod.json': JSON.stringify({ name: 'pinned-ok', main: 'main.mjs', temporalFmtVersion: '^0.9.0' }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded pinned-ok \(pinned\.tfmod\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: an unsatisfied temporalFmtVersion range fails that mod without running its code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'pinned.tfmod'), {
    'mod.json': JSON.stringify({ name: 'pinned-bad', main: 'main.mjs', temporalFmtVersion: '^5.0.0' }),
    'main.mjs': `console.log('PROOF_OF_EXECUTION'); export default { register() {} };`,
  });
  const { stdout, stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout, /PROOF_OF_EXECUTION/);
  assert.match(stderr, /failed pinned\.tfmod:.*pinned-bad.*needs temporal-fmt \^5\.0\.0/);
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: a malformed temporalFmtVersion range fails the manifest check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'pinned.tfmod'), {
    'mod.json': JSON.stringify({ name: 'pinned-garbage', main: 'main.mjs', temporalFmtVersion: 'not-a-version' }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed pinned\.tfmod:.*couldn't parse "not-a-version"/);
  rmSync(dir, { recursive: true, force: true });
});

// --- mod config ---

test('.tfmod: a mod with a config schema and no user config file gets its declared defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  const proofPath = join(dir, 'proof.json');
  buildTfmod(join(dir, 'mods', 'configurable.tfmod'), {
    'mod.json': JSON.stringify({
      name: 'configurable',
      main: 'main.mjs',
      config: [
        { key: 'greeting', type: 'string', default: 'hi' },
        { key: 'maxRetries', type: 'number', default: 3, min: 0, max: 10 },
      ],
    }),
    'main.mjs': `
      import { writeFileSync } from 'node:fs';
      export default {
        register(ctx, config) {
          writeFileSync(${JSON.stringify(proofPath)}, JSON.stringify(config));
        }
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded configurable \(configurable\.tfmod\)/);
  const written = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.deepEqual(written, { greeting: 'hi', maxRetries: 3 });
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: a user config file in config/ overrides the mod\'s declared defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  mkdirSync(join(dir, 'config'));
  const proofPath = join(dir, 'proof.json');
  writeFileSync(join(dir, 'config', 'configurable.json'), JSON.stringify({ greeting: 'yo', maxRetries: 7 }));
  buildTfmod(join(dir, 'mods', 'configurable.tfmod'), {
    'mod.json': JSON.stringify({
      name: 'configurable',
      main: 'main.mjs',
      config: [
        { key: 'greeting', type: 'string', default: 'hi' },
        { key: 'maxRetries', type: 'number', default: 3, min: 0, max: 10 },
      ],
    }),
    'main.mjs': `
      import { writeFileSync } from 'node:fs';
      export default {
        register(ctx, config) {
          writeFileSync(${JSON.stringify(proofPath)}, JSON.stringify(config));
        }
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded configurable \(configurable\.tfmod\)/);
  const written = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.deepEqual(written, { greeting: 'yo', maxRetries: 7 });
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: an out-of-range config value falls back to its default and is reported, mod still loads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  mkdirSync(join(dir, 'config'));
  const proofPath = join(dir, 'proof.json');
  writeFileSync(join(dir, 'config', 'configurable.json'), JSON.stringify({ maxRetries: 999, typoKey: true }));
  buildTfmod(join(dir, 'mods', 'configurable.tfmod'), {
    'mod.json': JSON.stringify({
      name: 'configurable',
      main: 'main.mjs',
      config: [{ key: 'maxRetries', type: 'number', default: 3, min: 0, max: 10 }],
    }),
    'main.mjs': `
      import { writeFileSync } from 'node:fs';
      export default {
        register(ctx, config) {
          writeFileSync(${JSON.stringify(proofPath)}, JSON.stringify(config));
        }
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded configurable \(configurable\.tfmod\)/);
  assert.match(stderr, /configurable\.json.*configurable: config key "maxRetries" must be <= 10, got 999 \(using default\)/);
  assert.match(stderr, /configurable\.json.*configurable: unknown config key "typoKey".*\(using default\)/);
  const written = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.deepEqual(written, { maxRetries: 3 });
  rmSync(dir, { recursive: true, force: true });
});

test('.tfmod: an invalid config schema in mod.json fails the manifest check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  mkdirSync(join(dir, 'mods'));
  buildTfmod(join(dir, 'mods', 'bad-schema.tfmod'), {
    'mod.json': JSON.stringify({ name: 'bad-schema', main: 'main.mjs', config: [{ key: 'x', type: 'regex', default: 'x' }] }),
    'main.mjs': `export default { register() {} };`,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /failed bad-schema\.tfmod:.*"config" as a valid settings schema/);
  rmSync(dir, { recursive: true, force: true });
});

test('.mjs mods (no manifest available) always receive an empty config object', () => {
  const proofPath = mkdtempSync(join(tmpdir(), 'temporal-fmt-mods-'));
  const dir = withModsDir({
    'plain.mjs': `
      import { writeFileSync } from 'node:fs';
      export default {
        name: 'plain',
        register(ctx, config) {
          writeFileSync(${JSON.stringify(join(proofPath, 'proof.json'))}, JSON.stringify(config));
        }
      };
    `,
  });
  const { stderr, exitCode } = runCliIn(dir, ...FORMAT_ARGS);
  assert.equal(exitCode, 0);
  assert.match(stderr, /loaded plain \(plain\.mjs\)/);
  const written = JSON.parse(readFileSync(join(proofPath, 'proof.json'), 'utf8'));
  assert.deepEqual(written, {});
  rmSync(dir, { recursive: true, force: true });
  rmSync(proofPath, { recursive: true, force: true });
});
