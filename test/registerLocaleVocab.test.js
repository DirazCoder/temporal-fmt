import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { format, parse, registerLocaleVocab, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// registerLocaleVocab lets callers supply their own month/weekday/day-period
// vocabulary for a locale key Intl doesn't cover well. Strict validation on
// registration: correct array lengths, no empty strings, no duplicates.
// Registered vocab takes precedence over the Intl-derived vocab for that
// locale key, for both format() and parse().
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const CUSTOM_LOCALE = 'en-x-test-vocab';

function validVocab() {
  return {
    monthLong: ['Firstmo','Secondmo','Thirdmo','Fourthmo','Fifthmo','Sixthmo','Seventhmo','Eighthmo','Ninthmo','Tenthmo','Eleventhmo','Twelfthmo'],
    monthShort: ['Fir','Sec','Thi','Fou','Fif','Six','Sev','Eig','Nin','Ten','Ele','Twe'],
    weekdayLong: ['Moonday','Tuesday','Wedday','Thursday','FridAy','Satday','Sunday'],
    weekdayShort: ['Moo','Tue','Wed','Thu','Fri','Sat','Sun'],
    dayPeriod: ['AM-X','PM-X'],
  };
}

test('registerLocaleVocab: valid vocab round-trips through format() then parse()', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  // 2026-08-03 is a Monday → custom weekdayLong[0] = 'Moonday'
  const date = Temporal.PlainDate.from('2026-08-03'); // Monday
  const formatted = format(date, 'MMMM d, yyyy EEEE', { locale: CUSTOM_LOCALE });
  assert.equal(formatted, 'Eighthmo 3, 2026 Moonday');
  // and parse() reverses it back to the same date
  const reparsed = parse('MMMM d, yyyy EEEE', formatted, { locale: CUSTOM_LOCALE });
  assert.equal(reparsed.toString(), '2026-08-03');
});

test('registerLocaleVocab: every month in custom vocab round-trips', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  for (let m = 1; m <= 12; m++) {
    const date = Temporal.PlainDate.from({ year: 2026, month: m, day: 15 });
    const formatted = format(date, 'MMMM d, yyyy', { locale: CUSTOM_LOCALE });
    const reparsed = parse('MMMM d, yyyy', formatted, { locale: CUSTOM_LOCALE });
    assert.equal(reparsed.month, m, `month ${m} should round-trip via custom vocab (formatted: "${formatted}")`);
  }
});

test('registerLocaleVocab: every weekday in custom vocab round-trips', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  // 2026-08-03 is Monday; walk 7 days from there
  for (let d = 0; d < 7; d++) {
    const date = Temporal.PlainDate.from('2026-08-03').add({ days: d });
    const formatted = format(date, 'EEEE, yyyy-MM-dd', { locale: CUSTOM_LOCALE });
    const reparsed = parse('EEEE, yyyy-MM-dd', formatted, { locale: CUSTOM_LOCALE });
    assert.equal(reparsed.toString(), date.toString(), `weekday offset ${d} should round-trip (formatted: "${formatted}")`);
  }
});

test('registerLocaleVocab: AM/PM cross-check still works under custom vocab', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  const am = Temporal.PlainDateTime.from('2026-08-04T01:00:00');
  const pm = Temporal.PlainDateTime.from('2026-08-04T13:00:00');
  assert.equal(format(am, 'h:mm a', { locale: CUSTOM_LOCALE }), '1:00 AM-X');
  assert.equal(format(pm, 'h:mm a', { locale: CUSTOM_LOCALE }), '1:00 PM-X');
  assert.equal(parse('h:mm a', '1:00 AM-X', { locale: CUSTOM_LOCALE }).hour, 1);
  assert.equal(parse('h:mm a', '1:00 PM-X', { locale: CUSTOM_LOCALE }).hour, 13);
});

test('registerLocaleVocab: throws on missing required field', () => {
  assert.throws(
    () => registerLocaleVocab('en-x-missing1', { monthLong: validVocab().monthLong }),
    /missing required field "monthShort"/
  );
});

test('registerLocaleVocab: throws on wrong array length', () => {
  assert.throws(
    () => registerLocaleVocab('en-x-short', { ...validVocab(), monthShort: ['Jan', 'Feb'] }),
    /"monthShort" must have exactly 12 entries \(got 2\)/
  );
  assert.throws(
    () => registerLocaleVocab('en-x-short-week', { ...validVocab(), weekdayShort: ['Mon'] }),
    /"weekdayShort" must have exactly 7 entries \(got 1\)/
  );
  assert.throws(
    () => registerLocaleVocab('en-x-bad-dayperiod', { ...validVocab(), dayPeriod: ['AM'] }),
    /"dayPeriod" must have exactly 2 entries \(got 1\)/
  );
});

test('registerLocaleVocab: throws on empty string in array', () => {
  const badMonth = [...validVocab().monthLong];
  badMonth[3] = '';
  assert.throws(
    () => registerLocaleVocab('en-x-empty', { ...validVocab(), monthLong: badMonth }),
    /"monthLong\[3\]" must be a non-empty string/
  );
});

test('registerLocaleVocab: throws on non-array field', () => {
  assert.throws(
    () => registerLocaleVocab('en-x-notarray', { ...validVocab(), monthLong: 'notanarray' }),
    /"monthLong" must be an array, got string/
  );
});

test('registerLocaleVocab: throws on duplicate month names', () => {
  const dup = [...validVocab().monthLong];
  dup[5] = dup[0]; // make index 5 collide with index 0
  assert.throws(
    () => registerLocaleVocab('en-x-dup-month', { ...validVocab(), monthLong: dup }),
    /renders MMMM month index 0 and 5 identically/
  );
});

