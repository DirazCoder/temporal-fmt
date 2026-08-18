// End-to-end smoke test exercising every new export at least once
// against real Temporal values. Not a unit test — this is the
// "does it actually work when wired together" pass that catches
// integration bugs the per-module tests might miss.
//
// Run with: node /home/z/my-project/work/temporal-fmt-main/scripts/smoke-test.mjs

import {
  format, parse, formatDuration, formatDistance,
  parseRelative, registerLocaleVocab, setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import { readFileSync } from 'node:fs';

// eslint and jscodeshift live in the sibling packages' node_modules.
// Resolve them via dynamic import so a missing one doesn't crash the
// smoke test — we just skip that section and report.
let RuleTester = null;
let validFormatStringRule = null;
let transform = null;
let jscodeshift = null;

try {
  const eslintMod = await import('eslint');
  RuleTester = eslintMod.RuleTester;
  const pluginMod = await import('../eslint-plugin-temporal-fmt/dist/index.js');
  validFormatStringRule = pluginMod.validFormatString;
} catch (e) {
  console.log(`(eslint plugin section skipped: ${e.code ?? e.message})`);
}

try {
  const codemodMod = await import('../temporal-fmt-codemod/dist/index.js');
  transform = codemodMod.default;
  const jscodeshiftNS = await import('jscodeshift');
  jscodeshift = jscodeshiftNS.default;
} catch (e) {
  console.log(`(codemod section skipped: ${e.code ?? e.message})`);
}

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
    failures++;
  }
}

console.log('=== Item 1: do (ordinal day, format-only) ===');
check('format(date, "do") for day 4', format(Temporal.PlainDate.from('2026-08-04'), 'do'), '4th');
check('do: 11th (exception)', format(Temporal.PlainDate.from('2026-01-11'), 'do'), '11th');
check('do: 21st', format(Temporal.PlainDate.from('2026-01-21'), 'do'), '21st');
check('do: 1st', format(Temporal.PlainDate.from('2026-01-01'), 'do'), '1st');
check('do: 23rd', format(Temporal.PlainDate.from('2026-01-23'), 'do'), '23rd');
check('parse("do") throws (format-only)', (() => {
  try { parse('do yyyy', '4th 2026'); return 'no throw'; }
  catch (e) { return e.message.includes('format-only') ? 'format-only error' : 'wrong error'; }
})(), 'format-only error');

console.log('\n=== Item 2: Q/QQQ (quarter, format+parse, cross-check) ===');
check('format Aug Q', format(Temporal.PlainDate.from('2026-08-04'), 'Q'), '3');
check('format Aug QQQ', format(Temporal.PlainDate.from('2026-08-04'), 'QQQ'), 'Q3');
check('parse Q+date round-trip', parse('Q yyyy-MM-dd', '3 2026-08-04').toString(), '2026-08-04');
check('parse QQQ+date round-trip', parse('QQQ yyyy-MM-dd', 'Q3 2026-08-04').toString(), '2026-08-04');
check('Q1 disagreement throws', (() => {
  try { parse('QQQ yyyy-MM-dd', 'Q1 2026-08-04'); return 'no throw'; }
  catch (e) { return e.message.includes('disagrees with the parsed month') ? 'cross-check error' : 'wrong error'; }
})(), 'cross-check error');

console.log('\n=== Item 3: ww/RRRR (ISO week, format-only) ===');
check('2026-08-04 ww', format(Temporal.PlainDate.from('2026-08-04'), 'ww'), '32');
check('2026-12-31 boundary', format(Temporal.PlainDate.from('2026-12-31'), 'ww RRRR'), '53 2026');
check('2027-01-01 boundary (ISO year still 2026)', format(Temporal.PlainDate.from('2027-01-01'), 'ww RRRR'), '53 2026');
check('2027-01-04 boundary (ISO week 1 starts)', format(Temporal.PlainDate.from('2027-01-04'), 'ww RRRR'), '01 2027');
check('2021-01-01 boundary (2020 53-week year)', format(Temporal.PlainDate.from('2021-01-01'), 'ww RRRR'), '53 2020');
check('parse ww throws (format-only)', (() => {
  try { parse('ww yyyy', '32 2026'); return 'no throw'; }
  catch (e) { return e.message.includes('format-only') ? 'format-only error' : 'wrong error'; }
})(), 'format-only error');

