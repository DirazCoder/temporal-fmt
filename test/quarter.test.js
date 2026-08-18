import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Q (numeric 1-4) and QQQ (e.g. "Q3") are quarter tokens computed from
// month: 1-3=Q1, 4-6=Q2, 7-9=Q3, 10-12=Q4. Both format and parse; on
// parse, QQQ cross-checks against the parsed month the same way EEEE
// cross-checks weekday against date.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

function dateInMonth(month) {
  return Temporal.PlainDate.from({ year: 2026, month, day: 15 });
}

test('Q: format renders numeric 1-4 by month', () => {
  assert.equal(format(dateInMonth(1), 'Q'), '1');
  assert.equal(format(dateInMonth(3), 'Q'), '1');
  assert.equal(format(dateInMonth(4), 'Q'), '2');
  assert.equal(format(dateInMonth(6), 'Q'), '2');
  assert.equal(format(dateInMonth(7), 'Q'), '3');
  assert.equal(format(dateInMonth(9), 'Q'), '3');
  assert.equal(format(dateInMonth(10), 'Q'), '4');
  assert.equal(format(dateInMonth(12), 'Q'), '4');
});

test('QQQ: format renders "Q1" through "Q4" by month', () => {
  assert.equal(format(dateInMonth(1), 'QQQ'), 'Q1');
  assert.equal(format(dateInMonth(4), 'QQQ'), 'Q2');
  assert.equal(format(dateInMonth(7), 'QQQ'), 'Q3');
  assert.equal(format(dateInMonth(10), 'QQQ'), 'Q4');
  // August is Q3
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'QQQ'), 'Q3');
});

test('Q and QQQ compose with date tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "QQQ yyyy-MM-dd"), 'Q3 2026-08-04');
  // Note: "QQ" is not a distinct token — the tokenizer reads "QQ" as
  // two Q tokens. To get "Q3" with a leading literal "Q", write 'QQQ'
  // (the explicit "Q" prefix + quarter digit). To get a single
  // numeric quarter, write 'Q'.
  assert.equal(format(date, "yyyy-Q"), '2026-3');
  assert.equal(format(date, "yyyy 'Q'Q"), '2026 Q3');
});

test('Q: parse succeeds alongside month/date when they agree', () => {
  // August = Q3
  const result = parse('Q yyyy-MM-dd', '3 2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('QQQ: parse succeeds alongside month/date when they agree', () => {
  const result = parse('QQQ yyyy-MM-dd', 'Q3 2026-08-04');
  assert.equal(result.toString(), '2026-08-04');
});

test('Q: parse rejects values outside 1-4 (regex fragment is [1-4])', () => {
  assert.throws(() => parse('Q yyyy-MM-dd', '5 2026-08-04'), /no valid pattern matches/);
  assert.throws(() => parse('Q yyyy-MM-dd', '0 2026-08-04'), /no valid pattern matches/);
});

test('Q: parse cross-check throws when quarter disagrees with month', () => {
  // Month 8 = Q3, but the input says Q1 — quarter is parsed but then
  // the cross-check catches the disagreement and throws, rather than
  // silently returning a value where the parsed quarter says one thing
  // and the parsed date says another.
  assert.throws(
    () => parse('Q yyyy-MM-dd', '1 2026-08-04'),
    /quarter token .* whose value \(Q1\) disagrees with the parsed month's actual quarter .* month 8 is in Q3/
  );
});

test('QQQ: parse cross-check throws when quarter disagrees with month', () => {
  assert.throws(
    () => parse('QQQ yyyy-MM-dd', 'Q1 2026-08-04'),
    /Q1.*Q3/
  );
});

test('QQQ: cross-check covers every disagreeing quarter for every month', () => {
  // Walk the full 12×4 grid of (month, quarter) combos — every combo
  // where the quarter doesn't match the month's actual quarter must
  // throw. Adversarial coverage so a future bug that only catches
  // some disagreements doesn't slip through.
  for (let month = 1; month <= 12; month++) {
    const expectedQuarter = Math.ceil(month / 3);
    for (let quarter = 1; quarter <= 4; quarter++) {
      const input = `Q${quarter} 2026-${String(month).padStart(2, '0')}-15`;
      if (quarter === expectedQuarter) {
        assert.doesNotThrow(() => parse('QQQ yyyy-MM-dd', input),
          `month ${month} with Q${quarter} should succeed`);
      } else {
        assert.throws(() => parse('QQQ yyyy-MM-dd', input),
          `month ${month} with Q${quarter} should throw (cross-check disagreement)`);
      }
    }
  }
});

test('Q alone (without month) cannot build a date', () => {
  // Quarter is a derived field of month; with no month/date tokens,
  // parse() can't construct a full date and throws "incomplete date".
  assert.throws(() => parse('Q', '3'), /incomplete date|no date or time tokens/);
});

test('Q and QQQ round-trip through format() then parse()', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const qFormatted = format(date, 'Q yyyy-MM-dd');
  const qqqFormatted = format(date, 'QQQ yyyy-MM-dd');
  assert.equal(parse('Q yyyy-MM-dd', qFormatted).toString(), '2026-08-04');
  assert.equal(parse('QQQ yyyy-MM-dd', qqqFormatted).toString(), '2026-08-04');
});

test('QQQ alongside locale-aware month name still cross-checks', () => {
  // month from MMMM is parsed via the locale vocab; quarter from QQQ
  // is parsed directly; the cross-check should work the same way
  const result = parse('QQQ MMMM d, yyyy', 'Q3 August 4, 2026');
  assert.equal(result.toString(), '2026-08-04');
  assert.throws(
    () => parse('QQQ MMMM d, yyyy', 'Q1 August 4, 2026'),
    /Q1.*Q3/
  );
});
