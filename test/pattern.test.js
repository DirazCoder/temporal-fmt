import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// tokenFragment() and NUMERIC_FRAGMENTS aren't exported — only reachable
// through parse()'s regex matching. These walk every numeric fragment's
// actual accept/reject boundary one at a time, since parse.test.js only
// checks a handful of representative values per field.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('M (unpadded month) accepts 1 and 12, rejects 0 and 13', () => {
  assert.equal(parse('yyyy-M-dd', '2026-1-04').month, 1);
  assert.equal(parse('yyyy-M-dd', '2026-12-04').month, 12);
  assert.throws(() => parse('yyyy-M-dd', '2026-0-04'), /no valid pattern matches/);
  assert.throws(() => parse('yyyy-M-dd', '2026-13-04'), /no valid pattern matches/);
});

test('M (unpadded month) rejects a leading zero — that shape belongs to MM', () => {
  assert.throws(() => parse('yyyy-M-dd', '2026-01-04'), /no valid pattern matches/);
});

test('d (unpadded day) accepts 1 through 31, rejects 0 and 32', () => {
  assert.equal(parse('yyyy-MM-d', '2026-08-1').day, 1);
  assert.equal(parse('yyyy-MM-d', '2026-08-31').day, 31);
  assert.throws(() => parse('yyyy-MM-d', '2026-08-0'), /no valid pattern matches/);
  assert.throws(() => parse('yyyy-MM-d', '2026-08-32'), /no valid pattern matches/);
});

test('H (unpadded hour) accepts 0 through 23, rejects 24', () => {
  assert.equal(parse('H:mm', '0:00').hour, 0);
  assert.equal(parse('H:mm', '23:00').hour, 23);
  assert.throws(() => parse('H:mm', '24:00'), /no valid pattern matches/);
});

test('h (unpadded 12-hour) accepts 1 through 12, rejects 0 and 13', () => {
  assert.equal(parse('h:mm a', '1:00 AM').hour, 1);
  assert.throws(() => parse('h:mm a', '0:00 AM'), /no valid pattern matches/);
  assert.throws(() => parse('h:mm a', '13:00 AM'), /no valid pattern matches/);
});

test('m (unpadded minute) accepts 0 and 59, rejects 60', () => {
  assert.equal(parse('mm:ss', '00:00').minute, 0);
  // "m" alone can't build a full time value, so pair with a token that can
  assert.equal(parse('H:m', '5:0').minute, 0);
  assert.equal(parse('H:m', '5:59').minute, 59);
  assert.throws(() => parse('H:m', '5:60'), /no valid pattern matches/);
});

test('s (unpadded second) accepts 0 and 59, rejects 60', () => {
  assert.equal(parse('mm:s', '00:0').second, 0);
  assert.equal(parse('mm:s', '00:59').second, 59);
  assert.throws(() => parse('mm:s', '00:60'), /no valid pattern matches/);
});

test('SSS rejects fewer than 3 digits — the fragment is fixed-width, not variable', () => {
  assert.throws(() => parse('HH:mm:ss.SSS', '15:45:30.7'), /no valid pattern matches/);
  assert.throws(() => parse('HH:mm:ss.SSS', '15:45:30.77'), /no valid pattern matches/);
});

test('a format string of exactly MAX_FORMAT_LENGTH (1000 chars) is accepted, not rejected — only strictly-over throws', () => {
  // format.test.js and parse.test.js both test 1001 chars throwing, but
  // neither confirms exactly 1000 is fine — the source check is
  // `formatStr.length > MAX_FORMAT_LENGTH`, a strict >, so 1000 itself
  // should never hit the length-check throw. An all-literal quoted string
  // isolates that: if it clears the length check, it should fail on
  // "no tokens" instead, not on "exceeds maximum length".
  const formatStr = "'" + 'x'.repeat(998) + "'"; // 998 + 2 quote chars = 1000
  assert.equal(formatStr.length, 1000);
  assert.throws(
    () => parse(formatStr, 'x'.repeat(998)),
    /no tokens/,
    'exactly 1000 chars should clear the length check and fail on "no tokens" instead'
  );
});

test('M and MM in the same format string each keep their own width requirement — not one shared fragment', () => {
  // buildCapturingPattern() gives each piece its own named group and calls
  // tokenFragment() per-piece, so a duplicated field with mixed widths
  // isn't just "the same regex twice" — M (no leading zero) and MM (exactly
  // 2 digits) apply independently even though parse.ts's applyGroup() will
  // then let the second one win for the actual field value.
  assert.throws(
    () => parse('M/MM/dd/yyyy', '3/3/04/2026'),
    /no valid pattern matches/,
    'MM position requires 2 digits, "3" alone should not satisfy it'
  );
  const result = parse('M/MM/dd/yyyy', '3/03/04/2026');
  assert.equal(result.month, 3);
});

test('yyyy rejects fewer than 4 digits', () => {
  assert.throws(() => parse('yyyy-MM-dd', '026-08-04'), /no valid pattern matches/);
});

test('yyyy rejects more than 4 digits — a 5-digit run doesn\'t partially match and leave a stray digit', () => {
  // NUMERIC_FRAGMENTS.yyyy is "\d{4}" with no upper bound of its own — this
  // only rejects because the whole pattern is fully anchored (^...$) and the
  // literal "-" separator can't absorb the extra digit. Worth pinning down
  // separately from the "fewer than 4" case above since it's a different
  // mechanism (anchoring, not the fragment) doing the rejecting.
  assert.throws(() => parse('yyyy-MM-dd', '20260-08-04'), /no valid pattern matches/);
});

test('yy rejects a single digit or three digits — must be exactly 2', () => {
  assert.throws(() => parse('yy-MM-dd', '6-08-04'), /no valid pattern matches/);
  assert.throws(() => parse('yy-MM-dd', '026-08-04'), /no valid pattern matches/);
});

test('a real IANA zone id with an underscore and a slash is accepted by the timezone fragment', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
  assert.equal(result.timeZoneId, 'America/New_York');
});

test('a zone id with three path segments is accepted, when the runtime ICU data actually has one', () => {
  // getTimeZoneFragment() builds its regex from Intl.supportedValuesOf('timeZone'),
  // so which three-segment ids exist (if any) depends on the runtime's ICU data —
  // some builds only ship the two-segment alias (e.g. America/Buenos_Aires) and
  // not the canonical America/Argentina/Buenos_Aires. Find one that's actually
  // present instead of hardcoding an id that may not resolve here.
  const threeSegmentZone = Intl.supportedValuesOf('timeZone').find(
    (z) => z.split('/').length === 3
  );
  if (!threeSegmentZone) {
    return; // this ICU build has no three-segment zone ids to test against
  }
  const result = parse('yyyy-MM-dd HH:mm zzz', `2026-08-04 15:45 ${threeSegmentZone}`);
  assert.equal(result.timeZoneId, threeSegmentZone);
});

test('a bare region name with no slash is rejected as a zone id (except UTC, which is special-cased)', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Narnia'),
    /no valid pattern matches/
  );
});