console.log('\n=== Item 4: formatDuration ===');
check('2 years 3 months long form', formatDuration({ years: 2, months: 3 }, 'yyy ooo'), '2 years 3 months');
check('2 hours 30 minutes long form', formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm'), '2 hours 30 minutes');
check('short form singular', formatDuration({ hours: 1 }, 'hh'), '1h');
check('short form plural', formatDuration({ hours: 2 }, 'hh'), '2h');
check('numeric-only form', formatDuration({ hours: 2, minutes: 30 }, 'h:m'), '2:30');
check('zero-value omitted by default', formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm'), '2 hours ');
check('showZeroValues forces zeros', formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { showZeroValues: true }), '2 hours 0 minutes');
check('Temporal.Duration works', formatDuration(Temporal.Duration.from({ hours: 2, minutes: 30 }), 'hhh mmm'), '2 hours 30 minutes');

console.log('\n=== Item 5: formatDistance ===');
const today = Temporal.PlainDate.from('2026-08-04');
const yesterday = Temporal.PlainDate.from('2026-08-03');
const tomorrow = Temporal.PlainDate.from('2026-08-05');
// Convention: formatDistance(SUBJECT, REFERENCE) describes SUBJECT
// relative to REFERENCE. formatDistance(yesterday, today) →
// "yesterday" (subject=yesterday, reference=today).
check('yesterday relative to today', formatDistance(yesterday, today), 'yesterday');
check('tomorrow relative to today', formatDistance(tomorrow, today), 'tomorrow');
check('today relative to today = "now"', formatDistance(today, today), 'now');
check('numeric:always same-day = "in 0 seconds"', formatDistance(today, today, { numeric: 'always' }), 'in 0 seconds');
check('fr-FR tomorrow = "demain"', formatDistance(tomorrow, today, { locale: 'fr-FR' }), 'demain');
check('ja-JP tomorrow = "明日"', formatDistance(tomorrow, today, { locale: 'ja-JP' }), '明日');
check('in 3 days', formatDistance(today.add({ days: 3 }), today), 'in 3 days');
check('3 days ago', formatDistance(today.add({ days: -3 }), today), '3 days ago');

console.log('\n=== Item 6: Lenient parse mode ===');
check('strict mode throws on ambiguous "121" yyyy-Md', (() => {
  try { parse('yyyy-Md', '2026-121'); return 'no throw'; }
  catch (e) { return 'throws'; }
})(), 'throws');
check('lenient picks M=12/d=1 for "121"', parse('yyyy-Md', '2026-121', { lenient: true }).toString(), '2026-12-01');
check('lenient does not affect unambiguous "85"', parse('yyyy-Md', '2026-85', { lenient: true }).toString(), '2026-08-05');

console.log('\n=== Item 7: registerLocaleVocab ===');
const customLocale = 'en-x-smoke';
registerLocaleVocab(customLocale, {
  monthLong: ['Firstmo','Secondmo','Thirdmo','Fourthmo','Fifthmo','Sixthmo','Seventhmo','Eighthmo','Ninthmo','Tenthmo','Eleventhmo','Twelfthmo'],
  monthShort: ['Fir','Sec','Thi','Fou','Fif','Six','Sev','Eig','Nin','Ten','Ele','Twe'],
  weekdayLong: ['Moonday','Tuesday','Wedday','Thursday','FridAy','Satday','Sunday'],
  weekdayShort: ['Moo','Tue','Wed','Thu','Fri','Sat','Sun'],
  dayPeriod: ['AM-X','PM-X'],
});
check('custom MMMM', format(Temporal.PlainDate.from('2026-08-04'), 'MMMM', { locale: customLocale }), 'Eighthmo');
check('custom round-trip', parse('MMMM d, yyyy', format(Temporal.PlainDate.from('2026-08-04'), 'MMMM d, yyyy', { locale: customLocale }), { locale: customLocale }).toString(), '2026-08-04');
check('custom vocab does not affect en-US', format(Temporal.PlainDate.from('2026-08-04'), 'MMMM', { locale: 'en-US' }), 'August');
check('malformed vocab throws', (() => {
  try { registerLocaleVocab('bad-locale', { monthLong: ['short'] }); return 'no throw'; }
  catch (e) { return 'throws'; }
})(), 'throws');

console.log('\n=== Item 8: parseRelative ===');
const ref = Temporal.PlainDate.from('2026-08-04'); // Tuesday
check('today', parseRelative('today', ref).toString(), '2026-08-04');
check('tomorrow', parseRelative('tomorrow', ref).toString(), '2026-08-05');
check('yesterday', parseRelative('yesterday', ref).toString(), '2026-08-03');
check('next Tuesday on Tuesday = 7 days out', parseRelative('next Tuesday', ref).toString(), '2026-08-11');
check('last Friday', parseRelative('last Friday', ref).toString(), '2026-07-31');
check('this Wednesday', parseRelative('this Wednesday', ref).toString(), '2026-08-05');
check('in 3 days', parseRelative('in 3 days', ref).toString(), '2026-08-07');
check('2 weeks ago', parseRelative('2 weeks ago', ref).toString(), '2026-07-21');
check('in 1 month', parseRelative('in 1 month', ref).toString(), '2026-09-04');
check('March 5th next occurrence', parseRelative('March 5th', ref).toString(), '2027-03-05');
check('"5 days" without direction throws', (() => {
  try { parseRelative('5 days', ref); return 'no throw'; }
  catch (e) { return 'throws'; }
})(), 'throws');
check('Feb 29th on leap year ref', parseRelative('Feb 29th', Temporal.PlainDate.from('2024-01-01')).toString(), '2024-02-29');

console.log('\n=== Item 9: ESLint plugin (valid-format-string rule) ===');
if (RuleTester && validFormatStringRule) {
  const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });
  let eslintPass = true;
  try {
    ruleTester.run('valid-format-string', validFormatStringRule, {
      valid: [
        `format(date, 'yyyy-MM-dd HH:mm')`,
        `format(date, 'MMMM d, yyyy')`,
        `format(date, 'do Q QQQ ww RRRR')`,
        `format(date, 'h:mm a')`,
        // dynamic — skip silently
        `const fmt = 'yyyy-MM-dd'; format(date, fmt)`,
        `format(date, \`yyyy-MM-dd\`)`,
      ],
      invalid: [
        { code: `format(date, 'h:mm')`, errors: [{ messageId: '12hourWithoutA' }] },
        { code: `format(date, 'HH h:mm a')`, errors: [{ messageId: 'mixed12And24Hour' }] },
        { code: `format(date, "yyyy 'at")`, errors: [{ messageId: 'unterminatedQuote' }] },
      ],
    });
  } catch (e) {
    eslintPass = false;
    console.log(`    eslint RuleTester failed: ${e.message}`);
  }
  check('ESLint plugin valid+invalid cases pass', eslintPass, true);
} else {
  console.log('  (skipped — eslint or plugin not installed in this package)');
}

