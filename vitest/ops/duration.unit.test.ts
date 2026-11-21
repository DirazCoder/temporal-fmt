import { describe, expect, it } from 'vitest';
import { formatISODuration, parseISODuration, balanceDuration, totalDuration, addDuration, compareDuration, formatDurationToParts, parseDuration, subtractDuration, roundDuration } from '../../src/ops/duration.js';
import { InvalidDurationError } from '../../src/core/errors.js';
import { formatDuration } from '../../src/format/formatDuration.js';

describe('formatISODuration / parseISODuration', () => {
  it('round-trips a field bag through the ISO 8601 duration grammar', () => {
    const iso = formatISODuration({ years: 1, days: 3 });
    expect(iso).toBe('P1Y3D');
    expect(parseISODuration(iso)).toMatchObject({ years: 1, days: 3 });
  });
});

describe('balanceDuration', () => {
  it('carries excess hours into days', () => {
    expect(balanceDuration({ hours: 25 })).toMatchObject({ days: 1, hours: 1 });
  });
});

describe('totalDuration', () => {
  it('sums fields into a single number in the requested unit', () => {
    expect(totalDuration({ hours: 2 }, 'minutes')).toBe(120);
  });

  it('throws for a calendar-bound target unit', () => {
    expect(() => totalDuration({ days: 1 }, 'years' as never)).toThrow();
  });
});

describe('addDuration / compareDuration', () => {
  it('adds field-by-field without balancing', () => {
    expect(addDuration({ hours: 1 }, { hours: 2, minutes: 30 })).toMatchObject({ hours: 3, minutes: 30 });
  });

  it('compares by total absolute length', () => {
    expect(compareDuration({ hours: 1 }, { minutes: 90 })).toBe(-1);
  });
});

describe('formatDurationToParts', () => {
  it('splits the rendered output into token and literal parts', () => {
    // covers the token arm of the ternary and the literal arm in one format
    expect(formatDurationToParts({ hours: 2, minutes: 30 }, 'hhh mmm')).toEqual([
      { type: 'token', value: '2 hours', token: 'hhh' },
      { type: 'literal', value: ' ' },
      { type: 'token', value: '30 minutes', token: 'mmm' },
    ]);
  });

  it('emits an empty token part for zero-suppressed units and keeps neighboring literals', () => {
    expect(formatDurationToParts({ hours: 2, minutes: 0 }, 'hhh mmm')).toEqual([
      { type: 'token', value: '2 hours', token: 'hhh' },
      { type: 'literal', value: ' ' },
      { type: 'token', value: '', token: 'mmm' },
    ]);
  });

  it('forwards options through to the renderer (showZeroValues)', () => {
    // non-default third-arg arm of the `options = {}` parameter
    expect(formatDurationToParts({ hours: 0 }, 'hhh', { showZeroValues: true })).toEqual([
      { type: 'token', value: '0 hours', token: 'hhh' },
    ]);
  });

  it('agrees with formatDuration on the joined string', () => {
    const bag = { hours: 2, minutes: 30, seconds: 5 };
    expect(formatDurationToParts(bag, 'hhh mmm sss').map((p) => p.value).join(''))
      .toBe(formatDuration(bag, 'hhh mmm sss'));
  });
});

