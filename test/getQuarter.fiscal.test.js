import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuarter } from '../dist/index.js';

// getQuarter(view, { startMonth }) — startMonth shifts which calendar
// month counts as fiscal-Q1-month-1. Omitted or 1 preserves the
// original calendar-quarter behavior (Jan-Mar = Q1, etc.), matching
// the Q/QQQ format tokens tested separately in quarter.test.js (those
// tokens have their own inline month-based logic and don't call
// getQuarter, so this file is the only coverage for the function
// itself).

test('startMonth omitted: matches calendar-quarter behavior for every month', () => {
  const expected = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
  for (let month = 1; month <= 12; month++) {
    assert.equal(getQuarter({ month }), expected[month - 1], `month ${month}`);
  }
});

test('startMonth: 1 explicitly is identical to omitting it', () => {
  for (let month = 1; month <= 12; month++) {
    assert.equal(getQuarter({ month }, { startMonth: 1 }), getQuarter({ month }));
  }
});

test('startMonth: 7 (July fiscal year, e.g. UK/India-style) — Jul-Sep is Q1', () => {
  assert.equal(getQuarter({ month: 7 }, { startMonth: 7 }), 1);
  assert.equal(getQuarter({ month: 8 }, { startMonth: 7 }), 1);
  assert.equal(getQuarter({ month: 9 }, { startMonth: 7 }), 1);
  assert.equal(getQuarter({ month: 10 }, { startMonth: 7 }), 2);
  assert.equal(getQuarter({ month: 12 }, { startMonth: 7 }), 2);
  assert.equal(getQuarter({ month: 1 }, { startMonth: 7 }), 3);
  assert.equal(getQuarter({ month: 3 }, { startMonth: 7 }), 3);
  assert.equal(getQuarter({ month: 4 }, { startMonth: 7 }), 4);
  assert.equal(getQuarter({ month: 6 }, { startMonth: 7 }), 4);
});

test('startMonth: 10 (Apple-style fiscal year, Oct-start) matches Apple\'s published quarters', () => {
  // Apple FY: Q1 Oct-Dec, Q2 Jan-Mar, Q3 Apr-Jun, Q4 Jul-Sep.
  assert.equal(getQuarter({ month: 10 }, { startMonth: 10 }), 1);
  assert.equal(getQuarter({ month: 11 }, { startMonth: 10 }), 1);
  assert.equal(getQuarter({ month: 12 }, { startMonth: 10 }), 1);
  assert.equal(getQuarter({ month: 1 }, { startMonth: 10 }), 2);
  assert.equal(getQuarter({ month: 3 }, { startMonth: 10 }), 2);
  assert.equal(getQuarter({ month: 4 }, { startMonth: 10 }), 3);
  assert.equal(getQuarter({ month: 6 }, { startMonth: 10 }), 3);
  assert.equal(getQuarter({ month: 7 }, { startMonth: 10 }), 4);
  assert.equal(getQuarter({ month: 9 }, { startMonth: 10 }), 4);
});

test('startMonth: exhaustive invariant across all 12 possible start months', () => {
  // For any startMonth, walking 12 consecutive months starting at
  // startMonth should produce exactly three months per quarter, in
  // order Q1,Q1,Q1,Q2,Q2,Q2,Q3,Q3,Q3,Q4,Q4,Q4 — regardless of where
  // the calendar year itself wraps.
  for (let startMonth = 1; startMonth <= 12; startMonth++) {
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const month = ((startMonth - 1 + i) % 12) + 1;
      seen.push(getQuarter({ month }, { startMonth }));
    }
    assert.deepEqual(seen, [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4], `startMonth ${startMonth}`);
  }
});

test('startMonth: invalid values throw descriptively', () => {
  assert.throws(() => getQuarter({ month: 6 }, { startMonth: 0 }), /startMonth must be an integer from 1 to 12/);
  assert.throws(() => getQuarter({ month: 6 }, { startMonth: 13 }), /startMonth must be an integer from 1 to 12/);
  assert.throws(() => getQuarter({ month: 6 }, { startMonth: 1.5 }), /startMonth must be an integer from 1 to 12/);
  assert.throws(() => getQuarter({ month: 6 }, { startMonth: -1 }), /startMonth must be an integer from 1 to 12/);
});

test('missing month field still throws the existing requireFields error, unaffected by startMonth', () => {
  assert.throws(() => getQuarter({}, { startMonth: 7 }), /requires "month"/);
});
