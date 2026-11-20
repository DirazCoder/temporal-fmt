import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../src/temporalProvider.js';
import { format, formatToParts } from '../src/format.js';
import { FormatSyntaxError } from '../src/errors.js';
import { TOKENS } from '../src/tokens.js';
import { tokenFragment } from '../src/pattern.js';

setTemporal(Temporal);

// node --test in test/offset.test.js exercises the public API end-to-end
// against the dist build. These go straight at the internals so a
// regression in formatOffset / parseOffsetString / OFFSET_SHAPES surfaces
// at the level it actually lives at, not three layers up as a wrong date
// string in the node:test suite.

describe('TOKENS table: offset tokens are registered correctly', () => {
  // Find every offset variant in TOKENS and verify its registration tuple
  // matches what format.ts/format.ts expect. A future refactor that
  // accidentally changes the field name or handler signature would
  // otherwise only show up downstream.
  const offsetTokens = TOKENS.filter(([tok]) =>
    ['X', 'XX', 'XXX', 'x', 'xx', 'xxx'].includes(tok)
  );

  it('all six offset variants are registered', () => {
    expect(new Set(offsetTokens.map(([tok]) => tok))).toEqual(
      new Set(['X', 'XX', 'XXX', 'x', 'xx', 'xxx'])
    );
  });

  it('every offset token targets the "offset" field (so format() throws on non-ZonedDateTime)', () => {
    // The ZonedDateTime-only validation happens because format() checks
    // `temporal[handler.field] === undefined` — so the field name has to
    // be exactly 'offset' for PlainDate/PlainTime/PlainDateTime to throw
    // the "requires offset" error rather than silently producing
    // undefined.
    for (const [tok, , field] of offsetTokens) {
      expect(field, `${tok}'s field should be 'offset'`).toBe('offset');
    }
  });

  it('every offset token has a function handler (not a string or other shape)', () => {
    for (const [tok, handler] of offsetTokens) {
      expect(typeof handler, `${tok}'s handler should be a function`).toBe('function');
    }
  });
});