describe('parseISODuration', () => {
  it('parses every date-section field', () => {
    expect(parseISODuration('P3Y6M4W12D')).toEqual({ years: 3, months: 6, weeks: 4, days: 12, hours: 0, minutes: 0, seconds: 0 });
  });

  it('parses every time-section field (T required)', () => {
    expect(parseISODuration('PT12H30M5S')).toEqual({ years: 0, months: 0, weeks: 0, days: 0, hours: 12, minutes: 30, seconds: 5 });
  });

  it('parses the full form with weeks next to days', () => {
    expect(parseISODuration('P1Y2M3W4DT5H6M7S')).toEqual({ years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7 });
    expect(parseISODuration('P1W2D')).toEqual({ years: 0, months: 0, weeks: 1, days: 2, hours: 0, minutes: 0, seconds: 0 });
  });

  it('reads M before T as months and M after T as minutes', () => {
    expect(parseISODuration('P1M')).toMatchObject({ months: 1, minutes: 0 });
    expect(parseISODuration('PT1M')).toMatchObject({ months: 0, minutes: 1 });
  });

  it('accepts fractional components in any section', () => {
    expect(parseISODuration('P1.5D')).toMatchObject({ days: 1.5 });
    expect(parseISODuration('P0.5W')).toMatchObject({ weeks: 0.5 });
    expect(parseISODuration('PT1.5H')).toMatchObject({ hours: 1.5 });
    expect(parseISODuration('PT0.25S')).toMatchObject({ seconds: 0.25 });
    expect(parseISODuration('-P1.5D')).toMatchObject({ days: -1.5 });
  });

  it('applies a leading minus sign to every nonzero field', () => {
    expect(parseISODuration('-P1Y2M3W4DT5H6M7S')).toEqual({ years: -1, months: -2, weeks: -3, days: -4, hours: -5, minutes: -6, seconds: -7 });
  });

  it('keeps zero fields positive under a leading minus (no -0)', () => {
    // negate() only negates nonzero values
    expect(parseISODuration('-P0D')).toEqual({ years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(parseISODuration('-P0Y1D')).toMatchObject({ years: 0, days: -1 });
  });

  it('accepts P0D as the canonical zero duration', () => {
    expect(parseISODuration('P0D')).toEqual({ years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('accepts a bare T after a date part', () => {
    // first group undefined but later group defined: exercises the
    // m.slice(2).every() predicate's true arm before hitting a value
    expect(parseISODuration('P1YT')).toEqual({ years: 1, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('throws for strings that do not match the grammar', () => {
    // missing P prefix
    expect(() => parseISODuration('1Y')).toThrow(/does not match ISO 8601 duration grammar/);
    // empty string
    expect(() => parseISODuration('')).toThrow(/does not match ISO 8601 duration grammar/);
    // lowercase designators are not ISO
    expect(() => parseISODuration('p1y')).toThrow(/does not match ISO 8601 duration grammar/);
    // H may only appear after the T designator
    expect(() => parseISODuration('P1H')).toThrow(/does not match ISO 8601 duration grammar/);
    // trailing garbage
    expect(() => parseISODuration('P1DX')).toThrow(/does not match ISO 8601 duration grammar/);
  });

  it('throws when no components are present at all', () => {
    expect(() => parseISODuration('P')).toThrow(/duration has no fields/);
    expect(() => parseISODuration('PT')).toThrow(/duration has no fields/);
  });
});

describe('formatISODuration', () => {
  it('renders every field of a full duration', () => {
    expect(formatISODuration({ years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7 })).toBe('P1Y2M3W4DT5H6M7S');
  });

  it('omits empty date-section components', () => {
    expect(formatISODuration({ years: 1 })).toBe('P1Y');
    expect(formatISODuration({ months: 1 })).toBe('P1M');
    expect(formatISODuration({ weeks: 1 })).toBe('P1W');
    expect(formatISODuration({ days: 1 })).toBe('P1D');
    // explicit zeros are omitted too (if (years) falsy arm)
    expect(formatISODuration({ years: 0, days: 1 })).toBe('P1D');
  });

  it('emits T only when a time component is present', () => {
    expect(formatISODuration({ hours: 5 })).toBe('PT5H');
    expect(formatISODuration({ minutes: 6 })).toBe('PT6M');
    expect(formatISODuration({ seconds: 7 })).toBe('PT7S');
    expect(formatISODuration({ years: 1, days: 4 })).toBe('P1Y4D');
    // all three time fields zero: no T, falls through to P0D
    expect(formatISODuration({ hours: 0, minutes: 0, seconds: 0 })).toBe('P0D');
  });

  it('falls back to P0D for an empty bag', () => {
    // parts.length === 1 arm
    expect(formatISODuration({})).toBe('P0D');
  });

  it('marks the duration negative when any field is negative', () => {
    // one bag per field so every operand of the negative `||` chain
    // sees both outcomes
    expect(formatISODuration({ years: -1 })).toBe('-P1Y');
    expect(formatISODuration({ months: -1 })).toBe('-P1M');
    expect(formatISODuration({ weeks: -1 })).toBe('-P1W');
    expect(formatISODuration({ days: -1 })).toBe('-P1D');
    expect(formatISODuration({ years: -1, months: -2, weeks: -3, days: -4, hours: -5, minutes: -6, seconds: -7 })).toBe('-P1Y2M3W4DT5H6M7S');
  });

  it('rejects mixed-sign bags instead of silently flipping field signs', () => {
    // ISO 8601 cannot express a duration whose fields disagree in sign;
    // these used to be coerced to all-negative (round-tripping
    // { days: -1, hours: 2 } as -P1DT2H and silently flipping the hours).
    expect(() => formatISODuration({ hours: -1, days: 1 })).toThrow(/mixed-sign/);
    expect(() => formatISODuration({ minutes: -30, hours: 1 })).toThrow(/mixed-sign/);
    expect(() => formatISODuration({ seconds: -5, hours: 1 })).toThrow(/mixed-sign/);
    expect(() => formatISODuration({ days: -3, hours: 2 })).toThrow(/mixed-sign/);
  });

  it('absolute-values components under a leading minus', () => {
    expect(formatISODuration({ hours: -1, minutes: -30 })).toBe('-PT1H30M');
  });

  it('emits sub-second fields as fractional seconds instead of dropping them', () => {
    // { milliseconds: 500 } used to serialize as "P0D", losing the
    // entire duration.
    expect(formatISODuration({ milliseconds: 500 })).toBe('PT0.5S');
    expect(formatISODuration({ seconds: 1, nanoseconds: 1 })).toBe('PT1.000000001S');
    expect(formatISODuration({ microseconds: 250 })).toBe('PT0.00025S');
    expect(formatISODuration({ milliseconds: -500 })).toBe('-PT0.5S');
    expect(formatISODuration({ hours: 1, milliseconds: 500 })).toBe('PT1H0.5S');
  });

  it('round-trips through parseISODuration', () => {
    const bag = { years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7 };
    expect(parseISODuration(formatISODuration(bag))).toEqual(bag);
    expect(formatISODuration(parseISODuration('P3Y6M4DT12H30M5S'))).toBe('P3Y6M4DT12H30M5S');
    expect(formatISODuration(parseISODuration('-PT1H30M'))).toBe('-PT1H30M');
    expect(formatISODuration(parseISODuration('P1.5D'))).toBe('P1.5D');
  });
});

describe('parseDuration', () => {
  it('rejects adjacent value tokens without a separator', () => {
    expect(() => parseDuration('123', 'hhmm')).toThrow(/adjacent value tokens/);
  });
  it('parses numeric tokens separated by literals', () => {
    expect(parseDuration('2:30', 'h:m')).toEqual({ hours: 2, minutes: 30 });
    expect(parseDuration('2:30:5', 'h:m:s')).toEqual({ hours: 2, minutes: 30, seconds: 5 });
  });

  it('maps every duration token letter to its DurationFields key', () => {
    expect(parseDuration('1', 'y')).toEqual({ years: 1 });
    expect(parseDuration('2', 'o')).toEqual({ months: 2 });
    expect(parseDuration('3', 'w')).toEqual({ weeks: 3 });
    expect(parseDuration('4', 'd')).toEqual({ days: 4 });
    expect(parseDuration('5', 'h')).toEqual({ hours: 5 });
    expect(parseDuration('6', 'm')).toEqual({ minutes: 6 });
    expect(parseDuration('7', 's')).toEqual({ seconds: 7 });
    expect(parseDuration('8', 'S')).toEqual({ milliseconds: 8 });
  });

  it('accepts a leading minus on numeric tokens', () => {
    expect(parseDuration('-30', 'm')).toEqual({ minutes: -30 });
  });

  it('parses short-form tokens with or without their suffix text', () => {
    expect(parseDuration('2yrs', 'yy')).toEqual({ years: 2 });
    expect(parseDuration('2', 'yy')).toEqual({ years: 2 });
  });

  it('parses long-form tokens with or without the unit word', () => {
    expect(parseDuration('2 years', 'yyy')).toEqual({ years: 2 });
    expect(parseDuration('2', 'yyy')).toEqual({ years: 2 });
    expect(parseDuration('250ms', 'SSS')).toEqual({ milliseconds: 250 });
  });

  it('parses multi-unit short and long format strings', () => {
    expect(parseDuration('2yrs 30m', 'yy mm')).toEqual({ years: 2, minutes: 30 });
    expect(parseDuration('2 years 30 minutes', 'yyy mmm')).toEqual({ years: 2, minutes: 30 });
  });

  it('escapes regex metacharacters in literal pieces', () => {
    expect(parseDuration('2|30', 'h|m')).toEqual({ hours: 2, minutes: 30 });
  });

  it('supports quoted literals in the format string', () => {
    expect(parseDuration('2 years and 30 minutes', "yyy 'and' mmm")).toEqual({ years: 2, minutes: 30 });
  });

  it('pushes the first literal onto an empty piece list', () => {
    // appendLiteral with pieces empty (last === undefined arm)
    expect(parseDuration('dur 2', "'dur' h")).toEqual({ hours: 2 });
  });

  it('treats an adjacent doubled quote as a literal quote', () => {
    // format[i+1] === "'" arm of the duration tokenizer
    expect(parseDuration("30m'45s", "mm''ss")).toEqual({ minutes: 30, seconds: 45 });
  });

  it('treats a doubled quote inside a quoted span as a literal quote', () => {
    // format[j+1] === "'" arm inside the quoted-span scanner
    expect(parseDuration("30m x'y 45s", "mm 'x''y' ss")).toEqual({ minutes: 30, seconds: 45 });
  });

  it('merges consecutive literal pieces while building the pattern', () => {
    expect(parseDuration('2::30', 'h::m')).toEqual({ hours: 2, minutes: 30 });
  });

  it('throws on an unterminated quote in the format string', () => {
    expect(() => parseDuration('30m 45s', "mm 'x ss")).toThrow(/unterminated quote/);
  });

  it('throws when the input does not match the format', () => {
    expect(() => parseDuration('2-30', 'h:m')).toThrow(/does not match duration format/);
  });

  it('throws when a captured value is not a finite number', () => {
    // a 400-digit run matches (-?\d+) but Number() overflows to Infinity
    expect(() => parseDuration('1'.repeat(400), 'h')).toThrow(InvalidDurationError);
    expect(() => parseDuration('1'.repeat(400), 'h')).toThrow(/isn't a finite number/);
  });

  it('accepts (and ignores) the options argument', () => {
    // non-default arm of the `options = {}` parameter
    expect(parseDuration('2:30', 'h:m', { locale: 'fr-FR' })).toEqual({ hours: 2, minutes: 30 });
  });

  it('round-trips with formatDuration for numeric tokens', () => {
    const bag = { hours: 2, minutes: 30 };
    expect(parseDuration(formatDuration(bag, 'h:m'), 'h:m')).toEqual(bag);
  });
});

describe('balanceDuration (additional)', () => {
  it('carries excess minutes into hours', () => {
    expect(balanceDuration({ minutes: 90 })).toMatchObject({ hours: 1, minutes: 30 });
  });

  it('carries excess seconds into minutes (90s -> 1m30s)', () => {
    expect(balanceDuration({ seconds: 90 })).toMatchObject({ minutes: 1, seconds: 30 });
  });

  it('carries existing days through when hours overflow', () => {
    expect(balanceDuration({ days: 2, hours: 25 })).toMatchObject({ days: 3, hours: 1 });
  });

  it('balances sub-second units across milliseconds, microseconds and nanoseconds', () => {
    expect(balanceDuration({ milliseconds: 1500 })).toMatchObject({ seconds: 1, milliseconds: 500 });
    expect(balanceDuration({ microseconds: 1234567 })).toMatchObject({ seconds: 1, milliseconds: 234, microseconds: 567, nanoseconds: 0 });
    // 1.5e9 ns carries into seconds, and the 5e8 ns remainder into ms
    expect(balanceDuration({ nanoseconds: 1500000000 })).toMatchObject({ seconds: 1, milliseconds: 500, nanoseconds: 0 });
  });

  it('balances a fractional absolute field exactly', () => {
    expect(balanceDuration({ hours: 1.5 })).toMatchObject({ hours: 1, minutes: 30 });
    expect(balanceDuration({ days: 1.5 })).toMatchObject({ days: 1, hours: 12 });
    // the fractional value parseISODuration legitimately produces
    expect(balanceDuration(parseISODuration('P1.5D'))).toMatchObject({ days: 1, hours: 12 });
  });

  it('balances a mixed multi-unit bag', () => {
    expect(balanceDuration({ hours: 25, minutes: 90, seconds: 30 })).toMatchObject({ days: 1, hours: 2, minutes: 30, seconds: 30 });
  });

  it('balances negative durations (bigint division truncates toward zero)', () => {
    expect(balanceDuration({ seconds: -90 })).toMatchObject({ minutes: -1, seconds: -30 });
    expect(balanceDuration({ hours: -25 })).toMatchObject({ days: -1, hours: -1 });
  });

  it('folds a mixed-sign bag into a single signed remainder', () => {
    // -1s + 5e8 ns = -5e8 ns, which lands in the milliseconds field
    expect(balanceDuration({ seconds: -1, nanoseconds: 500000000 })).toMatchObject({ seconds: 0, milliseconds: -500 });
  });

  it('leaves calendar-bound fields untouched', () => {
    expect(balanceDuration({ years: 2, months: 1, weeks: 3, hours: 25 })).toMatchObject({ years: 2, months: 1, weeks: 3, days: 1, hours: 1 });
  });

  it('zeroes every absolute field of an empty bag', () => {
    expect(balanceDuration({})).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0 });
  });

  it('throws when a fractional field cannot be converted to ns exactly', () => {
    // 3000.5 hours * 3.6e12 ns = 1.08e16, past the 2^53 safe-integer range
    expect(() => balanceDuration({ hours: 3000.5 })).toThrow(InvalidDurationError);
  });
});

describe('totalDuration (additional)', () => {
  it('converts between absolute units', () => {
    expect(totalDuration({ days: 2 }, 'days')).toBe(2);
    expect(totalDuration({ hours: 48 }, 'days')).toBe(2);
    expect(totalDuration({ hours: 1 }, 'minutes')).toBe(60);
    expect(totalDuration({ minutes: 90 }, 'hours')).toBe(1.5);
    expect(totalDuration({ seconds: 90 }, 'minutes')).toBe(1.5);
    expect(totalDuration({ milliseconds: 2500 }, 'seconds')).toBe(2.5);
    expect(totalDuration({ microseconds: 2500 }, 'milliseconds')).toBe(2.5);
    expect(totalDuration({ nanoseconds: 2500 }, 'microseconds')).toBe(2.5);
  });

  it('produces fractional results for sub-unit fields', () => {
    expect(totalDuration({ seconds: 90 }, 'hours')).toBeCloseTo(0.025, 12);
    expect(totalDuration({ nanoseconds: 1 }, 'seconds')).toBe(1e-9);
  });

  it('sums every absolute field into the requested unit', () => {
    expect(totalDuration({ hours: 1, minutes: 30, seconds: 15 }, 'seconds')).toBe(5415);
    expect(totalDuration({ days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 1, microseconds: 1, nanoseconds: 1 }, 'nanoseconds')).toBe(90_061_001_001_001);
  });

  it('ignores calendar-bound fields (they need a relativeTo)', () => {
    expect(totalDuration({ years: 5, months: 4, weeks: 3, days: 1 }, 'days')).toBe(1);
    expect(totalDuration({ weeks: 2 }, 'days')).toBe(0);
  });

  it('is signed', () => {
    expect(totalDuration({ minutes: -90 }, 'hours')).toBe(-1.5);
  });

  it('throws for every calendar-bound target unit', () => {
    expect(() => totalDuration({ days: 1 }, 'years' as never)).toThrow(/does not support unit "years"/);
    expect(() => totalDuration({ days: 1 }, 'months' as never)).toThrow(/does not support unit "months"/);
    expect(() => totalDuration({ days: 1 }, 'weeks' as never)).toThrow(/does not support unit "weeks"/);
  });

  it('throws when a fractional field cannot be converted to ns exactly', () => {
    // 3000.5 hours * 3.6e12 ns = 1.08e16, past the 2^53 safe-integer range
    expect(() => totalDuration({ hours: 3000.5 }, 'minutes')).toThrow(InvalidDurationError);
  });
});

describe('compareDuration (additional)', () => {
  it('returns -1 when the first duration is shorter', () => {
    expect(compareDuration({ hours: 1 }, { minutes: 90 })).toBe(-1);
    expect(compareDuration({ hours: -1 }, { hours: 1 })).toBe(-1);
  });

  it('returns 1 when the first duration is longer', () => {
    expect(compareDuration({ minutes: 90 }, { hours: 1 })).toBe(1);
    expect(compareDuration({ days: 1 }, { hours: 23, minutes: 59, seconds: 59 })).toBe(1);
    expect(compareDuration({ milliseconds: 1 }, { microseconds: 999 })).toBe(1);
  });

  it('returns 0 for equal total lengths', () => {
    expect(compareDuration({ hours: 1 }, { minutes: 60 })).toBe(0);
    expect(compareDuration({}, {})).toBe(0);
    expect(compareDuration({ seconds: 1 }, { milliseconds: 1000 })).toBe(0);
  });
});

describe('addDuration (additional)', () => {
  it('returns all ten keys, defaulting missing fields to 0', () => {
    expect(addDuration({}, {})).toEqual({
      years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0,
      seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0,
    });
  });

  it('adds every field of two full bags', () => {
    const a = { years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7, milliseconds: 8, microseconds: 9, nanoseconds: 10 };
    const b = { years: 10, months: 20, weeks: 30, days: 40, hours: 50, minutes: 60, seconds: 70, milliseconds: 80, microseconds: 90, nanoseconds: 100 };
    expect(addDuration(a, b)).toEqual({
      years: 11, months: 22, weeks: 33, days: 44, hours: 55, minutes: 66,
      seconds: 77, milliseconds: 88, microseconds: 99, nanoseconds: 110,
    });
  });

  it('adds signed values field-by-field', () => {
    expect(addDuration({ hours: -2 }, { hours: 5 })).toMatchObject({ hours: 3 });
  });
});

describe('subtractDuration', () => {
  it('subtracts field-by-field via negation', () => {
    expect(subtractDuration({ hours: 2, minutes: 30 }, { minutes: 45 })).toEqual({
      years: 0, months: 0, weeks: 0, days: 0, hours: 2, minutes: -15,
      seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0,
    });
  });

  it('can produce negative fields', () => {
    expect(subtractDuration({ hours: 1 }, { hours: 2 })).toMatchObject({ hours: -1 });
  });

  it('negates only the fields present on the subtrahend', () => {
    // negateDuration walks Object.keys(d), so a sparse subtrahend stays
    // sparse on the negate side before addDuration fills all ten keys
    expect(subtractDuration({ days: 10 }, { days: 4 })).toMatchObject({ days: 6, hours: 0 });
  });

  it('treats an explicitly-undefined subtrahend field as 0', () => {
    // d[k] ?? 0 undefined arm inside negateDuration
    expect(subtractDuration({ hours: 5 }, { minutes: undefined })).toMatchObject({ hours: 5, minutes: 0 });
  });
});

describe('roundDuration re-export', () => {
  it('is re-exported from duration.js and balances into larger units', () => {
    expect(roundDuration({ minutes: 90 }, { unit: 'minutes' })).toMatchObject({ hours: 1, minutes: 30, seconds: 0 });
  });
});
