import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import { setTemporal } from '../../src/core/temporalProvider.js';
import {
  isPlainDate,
  isPlainTime,
  isPlainDateTime,
  isZonedDateTime,
  isInstant,
  isPlainYearMonth,
  isPlainMonthDay,
  isDuration,
  isTemporal,
  assertTemporal,
  assertInstant,
  assertPlainDate,
  assertPlainTime,
  assertPlainDateTime,
  assertZonedDateTime,
  assertPlainYearMonth,
  assertPlainMonthDay,
  assertDuration,
} from '../../src/core/typeGuards.js';

setTemporal(Temporal);

describe('isPlainDate', () => {
  it('is true only for PlainDate', () => {
    expect(isPlainDate(Temporal.PlainDate.from('2026-08-04'))).toBe(true);
    expect(isPlainDate(Temporal.PlainTime.from('15:45:30'))).toBe(false);
    expect(isPlainDate({})).toBe(false);
    expect(isPlainDate(null)).toBe(false);
  });
});

describe('isZonedDateTime / isTemporal', () => {
  it('distinguishes zoned values from plain ones', () => {
    const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
    expect(isZonedDateTime(zdt)).toBe(true);
    expect(isTemporal(zdt)).toBe(true);
    expect(isTemporal(Temporal.PlainDate.from('2026-08-04'))).toBe(true);
    expect(isTemporal('not a temporal value')).toBe(false);
  });
});

describe('assertPlainDate', () => {
  it('throws a descriptive error for a non-PlainDate value', () => {
    expect(() => assertPlainDate({})).toThrow(/PlainDate/);
  });

  it('does not throw for a real PlainDate', () => {
    expect(() => assertPlainDate(Temporal.PlainDate.from('2026-08-04'))).not.toThrow();
  });
});

// ---- full guard/assert surface below ---------------------------------

const pd = Temporal.PlainDate.from('2026-08-04');
const pt = Temporal.PlainTime.from('15:45:30');
const pdt = Temporal.PlainDateTime.from('2026-08-04T15:45:30');
const zdt = Temporal.ZonedDateTime.from('2026-08-04T15:45:30[UTC]');
const inst = Temporal.Instant.from('2026-08-04T15:45:30Z');
const pym = Temporal.PlainYearMonth.from('2026-08');
const pmd = Temporal.PlainMonthDay.from('08-04');
const dur = Temporal.Duration.from('PT1H30M');

describe('isPlainDate (structural fallback)', () => {
  it('accepts an unbranded object shaped like a PlainDate', () => {
    // no Symbol.toStringTag — exercises the full field+method && chain
    expect(isPlainDate({ year: 2026, month: 8, day: 4, toPlainDateTime() {}, withCalendar() {} })).toBe(true);
  });

  it('rejects look-alikes that carry an hour or miss a discriminator method', () => {
    // hour present → PlainDateTime-shaped, not a PlainDate
    expect(isPlainDate({ year: 2026, month: 8, day: 4, hour: 15, toPlainDateTime() {}, withCalendar() {} })).toBe(false);
    // fields fine but no toPlainDateTime/withCalendar methods
    expect(isPlainDate({ year: 2026, month: 8, day: 4 })).toBe(false);
    expect(isPlainDate({ year: 2026, month: 8, toPlainDateTime() {}, withCalendar() {} })).toBe(false); // no day
  });

  it('rejects every other Temporal type', () => {
    expect(isPlainDate(pt)).toBe(false);
    expect(isPlainDate(pdt)).toBe(false);
    expect(isPlainDate(zdt)).toBe(false);
    expect(isPlainDate(inst)).toBe(false);
    expect(isPlainDate(pym)).toBe(false); // year/month but no day
    expect(isPlainDate(pmd)).toBe(false); // no numeric year
    expect(isPlainDate(dur)).toBe(false);
  });

  it('returns false for primitives and Dates', () => {
    for (const v of [undefined, 42, '2026-08-04', new Date(0)]) {
      expect(isPlainDate(v)).toBe(false);
    }
  });

  it('swallows hostile getters instead of throwing', () => {
    // guardOrFalse's catch: a throwing getter means "not one of ours"
    expect(isPlainDate({ get [Symbol.toStringTag]() { throw new Error('boom'); } })).toBe(false);
    expect(isPlainDate({ get year() { throw new Error('boom'); } })).toBe(false);
  });
});

