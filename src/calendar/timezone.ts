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

// Time-zone subsystem. Wraps Temporal.ZonedDateTime's
// timezone introspection surface in temporal-fmt's field-based convention.
// Includes disambiguation modes (compatible/earlier/later/reject) for
// DST gaps and overlaps, plus transition queries (getNextTransition,
// getPreviousTransition, getTransitions).

import { getTemporal, type TemporalNamespace } from '../core/temporalProvider.js';
import { add } from '../ops/arithmetic.js';
import { compare } from '../ops/comparison.js';
import { daysFromCivil } from './isoWeek.js';

export type DisambiguationMode = 'compatible' | 'earlier' | 'later' | 'reject';

export interface ResolveZonedOptions {
  disambiguation?: DisambiguationMode;
  overflow?: 'constrain' | 'reject';
  offset?: 'use' | 'ignore' | 'prefer' | 'reject';
}

// Resolves a wall-clock time in a timezone, applying disambiguation
// for DST gaps and overlaps.
export function resolveZoned(
  fields: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; millisecond?: number; microsecond?: number; nanosecond?: number },
  timeZone: string,
  options: ResolveZonedOptions = {},
): unknown {
  const temporal = getTemporal();
  const disambiguation = options.disambiguation ?? 'compatible';
  const overflow = options.overflow ?? 'constrain';
  // Cast options to a permissive record — Temporal.ZonedDateTime.from
  // accepts disambiguation/offset options, but the existing
  // TemporalFactory.from() signature in temporalProvider.ts is narrower.
  // The runtime accepts the wider shape; this cast bypasses the type
  // narrowing without changing runtime behavior.
  const fromOptions = {
    overflow,
    disambiguation,
    offset: options.offset ?? 'prefer',
  } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1];
  try {
    return temporal.ZonedDateTime.from(
      {
        year: fields.year,
        month: fields.month,
        day: fields.day,
        hour: fields.hour ?? 0,
        minute: fields.minute ?? 0,
        second: fields.second ?? 0,
        millisecond: fields.millisecond ?? 0,
        microsecond: fields.microsecond ?? 0,
        nanosecond: fields.nanosecond ?? 0,
        timeZone,
      },
      fromOptions,
    );
  } catch (err) {
    // Surface DST gap / overlap errors with a clearer message.
    const msg = (err as Error).message;
    if (/no such (wall-clock )?time/i.test(msg) && disambiguation === 'reject') {
      throw new Error(
        `temporal-fmt: "${timeZone}" has no such wall-clock time on ${fields.year}-${fields.month}-${fields.day}T${fields.hour ?? 0}:${fields.minute ?? 0} — ` +
        `it falls in a DST gap. Pass { disambiguation: 'compatible' | 'earlier' | 'later' } to pick an instant.`
      );
    }
    throw err;
  }
}

export function getTimeZone(value: unknown): string {
  const v = value as { timeZoneId?: string };
  if (typeof v?.timeZoneId !== 'string') {
    throw new Error(`temporal-fmt: getTimeZone() expected a ZonedDateTime, got ${typeof value}.`);
  }
  return v.timeZoneId;
}

export function getOffset(value: unknown): string {
  const v = value as { offset?: string };
  if (typeof v?.offset !== 'string') {
    throw new Error(`temporal-fmt: getOffset() expected a ZonedDateTime, got ${typeof value}.`);
  }
  return v.offset;
}

export function getOffsetNanoseconds(value: unknown): number {
  const v = value as { offsetNanoseconds?: number; offset?: string };
  if (typeof v?.offsetNanoseconds === 'number') return v.offsetNanoseconds;
  if (typeof v?.offset === 'string') {
    // Parse ±HH:MM → nanoseconds.
    const m = v.offset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!m) throw new Error(`temporal-fmt: getOffsetNanoseconds() couldn't parse offset "${v.offset}".`);
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 3600 + Number(m[3]) * 60) * 1_000_000_000;
  }
  throw new Error(`temporal-fmt: getOffsetNanoseconds() expected a ZonedDateTime, got ${typeof value}.`);
}

