// Probe: package.json's exports map has exactly one entry point ('.').
// dist/format.js exists on disk but isn't exported — requiring it from
// outside the package should fail one way or another (Node's exports
// enforcement typically throws ERR_PACKAGE_PATH_NOT_EXPORTED, but a
// malformed map can also surface as plain MODULE_NOT_FOUND — either way
// it must not resolve). attw checks the map's shape statically; this
// confirms Node actually enforces it against the real installed copy.
'use strict';

const assert = require('node:assert/strict');

let threw = false;
try {
  require('temporal-fmt/dist/format.js');
} catch (err) {
  threw = true;
  assert.ok(
    err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || err.code === 'MODULE_NOT_FOUND',
    `expected a resolution failure, got ${err.code}: ${err.message}`
  );
}

assert.ok(threw, 'deep import into dist/format.js resolved — exports map is not actually restricting subpath access');

console.log('smoke-deep-import-blocked.cjs: ok');
