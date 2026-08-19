// Probe: smoke-require.cjs already covers require() from a .cjs file,
// but a .cjs extension forces CJS interpretation regardless of the
// consumer project's own package.json — that's not the ambiguous case.
// A plain .js file is ambiguous: Node resolves it as CJS or ESM based
// on the nearest package.json's "type" field. This probe runs from a
// project with no "type": "module" (CJS-default), as a plain .js file,
// to confirm require('temporal-fmt') resolves the same way there.
'use strict';

const assert = require('node:assert/strict');
const { format, setTemporal } = require('temporal-fmt');
const { Temporal } = require('temporal-polyfill/full');

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');
assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');

console.log('smoke-cjs-default-project.js: ok');