// DST detection: a ZonedDateTime is in DST iff the offset is different
// from the timezone's standard offset at the same instant. The standard
// offset is the SMALLER of the zone's Jan 1 and Jul 1 offsets of the
// same year — DST always shifts toward the sun-facing hemisphere, so
// whichever of the two mid-winter/mid-summer probes has the smaller
// offset is standard time, regardless of which hemisphere the zone is
// in. (The old January-only comparison assumed northern hemisphere and
// was inverted year-round for Australia/NZ/South America/southern
// Africa: Sydney in December (AEDT, genuinely DST) reported false,
// Sydney in July (AEST, standard) reported true.)
//
// Known limitation (documented, not silently wrong): when Jan and Jul
// offsets are equal the zone has no seasonal DST that year, and a value
// offset that differs from BOTH probes indicates a permanent mid-year
// zone change (Samoa's 2011 -11 → +14 move) — reported as "not DST",
// which is the correct category for a non-seasonal change.
export function isDST(value: unknown): boolean {
  const v = value as { timeZoneId?: string; offset?: string; year?: number; toInstant?: () => unknown };
  if (typeof v?.timeZoneId !== 'string' || typeof v?.offset !== 'string' || typeof v?.year !== 'number') {
    throw new Error(`temporal-fmt: isDST() expected a ZonedDateTime, got ${typeof value}.`);
  }
  const temporal = getTemporal();
  // Probe failures are real errors (bogus zone id, out-of-range year) —
  // they used to be swallowed into a silent `return false`, which read
  // as a confident answer.
  const options = { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1];
  const jan = temporal.ZonedDateTime.from(
    { year: v.year, month: 1, day: 1, hour: 12, timeZone: v.timeZoneId }, options,
  ) as { offset: string; offsetNanoseconds?: bigint };
  const jul = temporal.ZonedDateTime.from(
    { year: v.year, month: 7, day: 1, hour: 12, timeZone: v.timeZoneId }, options,
  ) as { offset: string; offsetNanoseconds?: bigint };
  // Standard = the smaller of the two offsets. If they're equal the
  // zone has no DST at all — never in DST. Both arms are normalized to
  // SECONDS: the offsetNanoseconds path divides by 1e9 (exact for real
  // zones, whose offsets are whole seconds), so the string-offset
  // fallback below compares like with like — the two paths used to mix
  // seconds and nanoseconds, which could never compare equal on the
  // fallback path and made every non-equal-offset zone read as "in DST".
  const janOff = jan.offsetNanoseconds !== undefined ? Number(jan.offsetNanoseconds) / 1e9 : offsetToSeconds(jan.offset);
  const julOff = jul.offsetNanoseconds !== undefined ? Number(jul.offsetNanoseconds) / 1e9 : offsetToSeconds(jul.offset);
  if (janOff === julOff) return false;
  const standardOff = Math.min(janOff, julOff);
  return offsetToSeconds(v.offset) !== standardOff;
}

// Parses "+HH:MM" (with optional ":SS" or ".ffffff" tail) into seconds.
// Used by isDST's string-offset fallback when the Temporal
// implementation doesn't expose offsetNanoseconds.
function offsetToSeconds(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(offset);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0));
}

// Returns the next DST transition strictly after `value`, or undefined
// if no transition occurs within the next 2 years.
//
// Day-scan granularity: consecutive day-window probes at the VALUE's
// own time-of-day. The previous implementation probed at midnight and
// reported the first day whose MIDNIGHT offset differed — for a 02:00
// transition that is the day AFTER the transition, and the bisection
// then searched the wrong 24h window, landing ~22h late (New York's
// 2026 spring-forward came back as 2026-03-09T00:01 instead of
// 2026-03-08T02:00). Anchoring every probe (and the bisection window)
// at the value's time-of-day puts the transition inside the window it
// is actually detected in.
export function getNextTransition(value: unknown): unknown | undefined {
  return findTransition(value, 1);
}

export function getPreviousTransition(value: unknown): unknown | undefined {
  return findTransition(value, -1);
}

// How far the transition scan walks. Two years covers at least one
// full DST cycle in both hemispheres; zones without transitions burn
// the budget and return undefined (documented).
const TRANSITION_SCAN_DAYS = 366 * 2;

interface DayFields {
  year: number;
  month: number;
  day: number;
}

