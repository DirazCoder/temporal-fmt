import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Covers the new X/XX/XXX/x/xx/xxx offset-token family. Mirrors the split
// the rest of the suite uses: this file exercises the public API
// end-to-end against the dist build; vitest/offset.unit.test.ts hits
// parseOffsetString() and formatOffset() internals directly so a failure
// names the broken case instead of surfacing as a wrong date three layers
// up. The existing format.test.js and parse.test.js already cover zzz;
// the zzz-regression block at the bottom of this file re-pins a couple of
// zzz cases that the offset-token work could plausibly have disturbed
// (specifically the "needs a full date and time" path, which now has a
// sibling check for offset tokens).
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Real IANA zones chosen for each offset so DST doesn't make the expected
// values time-of-year-dependent. Every zone below is a no-DST zone that has
// held its offset constant through the modern era — the cases that *do*
// observe DST (America/New_York, Europe/London, etc.) get their own block
// further down.
//
// Etc/GMT+12 is used for -12:00 instead of Pacific/Baker (the more
// conventional pick) because the polyfill's bundled zone table omits
// Baker — Etc/GMT+12 is the same -12:00 offset and is in every zone table.
function zdt(iso) {
  return Temporal.ZonedDateTime.from(iso);
}

const UTC = zdt('2026-08-04T15:45:30+00:00[UTC]');
const PLUS_5 = zdt('2026-08-04T15:45:30+05:00[Asia/Karachi]');
const MINUS_5 = zdt('2026-08-04T15:45:30-05:00[America/Bogota]');
const HALF_HOUR = zdt('2026-08-04T15:45:30+05:30[Asia/Kolkata]');
const FORTY_FIVE = zdt('2026-08-04T15:45:30+05:45[Asia/Kathmandu]');
const MAX_POS = zdt('2026-08-04T15:45:30+14:00[Pacific/Kiritimati]');
const MAX_NEG = zdt('2026-08-04T15:45:30-12:00[Etc/GMT+12]');

// ---------- format: per-variant width across the offset spread ----------

test('X (uppercase, Z-allowed): drops minutes when zero, no colon otherwise, Z for UTC', () => {
  assert.equal(format(UTC, 'X'), 'Z');
  assert.equal(format(PLUS_5, 'X'), '+05');
  assert.equal(format(MINUS_5, 'X'), '-05');
  assert.equal(format(HALF_HOUR, 'X'), '+0530');
  assert.equal(format(FORTY_FIVE, 'X'), '+0545');
  assert.equal(format(MAX_POS, 'X'), '+14');
  assert.equal(format(MAX_NEG, 'X'), '-12');
});

test('XX (uppercase, Z-allowed): always hours+minutes, no colon, Z for UTC', () => {
  assert.equal(format(UTC, 'XX'), 'Z');
  assert.equal(format(PLUS_5, 'XX'), '+0500');
  assert.equal(format(MINUS_5, 'XX'), '-0500');
  assert.equal(format(HALF_HOUR, 'XX'), '+0530');
  assert.equal(format(FORTY_FIVE, 'XX'), '+0545');
  assert.equal(format(MAX_POS, 'XX'), '+1400');
  assert.equal(format(MAX_NEG, 'XX'), '-1200');
});

test('XXX (uppercase, Z-allowed): always hours+minutes with colon, Z for UTC', () => {
  assert.equal(format(UTC, 'XXX'), 'Z');
  assert.equal(format(PLUS_5, 'XXX'), '+05:00');
  assert.equal(format(MINUS_5, 'XXX'), '-05:00');
  assert.equal(format(HALF_HOUR, 'XXX'), '+05:30');
  assert.equal(format(FORTY_FIVE, 'XXX'), '+05:45');
  assert.equal(format(MAX_POS, 'XXX'), '+14:00');
  assert.equal(format(MAX_NEG, 'XXX'), '-12:00');
});

