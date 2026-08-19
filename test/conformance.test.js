import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, parse, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

const FIXTURES_URL = new URL('../conformance/fixtures.json', import.meta.url);
const fixtures = JSON.parse(readFileSync(fileURLToPath(FIXTURES_URL), 'utf8'));

// Everything in this set is a known, understood divergence from the
// fixture — not a design disagreement (those go through each case's own
// "opinionated" flag instead). These are real gaps, tracked as bugs, so
// the suite reports them as expected failures rather than clean passes
// or noisy unexplained ones. Write-up for each is in
// conformance/README.md under "Known divergences."
const KNOWN_FAILURES = new Set([
  // Same root cause, two symptoms: formatOffset() (src/tokens.ts)
  // assumes every offset string is exactly 6 chars (sign + HH + ':' +
  // MM) and never inspects a seconds component.
  'offset-sub-minute-rejected-by-X',    // X should throw on a sub-minute
                                          // offset instead of truncating it.
  'offset-sub-minute-passes-through-ZZ', // xxx should pass seconds through
                                          // instead of dropping them.

  // TOKENS (src/tokens.ts) has no 'y' — only 'yyyy'/'yy'. There's no way
  // to express an unpadded/variable-width year in a temporal-fmt
  // pattern, so fixtures using bare 'y' can't be adapted at all:
  'extreme-year-max-supported',
  'extreme-year-negative',
  // extreme-year-past-max-rejected also uses bare 'y' but isn't listed
  // here. It expects a throw, and "no valid pattern matches" for the
  // unrecognized 'y' token is technically a throw too — so it passes,
  // just for the wrong reason. A real 275761 CE rejection would throw
  // with a different message. Not currently failing, but not testing
  // what it claims to either. See conformance/README.md.

  // parse()'s offset-vs-zone cross-check (src/parse.ts, ~line 566) is
  // stricter than the fixture assumes. When a pattern captures both a
  // zone (zzz) and an offset token, temporal-fmt requires the offset to
  // match the zone's real offset at that instant and throws otherwise.
  // The fixture's source library goes the other way — it lets the zone
  // win and resolves the conflict silently. Neither approach is wrong,
  // but only one is implemented here:
  'dst-gap-offset-after-rejected',
  'dst-overlap-offset-selects-second',
  'dst-overlap-roundtrip-second-instant',

  // parse() can build a ZonedDateTime from an offset token with no zone
  // at all (the offsetString-only branch in src/parse.ts). That's by
  // design. The fixture assumes VV/zzz is always required.
  'zone-required-for-zoneddatetime',

  // Same offsetString-only branch: parse() accepts an offset token on a
  // PlainDateTime-shaped pattern when it can resolve to a fixed-offset
  // ZonedDateTime, rather than rejecting it outright.
  'zone-offset-token-rejected-on-plain-type',

  // Not fully root-caused. X-family parsing rejects a 4-digit offset
  // body ("+0530") before it ever reaches parseOffsetString's per-piece
  // checks, even though parseOffsetString itself allows it for X/x.
  // Best guess is the capturing regex for X in pattern.ts doesn't offer
  // the 4-digit shape as an alternative — but tracing pattern.ts's regex
  // construction was out of scope for adding this test folder.
  'offset-X-parse-accepts-four-digit',
]);

// This fixture set was written against a different library's token
// vocabulary. Two tokens don't exist in temporal-fmt at all:
//   ZZ  -> always-signed HH:MM offset, never "Z" for UTC. The closest
//          match is xxx (lowercase), NOT XXX. Per formatOffset() in
//          src/tokens.ts, only the uppercase X/XX/XXX family collapses
//          +00:00 to "Z" — lowercase never does, which is exactly ZZ's
//          "always numeric" semantics. First pass here mapped ZZ -> XXX
//          and got the UTC case wrong: offset-ZZ-format-utc-not-Z
//          expects "+00:00", XXX gives "Z". xxx is the correct match.
//   VV  -> IANA zone identifier. temporal-fmt's zzz token covers this.
// Quoted literal text (inside '...') must NOT be translated, only bare
// token runs. Everything else in the fixture set — yyyy, MM, dd, HH, mm,
// ss, S.., h, a, etc. — already matches temporal-fmt's vocabulary and
// needs nothing done to it.
function translatePattern(pattern) {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "'") {
      const end = pattern.indexOf("'", i + 1);
      const stop = end === -1 ? pattern.length : end + 1;
      out += pattern.slice(i, stop);
      i = stop;
      continue;
    }
    if (pattern.startsWith('ZZ', i)) {
      out += 'xxx';
      i += 2;
      continue;
    }
    if (pattern.startsWith('VV', i)) {
      out += 'zzz';
      i += 2;
      continue;
    }
    out += pattern[i];
    i += 1;
  }
  return out;
}

// Collected during the run and printed once at the end rather than
// per-case, so a scan of `opinionated: true` results doesn't get lost in
// the middle of normal test output.
const divergences = [];

function logDivergence(caseId, opinion, detail) {
  divergences.push({ caseId, opinion, detail });
}

