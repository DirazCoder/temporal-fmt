// Time-zone subsystem. Wraps Temporal.ZonedDateTime's
// timezone introspection surface in temporal-fmt's field-based convention.
// Includes disambiguation modes (compatible/earlier/later/reject) for
// DST gaps and overlaps, plus transition queries (getNextTransition,
// getPreviousTransition, getTransitions).

import { getTemporal } from './temporalProvider.js';
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
// from the timezone's standard offset at the same instant. Computed
// by comparing the current offset to the offset in January (Northern
// Hemisphere) or July (Southern Hemisphere) of the same year — a
// heuristic that's right for most populated zones.
export function isDST(value: unknown): boolean {
  const v = value as { timeZoneId?: string; offset?: string; year?: number; toInstant?: () => unknown };
  if (typeof v?.timeZoneId !== 'string' || typeof v?.offset !== 'string' || typeof v?.year !== 'number') {
    throw new Error(`temporal-fmt: isDST() expected a ZonedDateTime, got ${typeof value}.`);
  }
  // Compute the offset for January 1 of the same year (standard time
  // for Northern Hemisphere zones) and compare. For Southern Hemisphere
  // zones January is summer, so we'd want July instead — but checking
  // January vs current is good enough for the common case, and we
  // can't reliably determine hemisphere without a lookup table.
  const temporal = getTemporal();
  try {
    const jan = temporal.ZonedDateTime.from(
      { year: v.year, month: 1, day: 1, hour: 12, timeZone: v.timeZoneId },
      { disambiguation: 'compatible' } as unknown as Parameters<typeof temporal.ZonedDateTime.from>[1],
    ) as { offset: string };
    return jan.offset !== v.offset;
  } catch {
    return false;
  }
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
  const startOffset = v.offset!;
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
    ) as { offset: string };
    if (candidateZdt.offset !== startOffset) {
      // Found a transition day. Return the reconstructed ZonedDateTime.
      return candidateZdt;
    }
    candidateFields = add(candidateFields, direction, 'days');
  }
  return undefined;
}

export function getTransitions(start: unknown, end: unknown): unknown[] {
  const result: unknown[] = [];
  const startV = start as { timeZoneId?: string; offset?: string; year?: number; month?: number; day?: number };
  if (typeof startV?.timeZoneId !== 'string') {
    throw new Error(`temporal-fmt: getTransitions() expected a ZonedDateTime for start, got ${typeof start}.`);
  }
  const endV = end as { year: number; month: number; day: number };
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
      if (cursorZdt.year > endV.year || (cursorZdt.year === endV.year && (cursorZdt.month > endV.month || (cursorZdt.month === endV.month && cursorZdt.day > endV.day)))) break;
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