test('x (lowercase, never Z): drops minutes when zero, no colon otherwise, +00 for UTC', () => {
  assert.equal(format(UTC, 'x'), '+00');
  assert.equal(format(PLUS_5, 'x'), '+05');
  assert.equal(format(MINUS_5, 'x'), '-05');
  assert.equal(format(HALF_HOUR, 'x'), '+0530');
  assert.equal(format(FORTY_FIVE, 'x'), '+0545');
  assert.equal(format(MAX_POS, 'x'), '+14');
  assert.equal(format(MAX_NEG, 'x'), '-12');
});

test('xx (lowercase, never Z): always hours+minutes, no colon, +0000 for UTC', () => {
  assert.equal(format(UTC, 'xx'), '+0000');
  assert.equal(format(PLUS_5, 'xx'), '+0500');
  assert.equal(format(MINUS_5, 'xx'), '-0500');
  assert.equal(format(HALF_HOUR, 'xx'), '+0530');
  assert.equal(format(FORTY_FIVE, 'xx'), '+0545');
  assert.equal(format(MAX_POS, 'xx'), '+1400');
  assert.equal(format(MAX_NEG, 'xx'), '-1200');
});

test('xxx (lowercase, never Z): always hours+minutes with colon, +00:00 for UTC', () => {
  assert.equal(format(UTC, 'xxx'), '+00:00');
  assert.equal(format(PLUS_5, 'xxx'), '+05:00');
  assert.equal(format(MINUS_5, 'xxx'), '-05:00');
  assert.equal(format(HALF_HOUR, 'xxx'), '+05:30');
  assert.equal(format(FORTY_FIVE, 'xxx'), '+05:45');
  assert.equal(format(MAX_POS, 'xxx'), '+14:00');
  assert.equal(format(MAX_NEG, 'xxx'), '-12:00');
});

// ---------- format: only ZonedDateTime carries an offset ----------

test('offset tokens throw on PlainDate (no offset field)', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  for (const tok of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx']) {
    assert.throws(
      () => format(date, tok),
      /requires "offset"/,
      `${tok} should throw on PlainDate`
    );
  }
});

test('offset tokens throw on PlainDateTime (no offset field)', () => {
  const dt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
  for (const tok of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx']) {
    assert.throws(
      () => format(dt, tok),
      /requires "offset"/,
      `${tok} should throw on PlainDateTime`
    );
  }
});

test('offset tokens throw on PlainTime (no offset field)', () => {
  const t = Temporal.PlainTime.from('15:45:30');
  for (const tok of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx']) {
    assert.throws(
      () => format(t, tok),
      /requires "offset"/,
      `${tok} should throw on PlainTime`
    );
  }
});

// ---------- parse: per-variant round-trip through format ----------

// Build a ZonedDateTime in each no-DST zone, format it with each variant,
// parse the result back through the same variant, and assert the
// reconstructed ZonedDateTime has the same offset and instant as the
// original. The instant comparison is the load-bearing one — the offset
// alone doesn't prove the wall-clock fields matched, but identical
// instants across a format->parse round-trip do.
//
// Format carries :ss so seconds survive the round-trip; without it a
// 30-second original would lose 30s on parse (since :ss would default to
// 0), and the instant comparison would fail for a reason unrelated to
// what the test is actually checking.
//
// The pattern also carries "zzz": parse() no longer builds a ZonedDateTime
// from an offset token alone (an offset identifies a moment, not a zone —
// see conformance/README.md, zone-required-for-zoneddatetime), so a
// round-trip through just X/XX/XXX/x/xx/xxx now throws. Adding zzz keeps
// these tests doing what they're actually for — exercising each offset
// variant's width and Z-handling across the spread — instead of the
// unrelated question of whether a zone is required.
function roundTripCase(label, original, variant) {
  const formatStr = `yyyy-MM-dd HH:mm:ss${variant}'['zzz']'`;
  const formatted = format(original, formatStr);
  const reparsed = parse(formatStr, formatted);
  assert.equal(
    reparsed.epochNanoseconds,
    original.epochNanoseconds,
    `${label} round-trip under ${variant}: format produced "${formatted}", parse gave offset "${reparsed.offset}"`
  );
  assert.equal(reparsed.offset, original.offset, `${label} round-trip under ${variant}: offset mismatch`);
}

