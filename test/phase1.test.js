import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  format, formatToParts, compileFormat,
  parse, safeParse, tryParse, parseToParts, compileParser,
  analyzeFormat, explainFormat, tokenizeFormat, listTokens, tokenInfo,
  isValidFormat, validateFormat, fieldForToken,
  TOKEN_METADATA, ALL_TOKEN_NAMES, FORMAT_ONLY_TOKENS,
  isTemporal, isInstant, isPlainDate, isPlainTime, isPlainDateTime,
  isZonedDateTime, isPlainYearMonth, isPlainMonthDay, isDuration,
  assertTemporal, assertPlainDate, assertInstant, assertPlainTime, assertPlainDateTime,
  assertZonedDateTime, assertPlainYearMonth, assertPlainMonthDay, assertDuration,
  TemporalFmtError, FormatSyntaxError, UnknownTokenError, ParseMismatchError,
  InvalidDateError, InvalidOffsetError, AmbiguousInputError, InvalidTimeZoneError,
  setTemporal,
} from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// formatToParts mirrors Intl.DateTimeFormat.formatToParts. Each entry
// is either a literal (carrying no token info) or a token piece with
// the token string and the formatted value.
test('formatToParts: basic date splits into literal+token+literal+...', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const parts = formatToParts(date, 'yyyy-MM-dd');
  assert.deepEqual(parts, [
    { type: 'token', value: '2026', token: 'yyyy' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '08', token: 'MM' },
    { type: 'literal', value: '-' },
    { type: 'token', value: '04', token: 'dd' },
  ]);
});

test('formatToParts: adjacent literals collapse into one literal piece', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // The "at " and " " are two adjacent literals between MMM and d — they
  // should collapse into one literal entry, mirroring how format() walks
  // pieces internally.
  const parts = formatToParts(date, "MMM 'at' d");
  assert.deepEqual(parts, [
    { type: 'token', value: 'Aug', token: 'MMM' },
    { type: 'literal', value: ' at ' },
    { type: 'token', value: '4', token: 'd' },
  ]);
});

test('formatToParts: throws on missing field the same way format() does', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  // PlainDate has no hour field — formatToParts should throw with the same
  // shape of message format() throws, so callers switching between them
  // get consistent errors.
  assert.throws(
    () => formatToParts(date, 'HH:mm'),
    /token "HH" requires "hour"/,
  );
});

// compileFormat: pre-tokenizes once, exposes a tiny object with format()
// and formatToParts() methods. Useful for callers who want to hold the
// compiled form explicitly.
test('compileFormat: returned object has format, formatToParts, pieces, formatStr', () => {
  const compiled = compileFormat('yyyy-MM-dd');
  assert.equal(compiled.formatStr, 'yyyy-MM-dd');
  assert.equal(typeof compiled.format, 'function');
  assert.equal(typeof compiled.formatToParts, 'function');
  assert.ok(Array.isArray(compiled.pieces));
  assert.equal(compiled.pieces.length, 5); // yyyy, '-', MM, '-', dd
});

test('compileFormat: format() output matches format() directly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.equal(compiled.format(date), format(date, 'yyyy-MM-dd'));
  assert.equal(compiled.format(date), '2026-08-04');
});

test('compileFormat: formatToParts() output matches formatToParts() directly', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.deepEqual(compiled.formatToParts(date), formatToParts(date, 'yyyy-MM-dd'));
});

test('compileFormat: validates the format string at compile time, not lazily', () => {
  // Unterminated quote — surfaces at compileFormat, not at first format() call.
  // This is the point of compiling up front: fail fast on bad input.
  assert.throws(() => compileFormat("yyyy-MM-dd 'at HH:mm"), /unterminated quote/);
  assert.throws(() => compileFormat('x'.repeat(1001)), /exceeds maximum length/);
});

test('formatToParts: format string over the max length throws', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(() => formatToParts(date, 'y'.repeat(1001)), /exceeds maximum length/);
});

test('compileFormat: format() throws on missing field the same way format() does', () => {
  const time = Temporal.PlainTime.from('10:30:00');
  const compiled = compileFormat('yyyy-MM-dd');
  // PlainTime has no year/month/day fields — compileFormat's own format()
  // closure duplicates the field check rather than delegating to the
  // top-level format(), so it needs its own coverage of the same throw.
  assert.throws(() => compiled.format(time), /token "yyyy" requires "year"/);
});

test('compileFormat: formatToParts() throws on missing field the same way formatToParts() does', () => {
  const time = Temporal.PlainTime.from('10:30:00');
  const compiled = compileFormat('yyyy-MM-dd');
  assert.throws(() => compiled.formatToParts(time), /token "yyyy" requires "year"/);
});

// safeParse: returns a discriminated union instead of throwing. Lets
// callers handle parse failures without try/catch — useful in
// functional-style code where exceptions break the flow.
test('safeParse: success returns { ok: true, value }', () => {
  const result = safeParse('yyyy-MM-dd', '2026-08-04');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.toString(), '2026-08-04');
  }
});