describe('isPlainTime', () => {
  it('is true only for PlainTime', () => {
    expect(isPlainTime(pt)).toBe(true);
    expect(isPlainTime(pd)).toBe(false);
    expect(isPlainTime(pdt)).toBe(false); // carries year
    expect(isPlainTime(zdt)).toBe(false);
    expect(isPlainTime(pmd)).toBe(false);
    expect(isPlainTime(dur)).toBe(false);
  });

  it('accepts an unbranded hour-only object', () => {
    // hour, no year, no calendar methods — unique PlainTime shape
    expect(isPlainTime({ hour: 15 })).toBe(true);
  });

  it('rejects look-alikes carrying year or calendar methods', () => {
    expect(isPlainTime({ hour: 15, year: 2026 })).toBe(false);
    expect(isPlainTime({ hour: 15, withCalendar() {} })).toBe(false);
    expect(isPlainTime({ hour: 15, toPlainDate() {} })).toBe(false);
    expect(isPlainTime({ hour: 15, toPlainDateTime() {} })).toBe(false);
    expect(isPlainTime({})).toBe(false);
    expect(isPlainTime(null)).toBe(false);
    expect(isPlainTime('15:45')).toBe(false);
  });
});

describe('isPlainDateTime', () => {
  it('is true only for PlainDateTime', () => {
    expect(isPlainDateTime(pdt)).toBe(true);
    expect(isPlainDateTime(pd)).toBe(false);  // no hour
    expect(isPlainDateTime(pt)).toBe(false);  // no year
    expect(isPlainDateTime(zdt)).toBe(false); // has toInstant
    expect(isPlainDateTime(dur)).toBe(false);
  });

  it('accepts an unbranded date-time bag without toInstant', () => {
    // withPlainTime present, toInstant absent — uniquely PlainDateTime
    expect(isPlainDateTime({ year: 2026, month: 8, day: 4, hour: 15, withPlainTime() {} })).toBe(true);
  });

  it('rejects ZonedDateTime-shaped bags and partial bags', () => {
    expect(isPlainDateTime({ year: 2026, month: 8, day: 4, hour: 15, withPlainTime() {}, toInstant() {} })).toBe(false);
    expect(isPlainDateTime({ year: 2026, month: 8, hour: 15 })).toBe(false); // no day
    expect(isPlainDateTime({ month: 8, day: 4, hour: 15, withPlainTime() {} })).toBe(false); // no year
    expect(isPlainDateTime(42)).toBe(false);
  });
});

describe('isZonedDateTime (structural fallback)', () => {
  it('accepts an unbranded bag carrying withTimeZone + toInstant', () => {
    // no toStringTag — exercises the full structural chain
    expect(isZonedDateTime({ year: 2026, month: 8, day: 4, hour: 15, withTimeZone() {}, toInstant() {} })).toBe(true);
  });

  it('rejects plain date-times and partial bags', () => {
    expect(isZonedDateTime(pdt)).toBe(false); // no withTimeZone
    expect(isZonedDateTime(pd)).toBe(false);
    expect(isZonedDateTime({ year: 2026, month: 8, day: 4, hour: 15, toInstant() {} })).toBe(false); // no withTimeZone
    expect(isZonedDateTime(null)).toBe(false);
    expect(isZonedDateTime([])).toBe(false);
  });
});

describe('isInstant', () => {
  it('is true only for Instant', () => {
    expect(isInstant(inst)).toBe(true);
    expect(isInstant(zdt)).toBe(false); // toZonedDateTimeISO not on the ZDT prototype
    expect(isInstant(pd)).toBe(false);
    expect(isInstant(pdt)).toBe(false);
    expect(isInstant(pt)).toBe(false);
  });

  it('accepts an unbranded toZonedDateTimeISO-only object', () => {
    expect(isInstant({ toZonedDateTimeISO() {} })).toBe(true);
  });

  it('rejects bags that also carry toInstant or wall-clock fields', () => {
    expect(isInstant({ toZonedDateTimeISO() {}, toInstant() {} })).toBe(false);
    expect(isInstant({ toZonedDateTimeISO() {}, year: 2026 })).toBe(false);
    expect(isInstant(undefined)).toBe(false);
    expect(isInstant('2026-08-04T00:00:00Z')).toBe(false);
  });
});