test('X round-trips for every offset in the spread', () => {
  roundTripCase('UTC', UTC, 'X');
  roundTripCase('+05:00', PLUS_5, 'X');
  roundTripCase('-05:00', MINUS_5, 'X');
  roundTripCase('+05:30', HALF_HOUR, 'X');
  roundTripCase('+05:45', FORTY_FIVE, 'X');
  roundTripCase('+14:00', MAX_POS, 'X');
  roundTripCase('-12:00', MAX_NEG, 'X');
});

test('XX round-trips for every offset in the spread', () => {
  roundTripCase('UTC', UTC, 'XX');
  roundTripCase('+05:00', PLUS_5, 'XX');
  roundTripCase('-05:00', MINUS_5, 'XX');
  roundTripCase('+05:30', HALF_HOUR, 'XX');
  roundTripCase('+05:45', FORTY_FIVE, 'XX');
  roundTripCase('+14:00', MAX_POS, 'XX');
  roundTripCase('-12:00', MAX_NEG, 'XX');
});

test('XXX round-trips for every offset in the spread', () => {
  roundTripCase('UTC', UTC, 'XXX');
  roundTripCase('+05:00', PLUS_5, 'XXX');
  roundTripCase('-05:00', MINUS_5, 'XXX');
  roundTripCase('+05:30', HALF_HOUR, 'XXX');
  roundTripCase('+05:45', FORTY_FIVE, 'XXX');
  roundTripCase('+14:00', MAX_POS, 'XXX');
  roundTripCase('-12:00', MAX_NEG, 'XXX');
});

test('x round-trips for every offset in the spread (lowercase, never Z)', () => {
  roundTripCase('UTC', UTC, 'x');
  roundTripCase('+05:00', PLUS_5, 'x');
  roundTripCase('-05:00', MINUS_5, 'x');
  roundTripCase('+05:30', HALF_HOUR, 'x');
  roundTripCase('+05:45', FORTY_FIVE, 'x');
  roundTripCase('+14:00', MAX_POS, 'x');
  roundTripCase('-12:00', MAX_NEG, 'x');
});

test('xx round-trips for every offset in the spread', () => {
  roundTripCase('UTC', UTC, 'xx');
  roundTripCase('+05:00', PLUS_5, 'xx');
  roundTripCase('-05:00', MINUS_5, 'xx');
  roundTripCase('+05:30', HALF_HOUR, 'xx');
  roundTripCase('+05:45', FORTY_FIVE, 'xx');
  roundTripCase('+14:00', MAX_POS, 'xx');
  roundTripCase('-12:00', MAX_NEG, 'xx');
});

test('xxx round-trips for every offset in the spread', () => {
  roundTripCase('UTC', UTC, 'xxx');
  roundTripCase('+05:00', PLUS_5, 'xxx');
  roundTripCase('-05:00', MINUS_5, 'xxx');
  roundTripCase('+05:30', HALF_HOUR, 'xxx');
  roundTripCase('+05:45', FORTY_FIVE, 'xxx');
  roundTripCase('+14:00', MAX_POS, 'xxx');
  roundTripCase('-12:00', MAX_NEG, 'xxx');
});

// ---------- parse: standalone cases not covered by round-trip ----------

