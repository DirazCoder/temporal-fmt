// .cjs, not .js — this package is "type": "module", so a plain .js file
// here would load as ESM and `require` wouldn't exist. Nothing else in
// the suite exercises dist/index.cjs under real CommonJS semantics; this
// is what would actually fail if the "require" export condition broke.
const test = require('node:test');
const assert = require('node:assert/strict');
const { format, parse, setTemporal } = require('../dist/index.cjs');
const { Temporal } = require('temporal-polyfill/full');

setTemporal(Temporal);

test('require()-ing dist/index.cjs exposes format, parse, and setTemporal as callable exports', () => {
  assert.equal(typeof format, 'function');
  assert.equal(typeof parse, 'function');
  assert.equal(typeof setTemporal, 'function');
});

test('format() works end-to-end through the CJS build', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
});

test('parse() works end-to-end through the CJS build', () => {
  const result = parse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('module.exports has no default-export wrapper — named destructuring is the real shape, not a transpiler artifact', () => {
  const mod = require('../dist/index.cjs');
  assert.equal(mod.default, undefined);
  // Mirrors src/index.ts's export list. The Phase 1-3 expansion added
  // many new exports; rather than enumerate them all here (brittle),
  // assert the surface includes the expected "sections" by spot-checking
  // one representative export per section.
  const expected = [
    // Phase 1 baseline
    'format', 'parse', 'formatDuration', 'formatDistance', 'parseRelative',
    'registerLocaleVocab', 'setTemporal',
    // Phase 1: type guards, errors, analyzer
    'isPlainDate', 'isZonedDateTime', 'assertTemporal',
    'TemporalFmtError', 'UnknownTokenError', 'InvalidDateError',
    'analyzeFormat', 'tokenInfo', 'listTokens', 'explainFormat',
    'compileFormat', 'compileParser', 'safeParse', 'tryParse', 'parseToParts',
    // Phase 2: calendar utilities, arithmetic, comparison
    'daysInMonth', 'startOf', 'endOf',
    'add', 'subtract', 'difference', 'addYears', 'differenceInDays',
    'compare', 'isToday', 'isWeekend',
    // Phase 2 final: rounding, serialization, duration, relative time,
    // locale, numbering, config, grammar, intervals, recurrence,
    // business calendar, holiday framework, timezone, extensibility
    'round', 'floor', 'ceil', 'truncate', 'roundDuration',
    'parseISO', 'formatISO', 'parseRFC3339', 'formatRFC3339',
    'parseRFC2822', 'formatRFC2822', 'parseHTTPDate', 'formatHTTPDate',
    'fromUnixSeconds', 'fromUnixMilliseconds', 'toUnixNanoseconds',
    'formatDurationToParts', 'parseDuration', 'parseISODuration', 'formatISODuration',
    'balanceDuration', 'totalDuration', 'compareDuration', 'addDuration', 'subtractDuration',
    'formatRelative', 'formatRelativeToNow',
    'registerLocale', 'getLocale', 'hasLocale',
    'convertDigits', 'convertDigitsToAscii', 'SUPPORTED_NUMBERING_SYSTEMS',
    'createConfig', 'mergeWithConfig', 'DEFAULT_CONFIG',
    'registerRelativeGrammar', 'listRegisteredGrammars',
    'interval', 'intersection', 'union', 'mergeIntervals', 'splitInterval',
    'formatRange', 'formatRangeToParts',
    'recurrence', 'take', 'skip', 'between', 'parseRRule', 'formatRRule',
    'createBusinessCalendar', 'isBusinessDay', 'addBusinessDays', 'nextBusinessDay',
    'createHolidayCalendar', 'nextHoliday', 'previousHoliday', 'holidaysBetween',
    'resolveZoned', 'getTimeZone', 'getOffset', 'getOffsetNanoseconds', 'isDST',
    'getNextTransition', 'getPreviousTransition', 'getTransitions', 'possibleInstantsFor',
    'createFormatter',
  ];
  const actual = Object.keys(mod);
  const missing = expected.filter((name) => !actual.includes(name));
  assert.deepEqual(missing, [], `expected exports missing from dist/index.cjs: ${missing.join(', ')}`);
});