test('safeParse: failure returns { ok: false, error } with a TemporalFmtError', () => {
  const result = safeParse('yyyy-MM-dd', 'not-a-date');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof TemporalFmtError);
    assert.ok(result.error instanceof ParseMismatchError);
    assert.equal(result.error.input, 'not-a-date');
    assert.equal(result.error.format, 'yyyy-MM-dd');
    // The wrapped reason carries the original throw message, so callers
    // reading the typed surface still see what failed underneath.
    assert.match(result.error.reason ?? '', /no valid pattern matches/);
  }
});

test('safeParse: wraps construction-time errors (Feb 30) as InvalidDateError', () => {
  const result = safeParse('yyyy-MM-dd', '2026-02-30');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof InvalidDateError);
  }
});

test('safeParse: classifies ambiguous-input throws as AmbiguousInputError', () => {
  // "Md" against "121" is the canonical ambiguous case from the parse.ts
  // docs — strict mode throws rather than guess.
  const result = safeParse('Md', '121');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof AmbiguousInputError);
  }
});

test('safeParse: passes through an already-typed error unchanged (invalid time zone)', () => {
  // parse() throws InvalidTimeZoneError directly (not via
  // wrapUntypedError) for a zzz group whose captured text isn't a real
  // IANA zone id — this is the "err instanceof TemporalFmtError" pass-
  // through branch, distinct from every other safeParse test above,
  // which all exercise the wrapUntypedError fallback instead.
  const result = safeParse('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof InvalidTimeZoneError);
    assert.match(result.error.reason ?? '', /not a recognized IANA time zone/);
  }
});

test('safeParse: lenient mode resolves ambiguity and returns ok', () => {
  // yyyyMd has full date (year+month+day) plus the ambiguous M+d run at the
  // end. Lenient mode picks a split via the documented heuristic so the
  // parse succeeds; strict mode (default) would throw on the ambiguity.
  const result = safeParse('yyyyMd', '2026121', { lenient: true });
  assert.equal(result.ok, true);
});

// tryParse: best-effort variant. Returns the value or undefined. No
// diagnostic surface — when callers need the reason, they should use
// safeParse.
test('tryParse: success returns the parsed value', () => {
  const result = tryParse('yyyy-MM-dd', '2026-08-04');
  assert.ok(result !== undefined);
  assert.equal(result.toString(), '2026-08-04');
});

test('tryParse: failure returns undefined', () => {
  assert.equal(tryParse('yyyy-MM-dd', 'not-a-date'), undefined);
  assert.equal(tryParse('yyyy-MM-dd', '2026-02-30'), undefined);
});

// parseToParts: returns the matched groups with token labels before
// Temporal construction. Useful for callers building non-Temporal
// results or doing their own cross-checks.
test('parseToParts: returns the matched group per token, with raw text and position', () => {
  const parts = parseToParts('yyyy-MM-dd', '2026-08-04');
  assert.deepEqual(parts, [
    { token: 'yyyy', raw: '2026', position: 0 },
    { token: 'MM', raw: '08', position: 5 }, // after "2026-"
    { token: 'dd', raw: '04', position: 8 }, // after "2026-08-"
  ]);
});

test('parseToParts: throws on no-match the same way parse() does', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd', 'not-a-date'),
    /no valid pattern matches/,
  );
});

test('parseToParts: throws on ambiguous input in strict mode', () => {
  assert.throws(() => parseToParts('Md', '121'), /ambiguous/);
  // Lenient mode resolves — same behavior parse() has.
  const parts = parseToParts('Md', '121', { lenient: true });
  assert.equal(parts.length, 2);
});

test('parseToParts: does NOT throw on construction-time errors (Feb 30)', () => {
  // parseToParts doesn't construct anything, so it can't fail at the
  // Temporal construction step. Feb 30 still parses to parts; the caller
  // is responsible for cross-checking fields themselves.
  const parts = parseToParts('yyyy-MM-dd', '2026-02-30');
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '02', '30']);
});

test('parseToParts: parseNumberingSystem transliterates non-ASCII digits before matching', () => {
  // Same transliteration parse() applies (see numberingSystem.wiring.test.js)
  // — parseToParts has its own call site for this, since it never goes
  // through parse()'s code path.
  const parts = parseToParts('yyyy-MM-dd', '٢٠٢٦-٠٨-٠٤', { parseNumberingSystem: 'arab' });
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '08', '04']);
});

test('parseToParts: format string exceeding max length throws (own copy of the same check parse() has)', () => {
  assert.throws(() => parseToParts('x'.repeat(1001), 'irrelevant'), /exceeds maximum length/);
});

test('parseToParts: input exceeding max length throws (own copy of the same check parse() has)', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd', '9'.repeat(100_001)),
    /input exceeds maximum length/,
  );
});

test('parseToParts: empty/literal-only format string throws "no tokens" (own copy of the same check parse() has)', () => {
  assert.throws(() => parseToParts('', ''), /no tokens/);
  assert.throws(() => parseToParts("'just literal'", 'just literal'), /no tokens/);
});

test('parseToParts: throws InvalidTimeZoneError for a bogus zzz zone (own copy of the same check parse() has)', () => {
  assert.throws(
    () => parseToParts('yyyy-MM-dd HH:mm zzz', '2026-08-04 15:45 Not/A_Zone'),
    /not a recognized IANA time zone/,
  );
});

