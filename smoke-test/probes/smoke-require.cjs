// Probe: `require('temporal-fmt')` from a real installed copy — not
// dist/index.cjs directly (test/cjs-require.test.cjs already covers
// that under real CJS semantics). This one checks the "require"
// export condition resolves correctly once the package is actually
// sitting in a consumer's node_modules, packed exactly as it'll ship.
'use strict';

const assert = require('node:assert/strict');
const { format, legacyMatchesFormat, matchesFormat, parse, setTemporal } = require('temporal-fmt');
const { format: legacyFormat, parse: legacyParse } = require('temporal-fmt/legacy');
const { Temporal } = require('temporal-polyfill/full');

const subpathExports = [
  ['./format', 'format'],
  ['./parse', 'parse'],
  ['./legacy', 'matchesFormat'],
  ['./duration', 'parseDuration'],
  ['./relative', 'formatRelative'],
  ['./interval', 'interval'],
  ['./calendar', 'daysInMonth'],
  ['./timezone', 'resolveZoned'],
  ['./recurrence', 'recurrence'],
  ['./locale', 'registerLocale'],
];
for (const [subpath, name] of subpathExports) {
  assert.equal(typeof require(`temporal-fmt/${subpath.slice(2)}`)[name], 'function', `${subpath} should export ${name}`);
}

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');
assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');

const parsed = parse('yyyy-MM-dd', '2026-08-04');
assert.equal(parsed.toString(), '2026-08-04');
assert.equal(legacyFormat(date, 'yyyy-MM-dd'), '2026-08-04');
assert.equal(legacyParse('yyyy-MM-dd', '2026-08-04').toString(), '2026-08-04');
assert.equal(legacyMatchesFormat('yyyy-MM-dd', '2026-08-04'), true);
assert.equal(matchesFormat('yyyy-MM-dd', '2026-08-04'), true);

console.log('smoke-require.cjs: ok');
