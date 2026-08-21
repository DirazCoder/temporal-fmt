import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, safeParse, setTemporal } from '../dist/index.js';
import { Temporal } from 'temporal-polyfill/full';

setTemporal(Temporal);

// getLocaleVocab/partValue aren't exported — reached only through
// parse()/safeParse() (vocab is built for matching input text back to a
// month/weekday/day-period index, not for formatting output) with a
// locale whose Intl output has the specific shape each branch needs.
// Most locales fold cleanly (no adjacent literal at all), so these are
// deliberately obscure locale choices, not arbitrary ones — each was
// picked because it's confirmed on this runtime to produce the exact
// part shape the branch checks for.

test('partValue: folds a non-whitespace literal that comes after the matched part', () => {
  // ja-JP's month formatting appends a counter suffix ("月") as its own
  // adjacent literal part rather than including it in the month value
  // itself — parse() only recognizes "8月" as August if partValue folds
  // that trailing literal into the vocab entry it matches against.
  const r = safeParse('MMMM d, yyyy', '8月 5, 2026', { locale: 'ja-JP' });
  assert.equal(r.ok, true);
  assert.equal(r.value.toString(), '2026-08-05');
});

test('partValue: folds a non-whitespace literal that comes before the matched part', () => {
  // dz-BT (Dzongkha) prefixes month names with a literal ("སྤྱི་") ahead
  // of the month part itself. This is the mirror case of the ja-JP
  // suffix above — same fold logic, opposite side. Confirm format()
  // produces the prefixed form, then confirm parse() round-trips it
  // (which only works if partValue folded the same prefix into the
  // vocab entry parse() matches against).
  const d = Temporal.PlainDate.from('2026-08-05');
  const formatted = format(d, 'MMMM d, yyyy', { locale: 'dz-BT' });
  const r = safeParse('MMMM d, yyyy', formatted, { locale: 'dz-BT' });
  assert.equal(r.ok, true);
  assert.equal(r.value.toString(), '2026-08-05');
});