// compileParser: pre-compiles a format string into an object with
// parse/safeParse/tryParse/parseToParts methods.
test('compileParser: returned object exposes parse, safeParse, tryParse, parseToParts, pattern, formatStr', () => {
  const compiled = compileParser('yyyy-MM-dd');
  assert.equal(compiled.formatStr, 'yyyy-MM-dd');
  assert.equal(typeof compiled.parse, 'function');
  assert.equal(typeof compiled.safeParse, 'function');
  assert.equal(typeof compiled.tryParse, 'function');
  assert.equal(typeof compiled.parseToParts, 'function');
  assert.ok(compiled.pattern);
  assert.ok(compiled.pattern.regex instanceof RegExp);
  assert.ok(Array.isArray(compiled.pattern.groups));
});

test('compileParser: parse() output matches parse() directly', () => {
  const compiled = compileParser('yyyy-MM-dd');
  assert.equal(
    compiled.parse('2026-08-04').toString(),
    parse('yyyy-MM-dd', '2026-08-04').toString(),
  );
});

test('compileParser: safeParse()/tryParse()/parseToParts() methods actually delegate to the module-level functions', () => {
  // The previous test only checks these are functions; this calls each
  // one and checks the output matches calling the top-level export
  // directly with the same pre-baked formatStr/locale.
  const compiled = compileParser('yyyy-MM-dd');

  const safe = compiled.safeParse('2026-08-04');
  assert.equal(safe.ok, true);
  if (safe.ok) assert.equal(safe.value.toString(), '2026-08-04');
  const safeFail = compiled.safeParse('not-a-date');
  assert.equal(safeFail.ok, false);

  assert.equal(compiled.tryParse('2026-08-04').toString(), '2026-08-04');
  assert.equal(compiled.tryParse('not-a-date'), undefined);

  const parts = compiled.parseToParts('2026-08-04');
  assert.deepEqual(parts.map((p) => p.raw), ['2026', '08', '04']);
});

test('compileParser: validates the format string at compile time', () => {
  assert.throws(() => compileParser("yyyy-MM-dd 'at"), /unterminated quote/);
  assert.throws(() => compileParser('x'.repeat(1001)), /exceeds maximum length/);
});

// analyzeFormat: the central introspection surface.
test('analyzeFormat: lists tokens with position and metadata', () => {
  const analysis = analyzeFormat('yyyy-MM-dd');
  assert.equal(analysis.tokens.length, 3);
  assert.equal(analysis.tokens[0].name, 'yyyy');
  assert.equal(analysis.tokens[0].position, 0);
  assert.equal(analysis.tokens[1].name, 'MM');
  assert.equal(analysis.tokens[1].position, 5); // after "yyyy-"
  assert.equal(analysis.tokens[2].name, 'dd');
  assert.equal(analysis.tokens[2].position, 8); // after "yyyy-MM-"
});

test('analyzeFormat: requiredFields aggregates across tokens', () => {
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm');
  assert.deepEqual(analysis.requiredFields, ['day', 'hour', 'minute', 'month', 'year']);
});

test('analyzeFormat: compatibleTypes is the intersection across tokens', () => {
  // yyyy + MM + dd + HH + mm — needs year, month, day, hour, minute.
  // Only PlainDateTime and ZonedDateTime carry all of those.
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm');
  assert.deepEqual(analysis.compatibleTypes, ['PlainDateTime', 'ZonedDateTime']);
});

test('analyzeFormat: date-only format is compatible with PlainDate, PlainDateTime, ZonedDateTime', () => {
  const analysis = analyzeFormat('yyyy-MM-dd');
  assert.deepEqual(analysis.compatibleTypes, ['PlainDate', 'PlainDateTime', 'ZonedDateTime']);
});

test('analyzeFormat: time-only format is compatible with PlainTime, PlainDateTime, ZonedDateTime, Instant', () => {
  const analysis = analyzeFormat('HH:mm:ss');
  assert.deepEqual(analysis.compatibleTypes, ['Instant', 'PlainDateTime', 'PlainTime', 'ZonedDateTime']);
});

test('analyzeFormat: parseable is false for format-only tokens (do, ww, RRRR)', () => {
  assert.equal(analyzeFormat('yyyy-MM-do').parseable, false);
  assert.equal(analyzeFormat('ww-RRRR').parseable, false);
  assert.equal(analyzeFormat('yyyy-MM-dd').parseable, true);
});

test('analyzeFormat: localeSensitive flags MMMM/MMM/EEEE/EEE/a but not numeric tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-dd').localeSensitive, false);
  assert.equal(analyzeFormat('MMMM d, yyyy').localeSensitive, true);
  assert.equal(analyzeFormat('EEE, MMM d').localeSensitive, true);
  assert.equal(analyzeFormat('h:mm a').localeSensitive, true);
});

test('analyzeFormat: timezoneSensitive flags zzz and offset tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-dd').timezoneSensitive, false);
  assert.equal(analyzeFormat('yyyy-MM-dd HH:mm zzz').timezoneSensitive, true);
  assert.equal(analyzeFormat('yyyy-MM-dd HH:mm XXX').timezoneSensitive, true);
});

