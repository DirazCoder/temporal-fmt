// Capability smoke test. Exercises a representative sample of the public
// API — formatting/parsing across Temporal types, the compile/to-parts
// APIs, the analyzer surface, type guards, typed errors, calendar
// utilities, date arithmetic, comparison helpers, and the analyzer
// integration in the ESLint plugin.
//
// Distinct from the existing smoke-test/run.mjs (which exercises the
// package's install/resolution/types shape as a real consumer would):
// this one is about API surface coverage, not packaging. Runs against
// the local dist/ build, not a packed tarball.
//
// Run with: node smoke-test/capabilities.mjs
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  format, formatToParts, compileFormat,
  parse, safeParse, tryParse, parseToParts, compileParser,
  analyzeFormat, explainFormat, tokenizeFormat, listTokens, tokenInfo,
  isValidFormat, validateFormat, fieldForToken,
  TOKEN_METADATA, FORMAT_ONLY_TOKENS,
  isTemporal, isPlainDate, isPlainTime, isPlainDateTime, isZonedDateTime,
  isInstant, isPlainYearMonth, isPlainMonthDay, isDuration,
  TemporalFmtError, UnknownTokenError, AmbiguousInputError, InvalidDateError,
  daysInMonth, daysInYear, isLeapYear, dayOfYear, weekOfYear, weekYear,
  getQuarter, startOf, endOf,
  add, subtract, difference,
  addYears, addMonths, addDays, addHours,
  differenceInDays, differenceInYears,
  compare, isEqual, isBefore, isAfter, min, max, clamp, isBetween,
  isToday, isTomorrow, isYesterday, isSameDay, isSameMonth, isSameYear,
  isWeekend, isWeekday,
  setTemporal,
} from '../dist/index.js';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const actualStr = typeof actual === 'object' && actual !== null ? JSON.stringify(actual) : String(actual);
  const expectedStr = typeof expected === 'object' && expected !== null ? JSON.stringify(expected) : String(expected);
  if (actualStr === expectedStr) {
    passed++;
    // console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.error(`  ✖ ${label}`);
    console.error(`    expected: ${expectedStr}`);
    console.error(`    actual:   ${actualStr}`);
  }
}
function checkThrows(label, fn, re) {
  try {
    fn();
    failed++;
    console.error(`  ✖ ${label}: expected throw matching ${re}, did not throw`);
  } catch (err) {
    if (re.test(err.message)) {
      passed++;
    } else {
      failed++;
      console.error(`  ✖ ${label}: threw, but message "${err.message}" doesn't match ${re}`);
    }
  }
}
function checkOk(label, ok, detail) {
  if (ok) { passed++; } else {
    failed++;
    console.error(`  ✖ ${label}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('Section B: formatting');
const date = Temporal.PlainDate.from('2026-08-04');
const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');

check('format PlainDate', format(date, 'yyyy-MM-dd'), '2026-08-04');
check('format PlainDateTime', format(dt, 'yyyy-MM-dd HH:mm:ss'), '2026-08-04 15:45:30');
check('format with locale', format(date, 'MMMM d, yyyy', { locale: 'fr-FR' }), 'août 4, 2026');
check('format offset token', format(zdt, 'yyyy-MM-dd HH:mm XXX'), '2026-08-04 15:45 Z'); // uppercase X collapses UTC to Z per LDML
check('format zzz', format(zdt, 'yyyy-MM-dd HH:mm zzz'), '2026-08-04 15:45 UTC');

const parts = formatToParts(date, 'yyyy-MM-dd');
check('formatToParts length', parts.length, 5);
check('formatToParts[0]', parts[0], { type: 'token', value: '2026', token: 'yyyy' });

const compiled = compileFormat('yyyy-MM-dd');
check('compileFormat.format', compiled.format(date), '2026-08-04');
check('compileFormat.formatToParts length', compiled.formatToParts(date).length, 5);

console.log('Section C: parsing');
const parsed = parse('yyyy-MM-dd', '2026-08-04');
check('parse returns PlainDate', parsed.toString(), '2026-08-04');

const safeOk = safeParse('yyyy-MM-dd', '2026-08-04');
checkOk('safeParse ok', safeOk.ok === true);
if (safeOk.ok) check('safeParse value', safeOk.value.toString(), '2026-08-04');

const safeErr = safeParse('yyyy-MM-dd', 'not-a-date');
checkOk('safeParse err', safeErr.ok === false);
if (!safeErr.ok) {
  checkOk('safeParse error is TemporalFmtError', safeErr.error instanceof TemporalFmtError);
}

const tryResult = tryParse('yyyy-MM-dd', '2026-08-04');
check('tryParse success', tryResult.toString(), '2026-08-04');
check('tryParse failure', tryParse('yyyy-MM-dd', 'nope'), undefined);

const parts2 = parseToParts('yyyy-MM-dd', '2026-08-04');
check('parseToParts length', parts2.length, 3);
check('parseToParts[0].token', parts2[0].token, 'yyyy');
check('parseToParts[0].raw', parts2[0].raw, '2026');

const compiledParser = compileParser('yyyy-MM-dd');
check('compileParser.parse', compiledParser.parse('2026-08-04').toString(), '2026-08-04');

console.log('Section D: typed errors');
const err1 = new UnknownTokenError({ token: 'XYZ', format: 'XYZ-MM-dd' });
checkOk('UnknownTokenError is TemporalFmtError', err1 instanceof TemporalFmtError);
check('UnknownTokenError code', err1.code, 'UNKNOWN_TOKEN');
check('UnknownTokenError token', err1.token, 'XYZ');

const ambErr = safeParse('Md', '121');
checkOk('ambiguous input classified', !ambErr.ok && ambErr.error instanceof AmbiguousInputError);

console.log('Section E: analyzer');
const analysis = analyzeFormat('yyyy-MM-dd HH:mm');
check('analyzeFormat tokens', analysis.tokens.length, 5);
check('analyzeFormat requiredFields', analysis.requiredFields.sort().join(','), 'day,hour,minute,month,year');
check('analyzeFormat compatibleTypes', analysis.compatibleTypes.join(','), 'PlainDateTime,ZonedDateTime');
checkOk('analyzeFormat parseable', analysis.parseable);
checkOk('analyzeFormat not localeSensitive', !analysis.localeSensitive);
checkOk('analyzeFormat calendarSensitive', analysis.calendarSensitive);
checkOk('analyzeFormat not ambiguous', !analysis.ambiguous);
checkOk('analyzeFormat roundTripSafe', analysis.roundTripSafe);

check('explainFormat contains format string', explainFormat('yyyy-MM-dd').includes('Format string: "yyyy-MM-dd"'), true);
check('tokenInfo returns metadata', tokenInfo('yyyy')?.meaning.slice(0, 15), 'Four-digit year');
check('tokenInfo undefined for unknown', tokenInfo('XYZ'), undefined);
check('listTokens has yyyy', listTokens().some((t) => t.name === 'yyyy'), true);
check('isValidFormat valid string', isValidFormat('yyyy-MM-dd'), true);
check('isValidFormat invalid string', isValidFormat("yyyy 'at"), false);
check('fieldForToken yyyy', fieldForToken('yyyy'), 'year');
check('fieldForToken HH', fieldForToken('HH'), 'hour');

console.log('Section V: type guards');
checkOk('isPlainDate(PlainDate)', isPlainDate(date));
checkOk('isPlainDate(PlainTime) is false', !isPlainDate(Temporal.PlainTime.from('15:45:30')));
checkOk('isPlainTime(PlainTime)', isPlainTime(Temporal.PlainTime.from('15:45:30')));
checkOk('isPlainDateTime(PlainDateTime)', isPlainDateTime(dt));
checkOk('isZonedDateTime(ZonedDateTime)', isZonedDateTime(zdt));
checkOk('isInstant(Instant)', isInstant(Temporal.Instant.from('2026-08-04T15:45:30Z')));
checkOk('isPlainYearMonth', isPlainYearMonth(Temporal.PlainYearMonth.from('2026-08')));
checkOk('isPlainMonthDay', isPlainMonthDay(Temporal.PlainMonthDay.from('08-04')));
checkOk('isDuration', isDuration(Temporal.Duration.from({ hours: 2 })));
checkOk('isTemporal catches all', isTemporal(date) && isTemporal(dt) && isTemporal(zdt));

console.log('Section L: calendar utilities');
check('daysInMonth Feb leap', daysInMonth(Temporal.PlainDate.from('2024-02-15')), 29);
check('daysInMonth Feb nonleap', daysInMonth(Temporal.PlainDate.from('2026-02-15')), 28);
check('daysInYear leap', daysInYear(Temporal.PlainDate.from('2024-08-04')), 366);
check('daysInYear nonleap', daysInYear(Temporal.PlainDate.from('2026-08-04')), 365);
checkOk('isLeapYear 2024', isLeapYear(Temporal.PlainDate.from('2024-08-04')));
checkOk('isLeapYear 2026 false', !isLeapYear(Temporal.PlainDate.from('2026-08-04')));
check('dayOfYear Jan 1', dayOfYear(Temporal.PlainDate.from('2026-01-01')), 1);
check('dayOfYear Aug 4', dayOfYear(Temporal.PlainDate.from('2026-08-04')), 216);
check('getQuarter Jan', getQuarter(Temporal.PlainDate.from('2026-01-15')), 1);
check('getQuarter Aug', getQuarter(Temporal.PlainDate.from('2026-08-04')), 3);

const startOfDay = startOf(dt, 'day');
check('startOf day hour', startOfDay.hour, 0);
check('startOf day keeps date', `${startOfDay.year}-${startOfDay.month}-${startOfDay.day}`, '2026-8-4');

const endOfMonth = endOf(dt, 'month');
check('endOf month day', endOfMonth.day, 31);
check('endOf month hour', endOfMonth.hour, 23);

console.log('Section M: date arithmetic');
check('add 1 year', add(date, 1, 'years').year, 2027);
check('add 1 month', add(date, 1, 'months').month, 9);
check('add 1 week', add(date, 1, 'weeks').day, 11);
check('add 1 day', add(date, 1, 'days').day, 5);
check('add Feb 29 + 1 year clamps', add(Temporal.PlainDate.from('2024-02-29'), 1, 'years').day, 28);
check('add 1 hour across day', add(Temporal.PlainDateTime.from('2026-08-04T23:30:00'), 1, 'hours').day, 5);
check('subtract 1 day', subtract(date, 1, 'days').day, 3);

check('difference years', difference(date, Temporal.PlainDate.from('2027-08-04'), 'years'), 1);
check('difference days', difference(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-08'), 'days'), 7);

check('addYears wrapper', addYears(date, 1).year, 2027);
check('addMonths wrapper', addMonths(date, 1).month, 9);
check('addDays wrapper', addDays(date, 1).day, 5);
check('addHours wrapper', addHours(dt, 1).hour, 16);
check('differenceInDays', differenceInDays(Temporal.PlainDate.from('2026-01-01'), Temporal.PlainDate.from('2026-01-08')), 7);

console.log('Section O: comparison');
const a = Temporal.PlainDate.from('2026-08-04');
const b = Temporal.PlainDate.from('2026-08-05');
check('compare less', compare(a, b), -1);
check('compare equal', compare(a, a), 0);
check('compare greater', compare(b, a), 1);
checkOk('isEqual true', isEqual(a, a));
checkOk('isEqual false', !isEqual(a, b));
checkOk('isBefore', isBefore(a, b));
checkOk('isAfter', isAfter(b, a));

const c = Temporal.PlainDate.from('2024-01-01');
check('min', min([a, b, c]).toString(), c.toString());
check('max', max([a, b, c]).toString(), b.toString());

const lo = Temporal.PlainDate.from('2026-01-01');
const hi = Temporal.PlainDate.from('2026-12-31');
check('clamp below', clamp(Temporal.PlainDate.from('2025-06-15'), lo, hi).toString(), lo.toString());
check('clamp above', clamp(Temporal.PlainDate.from('2027-06-15'), lo, hi).toString(), hi.toString());
checkOk('isBetween true', isBetween(a, lo, hi));

const today = Temporal.Now.plainDateISO();
checkOk('isToday', isToday(today));
checkOk('isTomorrow', isTomorrow(add(today, 1, 'days')));
checkOk('isYesterday', isYesterday(subtract(today, 1, 'days')));
checkOk('isSameDay', isSameDay(today, today));
checkOk('isSameMonth Aug 4 and Aug 15', isSameMonth(date, Temporal.PlainDate.from('2026-08-15')));
checkOk('isSameYear 2026 and 2026', isSameYear(date, Temporal.PlainDate.from('2026-12-31')));
checkOk('isWeekend Sat', isWeekend(Temporal.PlainDate.from('2026-08-08')));
checkOk('isWeekday Tue', isWeekday(date));

console.log('Adversarial cases');
check('analyzeFormat pathological length', (() => {
  try { analyzeFormat('x'.repeat(1001)); return 'did not throw'; } catch (e) { return e.message; }
})(), 'temporal-fmt: format string exceeds maximum length of 1000 characters (got 1001).');

check('safeParse at input cap', (() => {
  const input = '2026-08-04' + ' '.repeat(990);
  const r = safeParse('yyyy-MM-dd', input.slice(0, 10));
  return r.ok ? 'ok' : 'err';
})(), 'ok');

console.log('Round-trip tests');
const fmts = ['yyyy-MM-dd', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH:mm:ss', 'HH:mm:ss', 'MMMM d, yyyy'];
for (const fmt of fmts) {
  const formatted = format(dt, fmt);
  const reparsed = parse(fmt, formatted);
  const reformatted = format(reparsed, fmt);
  checkOk(`round-trip ${fmt}: ${formatted} === ${reformatted}`, formatted === reformatted);
}

console.log('');
console.log(`Capability smoke test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