test('Z parses as UTC for uppercase variants', () => {
  // Standalone Z shape — uppercase variants accept it as +00:00.
  // Round-trip covers it indirectly via format(UTC, 'X') === 'Z', but
  // pinning the explicit parse side here means a regression surfaces with
  // a specific name instead of buried in the round-trip block.
  //
  // Pattern carries "zzz" — an offset token with no zone token no longer
  // resolves on its own (see zone-required-for-zoneddatetime in
  // conformance/README.md), so this needs a real zone to parse at all.
  for (const tok of ['X', 'XX', 'XXX']) {
    const formatStr = `yyyy-MM-dd HH:mm${tok}'['zzz']'`;
    const result = parse(formatStr, `2026-08-04 15:45Z[UTC]`);
    assert.equal(result.offset, '+00:00', `${tok} should accept "Z" as UTC`);
  }
});

test('lowercase variants reject "Z" with a descriptive error', () => {
  // Lowercase variants never emit Z, so they shouldn't accept it on parse
  // either — the regex shape for x/xx/xxx doesn't include the Z branch, so
  // a "Z" input fails the whole-pattern match and throws "no valid pattern
  // matches". That's the right outcome (silent acceptance would be a bug),
  // and the error path surfaces through the generic shape-mismatch throw
  // rather than the offset-specific validator.
  for (const tok of ['x', 'xx', 'xxx']) {
    assert.throws(
      () => parse(`yyyy-MM-dd HH:mm${tok}`, '2026-08-04 15:45Z'),
      /no valid pattern matches/,
      `${tok} should reject "Z" at the shape level`
    );
  }
});

test('offset-only pattern (no zzz) is rejected — an offset does not identify a zone', () => {
  // Previously, an offset token with no zzz built a fixed-offset
  // ZonedDateTime directly from the offset string. That's no longer
  // supported: an offset identifies a moment's distance from UTC, not a
  // time zone, so building a ZonedDateTime from one alone papered over
  // that distinction. See zone-required-for-zoneddatetime in
  // conformance/README.md.
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+09:00'),
    /has an offset token but no "zzz" zone token/
  );
});

test('offset-only pattern with half-hour offset is rejected the same way', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+05:30'),
    /has an offset token but no "zzz" zone token/
  );
});

test('offset token with zzz still builds a ZonedDateTime at the correct offset', () => {
  // Same case as the two tests above, but with the required zzz zone
  // added — this is the supported path.
  const result = parse(`yyyy-MM-dd HH:mmXXX'['zzz']'`, '2026-08-04 15:45+05:30[Asia/Kolkata]');
  assert.equal(result.offset, '+05:30');
  assert.equal(result.timeZoneId, 'Asia/Kolkata');
});

test('offset token without a full date+time throws the "needs a full date and time" error', () => {
  // Mirror zzz's existing rule: an offset alone can't anchor an instant,
  // same as a zone alone can't.
  assert.throws(
    () => parse('HH:mmXXX', '15:45+09:00'),
    /has an offset token .* but needs a full date and time/
  );
  assert.throws(
    () => parse('yyyy-MM-ddXXX', '2026-08-04+09:00'),
    /has an offset token .* but needs a full date and time/
  );
  assert.throws(
    () => parse('XXX', '+09:00'),
    /has an offset token .* but needs a full date and time/
  );
});

// ---------- parse: adversarial / malformed input ----------

test('out-of-range hours throws descriptive error naming the bound', () => {
  // The regex shape (OFFSET_SHAPES in pattern.ts) is deliberately
  // permissive so out-of-range values reach the post-match validator and
  // throw a specific "hours 99 out of range (max 14)" rather than the
  // generic "no valid pattern matches".
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+99:00'),
    /offset hours 99.*out of range/
  );
});

test('out-of-range minutes throws descriptive error', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+05:60'),
    /offset minutes 60 .* out of range \(max 59\)/
  );
});

test('+14:01 exceeds the max supported offset (boundary check at hours==14)', () => {
  // hours=14 and minutes!=0 — the per-piece checks alone would pass (14 ≤
  // 14, 1 ≤ 59), but the overall offset +14:01 is past Kiritimati's
  // maximum. The cross-piece check catches this.
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+14:01'),
    /exceeds the maximum supported UTC offset of \+14:00/
  );
});