describe('isPlainYearMonth', () => {
  it('is true only for PlainYearMonth', () => {
    expect(isPlainYearMonth(pym)).toBe(true);
    expect(isPlainYearMonth(pd)).toBe(false);  // carries day
    expect(isPlainYearMonth(pmd)).toBe(false); // no numeric year
    expect(isPlainYearMonth(pdt)).toBe(false);
    expect(isPlainYearMonth(zdt)).toBe(false);
  });

  it('accepts an unbranded year+month bag with toPlainDate', () => {
    expect(isPlainYearMonth({ year: 2026, month: 8, toPlainDate() {} })).toBe(true);
  });

  it('rejects bags with a day or without toPlainDate', () => {
    expect(isPlainYearMonth({ year: 2026, month: 8, day: 4, toPlainDate() {} })).toBe(false);
    expect(isPlainYearMonth({ year: 2026, month: 8 })).toBe(false);
    expect(isPlainYearMonth({ month: 8, toPlainDate() {} })).toBe(false);
    expect(isPlainYearMonth('2026-08')).toBe(false);
  });
});

describe('isPlainMonthDay', () => {
  it('is true only for PlainMonthDay', () => {
    expect(isPlainMonthDay(pmd)).toBe(true);
    expect(isPlainMonthDay(pd)).toBe(false);  // has numeric year
    expect(isPlainMonthDay(pym)).toBe(false); // has numeric year
    expect(isPlainMonthDay(pt)).toBe(false);
    expect(isPlainMonthDay(dur)).toBe(false);
  });

  it('accepts an unbranded monthCode+day bag with toPlainDate', () => {
    expect(isPlainMonthDay({ monthCode: 'M08', day: 4, toPlainDate() {} })).toBe(true);
  });

  it('rejects bags with numeric months or missing discriminators', () => {
    expect(isPlainMonthDay({ month: 8, day: 4, toPlainDate() {} })).toBe(false); // numeric month, no monthCode
    expect(isPlainMonthDay({ monthCode: 'M08', day: 4 })).toBe(false);          // no toPlainDate
    expect(isPlainMonthDay({ monthCode: 'M08' })).toBe(false);                  // no day
    expect(isPlainMonthDay({ day: 4, toPlainDate() {} })).toBe(false);          // no monthCode
    expect(isPlainMonthDay(new Date(0))).toBe(false);
  });
});

describe('isDuration', () => {
  it('is true only for Duration', () => {
    expect(isDuration(dur)).toBe(true);
    expect(isDuration(pd)).toBe(false);
    expect(isDuration(pt)).toBe(false);
    expect(isDuration(pdt)).toBe(false);
    expect(isDuration(zdt)).toBe(false);
    expect(isDuration(inst)).toBe(false);
  });

  it('duck-types on the Duration-only total() method', () => {
    expect(isDuration({ total() {} })).toBe(true);
    expect(isDuration({ abs() {} })).toBe(false); // abs alone isn't probed
    expect(isDuration({})).toBe(false);
    expect(isDuration(42)).toBe(false);
    expect(isDuration(null)).toBe(false);
  });
});

describe('isTemporal (umbrella guard)', () => {
  it('accepts every Temporal type via its toStringTag brand', () => {
    for (const v of [pd, pt, pdt, zdt, inst, pym, pmd, dur]) {
      expect(isTemporal(v)).toBe(true);
    }
  });

  it('falls back to discriminating methods when the brand is absent', () => {
    expect(isTemporal({ withCalendar() {} })).toBe(true);
    expect(isTemporal({ total() {} })).toBe(true); // last operand of the || chain
  });

  it('returns false for unbranded objects with no Temporal methods', () => {
    expect(isTemporal({})).toBe(false);             // evaluates every || operand
    expect(isTemporal(new Map())).toBe(false);       // string tag, but not "Temporal.*"
    expect(isTemporal({ [Symbol.toStringTag]: 'Map' })).toBe(false);
    expect(isTemporal([])).toBe(false);
    expect(isTemporal(42)).toBe(false);
  });

  it('swallows a throwing toStringTag getter', () => {
    expect(isTemporal({ get [Symbol.toStringTag]() { throw new Error('boom'); } })).toBe(false);
  });
});