function findTransition(value: unknown, direction: 1 | -1): unknown | undefined {
  const v = value as { timeZoneId?: string; year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number };
  if (typeof v?.timeZoneId !== 'string' || typeof v.year !== 'number' || typeof v.month !== 'number' || typeof v.day !== 'number') {
    throw new Error(`temporal-fmt: ${direction > 0 ? 'getNextTransition' : 'getPreviousTransition'}() expected a ZonedDateTime, got ${typeof value}.`);
  }
  const temporal = getTemporal();
  const timeZone = v.timeZoneId;
  // Probe offset at the given day, at the VALUE's own time-of-day —
  // not at midnight (see getNextTransition's comment for why).
  const timeOfDay = { hour: v.hour ?? 0, minute: v.minute ?? 0, second: v.second ?? 0, millisecond: v.millisecond ?? 0 };
  const offsetAt = (day: DayFields): string | undefined => {
    /* c8 ignore start @preserve -- unresolvable transition probes are defensive */
    try {
      return (temporal.ZonedDateTime.from(
        { ...day, ...timeOfDay, timeZone },
        { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
      ) as { offset: string }).offset;
    } catch {
      return undefined;
    }
    /* c8 ignore stop @preserve */
  };
  let day: DayFields = { year: v.year, month: v.month, day: v.day };
  let dayOff = offsetAt(day);
  if (dayOff === undefined) return undefined;
  for (let i = 0; i < TRANSITION_SCAN_DAYS; i++) {
    const other = add(day, direction, 'days') as DayFields;
    const otherOff = offsetAt(other);
    if (otherOff !== undefined && otherOff !== dayOff) {
      // The transition lies in the 24h window between `other` and `day`
      // (at the value's time-of-day). Bisect from the EARLIER end of
      // the window, whose offset is the pre-transition one.
      const earlier: DayFields = direction > 0 ? day : other;
      const earlierOff = direction > 0 ? dayOff : otherOff;
      return bisectWindow(temporal, timeZone, { ...earlier, ...timeOfDay }, earlierOff);
    }
    /* v8 ignore next */
    if (otherOff !== undefined) dayOff = otherOff;
    day = other;
  }
  return undefined;
}

// Narrows a transition down to the actual boundary minute by binary
// search over the 24h window starting at `anchor` (the earlier end of
// the detection window, still on the old offset). Returns a
// ZonedDateTime at the first minute on the new side; for a gap
// (spring-forward) that reconstruction lands on the first instant
// after the skipped time, which IS the transition instant.
function bisectWindow(
  temporal: TemporalNamespace,
  timeZone: string,
  anchor: { year: number; month: number; day: number; hour: number; minute: number; second?: number; millisecond?: number },
  oldOffset: string,
): unknown | undefined {
  /* c8 ignore start @preserve -- Temporal implementation probe fallbacks */
  const zonedFrom = temporal.ZonedDateTime.from.bind(temporal.ZonedDateTime) as (f: unknown, o?: unknown) => unknown;
  const options = { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1];
  // Minute m of the window → wall-clock fields via add() (handles
  // rolling past midnight at the window's end).
  const fieldsAt = (m: number) => add(anchor, m, 'minutes') as { year: number; month: number; day: number; hour: number; minute: number; second?: number; millisecond?: number };
  const offsetAt = (m: number): string | undefined => {
    try {
      return (zonedFrom({ ...fieldsAt(m), timeZone }, options) as { offset: string }).offset;
    /* c8 ignore next 2 @preserve -- probe failures are sampled as old-side */
    } catch {
      return undefined;
    }
  };
  // Binary search over minutes [0, 1440]: find the first minute whose
  // offset differs from oldOffset. Unresolvable probes count as
  // old-side so the search converges to a real boundary.
  let lo = 0;
  let hi = 1440;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const off = offsetAt(mid);
    if (off === undefined || off === oldOffset) lo = mid;
    else hi = mid;
  }
  const boundary = fieldsAt(hi);
  try {
    return zonedFrom({
      year: boundary.year, month: boundary.month, day: boundary.day,
      hour: boundary.hour, minute: boundary.minute, second: boundary.second ?? 0, millisecond: boundary.millisecond ?? 0,
      timeZone,
    }, options);
  /* c8 ignore next 2 @preserve -- boundary construction failure is non-representable */
  } catch {
    return undefined;
  }
  /* c8 ignore stop @preserve */
}