test('-12:01 exceeds the max supported negative offset (boundary check at hours==12)', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45-12:01'),
    /exceeds the maximum supported negative UTC offset of -12:00/
  );
});

test('wrong colon usage for the variant throws (XXX needs colon, XX forbids it)', () => {
  // XXX requires a colon; XX forbids it. The regex shape rejects these at
  // the match level (no descriptive post-match error since the regex
  // never captured them in the first place), surfacing as "no valid
  // pattern matches".
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+0500'),
    /no valid pattern matches/
  );
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXX', '2026-08-04 15:45+05:00'),
    /no valid pattern matches/
  );
});

test('missing sign throws at the shape level', () => {
  // "+05:00" without a leading sign — the regex requires [+-] or Z, so
  // "05:00" alone fails the whole-pattern match.
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:4505:00'),
    /no valid pattern matches/
  );
});

test('non-numeric junk in the offset position throws at the shape level', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mmXXX', '2026-08-04 15:45+ab:cd'),
    /no valid pattern matches/
  );
});

test('X accepts both +HH and +HHMM shapes, x rejects Z', () => {
  // X is the only variant where the regex accepts both the short +HH form
  // (when minutes are zero) and the +HHMM form (when they're not). Pin
  // both shapes here so a regression to one-or-the-other surfaces with a
  // specific name. zzz is required on the pattern since an offset token
  // alone no longer resolves to a ZonedDateTime.
  assert.equal(parse(`yyyy-MM-dd HH:mmX'['zzz']'`, '2026-08-04 15:45+05[Asia/Karachi]').offset, '+05:00');
  assert.equal(parse(`yyyy-MM-dd HH:mmX'['zzz']'`, '2026-08-04 15:45+0530[Asia/Kolkata]').offset, '+05:30');
  // x is identical to X minus the Z alternative.
  assert.equal(parse(`yyyy-MM-dd HH:mmx'['zzz']'`, '2026-08-04 15:45+05[Asia/Karachi]').offset, '+05:00');
  assert.equal(parse(`yyyy-MM-dd HH:mmx'['zzz']'`, '2026-08-04 15:45+0530[Asia/Kolkata]').offset, '+05:30');
});

// ---------- zzz / offset-token overlap ----------

test('zzz (IANA) + offset token agreeing: succeeds, IANA name preserved on the result', () => {
  // Pattern has both zzz and XXX. zzz's IANA name is the meaningful label
  // for the result's timeZoneId; XXX's value is cross-checked against the
  // zone's actual offset at this instant. On match, the IANA name wins
  // (so the result still says "America/New_York", not "-04:00").
  const result = parse(
    'yyyy-MM-dd HH:mm zzz XXX',
    '2026-08-04 15:45 America/New_York -04:00'
  );
  assert.equal(result.timeZoneId, 'America/New_York');
  assert.equal(result.offset, '-04:00'); // August = EDT
});

test('zzz (IANA) + offset token disagreeing: throws naming both values', () => {
  // IANA name resolves to -04:00 in August, but the offset token says
  // +09:00 — internally contradictory input. parse() throws rather than
  // silently agreeing-to-disagree, same pattern as the EEEE-vs-date and
  // Q-vs-month cross-checks.
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 America/New_York +09:00'),
    /has both a "zzz" zone .* and an offset token .* but the zone's actual offset/
  );
});

test('zzz (IANA) + offset token agreeing in January (EST, -05:00): succeeds', () => {
  // Same zone, different season, different actual offset — confirms the
  // cross-check is against the zone's *actual* offset at that instant,
  // not a static per-zone value.
  const result = parse(
    'yyyy-MM-dd HH:mm zzz XXX',
    '2026-01-04 15:45 America/New_York -05:00'
  );
  assert.equal(result.timeZoneId, 'America/New_York');
  assert.equal(result.offset, '-05:00');
});