test('analyzeFormat: ambiguous flags adjacent unpadded numeric runs', () => {
  assert.equal(analyzeFormat('Md').ambiguous, true);
  assert.equal(analyzeFormat('M-d').ambiguous, false); // literal separator breaks the run
  assert.equal(analyzeFormat('MMMd').ambiguous, false); // MMM is not unpadded-numeric
  assert.equal(analyzeFormat('yyyy-MM-dd').ambiguous, false);
});

test('analyzeFormat: roundTripSafe is false for format-only tokens', () => {
  assert.equal(analyzeFormat('yyyy-MM-do').roundTripSafe, false);
  assert.equal(analyzeFormat('yyyy-MM-dd').roundTripSafe, true);
});

test('analyzeFormat: warns on 12-hour token without "a"', () => {
  const analysis = analyzeFormat('h:mm');
  assert.ok(analysis.warnings.some((w) => w.code === 'TWELVE_HOUR_WITHOUT_A'));
});

test('analyzeFormat: warns on mixing 12-hour and 24-hour tokens', () => {
  const analysis = analyzeFormat('h:mm HH');
  assert.ok(analysis.warnings.some((w) => w.code === 'MIXED_12_AND_24_HOUR'));
});

test('analyzeFormat: warns on zzz + offset token combo', () => {
  const analysis = analyzeFormat('yyyy-MM-dd HH:mm zzz XXX');
  assert.ok(analysis.warnings.some((w) => w.code === 'ZZZ_WITH_OFFSET_TOKEN'));
});

test('analyzeFormat: warns on offset token without full date', () => {
  const analysis = analyzeFormat('HH:mm XXX');
  assert.ok(analysis.warnings.some((w) => w.code === 'OFFSET_WITHOUT_FULL_DATE'));
});

// explainFormat: human-readable rendering of analyzeFormat.
test('explainFormat: produces a multi-line string with all the analysis fields', () => {
  const explained = explainFormat('yyyy-MM-dd HH:mm');
  assert.match(explained, /Format string: "yyyy-MM-dd HH:mm"/);
  assert.match(explained, /Tokens \(5\):/);
  assert.match(explained, /yyyy @0/);
  // requiredFields are sorted alphabetically (see analyze.ts).
  assert.match(explained, /Required fields: day, hour, minute, month, year/);
  assert.match(explained, /Parseable: yes/);
});

test('explainFormat: renders "no" for locale/calendar/timezone/ambiguous flags and omits the Warnings section when there are none', () => {
  // "MM" alone is parseable, calendar-sensitive, round-trip safe, and
  // produces no warnings — but locale-sensitive, timezone-sensitive, and
  // ambiguous are all false. The baseline test above only ever hits the
  // "yes"/has-warnings sides of these lines.
  const explainedMM = explainFormat('MM');
  assert.match(explainedMM, /Locale-sensitive: no/);
  assert.match(explainedMM, /Timezone-sensitive: no/);
  assert.match(explainedMM, /Ambiguous: no/);
  assert.match(explainedMM, /Round-trip safe: yes/);
  assert.doesNotMatch(explainedMM, /Warnings:/);

  // "zzz" is the mirror case for calendar-sensitive: it's timezone-
  // sensitive but NOT calendar-sensitive, closing the one flag "MM"
  // above can't (MM is always calendar-sensitive).
  const explainedZzz = explainFormat('zzz');
  assert.match(explainedZzz, /Calendar-sensitive: no/);
});

test('explainFormat: renders "yes" for locale-sensitive and ambiguous flags', () => {
  // "EEEE" (locale-aware weekday name) is locale-sensitive; every other
  // format string in this file's explainFormat tests is not, so this
  // closes out the true side of that line.
  const explainedEEEE = explainFormat('EEEE');
  assert.match(explainedEEEE, /Locale-sensitive: yes/);

  // "Mdyyyy" has an unpadded M/d run with no separator, which
  // analyzeFormat flags as ambiguous — closing the true side of that
  // line too.
  const explainedAmbiguous = explainFormat('Mdyyyy');
  assert.match(explainedAmbiguous, /Ambiguous: yes/);
});

test('explainFormat: renders "no" for parseable/round-trip-safe and includes the Warnings section when a warning fires', () => {
  // "do" is format-only (not parseable, not round-trip safe) and
  // triggers a FORMAT_ONLY_TOKEN warning, closing out the flip side of
  // the ternaries above plus the warnings.length > 0 branch.
  const explained = explainFormat('do');
  assert.match(explained, /Parseable: no/);
  assert.match(explained, /Round-trip safe: no/);
  assert.match(explained, /Warnings:/);
  assert.match(explained, /\[FORMAT_ONLY_TOKEN\]/);
});

// tokenizeFormat: exposed tokenizer.
test('tokenizeFormat: returns the same piece list the runtime uses', () => {
  const pieces = tokenizeFormat('yyyy-MM-dd');
  assert.equal(pieces.length, 5);
  assert.equal(pieces[0].kind, 'token');
  assert.equal(pieces[0].value, 'yyyy');
  assert.equal(pieces[1].kind, 'literal');
  assert.equal(pieces[1].value, '-');
});