describe('assert* helpers (pass-through)', () => {
  it('accepts the matching Temporal type for every assert', () => {
    expect(() => assertTemporal(pd)).not.toThrow();
    expect(() => assertTemporal(dur)).not.toThrow();
    expect(() => assertInstant(inst)).not.toThrow();
    expect(() => assertPlainDate(pd)).not.toThrow();
    expect(() => assertPlainTime(pt)).not.toThrow();
    expect(() => assertPlainDateTime(pdt)).not.toThrow();
    expect(() => assertZonedDateTime(zdt)).not.toThrow();
    expect(() => assertPlainYearMonth(pym)).not.toThrow();
    expect(() => assertPlainMonthDay(pmd)).not.toThrow();
    expect(() => assertDuration(dur)).not.toThrow();
  });
});

describe('assert* helpers (throws)', () => {
  it('names the expected Temporal type for wrong-type inputs', () => {
    expect(() => assertInstant(pd)).toThrow('temporal-fmt: expected a Temporal.Instant, got instance of PlainDate.');
    expect(() => assertPlainTime(pdt)).toThrow('temporal-fmt: expected a Temporal.PlainTime, got instance of PlainDateTime.');
    expect(() => assertPlainDateTime(pt)).toThrow('temporal-fmt: expected a Temporal.PlainDateTime, got instance of PlainTime.');
    expect(() => assertZonedDateTime(pdt)).toThrow('temporal-fmt: expected a Temporal.ZonedDateTime, got instance of PlainDateTime.');
    expect(() => assertPlainYearMonth(pd)).toThrow('temporal-fmt: expected a Temporal.PlainYearMonth, got instance of PlainDate.');
    expect(() => assertPlainMonthDay(pym)).toThrow('temporal-fmt: expected a Temporal.PlainMonthDay, got instance of PlainYearMonth.');
    expect(() => assertDuration(pt)).toThrow('temporal-fmt: expected a Temporal.Duration, got instance of PlainTime.');
    expect(() => assertTemporal('nope')).toThrow(
      'temporal-fmt: expected a Temporal.object (Instant, PlainDate, PlainTime, PlainDateTime, ZonedDateTime, Duration, PlainYearMonth, or PlainMonthDay), got string.',
    );
  });

  it('describes non-Temporal offending values by shape', () => {
    // describeValue: null / array / named class / plain object / primitives
    expect(() => assertTemporal(null)).toThrow(
      'temporal-fmt: expected a Temporal.object (Instant, PlainDate, PlainTime, PlainDateTime, ZonedDateTime, Duration, PlainYearMonth, or PlainMonthDay), got null.',
    );
    expect(() => assertInstant([])).toThrow('temporal-fmt: expected a Temporal.Instant, got array.');
    expect(() => assertPlainTime(new Date(0))).toThrow('temporal-fmt: expected a Temporal.PlainTime, got instance of Date.');
    class Widget {}
    expect(() => assertPlainDateTime(new Widget())).toThrow('temporal-fmt: expected a Temporal.PlainDateTime, got instance of Widget.');
    expect(() => assertZonedDateTime({})).toThrow('temporal-fmt: expected a Temporal.ZonedDateTime, got plain object.');
    // constructor-less objects (Object.create(null)) still read as "plain object"
    expect(() => assertPlainDate(Object.create(null))).toThrow('temporal-fmt: expected a Temporal.PlainDate, got plain object.');
    expect(() => assertPlainYearMonth('x')).toThrow('temporal-fmt: expected a Temporal.PlainYearMonth, got string.');
    expect(() => assertPlainMonthDay(undefined)).toThrow('temporal-fmt: expected a Temporal.PlainMonthDay, got undefined.');
    expect(() => assertDuration(true)).toThrow('temporal-fmt: expected a Temporal.Duration, got boolean.');
    expect(() => assertPlainDate(42)).toThrow('temporal-fmt: expected a Temporal.PlainDate, got number.');
  });
});
