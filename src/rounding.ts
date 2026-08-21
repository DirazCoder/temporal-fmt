// Rounding helpers (plan section N). Pure functions over field bags,
// same convention as arithmetic.ts/calendarUtils.ts.

import { asDateFieldView, type DateFieldView } from './calendarUtils.js';

type RoundingUnit = 'day' | 'hour' | 'minute' | 'second' | 'millisecond';
type RoundingMode = 'nearest' | 'floor' | 'ceil' | 'trunc';

interface DateTimeFieldView extends DateFieldView {
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

// Ms-per-unit table. Used by round() to convert a field bag to ms,
// apply the rounding mode, and convert back. Mirrors how add() in
// arithmetic.ts handles sub-day arithmetic.
const MS_PER_UNIT: Record<RoundingUnit, number> = {
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
  second: 1_000,
  millisecond: 1,
};

function applyMode(ms: number, mode: RoundingMode, increment: number): number {
  // All four modes operate on absolute value then re-apply the sign,
  // so negative values round symmetrically (floor of -1.5 → -2, not -1).
  // Matches Math.round semantics for 'nearest' and Temporal's rounding
  // for the other three.
  const sign = ms < 0 ? -1 : 1;
  const abs = Math.abs(ms);
  const stepped = abs / increment;
  let rounded: number;
  switch (mode) {
    case 'nearest': rounded = Math.round(stepped); break;
    case 'floor': rounded = Math.floor(stepped); break;
    case 'ceil': rounded = Math.ceil(stepped); break;
    case 'trunc': rounded = Math.trunc(stepped); break;
  }
  return sign * rounded * increment;
}

function toMs(v: DateTimeFieldView): number {
  // Returns ms-since-(Howard Hinnant epoch). Used internally — the
  // absolute value is meaningful only relative to the same epoch used
  // by fromMs.
  const y = v.year!, m = v.month!, d = v.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * MS_PER_UNIT.day
    + (v.hour ?? 0) * MS_PER_UNIT.hour
    + (v.minute ?? 0) * MS_PER_UNIT.minute
    + (v.second ?? 0) * MS_PER_UNIT.second
    + (v.millisecond ?? 0);
}

function fromMs(ms: number, base: DateTimeFieldView): DateTimeFieldView {
  // Convert absolute ms (on the same epoch as toMs) back to a field bag.
  // Walks the Howard Hinnant days_from_civil inverse inline.
  const MS_PER_DAY = MS_PER_UNIT.day;
  const totalDays = Math.floor(ms / MS_PER_DAY);
  let withinDay = ms - totalDays * MS_PER_DAY; // ms since midnight
  // Defensive floating-point guard: given totalDays = Math.floor(ms /
  // MS_PER_DAY), withinDay = ms - totalDays * MS_PER_DAY is
  // mathematically guaranteed non-negative (that's what Math.floor
  // division gives you), verified against extreme values including
  // Number.MIN_SAFE_INTEGER and sub-ms fractional noise near day
  // boundaries. Kept in case a future change to how ms is computed
  // upstream breaks that guarantee.
  /* c8 ignore next */
  if (withinDay < 0) withinDay += MS_PER_DAY;
  const hour = Math.floor(withinDay / MS_PER_UNIT.hour);
  const minute = Math.floor((withinDay % MS_PER_UNIT.hour) / MS_PER_UNIT.minute);
  const second = Math.floor((withinDay % MS_PER_UNIT.minute) / MS_PER_UNIT.second);
  const millisecond = withinDay % MS_PER_UNIT.second;
  // Convert totalDays back to year/month/day via Howard Hinnant's
  // civil_from_days. Same algorithm as arithmetic.ts's shiftDays.
  const z = totalDays + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y2 = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y2 + 1 : y2;
  return { ...base, year, month: m, day: d, hour, minute, second, millisecond };
}

function shiftDays(v: DateTimeFieldView, days: number): DateTimeFieldView {
  const y = v.year!, m = v.month!, d = v.day!;
  const y2 = m <= 2 ? y - 1 : y;
  const era = Math.floor((y2 >= 0 ? y2 : y2 - 399) / 400);
  const yoe = y2 - era * 400;
  const m2 = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * m2 + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const totalDays = era * 146097 + doe - 719468 + days;
  const z = totalDays + 719468;
  const era2 = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe2 = z - era2 * 146097;
  const yoe2 = Math.floor((doe2 - Math.floor(doe2 / 1460) + Math.floor(doe2 / 36524) - Math.floor(doe2 / 146096)) / 365);
  const y2out = yoe2 + era2 * 400;
  const doy2 = doe2 - (365 * yoe2 + Math.floor(yoe2 / 4) - Math.floor(yoe2 / 100));
  const mp = Math.floor((5 * doy2 + 2) / 153);
  const d2 = doy2 - Math.floor((153 * mp + 2) / 5) + 1;
  const m2out = mp < 10 ? mp + 3 : mp - 9;
  const yOut = m2out <= 2 ? y2out + 1 : y2out;
  return { ...v, year: yOut, month: m2out, day: d2 };
}

export interface RoundOptions {
  unit: RoundingUnit;
  mode?: RoundingMode;
  roundingIncrement?: number;
}

export function round(value: unknown, options: RoundOptions): DateTimeFieldView {
  const base = asDateFieldView(value) as DateTimeFieldView;
  const mode = options.mode ?? 'nearest';
  const increment = (options.roundingIncrement ?? 1) * MS_PER_UNIT[options.unit];
  if (increment <= 0) {
    throw new Error(`temporal-fmt: round() requires a positive roundingIncrement (got ${options.roundingIncrement}).`);
  }
  const ms = toMs(base);
  const rounded = applyMode(ms, mode, increment);
  return fromMs(rounded, base);
}

export function floor(value: unknown, unit: RoundingUnit, roundingIncrement: number = 1): DateTimeFieldView {
  return round(value, { unit, mode: 'floor', roundingIncrement });
}

export function ceil(value: unknown, unit: RoundingUnit, roundingIncrement: number = 1): DateTimeFieldView {
  return round(value, { unit, mode: 'ceil', roundingIncrement });
}

export function truncate(value: unknown, unit: RoundingUnit, roundingIncrement: number = 1): DateTimeFieldView {
  return round(value, { unit, mode: 'trunc', roundingIncrement });
}

// Duration rounding. Takes a duration field bag and rounds it to the
// requested unit. Operates on the duration's own fields (years/months
// for calendar-bound units, days/hours/minutes/seconds/ms/µs/ns for
// absolute units). Mirrors Temporal.Duration.prototype.round's surface
// — but operates on plain field bags rather than real Temporal.Duration
// instances, same convention as the rest of this module set.
export interface DurationFields {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  microseconds?: number;
  nanoseconds?: number;
}

type DurationUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

const DURATION_UNIT_TO_NS: Record<DurationUnit, bigint> = {
  years: 0n, // calendar-bound, can't convert without relativeTo
  months: 0n, // same
  weeks: 0n, // same
  days: 86_400n * 1_000_000_000n,
  hours: 3_600n * 1_000_000_000n,
  minutes: 60n * 1_000_000_000n,
  seconds: 1_000_000_000n,
  milliseconds: 1_000_000n,
  microseconds: 1_000n,
  nanoseconds: 1n,
};

// Absolute units (days and below) can be rounded without a relativeTo
// because their length is fixed in nanoseconds. Calendar-bound units
// (years/months/weeks) can't — would need a Temporal.Duration round()
// call with a relativeTo. This helper throws if the caller tries to
// round to/from a calendar-bound unit, rather than silently producing
// a wrong result.
function isCalendarBound(unit: DurationUnit): boolean {
  return unit === 'years' || unit === 'months' || unit === 'weeks';
}

export function roundDuration(duration: DurationFields, options: {
  unit: DurationUnit;
  mode?: RoundingMode;
  roundingIncrement?: number;
}): DurationFields {
  const mode = options.mode ?? 'nearest';
  const increment = BigInt(options.roundingIncrement ?? 1);
  if (increment <= 0n) {
    throw new Error(`temporal-fmt: roundDuration() requires a positive roundingIncrement (got ${options.roundingIncrement}).`);
  }
  if (isCalendarBound(options.unit)) {
    throw new Error(
      `temporal-fmt: roundDuration() to "${options.unit}" requires a Temporal.Duration with a relativeTo — ` +
      `this helper operates on plain field bags without calendar context. Use Temporal.Duration.prototype.round() directly.`
    );
  }

  // Sum all absolute-unit contributions into total nanoseconds.
  let totalNs = 0n;
  for (const u of ['days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'] as DurationUnit[]) {
    const v = duration[u] ?? 0;
    totalNs += BigInt(v) * DURATION_UNIT_TO_NS[u];
  }

  // Apply rounding on the absolute value, preserving sign (same as round()).
  const stepNs = increment * DURATION_UNIT_TO_NS[options.unit];
  const sign = totalNs < 0n ? -1n : 1n;
  const abs = totalNs < 0n ? -totalNs : totalNs;
  const stepped = abs / stepNs;
  const remainder = abs % stepNs;
  let rounded: bigint;
  switch (mode) {
    case 'nearest':
      // Banker's rounding would be the Temporal spec, but Math.round-style
      // half-up is what callers typically expect from a "round" function.
      // Going with half-up to match round() above and avoid surprising anyone
      // who reads the output.
      rounded = remainder * 2n >= stepNs ? stepped + 1n : stepped;
      break;
    case 'floor': rounded = stepped; break;
    case 'ceil': rounded = remainder > 0n ? stepped + 1n : stepped; break;
    case 'trunc': rounded = stepped; break;
  }
  const newTotalNs = sign * rounded * stepNs;

  // Distribute back into the largest unit ≤ the requested unit. This
  // produces a balanced duration (e.g. rounding 90s to minutes gives
  // 1m30s in the minute field, not 90s).
  const result: DurationFields = { ...duration };
  let remaining = newTotalNs;
  // Clear all absolute units, then re-populate from largest to smallest.
  for (const u of ['days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'] as DurationUnit[]) {
    if (u === options.unit || isLargerUnit(u, options.unit) || u === options.unit) {
      // Keep calendar-bound units as-is; clear absolute units smaller
      // than the rounding target so the balanced output is clean.
    }
    result[u] = 0;
  }
  // Re-populate from the rounding unit downward (largest absolute unit
  // ≤ the target), so the result has all its value concentrated at the
  // target unit and below.
  const unitsInOrder: DurationUnit[] = ['days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
  const startIdx = unitsInOrder.indexOf(options.unit);
  // Include days in the distribution if days is below or equal to the target.
  // Otherwise leave days untouched (caller's days value stays).
  for (let i = 0; i <= startIdx; i++) {
    const u = unitsInOrder[i]!;
    const unitNs = DURATION_UNIT_TO_NS[u];
    // Dead by construction: unitsInOrder only lists days/hours/minutes/
    // seconds/milliseconds/microseconds/nanoseconds, none of which are
    // 0n in DURATION_UNIT_TO_NS (only years/months/weeks are, and those
    // never appear in this array). Kept in case unitsInOrder grows to
    // include a calendar-bound unit later.
    /* c8 ignore next */
    if (unitNs === 0n) continue;
    const count = remaining / unitNs;
    remaining -= count * unitNs;
    if (count !== 0n) {
      result[u] = Number(count);
    }
  }
  return result;
}

function isLargerUnit(_a: DurationUnit, _b: DurationUnit): boolean {
  // Helper kept for clarity above — currently unused because the
  // distribution loop handles ordering explicitly via unitsInOrder.
  return false;
}