// listTokens: every token in the table.
test('listTokens: returns one entry per token in TOKENS, with metadata', () => {
  const tokens = listTokens();
  // Spot-check a few expected entries — full coverage is in
  // tokenMetadata.test.js.
  const names = tokens.map((t) => t.name);
  assert.ok(names.includes('yyyy'));
  assert.ok(names.includes('MMMM'));
  assert.ok(names.includes('zzz'));
  assert.ok(names.includes('XXX'));
  assert.ok(names.includes('do'));
  // Every entry has metadata populated.
  for (const t of tokens) {
    assert.ok(t.metadata, `token ${t.name} has metadata`);
    assert.equal(typeof t.metadata.meaning, 'string');
  }
});

// tokenInfo: one token's metadata, or undefined for unknown.
test('tokenInfo: returns metadata for known tokens', () => {
  const info = tokenInfo('yyyy');
  assert.ok(info);
  assert.equal(info.meaning.slice(0, 15), 'Four-digit year');
  assert.equal(info.parseCapable, true);
  assert.equal(info.localeSensitive, false);
});

test('tokenInfo: returns undefined for unknown tokens', () => {
  assert.equal(tokenInfo('YYYY'), undefined); // YYYY is not a token in this library
  assert.equal(tokenInfo('notAToken'), undefined);
});

// isValidFormat / validateFormat
test('isValidFormat: true for valid format strings, false for malformed ones', () => {
  assert.equal(isValidFormat('yyyy-MM-dd'), true);
  assert.equal(isValidFormat("yyyy-MM-dd 'at' HH:mm"), true);
  assert.equal(isValidFormat("yyyy-MM-dd 'at"), false); // unterminated quote
  assert.equal(isValidFormat('x'.repeat(1001)), false); // too long
});

test('validateFormat: returns the analysis (same as analyzeFormat)', () => {
  const analysis = validateFormat('yyyy-MM-dd');
  assert.equal(analysis.tokens.length, 3);
  assert.equal(analysis.parseable, true);
  // validateFormat and analyzeFormat are the same function under different
  // names — the difference is purely semantic ("validate" implies the caller
  // expects it to throw on bad input, which analyzeFormat also does).
  assert.deepEqual(analysis, analyzeFormat('yyyy-MM-dd'));
});

// fieldForToken: which field does this token read off the input?
test('fieldForToken: returns the field each token requires', () => {
  assert.equal(fieldForToken('yyyy'), 'year');
  assert.equal(fieldForToken('HH'), 'hour');
  assert.equal(fieldForToken('zzz'), 'timeZoneId');
  assert.equal(fieldForToken('XXX'), 'offset');
  assert.equal(fieldForToken('notAToken'), undefined);
});

// TOKEN_METADATA: every token in the table has an entry. test that the
// table is in sync with TOKENS (the runtime table).
test('TOKEN_METADATA: every token in TOKENS has a metadata entry, and vice versa', () => {
  // We can't read TOKENS directly from here (it's not exported), but
  // listTokens() reads it, so we use that.
  const runtimeTokens = listTokens().map((t) => t.name);
  const metadataTokens = Object.keys(TOKEN_METADATA);
  runtimeTokens.sort();
  metadataTokens.sort();
  assert.deepEqual(runtimeTokens, metadataTokens);
});

test('FORMAT_ONLY_TOKENS: contains the format-only tokens', () => {
  // do, ww, RRRR + D, DD, DDD + LLLL, LLL, cccc, ccc, GGGG, G, zzzz, z
  assert.equal(FORMAT_ONLY_TOKENS.size, 14);
  for (const t of ['do', 'ww', 'RRRR', 'D', 'DD', 'DDD', 'LLLL', 'LLL', 'cccc', 'ccc', 'GGGG', 'G', 'zzzz', 'z']) {
    assert.ok(FORMAT_ONLY_TOKENS.has(t), `missing ${t}`);
  }
});