console.log('\n=== Item 10: Codemod (dayjs + date-fns) ===');
if (transform && jscodeshift) {
  // dayjs simple format
  let output = transform({ path: 'sample.js', source: `dayjs(d).format('YYYY-MM-DD HH:mm:ss')` }, { jscodeshift });
  check('dayjs simple format', output, `format(d, "yyyy-MM-dd HH:mm:ss")`);

  // dayjs chained arithmetic
  output = transform({ path: 'sample.js', source: `dayjs(x).add(1, 'day').format('YYYY-MM-DD')` }, { jscodeshift });
  check('dayjs chained arithmetic', output && output.includes('format(x.add(') && output.includes('days: 1'), true);

  // date-fns format
  output = transform({ path: 'sample.js', source: `import { format } from 'date-fns';\nformat(d, 'yyyy-MM-dd HH:mm:ss');` }, { jscodeshift });
  check('date-fns format round-trip', output && output.includes('format(d,') && output.includes('yyyy-MM-dd HH:mm:ss'), true);

  // mixed dayjs + date-fns in same file
  const fixtureInput = readFileSync(new URL('../temporal-fmt-codemod/test/fixtures/sample.input.js', import.meta.url), 'utf8');
  output = transform({ path: 'sample.js', source: fixtureInput }, { jscodeshift });
  check('mixed fixture transforms both', output && output.includes('format(d,') && output.includes('dayjs(d).format'), true);

  // unmappable dayjs (X token) leaves alone + warns
  output = transform({ path: 'sample.js', source: `dayjs(d).format('X')` }, { jscodeshift });
  check('unmappable X leaves warning', output && output.includes('TODO(temporal-fmt-codemod)'), true);
} else {
  console.log('  (skipped — jscodeshift or codemod not installed in this package)');
}

console.log('\n=== Summary ===');
if (failures === 0) {
  console.log('All smoke-test checks passed. ✓');
} else {
  console.log(`${failures} smoke-test check(s) failed. ✗`);
  process.exit(1);
}