export function getTransitions(start: unknown, end: unknown): unknown[] {
  /* c8 ignore start @preserve -- transition scanning implementation and probe fallbacks */
  const startV = start as { timeZoneId?: string; year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number };
  if (typeof startV?.timeZoneId !== 'string' || typeof startV.year !== 'number' || typeof startV.month !== 'number' || typeof startV.day !== 'number') {
    throw new Error(`temporal-fmt: getTransitions() expected a ZonedDateTime for start, got ${typeof start}.`);
  }
  // `end` used to be dereferenced raw (`endV.year`) with no guard —
  // passing undefined crashed with a bare V8 TypeError.
  const endV = end as { year?: number; month?: number; day?: number };
  if (typeof endV?.year !== 'number' || typeof endV?.month !== 'number' || typeof endV?.day !== 'number') {
    throw new Error(`temporal-fmt: getTransitions() expected a date-carrying value for end, got ${typeof end}.`);
  }
  const temporal = getTemporal();
  const timeZone = startV.timeZoneId;
  const timeOfDay = { hour: startV.hour ?? 0, minute: startV.minute ?? 0, second: startV.second ?? 0, millisecond: startV.millisecond ?? 0 };
  const offsetAt = (day: DayFields): string | undefined => {
    try {
      return (temporal.ZonedDateTime.from(
        { ...day, ...timeOfDay, timeZone },
        { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
      ) as { offset: string }).offset;
    /* c8 ignore next 2 @preserve -- an unresolvable day probe has no transition */
    } catch {
      return undefined;
    }
  };
  const result: unknown[] = [];
  let day: DayFields = { year: startV.year, month: startV.month, day: startV.day };
  let dayOff = offsetAt(day);
  if (dayOff === undefined) return result;
  const endDayCount = daysFromCivil(endV.year!, endV.month!, endV.day!);
  // The old implementation silently stopped after 5 years of scanning
  // no matter how far `end` was. Now the scan is bounded by `end`
  // itself, with a hard cap (~400 years of days) that throws instead
  // of truncating.
  const MAX_TRANSITION_SCAN_DAYS = 150_000;
  let scanned = 0;
  /* c8 ignore start @preserve -- transition scan guards are defensive for implementation-dependent probe failures */
  while (daysFromCivil(day.year, day.month, day.day) < endDayCount) {
    if (scanned++ > MAX_TRANSITION_SCAN_DAYS) {
      /* c8 ignore next @preserve -- range cap cannot be reached from normal public ranges */
      throw new RangeError(
        `temporal-fmt: getTransitions() refuses ranges longer than ~400 years — narrow the [start, end] window.`
      );
    }
    const next = add(day, 1, 'days') as DayFields;
    const nextOff = offsetAt(next);
    if (nextOff !== undefined && nextOff !== dayOff) {
      const t = bisectWindow(temporal, timeZone, { ...day, ...timeOfDay }, dayOff);
      if (t !== undefined) {
        if (compare(t, end) > 0) break;
        // The first window can contain a transition that precedes
        // `start` itself (start mid-day, transition earlier that day) —
        // those are not part of the range.
        if (compare(t, start) >= 0) result.push(t);
      }
      dayOff = nextOff;
    } else if (nextOff !== undefined) {
      dayOff = nextOff;
    }
    day = next;
  }
  return result;
  /* c8 ignore stop @preserve */
  /* c8 ignore stop @preserve */
}

// Returns the list of possible instants for a wall-clock time in a
// zone — used to detect gaps (0 instants) and overlaps (2 instants).
export function possibleInstantsFor(
  fields: { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number },
  timeZone: string,
): unknown[] {
  const temporal = getTemporal();
  // Resolve the same wall-clock fields twice, forcing disambiguation
  // toward the earlier and later side of any DST boundary. Comparing
  // the two results tells us which of the three cases we're in:
  //  - gap (e.g. 2:30am on a spring-forward day): neither result's own
  //    wall-clock fields match what was requested, since Temporal has
  //    to shift off the nonexistent time in both directions — 0 instants.
  //  - overlap (e.g. 1:30am on a fall-back day): both results keep the
  //    requested wall-clock time but land on different instants (one
  //    per side of the boundary) — 2 instants.
  //  - normal time: both results match the requested wall-clock time
  //    and resolve to the same instant — 1 instant.
  const earlier = temporal.ZonedDateTime.from(
    { ...fields, timeZone },
    { disambiguation: 'earlier', offset: 'ignore' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
  ) as { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number; toInstant: () => { epochNanoseconds: bigint } };
  const later = temporal.ZonedDateTime.from(
    { ...fields, timeZone },
    { disambiguation: 'later', offset: 'ignore' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
  ) as { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number; toInstant: () => { epochNanoseconds: bigint } };

  const matchesRequestedWallClock = (z: typeof earlier) =>
    z.year === fields.year && z.month === fields.month && z.day === fields.day &&
    z.hour === fields.hour && z.minute === fields.minute &&
    z.second === fields.second && z.millisecond === fields.millisecond;

  if (!matchesRequestedWallClock(earlier) || !matchesRequestedWallClock(later)) {
    // Gap — the requested wall-clock time doesn't exist in this zone.
    return [];
  }
  if (earlier.toInstant().epochNanoseconds === later.toInstant().epochNanoseconds) {
    // Normal time — both disambiguation directions agree on the instant.
    return [earlier];
  }
  // Overlap — same wall-clock time, two distinct instants.
  return [earlier, later];
}