test('zzz (fixed offset) + offset token agreeing: succeeds', () => {
  // zzz parsing a fixed offset itself (existing leniency) plus an offset
  // token saying the same thing. Both describe the same zone; either
  // could win and the result would be the same.
  const result = parse(
    'yyyy-MM-dd HH:mm zzz XXX',
    '2026-08-04 15:45 +09:00 +09:00'
  );
  assert.equal(result.timeZoneId, '+09:00');
  assert.equal(result.offset, '+09:00');
});

test('zzz (fixed offset) + offset token disagreeing: throws', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz XXX', '2026-08-04 15:45 +09:00 +10:00'),
    /has both a "zzz" zone .* and an offset token/
  );
});

test('zzz (IANA) + offset token = Z (UTC) on a non-UTC zone: throws', () => {
  // America/New_York is never +00:00 — the offset token saying "Z"
  // contradicts the zone's actual offset.
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz X', '2026-08-04 15:45 America/New_York Z'),
    /has both a "zzz" zone .* and an offset token/
  );
});

test('zzz (UTC) + offset token = Z: succeeds', () => {
  const result = parse(
    'yyyy-MM-dd HH:mm zzz X',
    '2026-08-04 15:45 UTC Z'
  );
  assert.equal(result.timeZoneId, 'UTC');
  assert.equal(result.offset, '+00:00');
});

// ---------- zzz regression: existing behavior unchanged ----------

test('zzz regression: formats the IANA id, never the numeric offset', () => {
  // zzz formats the id string verbatim — adding offset tokens didn't
  // change that.
  assert.equal(format(PLUS_5, 'zzz'), 'Asia/Karachi');
  const nySummer = zdt('2026-08-04T15:45:30-04:00[America/New_York]');
  assert.equal(format(nySummer, 'zzz'), 'America/New_York');
});

test('zzz regression: parses an IANA name into a ZonedDateTime at the zone DST-correct offset', () => {
  // Same test that was already in parse.test.js — duplicated here so a
  // regression in zzz's DST handling surfaces in the offset-token test
  // file too, not just in parse.test.js.
  const winter = parse('yyyy-MM-dd HH:mm zzz', '2026-01-04 15:45 America/New_York');
  assert.equal(winter.offset, '-05:00');
  const summer = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 America/New_York');
  assert.equal(summer.offset, '-04:00');
});

test('zzz regression: alone throws "needs a full date and time" (same message as before)', () => {
  assert.throws(() => parse('zzz', 'America/New_York'), /needs a full date and time/);
  assert.throws(() => parse('yyyy-MM-dd zzz', '2026-08-04 America/New_York'), /needs a full date and time/);
  assert.throws(() => parse('HH:mm zzz', '15:45 America/New_York'), /needs a full date and time/);
});

test('zzz regression: unrecognized zone id throws InvalidTimeZoneError', () => {
  assert.throws(
    () => parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone'),
    /not a recognized IANA time zone/
  );
});

test('zzz regression: UTC accepted even though supportedValuesOf omits it', () => {
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 UTC');
  assert.equal(result.timeZoneId, 'UTC');
});

test('zzz regression: fixed-offset input through zzz still works (independent of new offset tokens)', () => {
  // zzz's existing leniency for fixed offsets must remain — adding a
  // dedicated offset token family doesn't change what zzz accepts.
  const result = parse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 +09:00');
  assert.equal(result.timeZoneId, '+09:00');
  assert.equal(result.offset, '+09:00');
});

// ---------- integration: combining offset tokens with locale-aware tokens ----------

