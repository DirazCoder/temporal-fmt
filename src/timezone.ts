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

import { getTemporal, type TemporalNamespace } from './temporalProvider.js';
import { add } from './arithmetic.js';

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
export function isDST(value: unknown): boolean {
  const v = value as { timeZoneId?: string; offset?: string; year?: number; toInstant?: () => unknown };
  if (typeof v?.timeZoneId !== 'string' || typeof v?.offset !== 'string' || typeof v?.year !== 'number') {
    throw new Error(`temporal-fmt: isDST() expected a ZonedDateTime, got ${typeof value}.`);
  }
  const temporal = getTemporal();
  try {
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
  } catch {
    return false;
  }
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
// if no transition occurs within the next 2 years. Implemented by
// walking day-by-day checking for offset changes — slow but simple,
// and correct across all IANA zones.
export function getNextTransition(value: unknown): unknown | undefined {
  return findTransition(value, 1);
}

export function getPreviousTransition(value: unknown): unknown | undefined {
  return findTransition(value, -1);
}

function findTransition(value: unknown, direction: 1 | -1): unknown | undefined {
  const v = value as { timeZoneId?: string; offset?: string; toInstant?: () => unknown; year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number };
  if (typeof v?.timeZoneId !== 'string') {
    throw new Error(`temporal-fmt: ${direction > 0 ? 'getNextTransition' : 'getPreviousTransition'}() expected a ZonedDateTime, got ${typeof value}.`);
  }
  const temporal = getTemporal();
  const timeZone = v.timeZoneId;
  let candidateFields = add(value, direction, 'days');
  // Duck-typed input with no `offset` used to hit a non-null lie
  // (`v.offset!`) and find a spurious "transition" on the first
  // candidate day; derive the real starting offset instead.
  const startOffset = typeof v.offset === 'string'
    ? v.offset
    : (() => {
        try {
          return (temporal.ZonedDateTime.from(
            { year: v.year, month: v.month, day: v.day, hour: v.hour ?? 12, timeZone },
            { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
          ) as { offset: string }).offset;
        } catch {
          return undefined;
        }
      })();
  if (startOffset === undefined) return undefined;
  for (let i = 0; i < 365 * 2; i++) {
    // Rebuild a real ZonedDateTime for this candidate day, in this
    // timezone, so `.offset` reflects the actual UTC offset on that
    // day rather than being absent. add() only produces a plain field
    // bag (it has no notion of timezone), so re-attaching timeZone via
    // ZonedDateTime.from is what actually lets us detect a DST change
    // here — using the field bag's own (nonexistent) offset would make
    // every call "find" a transition on the very first day checked.
    const cf = candidateFields as { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };
    const candidateZdt = temporal.ZonedDateTime.from(
      { ...cf, timeZone },
      { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
    ) as { offset: string; year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };
    if (candidateZdt.offset !== startOffset) {
      // Found a transition day. Bisect the actual transition instant
      // within the day: the day-before/day-of boundary is somewhere in
      // the 24h before this candidate. Stepping the reconstruction at
      // the input's wall-clock time used to return "2026-03-08T12:00"
      // for a spring-forward that actually happens at 02:00 — the
      // right day, ten hours late.
      return bisectTransition(temporal, timeZone, candidateZdt, startOffset, direction);
    }
    candidateFields = add(candidateFields, direction, 'days');
  }
  return undefined;
}

// Narrows a transition down to the actual boundary minute by binary
// search over a 24-hour window, probed via a minute-index cursor.
// `direction` is 1 when scanning forward: the transition lies inside
// `day` (whose 12:00 already shows the new offset), so the window is
// [day 00:00, day 24:00). `direction` is -1 when scanning backward:
// `day` is the last day whose 12:00 still shows the OLD offset, so the
// transition lies in (day 12:00, day+1 12:00]. Returns a ZonedDateTime
// at the first minute on the new side. (The old code returned the
// candidate day reconstructed at the INPUT's wall-clock time — e.g.
// "2026-03-08T12:00" for a spring-forward that happens at 02:00.)
function bisectTransition(
  temporal: TemporalNamespace,
  timeZone: string,
  day: { year: number; month: number; day: number; offset: string },
  beforeOffset: string,
  direction: 1 | -1,
): unknown {
  const zonedFrom = temporal.ZonedDateTime.from.bind(temporal.ZonedDateTime) as (f: unknown, o?: unknown) => unknown;
  const options = { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1];
  // Window anchor: midnight of `day` for forward scans; noon of `day`
  // for backward scans (the day's noon is known to still be old-side).
  const windowStart = direction > 0
    ? { year: day.year, month: day.month, day: day.day, hour: 0, minute: 0 }
    : { year: day.year, month: day.month, day: day.day, hour: 12, minute: 0 };
  // Minute m of the window → wall-clock fields via add() (handles
  // rolling past midnight at the window's end).
  const fieldsAt = (m: number) => add(windowStart, m, 'minutes') as { year: number; month: number; day: number; hour: number; minute: number };
  const offsetAt = (m: number): string | undefined => {
    try {
      const f = fieldsAt(m);
      return (zonedFrom({ ...f, timeZone }, options) as { offset: string }).offset;
    } catch {
      return undefined;
    }
  };
  // The old side's offset: `beforeOffset` for forward scans, `day`'s own
  // (still-old) offset for backward scans.
  const oldOffset = direction > 0 ? beforeOffset : day.offset;
  // Binary search over minutes [0, 1440): find the first minute whose
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
  // `hi` is the first new-side minute (1440 = the boundary exactly at
  // the window's end — normalize to the following midnight).
  const boundary = hi >= 1440 ? fieldsAt(1439) : fieldsAt(hi);
  try {
    return zonedFrom({
      year: boundary.year, month: boundary.month, day: boundary.day,
      hour: boundary.hour, minute: boundary.minute, timeZone,
    }, options);
  } catch {
    return day;
  }
}

export function getTransitions(start: unknown, end: unknown): unknown[] {
  const result: unknown[] = [];
  const startV = start as { timeZoneId?: string; offset?: string; year?: number; month?: number; day?: number };
  if (typeof startV?.timeZoneId !== 'string') {
    throw new Error(`temporal-fmt: getTransitions() expected a ZonedDateTime for start, got ${typeof start}.`);
  }
  // `end` used to be dereferenced raw (`endV.year`) with no guard —
  // passing undefined crashed with a bare V8 TypeError.
  const endV = end as { year?: number; month?: number; day?: number };
  if (typeof endV?.year !== 'number' || typeof endV?.month !== 'number' || typeof endV?.day !== 'number') {
    throw new Error(`temporal-fmt: getTransitions() expected a date-carrying value for end, got ${typeof end}.`);
  }
  const endYear = endV.year, endMonth = endV.month, endDay = endV.day;
  const temporal = getTemporal();
  const timeZone = startV.timeZoneId;
  let cursorFields = add(start, 1, 'days');
  let lastOffset = startV.offset!;
  for (let i = 0; i < 365 * 5; i++) {
    // Same reconstruction as findTransition() above — add() strips
    // timezone/offset info, so we rebuild a real ZonedDateTime each
    // iteration to read its actual offset instead of comparing against
    // a field bag that never has one.
    const cf = cursorFields as { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number };
    const cursorZdt = temporal.ZonedDateTime.from(
      { ...cf, timeZone },
      { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
    ) as { offset: string; year: number; month: number; day: number };
    if (cursorZdt.offset !== lastOffset) {
      // Found a transition.
      if (cursorZdt.year > endYear || (cursorZdt.year === endYear && (cursorZdt.month > endMonth || (cursorZdt.month === endMonth && cursorZdt.day > endDay)))) break;
      result.push(cursorZdt);
      lastOffset = cursorZdt.offset;
    }
    cursorFields = add(cursorFields, 1, 'days');
  }
  return result;
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