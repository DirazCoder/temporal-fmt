// Probe: `import` from a real installed copy, checking the "import"
// export condition resolves once temporal-fmt is sitting in a
// consumer's node_modules — not src/index.ts or dist/index.js directly,
// which the rest of the suite already exercises.
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from 'temporal-fmt';
import { Temporal } from 'temporal-polyfill/full';

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');
assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');

const parsed = parse('yyyy-MM-dd', '2026-08-04');
assert.equal(parsed.toString(), '2026-08-04');

console.log('smoke-import.mjs: ok');