function buildTemporalValue(from) {
  const { type, iso, calendar } = from;
  switch (type) {
    case 'PlainDate':
      return calendar
        ? Temporal.PlainDate.from(iso).withCalendar(calendar)
        : Temporal.PlainDate.from(iso);
    case 'PlainTime':
      return Temporal.PlainTime.from(iso);
    case 'PlainDateTime':
      return Temporal.PlainDateTime.from(iso);
    case 'ZonedDateTime':
      return Temporal.ZonedDateTime.from(iso);
    default:
      throw new Error(`conformance adapter: unhandled fixture "from.type" "${type}"`);
  }
}

// temporal-fmt has no error class hierarchy (parse/format both throw
// plain Error — see conformance/README.md). Every fixture "throws" name
// (ParseError/FormatError/InvalidPatternError) is treated as "any Error",
// since there's nothing more specific to check against.
function assertThrows(fn, caseId) {
  assert.throws(fn, Error, `${caseId}: expected a throw, got a value`);
}

function runCase(c) {
  const { id, op, expect: exp, opinionated, opinion } = c;
  const pattern = translatePattern(c.pattern);

  if (op === 'format') {
    const value = buildTemporalValue(c.from);
    if ('throws' in exp) {
      try {
        format(value, pattern);
      } catch (err) {
        assert.ok(err instanceof Error, `${id}: threw a non-Error`);
        return;
      }
      if (opinionated) {
        logDivergence(id, opinion, 'expected a throw, format() returned a value');
        return;
      }
      assert.fail(`${id}: expected format() to throw, it didn't`);
    }
    let output;
    try {
      output = format(value, pattern);
    } catch (err) {
      if (opinionated) {
        logDivergence(id, opinion, `format() threw unexpectedly: ${err.message}`);
        return;
      }
      throw err;
    }
    if (output !== exp.output) {
      if (opinionated) {
        logDivergence(id, opinion, `expected "${exp.output}", got "${output}"`);
        return;
      }
      assert.equal(output, exp.output, id);
    }
    return;
  }

  if (op === 'parse') {
    if ('throws' in exp) {
      try {
        parse(pattern, c.input);
      } catch (err) {
        assert.ok(err instanceof Error, `${id}: threw a non-Error`);
        return;
      }
      if (opinionated) {
        logDivergence(id, opinion, 'expected a throw, parse() returned a value');
        return;
      }
      assert.fail(`${id}: expected parse() to throw, it didn't`);
    }
    let result;
    try {
      result = parse(pattern, c.input);
    } catch (err) {
      if (opinionated) {
        logDivergence(id, opinion, `parse() threw unexpectedly: ${err.message}`);
        return;
      }
      throw err;
    }
    const actual = result.toString();
    if (actual !== exp.value) {
      if (opinionated) {
        logDivergence(id, opinion, `expected "${exp.value}", got "${actual}"`);
        return;
      }
      assert.equal(actual, exp.value, id);
    }
    if (exp.calendar) {
      assert.equal(result.calendarId ?? result.calendar, exp.calendar, `${id}: calendar mismatch`);
    }
    return;
  }

  if (op === 'roundtrip') {
    const value = buildTemporalValue(c.from);
    const formatted = format(value, pattern);
    const reparsed = parse(pattern, formatted);
    if (formatted !== exp.output) {
      if (opinionated) {
        logDivergence(id, opinion, `format() produced "${formatted}", expected "${exp.output}"`);
        return;
      }
      assert.equal(formatted, exp.output, `${id}: format() output mismatch`);
    }
    if (exp.equals) {
      const same = typeof reparsed.equals === 'function'
        ? reparsed.equals(value)
        : reparsed.toString() === value.toString();
      if (!same) {
        if (opinionated) {
          logDivergence(id, opinion, 'round-tripped value is not equal to the original');
          return;
        }
        assert.ok(same, `${id}: round-tripped value does not equal the original`);
      }
    }
    return;
  }

  throw new Error(`conformance adapter: unhandled op "${op}" in case "${id}"`);
}

for (const group of Object.keys(fixtures.groups)) {
  const casesInGroup = fixtures.cases.filter((c) => c.group === group);
  test(`conformance: ${group} — ${fixtures.groups[group]}`, async (t) => {
    for (const c of casesInGroup) {
      await t.test(c.id, () => {
        if (KNOWN_FAILURES.has(c.id)) {
          assert.throws(
            () => runCase(c),
            `${c.id}: was expected to still be failing (listed in KNOWN_FAILURES) but passed — ` +
            `remove it from KNOWN_FAILURES and from the "Known divergences" section of conformance/README.md.`
          );
          return;
        }
        runCase(c);
      });
    }
  });
}

test('conformance: fixture file sanity', () => {
  assert.ok(fixtures.cases.length > 0, 'fixtures.json has no cases');
  const ids = fixtures.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'fixtures.json has duplicate case ids');
  for (const c of fixtures.cases) {
    assert.ok(c.group in fixtures.groups, `case "${c.id}" references unknown group "${c.group}"`);
  }
});

test('conformance: divergence summary', () => {
  // Not a pass/fail check — this prints what it found for a human to read.
  // Always runs (even with zero divergences) so its absence from output
  // never looks like the check didn't run.
  if (divergences.length === 0) {
    return;
  }
  console.log(`\nconformance: ${divergences.length} opinionated-case divergence(s):`);
  for (const d of divergences) {
    console.log(`  - ${d.caseId}: ${d.detail}`);
    console.log(`    (${d.opinion})`);
  }
});
