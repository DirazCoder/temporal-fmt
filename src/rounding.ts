/*
 * Copyright 2026 DirazCoder
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Rounding helpers. Pure functions over field bags,
// same convention as arithmetic.ts/calendarUtils.ts.

import { asDateFieldView, type DateFieldView } from './calendarUtils.js';
import { InvalidDurationError } from './errors.js';
import { daysFromCivil } from './isoWeek.js';

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
  // Operates on the SIGNED value. The absolute-value-then-reapply-sign
  // version this replaced inverted floor/ceil for every negative input
  // (Unix-epoch ms < 0 = any date before 1970-01-01): floor(-0.5 days)
  // came out as 0 (= 1970-01-01) instead of -1 (= 1969-12-31), i.e.
  // floor and ceil were literally swapped for pre-epoch dates, and
  // 'nearest' broke ties away-from-epoch (10:30 pre-epoch → 10:00 while
  // the identical post-epoch clock time → 11:00). Signed Math.* calls
  // are epoch-consistent by construction: floor always moves toward
  // −∞ (the earlier boundary), ceil toward +∞, trunc toward zero,
  // nearest ties up (Math.round semantics, both sides of the epoch).
  const stepped = ms / increment;
  let rounded: number;
  switch (mode) {
    case 'nearest': rounded = Math.round(stepped); break;
    case 'floor': rounded = Math.floor(stepped); break;
    case 'ceil': rounded = Math.ceil(stepped); break;
    case 'trunc': rounded = Math.trunc(stepped); break;
  }
  return rounded * increment;
}

function toMs(v: DateTimeFieldView): number {
  // Returns ms-since-(Howard Hinnant epoch). Used internally — the
  // absolute value is meaningful only relative to the same epoch used
  // by fromMs. daysFromCivil is O(1) and correct for negative years;
  // the forward era previously inlined here (Math.floor of the -399-
  // offset numerator) shifted pre-year-0 dates by one day.
  const days = daysFromCivil(v.year!, v.month!, v.day!);
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
  // civil_from_days. The era term MUST use truncating division — the
  // -146096 offset exists precisely so trunc lands the era correctly;
  // Math.floor double-shifts every z < 0 by one day. (Same fix as
  // arithmetic.ts's shiftDays.)
  const z = totalDays + 719468;
  const era = Math.trunc((z >= 0 ? z : z - 146096) / 146097);
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
  // daysFromCivil (isoWeek.ts): O(1) and correct for negative years —
  // the forward era previously inlined here (Math.floor of Hinnant's
  // -399-offset numerator) double-corrected, and the inverse era's
  // Math.floor (see fromMs) canceled it only for round-trips, leaving
  // one-way consumers off by a day for pre-year-0 dates.
  const totalDays = daysFromCivil(v.year!, v.month!, v.day!) + days;
  const z = totalDays + 719468;
  const era2 = Math.trunc((z >= 0 ? z : z - 146096) / 146097);
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

// Converts one absolute-unit field to nanoseconds, exactly. Integer
// values keep the exact BigInt path (arbitrary magnitude). Fractional
// values — which parseISODuration legitimately produces ("P1.5D") —
// scale in floating point and are accepted only when the product is a
// safe integer, so P1.5D balances to exactly 1 day + 12 hours. A
// fractional value whose product can't be represented exactly (large
// fractional day counts) throws the typed InvalidDurationError instead
// of the opaque "TypeError: Cannot convert 1.5 to a BigInt" the old
// BigInt(v) call produced. Shared by roundDuration (here) and the
// duration.ts arithmetic helpers — duration.ts already imports from
// this module, so exporting keeps the dependency direction acyclic.
export function fieldToNs(v: number, nsPer: bigint, field: string): bigint {
  if (Number.isInteger(v)) return BigInt(v) * nsPer;
  const scaled = v * Number(nsPer);
  if (Number.isSafeInteger(scaled)) return BigInt(scaled);
  throw new InvalidDurationError({
    reason: `field "${field}" (${v}) cannot be converted to nanoseconds exactly — the value is too large for a fractional unit; use smaller units`,
  });
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
  // Default first, then validate: roundDuration({hours:1}, {unit:'hours'})
  // (no increment) must keep meaning "increment 1", not trip the guard.
  // A fractional value (2.5) used to reach BigInt() and throw a raw V8
  // RangeError ("The number 2.5 cannot be converted to a BigInt") —
  // inconsistent with round(), which accepts fractional increments via
  // float math, and with the typed-error surface this library promises.
  const incrementValue = options.roundingIncrement ?? 1;
  if (typeof incrementValue !== 'number' || !Number.isInteger(incrementValue) || incrementValue < 1) {
    throw new InvalidDurationError({
      reason:
        `temporal-fmt: roundDuration() requires a positive roundingIncrement (got ${String(incrementValue)})` +
        (Number.isInteger(incrementValue) ? '' : ' — fractional increments aren\'t supported here (use round() for those)'),
    });
  }
  const increment = BigInt(incrementValue);
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
    totalNs += fieldToNs(v, DURATION_UNIT_TO_NS[u], u);
  }

  // Apply rounding on the SIGNED total (see applyMode for why the
  // abs-then-sign form was wrong for negatives: floor/ceil inverted,
  // ties asymmetric). BigInt division truncates toward zero, so floor
  // and ceil need explicit adjustment for negative remainders, and
  // 'nearest' follows Math.round's ties-toward-+∞ exactly (r of exactly
  // −½ steps stays at the truncation quotient, which is the higher
  // boundary — matching round() above instead of the old away-from-zero
  // tie break that disagreed with it for negative values).
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
    // floor/ceil are computed from the truncating quotient adjusted by
    // the SIGN of totalNs: floor moves toward −∞ (one step earlier for a
    // negative value with a remainder), ceil toward +∞.
    case 'floor': rounded = sign < 0n && remainder > 0n ? stepped + 1n : stepped; break;
    case 'ceil': rounded = sign > 0n && remainder > 0n ? stepped + 1n : stepped; break;
    case 'trunc': rounded = stepped; break;
  }
  const newTotalNs = sign * rounded * stepNs;

  // Distribute back into the largest unit ≤ the requested unit. This
  // produces a balanced duration (e.g. rounding 90s to minutes gives
  // 1m30s in the minute field, not 90s).
  const result: DurationFields = { ...duration };
  let remaining = newTotalNs;
  // Clear all absolute units, then re-populate from largest to smallest so
  // the balanced output has all its value concentrated at the target unit
  // and below.
  const unitsInOrder: DurationUnit[] = ['days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
  const startIdx = unitsInOrder.indexOf(options.unit);
  // Units finer than the rounding target are zeroed: all their value was
  // folded into `remaining` above, and whatever survives rounding now
  // lives at the target unit and above. (Units coarser than the target
  // are re-written by the distribution loop below — their value is
  // already inside `remaining`, so the spread copy is overwritten with
  // the same number.)
  for (let i = startIdx + 1; i < unitsInOrder.length; i++) {
    result[unitsInOrder[i]!] = 0;
  }
  // Re-populate from the largest absolute unit down to the target, so the
  // result has all its value concentrated at the target unit and above.
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
    // Assign unconditionally (zero counts write 0): the units at and above
    // the target are fully re-derived from the rounded total, so any
    // original spread-copied value must be overwritten either way —
    // conditionally skipping zero counts would leave the caller's stale
    // value sitting in the field.
    result[u] = Number(count);
  }
  return result;
}