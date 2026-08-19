// Probe: `require('temporal-fmt')` from a real installed copy — not
// dist/index.cjs directly (test/cjs-require.test.cjs already covers
// that under real CJS semantics). This one checks the "require"
// export condition resolves correctly once the package is actually
// sitting in a consumer's node_modules, packed exactly as it'll ship.
'use strict';

const assert = require('node:assert/strict');
const { format, parse, setTemporal } = require('temporal-fmt');
const { Temporal } = require('temporal-polyfill/full');

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');
assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');

const parsed = parse('yyyy-MM-dd', '2026-08-04');
assert.equal(parsed.toString(), '2026-08-04');

console.log('smoke-require.cjs: ok');
