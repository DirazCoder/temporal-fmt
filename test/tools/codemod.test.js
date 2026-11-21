import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateDayjsFormatString, translateDateFnsFormatString } from '../../dist/index.js';

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

test('translateDateFnsFormatString: brackets are literal characters (date-fns escapes with quotes, not brackets)', () => {
  // date-fns escapes literal text with single quotes — square brackets
  // have no special meaning there, so "[at]" must stay a literal
  // "[at]" in the output (bracket chars pass through, the letters
  // inside get quoted so temporal-fmt won't read them as tokens).
  assert.equal(translateDateFnsFormatString("yyyy 'Q'"), "yyyy 'Q'"); // quoted span is already temporal-fmt syntax
  // In date-fns, brackets are NOT escapes — "[at]" renders as literal
  // "[" + <am/pm token> + literal "t]". The translation preserves that
  // exactly: 'a' stays a temporal-fmt meridiem token, 't] ' (letter +
  // bracket + space run) is quoted as a literal.
  assert.equal(translateDateFnsFormatString('yyyy [at] HH'), "yyyy [a't] 'HH");
  // Non-letter bracket contents pass through untouched.
  assert.equal(translateDateFnsFormatString('yyyy [2026] HH'), 'yyyy [2026] HH');
  // The quote dialect is actually parsed now: "yyyy 'at' HH:mm" used to
  // come out as corrupted output the library itself rejects.
  assert.equal(translateDateFnsFormatString("yyyy 'at' HH:mm"), "yyyy 'at' HH:mm");
  // '' inside a date-fns quoted span is one literal quote.
  assert.equal(translateDateFnsFormatString("yyyy 'o''clock'"), "yyyy 'o''clock'");
});

test('an unterminated bracket at the end of a source string is kept as literal text', () => {
  // Day.js renders an unterminated "[" and everything after it as
  // literal text, so the translation quotes the whole remainder
  // (bracket included) instead of feeding it to the token mapper.
  assert.equal(translateDayjsFormatString('YYYY [oops'), "yyyy '[oops'");
});