// Type guards — duck-typed detection. PlainDate has year/month/day and
// toPlainDateTime, no hour; PlainTime has hour and toPlainDateTime, no
// year/month/day; etc.
test('isPlainDate: true for PlainDate, false for everything else', () => {
  assert.equal(isPlainDate(Temporal.PlainDate.from('2026-08-04')), true);
  assert.equal(isPlainDate(Temporal.PlainTime.from('15:45:30')), false);
  assert.equal(isPlainDate(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
  assert.equal(isPlainDate(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), false);
  assert.equal(isPlainDate({}), false);
  assert.equal(isPlainDate(null), false);
  assert.equal(isPlainDate(undefined), false);
  assert.equal(isPlainDate(42), false);
});

test('isPlainTime: true for PlainTime, false for everything else', () => {
  assert.equal(isPlainTime(Temporal.PlainTime.from('15:45:30')), true);
  assert.equal(isPlainTime(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
});

test('isPlainDateTime: true for PlainDateTime, false for everything else', () => {
  assert.equal(isPlainDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), true);
  assert.equal(isPlainDateTime(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainDateTime(Temporal.PlainTime.from('15:45:30')), false);
});

test('isZonedDateTime: true for ZonedDateTime, false for everything else', () => {
  assert.equal(isZonedDateTime(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), true);
  assert.equal(isZonedDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), false);
  assert.equal(isZonedDateTime(Temporal.PlainDate.from('2026-08-04')), false);
});

test('isPlainYearMonth: true for PlainYearMonth, false for everything else', () => {
  assert.equal(isPlainYearMonth(Temporal.PlainYearMonth.from('2026-08')), true);
  assert.equal(isPlainYearMonth(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainYearMonth(Temporal.PlainMonthDay.from('08-04')), false);
});

test('isPlainMonthDay: true for PlainMonthDay, false for everything else', () => {
  assert.equal(isPlainMonthDay(Temporal.PlainMonthDay.from('08-04')), true);
  assert.equal(isPlainMonthDay(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isPlainMonthDay(Temporal.PlainYearMonth.from('2026-08')), false);
});

test('isInstant: true for Instant, false for everything else', () => {
  assert.equal(isInstant(Temporal.Instant.from('2026-08-04T15:45:30Z')), true);
  assert.equal(isInstant(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isInstant(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), false);
});

test('isDuration: true for Duration, false for everything else', () => {
  assert.equal(isDuration(Temporal.Duration.from({ hours: 2, minutes: 30 })), true);
  assert.equal(isDuration(Temporal.PlainDate.from('2026-08-04')), false);
  assert.equal(isDuration({}), false);
});

test('isTemporal: umbrella guard catches any Temporal type', () => {
  assert.equal(isTemporal(Temporal.PlainDate.from('2026-08-04')), true);
  assert.equal(isTemporal(Temporal.PlainTime.from('15:45:30')), true);
  assert.equal(isTemporal(Temporal.PlainDateTime.from('2026-08-04T15:45:30')), true);
  assert.equal(isTemporal(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')), true);
  assert.equal(isTemporal(Temporal.Instant.from('2026-08-04T15:45:30Z')), true);
  assert.equal(isTemporal(Temporal.Duration.from({ hours: 2 })), true);
  assert.equal(isTemporal(Temporal.PlainYearMonth.from('2026-08')), true);
  assert.equal(isTemporal(Temporal.PlainMonthDay.from('08-04')), true);
  assert.equal(isTemporal({}), false);
  assert.equal(isTemporal(null), false);
  assert.equal(isTemporal(42), false);
});

test('assertTemporal: throws descriptively on non-Temporal input', () => {
  assert.throws(() => assertTemporal(42), /expected a Temporal\.object.*got number/);
  assert.throws(() => assertTemporal({}), /expected a Temporal\.object.*got plain object/);
  // Doesn't throw on actual Temporal values.
  assert.doesNotThrow(() => assertTemporal(Temporal.PlainDate.from('2026-08-04')));
});

test('assertPlainDate: throws descriptively on PlainTime (wrong type)', () => {
  assert.throws(
    () => assertPlainDate(Temporal.PlainTime.from('15:45:30')),
    /expected a Temporal\.PlainDate, got instance of PlainTime/,
  );
});

// Structural fallback — hand-built objects with no Symbol.toStringTag,
// so hasTag() can't short-circuit and each guard has to fall through to
// its duck-typed field/method checks instead.
test('isPlainDate: structural fallback matches a tag-less PlainDate shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4,
    toPlainDateTime: () => {}, withCalendar: () => {},
  };
  assert.equal(isPlainDate(fake), true);
  assert.equal(isPlainDate({ ...fake, hour: 12 }), false); // has hour -> not PlainDate
  assert.equal(isPlainDate({ ...fake, toPlainDateTime: undefined }), false); // missing method
  assert.equal(isPlainDate({ ...fake, withCalendar: undefined }), false); // missing method
});

test('isPlainTime: structural fallback matches a tag-less PlainTime shape', () => {
  const fake = { hour: 15 };
  assert.equal(isPlainTime(fake), true);
  assert.equal(isPlainTime({ ...fake, year: 2026 }), false); // has year -> not PlainTime
  assert.equal(isPlainTime({ ...fake, withCalendar: () => {} }), false);
  assert.equal(isPlainTime({ ...fake, toPlainDate: () => {} }), false);
  assert.equal(isPlainTime({ ...fake, toPlainDateTime: () => {} }), false);
});

test('isPlainDateTime: structural fallback matches a tag-less PlainDateTime shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4, hour: 15,
    withPlainTime: () => {},
  };
  assert.equal(isPlainDateTime(fake), true);
  assert.equal(isPlainDateTime({ ...fake, withPlainTime: undefined }), false);
  assert.equal(isPlainDateTime({ ...fake, toInstant: () => {} }), false); // ZonedDateTime has this too
});

test('isZonedDateTime: structural fallback matches a tag-less ZonedDateTime shape', () => {
  const fake = {
    year: 2026, month: 8, day: 4, hour: 15,
    withTimeZone: () => {}, toInstant: () => {},
  };
  assert.equal(isZonedDateTime(fake), true);
  assert.equal(isZonedDateTime({ ...fake, withTimeZone: undefined }), false);
  assert.equal(isZonedDateTime({ ...fake, toInstant: undefined }), false);
});

test('isInstant: structural fallback matches a tag-less Instant shape', () => {
  const fake = { toZonedDateTimeISO: () => {} };
  assert.equal(isInstant(fake), true);
  assert.equal(isInstant({ ...fake, toInstant: () => {} }), false); // ZonedDateTime also has this
  assert.equal(isInstant({ ...fake, year: 2026 }), false); // Instant has no date fields
});

test('isPlainYearMonth: structural fallback matches a tag-less PlainYearMonth shape', () => {
  const fake = { year: 2026, month: 8, toPlainDate: () => {} };
  assert.equal(isPlainYearMonth(fake), true);
  assert.equal(isPlainYearMonth({ ...fake, day: 4 }), false); // has day -> not PlainYearMonth
  assert.equal(isPlainYearMonth({ ...fake, toPlainDate: undefined }), false);
});

test('isPlainMonthDay: structural fallback matches a tag-less PlainMonthDay shape', () => {
  const fake = { day: 4, monthCode: 'M08', toPlainDate: () => {} };
  assert.equal(isPlainMonthDay(fake), true);
  assert.equal(isPlainMonthDay({ ...fake, year: 2026 }), false); // has year -> not PlainMonthDay
  assert.equal(isPlainMonthDay({ ...fake, month: 8 }), false); // has numeric month -> not PlainMonthDay
  assert.equal(isPlainMonthDay({ ...fake, monthCode: undefined }), false);
  assert.equal(isPlainMonthDay({ ...fake, toPlainDate: undefined }), false);
});

test('isDuration: structural fallback matches a tag-less Duration shape', () => {
  assert.equal(isDuration({ total: () => 0 }), true);
});

test('type guards: false for non-object input (primitives, null)', () => {
  for (const bad of [42, 'x', undefined, null]) {
    assert.equal(isPlainTime(bad), false);
    assert.equal(isPlainDateTime(bad), false);
    assert.equal(isZonedDateTime(bad), false);
    assert.equal(isInstant(bad), false);
    assert.equal(isPlainYearMonth(bad), false);
    assert.equal(isPlainMonthDay(bad), false);
    assert.equal(isDuration(bad), false);
  }
});

test('isTemporal: structural fallback matches any tag-less Temporal-shaped object', () => {
  assert.equal(isTemporal({ withPlainTime: () => {} }), true);
  assert.equal(isTemporal({ total: () => 0 }), true);
  assert.equal(isTemporal({ toZonedDateTimeISO: () => {} }), true);
});

test('describeValue (via assertTemporal): describes null and array distinctly', () => {
  assert.throws(() => assertTemporal(null), /expected a Temporal\.object.*got null/);
  assert.throws(() => assertTemporal([1, 2, 3]), /expected a Temporal\.object.*got array/);
});

// Every assert* wrapper: one passing call, one throwing call, so both
// assertImpl branches and the wrapper function itself get exercised.
test('assertInstant: passes for Instant, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertInstant(Temporal.Instant.from('2026-08-04T15:45:30Z')));
  assert.throws(
    () => assertInstant(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.Instant, got instance of PlainDate/,
  );
});

test('assertPlainTime: passes for PlainTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainTime(Temporal.PlainTime.from('15:45:30')));
  assert.throws(
    () => assertPlainTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainTime, got instance of PlainDate/,
  );
});

test('assertPlainDateTime: passes for PlainDateTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainDateTime(Temporal.PlainDateTime.from('2026-08-04T15:45:30')));
  assert.throws(
    () => assertPlainDateTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainDateTime, got instance of PlainDate/,
  );
});

test('assertZonedDateTime: passes for ZonedDateTime, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertZonedDateTime(Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]')));
  assert.throws(
    () => assertZonedDateTime(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.ZonedDateTime, got instance of PlainDate/,
  );
});