test('registerLocaleVocab: throws on duplicate weekday names', () => {
  const dup = [...validVocab().weekdayLong];
  dup[3] = dup[0];
  assert.throws(
    () => registerLocaleVocab('en-x-dup-wd', { ...validVocab(), weekdayLong: dup }),
    /renders EEEE weekday index 0 and 3 identically/
  );
});

test('registerLocaleVocab: throws on identical dayPeriod entries (AM === PM)', () => {
  assert.throws(
    () => registerLocaleVocab('en-x-dup-dp', { ...validVocab(), dayPeriod: ['SAME', 'SAME'] }),
    /dayPeriod entries must differ.*both are "SAME".*parse\(\) can't tell AM from PM/
  );
});

test('registerLocaleVocab: throws on empty locale string', () => {
  assert.throws(
    () => registerLocaleVocab('', validVocab()),
    /requires a non-empty locale string/
  );
});

test('registerLocaleVocab: re-registering overwrites prior vocab', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  const v2 = {
    ...validVocab(),
    monthLong: ['Mo1','Mo2','Mo3','Mo4','Mo5','Mo6','Mo7','Mo8','Mo9','Mo10','Mo11','Mo12'],
    monthShort: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'],
  };
  registerLocaleVocab(CUSTOM_LOCALE, v2);
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'MMMM', { locale: CUSTOM_LOCALE }), 'Mo8');
});

test('registerLocaleVocab: locale key is canonicalized — en-US and EN-us share one entry', () => {
  // Register under one spelling, read under another — both should
  // resolve to the same custom vocab (canonical cache key).
  const v = {
    monthLong: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    monthShort: ['Ja','Fe','Mr','Ap','Ma','Jn','Jl','Au','Se','Oc','Nv','De'],
    weekdayLong: ['mon','tue','wed','thu','fri','sat','sun'],
    weekdayShort: ['mo','tu','we','th','fr','sa','su'],
    dayPeriod: ['am','pm'],
  };
  registerLocaleVocab('en-x-can', v);
  const date = Temporal.PlainDate.from('2026-08-04');
  // different spellings of the same locale tag should all resolve
  // to the registered custom vocab, not Intl's
  assert.equal(format(date, 'MMMM', { locale: 'en-x-can' }), 'aug');
  assert.equal(format(date, 'MMMM', { locale: 'EN-x-CAN' }), 'aug');
});

test('registerLocaleVocab: does not affect other locales (no spillover)', () => {
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  const date = Temporal.PlainDate.from('2026-08-04');
  // en-US should still use Intl's vocab (August), not the custom
  // vocab (Eighthmo).
  assert.equal(format(date, 'MMMM', { locale: 'en-US' }), 'August');
  assert.equal(format(date, 'MMMM', { locale: CUSTOM_LOCALE }), 'Eighthmo');
});

test('registerLocaleVocab: custom vocab is honored by the short/standalone token variants too', () => {
  // The tests above only ever format MMMM/EEEE (long forms) with custom
  // vocab active. MMM/EEE (short) and LLLL/LLL/cccc/ccc (standalone
  // month/weekday) each read from the same custom object but are
  // separate token handlers — every one of them needs its own real
  // exercise with `custom` actually set, not just Intl's default vocab.
  registerLocaleVocab(CUSTOM_LOCALE, validVocab());
  const date = Temporal.PlainDate.from('2026-08-03'); // Monday
  assert.equal(format(date, 'MMM', { locale: CUSTOM_LOCALE }), 'Eig');
  assert.equal(format(date, 'EEE', { locale: CUSTOM_LOCALE }), 'Moo');
  assert.equal(format(date, 'LLLL', { locale: CUSTOM_LOCALE }), 'Eighthmo');
  assert.equal(format(date, 'LLL', { locale: CUSTOM_LOCALE }), 'Eig');
  assert.equal(format(date, 'cccc', { locale: CUSTOM_LOCALE }), 'Moonday');
  assert.equal(format(date, 'ccc', { locale: CUSTOM_LOCALE }), 'Moo');
});
test('registerLocaleVocab: rejects oversized locale tags and entries', () => {
  const valid = validVocab();
  assert.throws(
    () => registerLocaleVocab('x'.repeat(257), valid),
    /locale is too long/
  );
  assert.throws(
    () => registerLocaleVocab('en-x-long', {
      ...valid,
      monthLong: [...valid.monthLong.slice(0, 11), 'x'.repeat(257)],
    }),
    /too long/
  );
});


test('registerLocaleVocab: enforces the bounded custom-vocab registry', () => {
  const source = `
    import { registerLocaleVocab } from './dist/index.js';
    const validVocab = () => ({
      monthLong: ['Firstmo','Secondmo','Thirdmo','Fourthmo','Fifthmo','Sixthmo','Seventhmo','Eighthmo','Ninthmo','Tenthmo','Eleventhmo','Twelfthmo'],
      monthShort: ['Fir','Sec','Thi','Fou','Fif','Six','Sev','Eig','Nin','Ten','Ele','Twe'],
      weekdayLong: ['Moonday','Tuesday','Wedday','Thursday','FridAy','Satday','Sunday'],
      weekdayShort: ['Moo','Tue','Wed','Thu','Fri','Sat','Sun'],
      dayPeriod: ['AM-X','PM-X'],
    });
    for (let i = 0; i < 500; i++) registerLocaleVocab('en-x-vocab-cap-' + i, validVocab());
    try {
      registerLocaleVocab('en-x-vocab-cap-overflow', validVocab());
      process.exit(2);
    } catch (error) {
      if (!(error instanceof RangeError) || !String(error.message).includes('500-locale limit')) process.exit(3);
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
