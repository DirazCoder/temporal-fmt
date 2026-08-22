import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateDayjsFormatString, translateDateFnsFormatString } from '../dist/index.js';

test('translateDayjsFormatString: common format string translates token-for-token', () => {
  assert.equal(translateDayjsFormatString('YYYY-MM-DD HH:mm:ss'), 'yyyy-MM-dd HH:mm:ss');
});

test('translateDayjsFormatString: bracket-escaped text becomes a quoted literal', () => {
  assert.equal(translateDayjsFormatString('[Q]Q YYYY'), "'Q'Q yyyy");
});

test('translateDayjsFormatString: a literal quote inside bracketed text gets doubled', () => {
  assert.equal(translateDayjsFormatString("[it's] YYYY"), "'it''s' yyyy");
});

test('translateDayjsFormatString: Do is a single indivisible token, not D followed by literal o', () => {
  // Regression: an earlier version of the scanner matched "D" first and
  // left "o" to fall through as an unrecognized literal, silently
  // producing "do" — which reads as temporal-fmt's real ordinal-day
  // token and changes what the format string means. Do has no
  // temporal-fmt equivalent (temporal-fmt's own ordinal token is
  // lowercase "do"), so this must throw, not decompose.
  assert.throws(
    () => translateDayjsFormatString('Do MMMM YYYY'),
    /no Day\.js -> temporal-fmt mapping/
  );
});

test('translateDayjsFormatString: unmapped token names the source library and the offending token', () => {
  assert.throws(() => translateDayjsFormatString('X'), /"X" has no Day\.js -> temporal-fmt mapping/);
});

test('translateDayjsFormatString: D and DD mean day-of-month, unlike date-fns', () => {
  assert.equal(translateDayjsFormatString('DD/MM/YYYY'), 'dd/MM/yyyy');
});

test('translateDayjsFormatString: a stray unmapped letter run gets quoted rather than passed through raw', () => {
  // Regression: splitIntoRuns merges consecutive unmatched characters
  // into one literal piece before the letter check runs. A run merging
  // several stray letters ("o'clock" after HH:mm:ss consumes the digits)
  // needs the whole run quoted, not just a single character.
  assert.equal(translateDayjsFormatString('HH:mm [oclock]'), "HH:mm 'oclock'");
});

test('translateDayjsFormatString: apostrophes are not an escape mechanism in Day.js, so embedded tokens still match', () => {
  // Day.js only escapes via [...]; a bare apostrophe is just a literal
  // character, so "o'clock" still has its "k" read as a real token
  // (hour-in-24h, 1-indexed) rather than being treated as protected text.
  assert.throws(() => translateDayjsFormatString("YYYY [at] o'clock"), /"k" has no Day\.js/);
});

test('translateDateFnsFormatString: modern date-fns tokens mostly pass through unchanged', () => {
  assert.equal(translateDateFnsFormatString('EEEE, MMMM do yyyy'), 'EEEE, MMMM do yyyy');
});

test('translateDateFnsFormatString: D and DD mean day-of-year, matching temporal-fmt already', () => {
  // The opposite convention from Day.js's D/DD above — this is the whole
  // reason the two tables can't share one entry.
  assert.equal(translateDateFnsFormatString('DDD'), 'DDD');
});

test('translateDateFnsFormatString: locale composite tokens have no single temporal-fmt token', () => {
  assert.throws(
    () => translateDateFnsFormatString('PPPP'),
    /"PPPP" has no date-fns -> temporal-fmt mapping/
  );
});

test('translateDateFnsFormatString: bracket-escaped text becomes a quoted literal, same as Day.js', () => {
  assert.equal(translateDateFnsFormatString("yyyy 'Q'"), "yyyy 'Q'"); // no bracket used, passes through as-is
  assert.equal(translateDateFnsFormatString('yyyy [at] HH'), "yyyy 'at' HH");
});

test('an unterminated bracket at the end of a source string is scanned as token text, not silently dropped', () => {
  // splitOnBrackets treats a "[" with no matching "]" as the start of a
  // token run (including the "[" itself) rather than swallowing the rest
  // of the string as an escaped literal. The "[" and "oop" fall through
  // as an unrecognized, quoted literal run; "s" mid-run still matches
  // the real seconds token, since the run-splitter re-checks at every
  // position rather than giving up once it's inside unrecognized text.
  assert.equal(translateDayjsFormatString('YYYY [oops'), "yyyy '[oop's");
});