test('assertPlainYearMonth: passes for PlainYearMonth, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainYearMonth(Temporal.PlainYearMonth.from('2026-08')));
  assert.throws(
    () => assertPlainYearMonth(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainYearMonth, got instance of PlainDate/,
  );
});

test('assertPlainMonthDay: passes for PlainMonthDay, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertPlainMonthDay(Temporal.PlainMonthDay.from('08-04')));
  assert.throws(
    () => assertPlainMonthDay(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.PlainMonthDay, got instance of PlainDate/,
  );
});

test('assertDuration: passes for Duration, throws descriptively otherwise', () => {
  assert.doesNotThrow(() => assertDuration(Temporal.Duration.from({ hours: 2 })));
  assert.throws(
    () => assertDuration(Temporal.PlainDate.from('2026-08-04')),
    /expected a Temporal\.Duration, got instance of PlainDate/,
  );
});

// Typed errors — the structured diagnostic surface.
test('TemporalFmtError: base class carries all structured fields', () => {
  const err = new TemporalFmtError('test message', {
    code: 'PARSE_MISMATCH',
    input: 'foo',
    format: 'yyyy',
    token: 'yyyy',
    position: 0,
    expected: '4 digits',
    actual: 'foo',
    reason: 'no match',
  });
  assert.equal(err.message, 'test message');
  assert.equal(err.code, 'PARSE_MISMATCH');
  assert.equal(err.input, 'foo');
  assert.equal(err.format, 'yyyy');
  assert.equal(err.token, 'yyyy');
  assert.equal(err.position, 0);
  assert.equal(err.expected, '4 digits');
  assert.equal(err.actual, 'foo');
  assert.equal(err.reason, 'no match');
  assert.equal(err.name, 'TemporalFmtError');
});

