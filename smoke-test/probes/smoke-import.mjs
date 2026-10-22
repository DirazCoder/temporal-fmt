// Probe: `import` from a real installed copy, checking the "import"
// export condition resolves once temporal-fmt is sitting in a
// consumer's node_modules — not src/index.ts or dist/index.js directly,
// which the rest of the suite already exercises.
import assert from 'node:assert/strict';
import { format, legacyMatchesFormat, matchesFormat, parse, setTemporal } from 'temporal-fmt';
import { format as legacyFormat, parse as legacyParse } from 'temporal-fmt/legacy';
import { Temporal } from 'temporal-polyfill/full';

setTemporal(Temporal);

const date = Temporal.PlainDate.from('2026-08-04');
assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');

const parsed = parse('yyyy-MM-dd', '2026-08-04');
assert.equal(parsed.toString(), '2026-08-04');
assert.equal(legacyFormat(date, 'yyyy-MM-dd'), '2026-08-04');
assert.equal(legacyParse('yyyy-MM-dd', '2026-08-04').toString(), '2026-08-04');
assert.equal(legacyMatchesFormat('yyyy-MM-dd', '2026-08-04'), true);
assert.equal(matchesFormat('yyyy-MM-dd', '2026-08-04'), true);

console.log('smoke-import.mjs: ok');