test('offset token composes with locale-aware month name in the same pattern', () => {
  // XXX after a localized MMMM — confirms the offset token's regex shape
  // doesn't accidentally consume part of a preceding locale-named token,
  // and that the locale-aware path doesn't disturb the offset's parse.
  // Format carries seconds so the round-trip is exact; without :ss the
  // reparsed value would lose the 30s and fail the instant comparison.
  //
  // Parse-side pattern adds "zzz": an offset token with no zone token no
  // longer resolves to a ZonedDateTime on its own (see
  // zone-required-for-zoneddatetime in conformance/README.md). The
  // format-side assertion is untouched — it's still proving the offset
  // token doesn't collide with the preceding locale-named token.
  const original = zdt('2026-08-04T15:45:30+05:30[Asia/Kolkata]');
  const formatted = format(original, 'MMMM d, yyyy HH:mm:ssXXX', { locale: 'en-US' });
  assert.equal(formatted, 'August 4, 2026 15:45:30+05:30');
  const reparsed = parse(`MMMM d, yyyy HH:mm:ssXXX'['zzz']'`, `${formatted}[Asia/Kolkata]`);
  assert.equal(reparsed.offset, '+05:30');
  assert.equal(reparsed.epochNanoseconds, original.epochNanoseconds);
});

test('offset token composes with milliseconds token', () => {
  // Adjacency check: SSS followed by XXX — the SSS regex consumes exactly
  // 3 digits, then the literal space, then XXX's regex picks up the
  // offset. Confirms the offset's leading +/-/Z doesn't get sucked into
  // SSS's digit run. Parse-side pattern adds "zzz" for the same reason as
  // the test above.
  const original = zdt('2026-08-04T15:45:30.007+09:00[Asia/Tokyo]');
  const formatted = format(original, 'yyyy-MM-dd HH:mm:ss.SSSXXX');
  assert.equal(formatted, '2026-08-04 15:45:30.007+09:00');
  const reparsed = parse(`yyyy-MM-dd HH:mm:ss.SSSXXX'['zzz']'`, `${formatted}[Asia/Tokyo]`);
  assert.equal(reparsed.millisecond, 7);
  assert.equal(reparsed.offset, '+09:00');
});

// ---------- smoke: a real-world RFC-3339-style timestamp ----------

test('RFC-3339-style timestamp with XXX round-trips', () => {
  // The most common real-world shape: ISO 8601 / RFC 3339 with a colon
  // offset. XXX is the variant that matches it. format() output is
  // pinned to the exact RFC-3339-shaped string on its own (real RFC 3339
  // has no room for a zone name); the round-trip is checked separately
  // with "zzz" added, since an offset token alone no longer resolves to
  // a ZonedDateTime (see zone-required-for-zoneddatetime in
  // conformance/README.md) — a real caller round-tripping RFC 3339 text
  // would need to already know, or separately track, which zone it came
  // from.
  const original = zdt('2026-08-04T15:45:30.123-04:00[America/New_York]');
  const formatStr = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  const formatted = format(original, formatStr);
  assert.equal(formatted, '2026-08-04T15:45:30.123-04:00');
  const reparsed = parse(`${formatStr}'['zzz']'`, `${formatted}[America/New_York]`);
  assert.equal(reparsed.epochNanoseconds, original.epochNanoseconds);
});

test('ISO-8601 basic-format-style timestamp with XX round-trips (no separators)', () => {
  // XX is the no-colon form, used in ISO 8601 "basic" format (compact,
  // no separators). Less common than XXX but the LDML spec defines it,
  // so we support it for symmetry. Same format/parse split as the RFC
  // 3339 test above.
  const original = zdt('2026-08-04T15:45:30+09:00[Asia/Tokyo]');
  const formatStr = "yyyyMMdd'T'HHmmssXX";
  const formatted = format(original, formatStr);
  assert.equal(formatted, '20260804T154530+0900');
  const reparsed = parse(`${formatStr}'['zzz']'`, `${formatted}[Asia/Tokyo]`);
  assert.equal(reparsed.epochNanoseconds, original.epochNanoseconds);
});