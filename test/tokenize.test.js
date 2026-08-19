import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// tokenize() isn't exported — it only ships as part of the compiled
// format()/parse() pipeline (see dist/index.js). These tests pin down its
// piece-splitting behavior specifically, as opposed to format.test.js and
// parse.test.js which test the pipeline as a whole. Where format.test.js
// already covers a case (quoting, MMMM greediness) it's not repeated here.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('every token in TOKENS matches at the start of a string, not just mid-string', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy'), '2026');
  assert.equal(format(date, 'MMMM'), 'August');
});

test('two-letter tokens win over their one-letter prefix everywhere they appear, not just at position 0', () => {
  // "M-MM-M" — the scan has to re-evaluate greediness after each match,
  // not just once at the start of the string
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'M-MM-M'), '8-08-8');
});

test('a quote directly followed by a token character does not swallow the token', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "'d'd"), 'd4');
});

test('three consecutive single quotes: doubled-quote escape then an unterminated open', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, "yyyy'''"), /unterminated quote/);
});

test('a literal run split by a token in the middle produces two merged literal pieces, not one', () => {
  // "nb" + yyyy + "cq" — the two literal runs shouldn't merge across the
  // token in between. Deliberately avoiding a, d, and every other reserved
  // single-char token here (see TOKENS) so this actually tests literal
  // handling instead of accidentally invoking a field handler. "n" is the
  // current placeholder; "x" was used before X/x became offset tokens.
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'nbyyyycq'), 'nb2026cq');
});

test('quoted text containing only whitespace is preserved exactly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy'   'MM"), '2026   08');
});

test('a single unquoted apostrophe-like character that is not ASCII quote passes through as literal', () => {
  // U+2019 RIGHT SINGLE QUOTATION MARK isn't the ASCII quote tokenize()
  // treats specially. Using "n" as the trailing literal here, not "s" —
  // "s" is the reserved seconds token and would throw on a PlainDate,
  // which has no time fields. ("n" is the current placeholder; "x" was
  // used before X/x became offset tokens.)
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy\u2019n'), '2026\u2019n');
});

test('every single-character field token throws its own field-specific error when unquoted in plain text', () => {
  // confirms tokenize() reads y, M, d, h, H, m, s, a, X, x as tokens even
  // standing alone in the middle of ordinary words, not just h (already
  // covered in format.test.js) — each should throw on the field it maps to
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => format(date, 'am'), /requires "hour"/); // "a" token
  assert.throws(() => format(date, 'sat'), /requires "second"/); // "s" token
  assert.throws(() => format(date, 'Xat'), /requires "offset"/); // "X" token (offset)
  assert.throws(() => format(date, 'xat'), /requires "offset"/); // "x" token (offset)
});

test('a format string that is entirely literal punctuation with no letters round-trips through parse unchanged', () => {
  assert.throws(() => parse('---///...', '---///...'), /no tokens/);
});

test('an escaped quote inside an already-open quoted span keeps accumulating literal text after it', () => {
  // different branch than the standalone '' test above — this one exercises
  // the inner while-loop's "format[j+1] === quote" check while a span is
  // already open, not the outer shortcut that fires before a span opens
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy'it''s'"), "2026it's");
});

test('a doubled quote is always read as an escaped literal quote, never as an empty span, even mid-string', () => {
  // tokenize() checks format[i+1] === "'" before it ever tries to open a
  // span, so "yyyy''MM" can't be read as "yyyy" + (empty span) + "MM" —
  // it's "yyyy" + (literal ') + "MM". Worth pinning down since both
  // readings would produce a valid-looking piece list.
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, "yyyy''MM"), "2026'08");
});

test('mixed tokens and literals tokenize consistently between format and parse (round-trip check on piece boundaries)', () => {
  const original = Temporal.PlainDate.from('2026-08-04');
  const formatStr = "'Date:' yyyy'/'MM'/'dd";
  const formatted = format(original, formatStr);
  const reparsed = parse(formatStr, formatted);
  assert.equal(reparsed.toString(), original.toString());
});