describe('OFFSET_SHAPES via tokenFragment: each variant matches its own formatted output', () => {
  // The shape a token uses to parse has to accept the same text the
  // format side produces, or round-trips silently fail. Check every
  // variant against the literal its handler emits for both UTC and a
  // representative non-UTC offset — that's the contract that makes
  // format->parse round-trips work.
  //
  // Doesn't construct real Temporal values (these are unit tests of the
  // pattern machinery, not end-to-end behavior) — just feeds the regex
  // fragment a representative string and checks it matches with no
  // leftover characters.

  // Helper: take a token's regex fragment, anchor it, and check whether
  // a given string matches fully. Done by hand (rather than embedding in
  // a fake pattern) so the failure message names the broken fragment
  // directly.
  function matchesFully(fragment: string, input: string): boolean {
    return new RegExp(`^(?:${fragment})$`, 'u').test(input);
  }

  it('X accepts Z, +HH, and +HHMM but rejects +HH:MM', () => {
    const frag = tokenFragment('X', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+05')).toBe(true);
    expect(matchesFully(frag, '-05')).toBe(true);
    expect(matchesFully(frag, '+0530')).toBe(true);
    expect(matchesFully(frag, '-0530')).toBe(true);
    expect(matchesFully(frag, '+14')).toBe(true);
    expect(matchesFully(frag, '-12')).toBe(true);
    // X never carries a colon — that's XXX's job.
    expect(matchesFully(frag, '+05:00')).toBe(false);
  });

  it('XX accepts Z and +HHMM but rejects +HH and +HH:MM', () => {
    const frag = tokenFragment('XX', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+0500')).toBe(true);
    expect(matchesFully(frag, '-0500')).toBe(true);
    // XX always carries minutes, so +HH alone shouldn't match.
    expect(matchesFully(frag, '+05')).toBe(false);
    expect(matchesFully(frag, '+05:00')).toBe(false);
  });

  it('XXX accepts Z and +HH:MM but rejects +HHMM and +HH', () => {
    const frag = tokenFragment('XXX', 'en-US');
    expect(matchesFully(frag, 'Z')).toBe(true);
    expect(matchesFully(frag, '+05:00')).toBe(true);
    expect(matchesFully(frag, '-05:00')).toBe(true);
    expect(matchesFully(frag, '+05:45')).toBe(true);
    expect(matchesFully(frag, '+0500')).toBe(false);
    expect(matchesFully(frag, '+05')).toBe(false);
  });

  it('x accepts +HH and +HHMM but rejects Z', () => {
    const frag = tokenFragment('x', 'en-US');
    expect(matchesFully(frag, '+05')).toBe(true);
    expect(matchesFully(frag, '-05')).toBe(true);
    expect(matchesFully(frag, '+0530')).toBe(true);
    expect(matchesFully(frag, '-0530')).toBe(true);
    // x never emits Z — lowercase always produces a numeric offset.
    expect(matchesFully(frag, 'Z')).toBe(false);
  });

  it('xx accepts +HHMM but rejects Z and +HH', () => {
    const frag = tokenFragment('xx', 'en-US');
    expect(matchesFully(frag, '+0500')).toBe(true);
    expect(matchesFully(frag, '-0500')).toBe(true);
    expect(matchesFully(frag, 'Z')).toBe(false);
    expect(matchesFully(frag, '+05')).toBe(false);
  });

  it('xxx accepts +HH:MM but rejects Z and +HHMM', () => {
    const frag = tokenFragment('xxx', 'en-US');
    expect(matchesFully(frag, '+05:00')).toBe(true);
    expect(matchesFully(frag, '-05:00')).toBe(true);
    expect(matchesFully(frag, '+05:45')).toBe(true);
    expect(matchesFully(frag, 'Z')).toBe(false);
    expect(matchesFully(frag, '+0500')).toBe(false);
  });

  it('X prefers the longer +HHMM match over +HH when both are prefixes', () => {
    // The optional (?:\d{2})? group is greedy by default — for input
    // "+0530", the engine should consume all 4 digits, not stop at "+05"
    // and leave "30" dangling. A regression to non-greedy matching here
    // would silently break half-hour and 45-minute offset round-trips.
    const frag = tokenFragment('X', 'en-US');
    const match = new RegExp(`^(?:${frag})`).exec('+0530');
    expect(match?.[0]).toBe('+0530');
  });
});

describe('tokenFragment: offset tokens not in DIGIT_LEADING_TOKENS', () => {
  // yyyy uses YYYY_EXACT (4-digit) instead of YYYY_EXTENDED (4+ digit) when
  // the next token is in DIGIT_LEADING_TOKENS, to avoid yyyy's greediness
  // silently eating the next token's digits. Offset tokens all start with
  // +/-/Z, never a digit — so yyyy shouldn't switch to YYYY_EXACT before
  // them. The check below is indirect (via the resulting fragment for a
  // hypothetical "yyyyX" pattern) but pins the contract: yyyy next to X
  // uses the open-ended fragment, not the 4-digit-only one.
  //
  // We don't import DIGIT_LEADING_TOKENS directly because it's not
  // exported — the behavior-tested approach below is also what catches
  // regressions to the comment in pattern.ts that documents this.
  it('yyyy followed by X uses YYYY_EXTENDED (4+ digits), not YYYY_EXACT', () => {
    // If yyyy switched to YYYY_EXACT here, the next-token check would have
    // to include 'X' in DIGIT_LEADING_TOKENS — but offset tokens start
    // with +/-/Z, not a digit, so the natural digit-boundary works without
    // the explicit fragment switch.
    const yyyyFrag = tokenFragment('yyyy', 'en-US', 'X');
    // YYYY_EXTENDED is `-?\\d{4,}` — open-ended width. YYYY_EXACT is
    // `-?\\d{4}` (exactly 4). The check below tests the 5-digit year case
    // — only YYYY_EXTENDED accepts it.
    expect(new RegExp(`^(?:${yyyyFrag})$`).test('12345')).toBe(true);
  });

  it('yyyy followed by XXX also uses YYYY_EXTENDED (all six offset variants behave the same)', () => {
    for (const tok of ['X', 'XX', 'XXX', 'x', 'xx', 'xxx']) {
      const yyyyFrag = tokenFragment('yyyy', 'en-US', tok);
      expect(
        new RegExp(`^(?:${yyyyFrag})$`).test('12345'),
        `yyyy followed by ${tok} should accept 5-digit years (YYYY_EXTENDED)`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TOKENS handler coverage (task 2-a2): every handler in the exported TOKENS
// table (src/tokens.ts lines 570-764) is driven through format() /
// formatToParts(), including the branchy handlers (yy's negative-year guard,
// do's suffix rules, hh/h's 12-hour wrap, ww/RRRR/D/DD/DDD's requireFields
// guards, and the six offset variants' Z / minutes / seconds-component paths).
// ---------------------------------------------------------------------------

// Small cast of Temporal objects reused across the cases below.
const midnight = Temporal.PlainDateTime.from('2026-08-04T00:05:07.123456789');
const noon = Temporal.PlainDateTime.from('2026-08-04T12:30:45');
const afternoon = Temporal.PlainDateTime.from('2026-08-04T13:06:08');
const lateNight = Temporal.PlainDateTime.from('2026-08-04T23:14:59');
const date = Temporal.PlainDate.from('2026-08-04');
const utcZdt = Temporal.ZonedDateTime.from('2026-08-04T12:00:00[UTC]');
const nyAugZdt = Temporal.ZonedDateTime.from('2026-08-04T12:00:00[America/New_York]');
const nyJanZdt = Temporal.ZonedDateTime.from('2026-01-15T12:00:00[America/New_York]');
const kolkataZdt = Temporal.ZonedDateTime.from('2026-08-04T12:00:00[Asia/Kolkata]');
const euclaZdt = Temporal.ZonedDateTime.from('2026-08-04T12:00:00[Australia/Eucla]');
// Pre-1883 America/New_York was local mean time: the offset carries seconds.
const lmtZdt = Temporal.ZonedDateTime.from('1880-06-15T12:00:00[America/New_York]');

describe('TOKENS handlers: year tokens (yyyy / yy / y)', () => {
  it('yyyy pads to 4 digits, yy keeps the last two, y is unpadded', () => {
    expect(format(date, 'yyyy')).toBe('2026');
    expect(format(date, 'yy')).toBe('26');
    expect(format(date, 'y')).toBe('2026');
  });

  it('yy/y render a first-century year without century padding', () => {
    const y45 = Temporal.PlainDate.from('+000045-06-15');
    expect(format(y45, 'yy')).toBe('45');
    expect(format(y45, 'y')).toBe('45');
  });

  it('y keeps the sign on negative years, yy throws (both arms of yy sign check)', () => {
    const bce = Temporal.PlainDate.from('-000045-06-15');
    expect(format(bce, 'y')).toBe('-45');
    expect(() => format(bce, 'yy')).toThrow(/doesn't support negative years/);
  });
});

describe('TOKENS handlers: month tokens (MMMM / MMM / MM / M / LLLL / LLL)', () => {
  it('MMMM/MMM use long/short names; MM/M are zero-padded / unpadded numbers', () => {
    expect(format(date, 'MMMM')).toBe('August');
    expect(format(date, 'MMM')).toBe('Aug');
    expect(format(date, 'MM')).toBe('08');
    expect(format(date, 'M')).toBe('8');
    expect(format(Temporal.PlainDate.from('2026-03-15'), 'MM')).toBe('03');
    expect(format(Temporal.PlainDate.from('2026-03-15'), 'M')).toBe('3');
  });

  it('MMMM is locale-aware', () => {
    expect(format(date, 'MMMM', { locale: 'fr-FR' })).toBe('août');
  });

  it('LLLL/LLL mirror MMMM/MMM in en-US and pick the stand-alone form in cs-CZ', () => {
    expect(format(date, 'LLLL')).toBe('August');
    expect(format(date, 'LLL')).toBe('Aug');
    const jan = Temporal.PlainDate.from('2026-01-15');
    expect(format(jan, 'LLLL', { locale: 'cs-CZ' })).toBe('leden');
    expect(format(jan, 'LLL', { locale: 'cs-CZ' })).toBe('led');
    // Same date through the format-form tokens, for contrast.
    expect(format(jan, 'MMMM', { locale: 'cs-CZ' })).toBe('leden');
    expect(format(jan, 'MMM', { locale: 'cs-CZ' })).toBe('led');
  });

  it('MMMM reads the month off a PlainMonthDay monthCode', () => {
    expect(format(Temporal.PlainMonthDay.from('08-04'), 'MMMM')).toBe('August');
  });
});

describe('TOKENS handlers: day and weekday tokens (dd / d / EEEE / EEE / cccc / ccc)', () => {
  it('dd pads to 2 digits, d does not', () => {
    expect(format(date, 'dd')).toBe('04');
    expect(format(date, 'd')).toBe('4');
  });

  it('EEEE/EEE long/short weekday names; cccc/ccc stand-alone forms', () => {
    expect(format(date, 'EEEE')).toBe('Tuesday');
    expect(format(date, 'EEE')).toBe('Tue');
    expect(format(date, 'cccc')).toBe('Tuesday');
    expect(format(date, 'ccc')).toBe('Tue');
  });
});

describe('TOKENS handlers: clock tokens (HH / H / hh / h / mm / m / ss / s)', () => {
  it('HH/H are 24-hour, zero-padded / unpadded', () => {
    expect(format(midnight, 'HH')).toBe('00');
    expect(format(midnight, 'H')).toBe('0');
    expect(format(afternoon, 'HH')).toBe('13');
    expect(format(afternoon, 'H')).toBe('13');
  });

  it('hh/h wrap midnight and noon to 12 and keep 13->1, 23->11 (both arms of %12||12)', () => {
    // hour 0 and hour 12: % 12 is 0 (falsy) -> the || 12 fallback fires
    expect(format(midnight, 'hh')).toBe('12');
    expect(format(noon, 'hh')).toBe('12');
    expect(format(midnight, 'h')).toBe('12');
    expect(format(noon, 'h')).toBe('12');
    // hour 13 and 23: % 12 is truthy -> fallback skipped
    expect(format(afternoon, 'hh')).toBe('01');
    expect(format(afternoon, 'h')).toBe('1');
    expect(format(lateNight, 'hh')).toBe('11');
    expect(format(lateNight, 'h')).toBe('11');
  });

  it('mm/m and ss/s are zero-padded / unpadded', () => {
    expect(format(midnight, 'mm')).toBe('05');
    expect(format(midnight, 'm')).toBe('5');
    expect(format(midnight, 'ss')).toBe('07');
    expect(format(midnight, 's')).toBe('7');
  });
});

describe('TOKENS handlers: day-period token (a)', () => {
  it('a renders AM before noon and PM at/after noon', () => {
    expect(format(midnight, 'a')).toBe('AM');
    expect(format(noon, 'a')).toBe('PM');
    expect(format(afternoon, 'a')).toBe('PM');
    expect(format(lateNight, 'a')).toBe('PM');
  });
});

describe('TOKENS handlers: fractional-second tokens (S .. SSSSSSSSS)', () => {
  it('each width truncates the 9-digit nanosecond-of-second to its own length', () => {
    // midnight carries ms=123 us=456 ns=789 -> nanosecond-of-second 123456789
    expect(format(midnight, 'S')).toBe('1');
    expect(format(midnight, 'SS')).toBe('12');
    expect(format(midnight, 'SSS')).toBe('123');
    expect(format(midnight, 'SSSS')).toBe('1234');
    expect(format(midnight, 'SSSSS')).toBe('12345');
    expect(format(midnight, 'SSSSSS')).toBe('123456');
    expect(format(midnight, 'SSSSSSS')).toBe('1234567');
    expect(format(midnight, 'SSSSSSSS')).toBe('12345678');
    expect(format(midnight, 'SSSSSSSSS')).toBe('123456789');
  });

  it('a field bag without microsecond/nanosecond fields falls back to 0', () => {
    // pad.fraction's `?? 0` arms: only millisecond is present on the bag.
    expect(format({ hour: 0, minute: 5, second: 7, millisecond: 123 }, 'SSS')).toBe('123');
  });
});

describe('TOKENS handlers: offset tokens (X / XX / XXX / x / xx / xxx)', () => {
  it('uppercase variants collapse +00:00 to Z; lowercase stay numeric', () => {
    expect(format(utcZdt, 'X')).toBe('Z');
    expect(format(utcZdt, 'XX')).toBe('Z');
    expect(format(utcZdt, 'XXX')).toBe('Z');
    expect(format(utcZdt, 'x')).toBe('+00');
    expect(format(utcZdt, 'xx')).toBe('+0000');
    expect(format(utcZdt, 'xxx')).toBe('+00:00');
  });

  it('X/x drop whole-hour minutes; XX/xx glue them; XXX/xxx keep the colon', () => {
    // -04:00 (EDT): minutes "00" -> the minutes === "00" arm drops them for X/x
    expect(format(nyAugZdt, 'X')).toBe('-04');
    expect(format(nyAugZdt, 'x')).toBe('-04');
    expect(format(nyAugZdt, 'XX')).toBe('-0400');
    expect(format(nyAugZdt, 'xx')).toBe('-0400');
    expect(format(nyAugZdt, 'XXX')).toBe('-04:00');
    expect(format(nyAugZdt, 'xxx')).toBe('-04:00');
    // Winter offset -05:00, same shapes with the other negative hour
    expect(format(nyJanZdt, 'X')).toBe('-05');
    expect(format(nyJanZdt, 'XX')).toBe('-0500');
    expect(format(nyJanZdt, 'XXX')).toBe('-05:00');
    expect(format(nyJanZdt, 'x')).toBe('-05');
    expect(format(nyJanZdt, 'xx')).toBe('-0500');
    expect(format(nyJanZdt, 'xxx')).toBe('-05:00');
  });

  it('sub-hour offsets keep their minutes in every variant', () => {
    // +05:30 and +08:45 exercise the minutes !== "00" arm
    expect(format(kolkataZdt, 'X')).toBe('+0530');
    expect(format(kolkataZdt, 'x')).toBe('+0530');
    expect(format(kolkataZdt, 'XX')).toBe('+0530');
    expect(format(kolkataZdt, 'xx')).toBe('+0530');
    expect(format(kolkataZdt, 'XXX')).toBe('+05:30');
    expect(format(kolkataZdt, 'xxx')).toBe('+05:30');
    expect(format(euclaZdt, 'X')).toBe('+0845');
    expect(format(euclaZdt, 'x')).toBe('+0845');
    expect(format(euclaZdt, 'XX')).toBe('+0845');
    expect(format(euclaZdt, 'xx')).toBe('+0845');
    expect(format(euclaZdt, 'XXX')).toBe('+08:45');
    expect(format(euclaZdt, 'xxx')).toBe('+08:45');
  });

  it('only xxx can carry a pre-1900 offset with a seconds component; the rest throw', () => {
    // 1880 America/New_York was LMT -04:56:02 (9 chars, wider than ±HH:MM)
    expect(format(lmtZdt, 'xxx')).toBe('-04:56:02');
    for (const tok of ['X', 'XX', 'XXX', 'x', 'xx']) {
      expect(() => format(lmtZdt, tok), `${tok} should reject offsets with seconds`).toThrow(
        /cannot represent the offset/
      );
    }
  });
});

describe('TOKENS handlers: zone-name tokens (zzz / z / zzzz)', () => {
  it('zzz prints the IANA timeZoneId verbatim', () => {
    expect(format(utcZdt, 'zzz')).toBe('UTC');
    expect(format(nyAugZdt, 'zzz')).toBe('America/New_York');
    expect(format(kolkataZdt, 'zzz')).toBe('Asia/Kolkata');
    expect(format(euclaZdt, 'zzz')).toBe('Australia/Eucla');
  });

  it('z renders the short zone name (season-aware for DST zones)', () => {
    // The active polyfill's toLocaleString path returns the whole formatted
    // string for these handlers, so assert on the zone-name substring.
    expect(format(utcZdt, 'z')).toContain('UTC');
    expect(format(nyAugZdt, 'z')).toContain('EDT');
    expect(format(nyJanZdt, 'z')).toContain('EST');
    expect(format(kolkataZdt, 'z')).toContain('GMT+5:30');
  });

  it('zzzz renders the generic long zone name (same string in and out of DST)', () => {
    const expectedUtcName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      timeZoneName: 'longGeneric' as Intl.DateTimeFormatOptions['timeZoneName'],
    })
      .formatToParts(new Date('2026-08-04T12:00:00Z'))
      .find(({ type }) => type === 'timeZoneName')?.value;
    expect(format(utcZdt, 'zzzz')).toBe(expectedUtcName);
    expect(format(nyAugZdt, 'zzzz')).toContain('Eastern Time');
    expect(format(nyJanZdt, 'zzzz')).toContain('Eastern Time');
    expect(format(kolkataZdt, 'zzzz')).toContain('India Standard Time');
  });
});

describe('TOKENS handlers: ordinal-day token (do)', () => {
  it('maps every day of a 31-day month to its English ordinal suffix', () => {
    // Sweeps all arms: lastDigit 1/2/3/other, plus the 11-13 "always th"
    // exception inside the lastTwoDigits 11..13 guard.
    const expected = [
      '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
      '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th',
      '21st', '22nd', '23rd', '24th', '25th', '26th', '27th', '28th', '29th', '30th', '31st',
    ];
    for (let day = 1; day <= 31; day++) {
      const d = Temporal.PlainDate.from(`2026-01-${String(day).padStart(2, '0')}`);
      expect(format(d, 'do'), `day ${day}`).toBe(expected[day - 1]);
    }
  });
});

describe('TOKENS handlers: quarter tokens (Q / QQQ)', () => {
  it('Q is the bare quarter number, QQQ prefixes it with Q', () => {
    const byMonth: Array<[number, string, string]> = [
      [1, '1', 'Q1'], [3, '1', 'Q1'], [6, '2', 'Q2'], [9, '3', 'Q3'], [12, '4', 'Q4'],
    ];
    for (const [month, q, qqq] of byMonth) {
      const d = Temporal.PlainDate.from(`2026-${String(month).padStart(2, '0')}-15`);
      expect(format(d, 'Q'), `month ${month}`).toBe(q);
      expect(format(d, 'QQQ'), `month ${month}`).toBe(qqq);
    }
  });
});

describe('TOKENS handlers: ISO week tokens (ww / RRRR)', () => {
  it('ww zero-pads to 2 digits; RRRR zero-pads the week-year to 4', () => {
    expect(format(date, 'ww')).toBe('32');
    expect(format(date, 'RRRR')).toBe('2026');
    expect(format(Temporal.PlainDate.from('2026-01-01'), 'ww')).toBe('01');
    expect(format(Temporal.PlainDate.from('2026-01-01'), 'RRRR')).toBe('2026');
  });

  it("boundary dates borrow the adjacent year's week number", () => {
    const dec28 = Temporal.PlainDate.from('2020-12-28');
    expect(format(dec28, 'ww')).toBe('53');
    expect(format(dec28, 'RRRR')).toBe('2020');
    const jan3 = Temporal.PlainDate.from('2016-01-03');
    expect(format(jan3, 'ww')).toBe('53');
    expect(format(jan3, 'RRRR')).toBe('2015');
  });

  it('RRRR renders a negative week-year with a sign (0000-01-01 is week 52 of -1)', () => {
    const y0 = Temporal.PlainDate.from('0000-01-01');
    expect(format(y0, 'ww')).toBe('52');
    expect(format(y0, 'RRRR')).toBe('-0001');
  });

  it('ww/RRRR throw on a bag with dayOfWeek but no year (requireFields guard)', () => {
    expect(() => format({ dayOfWeek: 2 }, 'ww')).toThrow('token "ww" requires "year"');
    expect(() => format({ dayOfWeek: 2 }, 'RRRR')).toThrow('token "RRRR" requires "year"');
  });
});

describe('TOKENS handlers: day-of-year tokens (D / DD / DDD)', () => {
  it('D is unpadded, DD is 2-digit, DDD is 3-digit', () => {
    const jan1 = Temporal.PlainDate.from('2026-01-01');
    expect(format(jan1, 'D')).toBe('1');
    expect(format(jan1, 'DD')).toBe('01');
    expect(format(jan1, 'DDD')).toBe('001');
    const mar1 = Temporal.PlainDate.from('2026-03-01'); // day 60, already 2 digits
    expect(format(mar1, 'D')).toBe('60');
    expect(format(mar1, 'DD')).toBe('60');
    expect(format(mar1, 'DDD')).toBe('060');
    const leapEnd = Temporal.PlainDate.from('2024-12-31'); // 366 in a leap year
    expect(format(leapEnd, 'D')).toBe('366');
    expect(format(leapEnd, 'DD')).toBe('366');
    expect(format(leapEnd, 'DDD')).toBe('366');
  });

  it('D/DD/DDD throw on a bag with day but no year (requireFields guard)', () => {
    expect(() => format({ day: 15 }, 'D')).toThrow('token "D" requires "year"');
    expect(() => format({ day: 15 }, 'DD')).toThrow('token "DD" requires "year"');
    expect(() => format({ day: 15 }, 'DDD')).toThrow('token "DDD" requires "year"');
  });
});

describe('TOKENS handlers: era tokens (GGGG / G)', () => {
  it('GGGG is the long era name, G the short one, for a CE date', () => {
    expect(format(date, 'GGGG')).toContain('Anno Domini');
    expect(format(date, 'G')).toContain('AD');
  });

  it('BCE dates render Before Christ / BC (year 0 is 1 BCE)', () => {
    const bce1 = Temporal.PlainDate.from('0000-06-15');
    expect(format(bce1, 'GGGG')).toContain('Before Christ');
    expect(format(bce1, 'G')).toContain('BC');
    const bce51 = Temporal.PlainDate.from('-000050-06-15');
    expect(format(bce51, 'GGGG')).toContain('Before Christ');
    expect(format(bce51, 'G')).toContain('BC');
  });
});

describe('TOKENS handlers: missing-field validation through format()', () => {
  it('offset tokens require a ZonedDateTime (PlainDate carries no offset)', () => {
    expect(() => format(date, 'X')).toThrow(FormatSyntaxError);
    expect(() => format(date, 'X')).toThrow('token "X" requires "offset"');
  });

  it('zone-name tokens require a timeZoneId (PlainDateTime carries none)', () => {
    for (const tok of ['zzz', 'z', 'zzzz']) {
      expect(() => format(noon, tok), `${tok} needs timeZoneId`).toThrow(
        `token "${tok}" requires "timeZoneId"`
      );
    }
  });

  it('fraction tokens require sub-second fields (PlainDate carries none)', () => {
    expect(() => format(date, 'SSS')).toThrow('token "SSS" requires "millisecond"');
  });

  it('day-period token requires an hour (PlainDate carries none)', () => {
    expect(() => format(date, 'a')).toThrow('token "a" requires "hour"');
  });

  it('year tokens require a date object (PlainTime carries none)', () => {
    expect(() => format(Temporal.PlainTime.from('12:00'), 'yyyy')).toThrow(
      'token "yyyy" requires "year"'
    );
  });
});

describe('formatToParts drives TOKENS handlers too', () => {
  it('returns one token part per handler, with the token name attached', () => {
    expect(formatToParts(utcZdt, 'X')).toEqual([{ type: 'token', value: 'Z', token: 'X' }]);
    expect(formatToParts(date, 'do')).toEqual([{ type: 'token', value: '4th', token: 'do' }]);
  });
});