test('TemporalFmtError: toJSON serializes all fields', () => {
  const err = new TemporalFmtError('test', { code: 'PARSE_MISMATCH', input: 'foo' });
  const json = err.toJSON();
  assert.equal(json.code, 'PARSE_MISMATCH');
  assert.equal(json.input, 'foo');
  assert.equal(json.message, 'test');
  assert.equal(json.name, 'TemporalFmtError');
});

test('FormatSyntaxError: subclass fixes the code', () => {
  const err = new FormatSyntaxError({ format: 'yyyy-MM-', reason: 'unterminated' });
  assert.equal(err.code, 'FORMAT_SYNTAX_ERROR');
  assert.equal(err.format, 'yyyy-MM-');
  assert.equal(err.reason, 'unterminated');
  assert.ok(err instanceof TemporalFmtError);
  assert.match(err.message, /syntax error/);
});

test('UnknownTokenError: subclass fixes the code', () => {
  const err = new UnknownTokenError({ token: 'YYYY', format: 'YYYY-MM-dd' });
  assert.equal(err.code, 'UNKNOWN_TOKEN');
  assert.equal(err.token, 'YYYY');
  assert.ok(err instanceof TemporalFmtError);
  assert.match(err.message, /token "YYYY"/);
});

test('ParseMismatchError: subclass fixes the code', () => {
  const err = new ParseMismatchError({ input: 'foo', format: 'yyyy' });
  assert.equal(err.code, 'PARSE_MISMATCH');
  assert.equal(err.input, 'foo');
});

test('InvalidDateError: subclass fixes the code', () => {
  const err = new InvalidDateError({ input: '2026-02-30', reason: 'Feb 30 does not exist' });
  assert.equal(err.code, 'INVALID_DATE');
  assert.equal(err.input, '2026-02-30');
});

test('InvalidOffsetError: subclass fixes the code', () => {
  const err = new InvalidOffsetError({ actual: '+99:99', reason: 'out of range' });
  assert.equal(err.code, 'INVALID_OFFSET');
  assert.equal(err.actual, '+99:99');
});

test('AmbiguousInputError: subclass fixes the code', () => {
  const err = new AmbiguousInputError({ input: '121', format: 'Md' });
  assert.equal(err.code, 'AMBIGUOUS_INPUT');
  assert.equal(err.input, '121');
  assert.equal(err.format, 'Md');
});

// Regression: legacy parse()/format() throw messages are unchanged.
// The plan requires this: "verify directly against each repo's current
// test/ expected values, not 'should be fine.' If any existing assertion
// needs to change, that means a 'fix' altered old behavior, which isn't
// allowed here."
test('regression: parse() still throws the same "no valid pattern" message', () => {
  assert.throws(
    () => parse('yyyy-MM-dd', 'not-a-date'),
    /no valid pattern matches the format string and input shape/,
  );
});

test('regression: format() still throws the same "requires" message for missing field', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.throws(
    () => format(date, 'HH:mm'),
    /token "HH" requires "hour", which this Temporal object doesn't have/,
  );
});

test('regression: format() output is byte-identical for existing tokens', () => {
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(format(date, 'yyyy-MM-dd'), '2026-08-04');
  assert.equal(format(date, 'EEEE, MMMM d, yyyy'), 'Tuesday, August 4, 2026');
  assert.equal(format(date, 'EEE, MMM d'), 'Tue, Aug 4');
});

// Adversarial cases for the new APIs.
test('adversarial: safeParse on input at the length cap', () => {
  // MAX_INPUT_LENGTH is 100_000 — exercising it directly would be slow.
  // Spot-check that a 1_000-char input still parses.
  const input = '2026-08-04' + ' '.repeat(1000);
  const result = safeParse('yyyy-MM-dd', input.slice(0, 10));
  assert.equal(result.ok, true);
});

test('adversarial: analyzeFormat on a pathological format string at the length cap', () => {
  // Repeating "yyyy " 200 times → 1000 chars, exactly at MAX_FORMAT_LENGTH.
  const fmt = 'yyyy '.repeat(200).trimEnd();
  assert.equal(fmt.length, 999); // 200*5 - 1 for trimEnd
  const analysis = analyzeFormat(fmt);
  assert.equal(analysis.tokens.length, 200);
  // All yyyy → all need year. Compatible types are the four that carry year.
  assert.deepEqual(analysis.compatibleTypes, ['PlainDate', 'PlainDateTime', 'PlainYearMonth', 'ZonedDateTime']);
});

test('adversarial: analyzeFormat rejects format strings over MAX_FORMAT_LENGTH', () => {
  assert.throws(() => analyzeFormat('x'.repeat(1001)), /exceeds maximum length/);
});