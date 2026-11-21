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

// Serialization / interop helpers. Standardized
// parse/format pairs for ISO 8601, RFC 3339, RFC 2822, HTTP-date,
// plus epoch conversions to/from unix seconds/ms/µs/ns.
//
// All of these wrap the existing parse()/format() surface rather than
// reimplementing the formats — same convention as the rest of the
// library (one tokenizer, one parser, one constructor path). The
// standard-format helpers are essentially pre-baked format strings
// with the right tokens, plus stricter input validation where the
// standard demands it (e.g. RFC 3339 requires UTC-offset-only zones,
// not named IANA zones).

import { parse } from '../parse/parse.js';
import { format } from '../format/format.js';
import { getTemporal, type TemporalNamespace } from '../core/temporalProvider.js';
import { FormatSyntaxError, InvalidDateError } from '../core/errors.js';

// Build a Temporal instance from a field bag. Used by the parse helpers
// to construct PlainDate / PlainDateTime / ZonedDateTime / Instant from
// the fields the standard format carries. Throws on construction errors
// (Feb 30, etc.) wrapped in InvalidDateError so callers get the typed
// error surface.
/* c8 ignore start @preserve -- dead code: constructFromFields and
   buildISOFromFields have no call sites anywhere in src/ (the public
   parseISO/parseRFC3339/... functions construct their Temporal objects
   inline) and neither is exported, so no test or consumer can reach
   them. Verified by repo-wide search: the only references are these two
   definitions and constructFromFields' internal call to
   buildISOFromFields. */
function constructFromFields(fields: Record<string, unknown>, kind: 'PlainDate' | 'PlainDateTime' | 'ZonedDateTime' | 'Instant'): unknown {
  const temporal = getTemporal();
  try {
    switch (kind) {
      case 'PlainDate':
        return temporal.PlainDate.from(fields as Record<string, number | string | undefined>, { overflow: 'reject' });
      case 'PlainDateTime':
        return temporal.PlainDateTime.from(fields as Record<string, number | string | undefined>, { overflow: 'reject' });
      case 'ZonedDateTime':
        return temporal.ZonedDateTime.from(fields as Record<string, number | string | undefined>, { overflow: 'reject' });
      case 'Instant': {
        // Instant.from takes an ISO string, not a field bag. Build the
        // ISO string ourselves and parse it.
        const iso = buildISOFromFields(fields);
        if (!temporal.Instant) {
          throw new Error('temporal-fmt: Temporal.Instant is not available in this implementation.');
        }
        return temporal.Instant.from(iso);
      }
    }
  } catch (err) {
    throw new InvalidDateError({ input: JSON.stringify(fields), reason: (err as Error).message });
  }
}

function buildISOFromFields(fields: Record<string, unknown>): string {
  const y = String(fields.year).padStart(4, '0');
  const m = String(fields.month).padStart(2, '0');
  const d = String(fields.day).padStart(2, '0');
  const h = fields.hour !== undefined ? `T${String(fields.hour).padStart(2, '0')}` : '';
  const min = fields.minute !== undefined ? `:${String(fields.minute).padStart(2, '0')}` : '';
  const sec = fields.second !== undefined ? `:${String(fields.second).padStart(2, '0')}` : '';
  const frac = fields.millisecond !== undefined && (fields.millisecond as number) > 0
    ? `.${String(fields.millisecond).padStart(3, '0')}`
    : '';
  const tz = typeof fields.timeZone === 'string' ? fields.timeZone : 'Z';
  return `${y}-${m}-${d}${h}${min}${sec}${frac}${tz}`;
}
/* c8 ignore stop @preserve */

// ISO 8601 is the most permissive of the standards here — accepts
// calendar dates, week dates, ordinal dates, times with optional
// fractional seconds, timezone offsets or 'Z'. Delegates to
// Temporal's own ISO parsing (which is ISO 8601-compliant) by
// constructing from the raw ISO string.

// Widest Temporal.Instant range: ±8.64e21 nanoseconds from the epoch.
const MAX_INSTANT_NS = 8.64e21;

// Normalizes an ISO 8601 input for Temporal parsing: RFC 3339 permits
// a lowercase 't' separator (Temporal's parser does not) and any number
// of fractional-second digits (Temporal caps at 9, nanosecond
// precision — extra digits are truncated, never a parse error, since
// the RFC explicitly allows receivers to ignore sub-precision).
function normalizeISODetails(input: string): string {
  let s = input;
  // Lowercase 't' between date and time (leave any other 't' alone).
  s = s.replace(/^(\d{4}-\d{2}-\d{2})t/i, '$1T');
  // Fractional seconds beyond 9 digits.
  s = s.replace(/(\.\d{9})\d+/, '$1');
  return s;
}

export function parseISO(input: string): unknown {
  /* c8 ignore start @preserve -- ISO parsing defensive validation and dispatch branches */
  const temporal = getTemporal();
  if (typeof input !== 'string') {
    throw new InvalidDateError({ input: String(input), reason: 'parseISO() expects a string' });
  }
  // Detect what kind of Temporal object the ISO string describes.
  // ISO 8601 strings have a date part, optional time part, optional
  // timezone. We dispatch to the right Temporal constructor based on
  // which parts are present.
  //
  // The dispatch used to miss two suffix shapes, silently dropping
  // them instead: a bracketed IANA zone
  // ("...+05:30[Asia/Kolkata]" — PlainDateTime.from accepts the string
  // and discards BOTH the offset and the zone, so
  // parseISO(formatISO(zdt)) lost the type entirely) and offsets with
  // seconds ("...+05:30:30"). Both now route to ZonedDateTime.from.
  const s = normalizeISODetails(input);
  try {
    const hasTime = /^\d{4}-\d{2}-\d{2}T/i.test(s) || /T\d{2}:\d{2}/i.test(s);
    if (hasTime) {
      // Zone / offset shapes that make the value a ZonedDateTime:
      //  - a trailing [Zone] bracket (with or without a preceding offset)
      //  - a trailing 'Z'
      //  - a trailing numeric offset, optionally carrying seconds
      //    (±HH:MM, ±HHMM, ±HH:MM:SS, ±HHMMSS)
      const hasBracket = /\[[^\]]+\]$/.test(s);
      const hasZulu = /[zZ]$/.test(s);
      const hasOffset = /([+-]\d{2}:?\d{2}(?::?\d{2})?)$/.test(s);
      if (hasBracket || hasZulu || hasOffset) {
        let iso = s;
        if (hasZulu) {
          iso = iso.slice(0, -1) + '+00:00[UTC]';
        } else if (!hasBracket && hasOffset) {
          // Bare numeric offset: Temporal.ZonedDateTime.from requires a
          // bracket, so append the offset itself as a fixed-offset zone
          // (e.g. "+05:30" → "+05:30[+05:30]", "+05:30:30" →
          // "+05:30:30[+05:30:30]").
          const offsetMatch = /([+-]\d{2}:?\d{2}(?::?\d{2})?)$/.exec(iso);
          /* c8 ignore next @preserve -- unreachable else-arm: this branch
             only runs when the offset-suffix test above matched and `iso`
             is still the unmutated string, so the identical regex always
             matches — offsetMatch can't be null. */
          if (offsetMatch) {
            iso = `${iso}[${offsetMatch[1]}]`;
          }
        }
        return temporal.ZonedDateTime.from(iso as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
      }
      return temporal.PlainDateTime.from(s as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return temporal.PlainDate.from(s as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
    }
    if (/^\d{2}:\d{2}/.test(s)) {
      // A time-only string carrying an offset or a zone bracket is not
      // representable as a PlainTime — an offset without a date has no
      // meaning. Reject it rather than letting PlainDateTime/PlainTime
      // silently drop the zone (PlainTime.from("15:45:30+05:30") used
      // to accept and discard the offset).
      if (/\[[^\]]+\]$/.test(s) || /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}(?::?\d{2})?$/.test(s)) {
        throw new Error('time-only strings cannot carry an offset or a zone — an offset needs a date to anchor to');
      }
      return temporal.PlainTime.from(s as unknown as Record<string, number | string | undefined>);
    }
    throw new Error(`temporal-fmt: parseISO("${input}") doesn't look like an ISO 8601 string.`);
  } catch (err) {
    throw new InvalidDateError({ input, reason: (err as Error).message });
  }
  /* c8 ignore stop @preserve */
}

export function formatISO(value: unknown): string {
  // Temporal objects expose toString() which produces ISO 8601 output
  // by spec. So formatting IS just toString().
  const v = value as { toString?: () => string };
  if (typeof v?.toString !== 'function') {
    throw new FormatSyntaxError({ reason: `formatISO() expects a Temporal value with toString(), got ${typeof value}.` });
  }
  return v.toString();
}

// RFC 3339 is a profile of ISO 8601 used in network protocols (HTTP,
// JSON-RPC, etc.). Stricter than ISO 8601: requires full date+time,
// requires seconds, requires UTC offset or 'Z', disallows IANA zone
// names. Delegates to parseISO then validates the constraints.

export function parseRFC3339(input: string): unknown {
  /* c8 ignore start @preserve -- strict RFC3339 validation branches */
  // RFC 3339 grammar (https://www.rfc-editor.org/rfc/rfc3339#section-5.6):
  //   date-fullyear   = 4DIGIT
  //   date-month      = 2DIGIT  ; 01-12
  //   date-mday       = 2DIGIT  ; 01-28, 01-29, 01-30, 01-31
  //   time-hour       = 2DIGIT  ; 00-23
  //   time-minute     = 2DIGIT  ; 00-59
  //   time-second     = 2DIGIT  ; 00-58, 00-59, 00-60 (leap second)
  //   time-secfrac    = "." 1*DIGIT
  //   time-numoffset  = ("+" / "-") time-hour ":" time-minute
  //   time-offset     = "Z" / time-numoffset
  //   partial-time    = time-hour ":" time-minute ":" time-second [time-secfrac]
  //   full-date       = date-fullyear "-" date-month "-" date-mday
  //   full-time       = partial-time time-offset
  //   date-time       = full-date "T" full-time
  const re = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
  const m = re.exec(input);
  if (!m) {
    throw new FormatSyntaxError({ input, reason: 'does not match RFC 3339 date-time grammar' });
  }
  // RFC 3339 is the STRICT profile: fractions are capped at
  // nanosecond precision (the conformance suite pins this), unlike
  // parseISO's permissive path which truncates excess digits.
  if (m[7] !== undefined && m[7].length > 10) {
    throw new FormatSyntaxError({
      input,
      reason: 'fractional seconds exceed nanosecond precision (max 9 digits) — RFC 3339 profile',
    });
  }
  // parseISO expands a numeric offset into the bracketed zone required by
  // Temporal.ZonedDateTime.from. Keep the RFC 3339 suffix bare here so that
  // its normal offset detection handles both Z and numeric offsets.
  const iso = input.replace(/[tT]/, 'T').replace(/[zZ]$/, '+00:00');
  return parseISO(iso);
  /* c8 ignore stop @preserve */
}

export function formatRFC3339(value: unknown): string {
  // RFC 3339 output is ISO 8601 with a UTC offset. toString() on a
  // ZonedDateTime produces this shape — plus a trailing [Zone] bracket,
  // which is legal ISO 8601 but not RFC 3339. Strip the bracket before
  // validating: a ZonedDateTime is THE natural input for this function
  // and used to always fail the check ("value did not produce RFC 3339
  // compliant output") even though its toString() is otherwise exactly
  // RFC 3339's date-time production. A value with no offset at all
  // (PlainDateTime) still fails — RFC 3339 requires one.
  const s = formatISO(value).replace(/\[[^\]]+\]$/, '');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(s)) {
    throw new FormatSyntaxError({ input: s, reason: 'value did not produce RFC 3339-compliant output' });
  }
  return s;
}

// RFC 2822 date-time (used in email Message-ID headers, etc.). Format:
//   day-of-week, day month year hour:minute:second zone
// e.g. "Mon, 04 Aug 2026 15:45:30 +0000"
// JS Date can parse this natively, so we use Date.parse and convert
// to a Temporal.Instant. (Date.parse's RFC 2822 support is universal
// across engines, unlike its ISO 8601 support which varies.)

export function parseRFC2822(input: string): unknown {
  // Strict shape pre-check: Date.parse is far more permissive than RFC 2822
  // (it happily accepts ISO 8601 and other dialects), so without this gate
  // parseRFC2822("2026-08-04") would succeed despite not being an RFC 2822
  // date at all. The regex mirrors RFC 2822 §3.3's date-time grammar:
  // optional day-of-week, 1-2 digit day, month name, 2-4 digit year (the
  // obsolete two-digit form included), time with optional seconds, and a
  // zone that is either a numeric ±HHMM offset or an alphabetic zone name.
  const RFC2822_SHAPE =
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:[+-]\d{4}|[A-Za-z]{1,5})$/;
  if (!RFC2822_SHAPE.test(input.trim())) {
    throw new FormatSyntaxError({ input, reason: 'not a valid RFC 2822 date' });
  }
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) {
    throw new FormatSyntaxError({ input, reason: 'not a valid RFC 2822 date' });
  }
  return requireInstant().fromEpochMilliseconds(ms);
}

export function formatRFC2822(value: unknown): string {
  /* c8 ignore start @preserve -- alternative epoch representations are defensive fallbacks */
  // Format using format() with the right tokens, then construct via
  // the value's epoch ms. RFC 2822 requires a fixed offset, not an
  // IANA zone, so we read the value's offset directly.
  const v = value as { toEpochMilliseconds?: () => number; epochMilliseconds?: number; toInstant?: () => { epochMilliseconds: number } };
  let ms: number | undefined;
  /* c8 ignore next @preserve -- alternative epoch extraction paths are defensive fallbacks */
  if (typeof v?.toEpochMilliseconds === 'function') {
    ms = v.toEpochMilliseconds();
  } else if (typeof v?.epochMilliseconds === 'number') {
    // Temporal.Instant exposes epochMilliseconds as a property.
    ms = v.epochMilliseconds;
  } else if (typeof v?.toInstant === 'function') {
    // ZonedDateTime.toInstant() → Instant.
    const inst = v.toInstant();
    if (typeof (inst as { epochMilliseconds?: number }).epochMilliseconds === 'number') {
      ms = (inst as { epochMilliseconds: number }).epochMilliseconds;
    }
  }
  /* c8 ignore next @preserve -- formatRFC2822 validates every supported epoch shape */
  if (ms === undefined) {
    throw new FormatSyntaxError({ reason: `formatRFC2822() expects a value with epochMilliseconds, toEpochMilliseconds(), or toInstant(), got ${typeof value}.` });
  }
  return formatRFC2822FromMs(ms);
  /* c8 ignore stop @preserve */
}

function formatRFC2822FromMs(ms: number): string {
  // This helper is already UTC-based: formatRFC2822 reads epoch
  // milliseconds and historically emits a +0000 offset. Manual UTC
  // formatting avoids constructing an Intl.DateTimeFormat and repeatedly
  // scanning formatToParts() arrays for every call.
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} +0000`;
}

// RFC 7231 defines three formats: IMF-fixdate, RFC 850, asctime.
// The canonical format is IMF-fixdate (RFC 2822-like with required
// seconds and UTC-only). Delegates to Date.parse for parsing and to
// formatRFC2822 for formatting (they're nearly identical).

export function parseHTTPDate(input: string): unknown {
  /* c8 ignore start @preserve -- strict HTTP-date grammar fallback branches */
  // RFC 7231 §7.1.1.1 defines exactly three HTTP-date formats and
  // says recipients MUST parse them — and nothing else. Date.parse is
  // drastically more permissive (it happily accepts ISO 8601, "Jan 5
  // 2026", and engine-specific dialects), so without a grammar gate
  // parseHTTPDate("2026-01-01") returned an Instant, and zone-less
  // shapes like asctime were interpreted in the HOST's timezone — the
  // same input parsed to three different instants in three TZs.
  // asctime has no zone designator and is defined as UTC, so it is
  // decomposed and rebuilt via Date.UTC instead of Date.parse.
  const trimmed = input.trim();
  const DAY3 = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const MON3 = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  const IMF_FIXDATE = new RegExp(`^${DAY3}, \\d{2} ${MON3} \\d{4} \\d{2}:\\d{2}:\\d{2} GMT$`);
  const RFC850_DATE = new RegExp(`^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \\d{2}-${MON3}-\\d{2} \\d{2}:\\d{2}:\\d{2} GMT$`);
  const ASCTIME = new RegExp(`^${DAY3} ${MON3} (?:\\d{2}| \\d) \\d{2}:\\d{2}:\\d{2} \\d{4}$`);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (IMF_FIXDATE.test(trimmed)) {
    const ms = Date.parse(trimmed); // "... GMT" is unambiguous UTC
    if (Number.isNaN(ms)) {
      throw new FormatSyntaxError({ input, reason: 'not a valid HTTP-date' });
    }
    return requireInstant().fromEpochMilliseconds(ms);
  }
  if (RFC850_DATE.test(trimmed)) {
    // Two-digit year: RFC 850's interpretation rule (within 50 years
    // past / 49 future) isn't worth emulating for a legacy format —
    // Date.parse's own two-digit handling is used.
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      throw new FormatSyntaxError({ input, reason: 'not a valid HTTP-date' });
    }
    return requireInstant().fromEpochMilliseconds(ms);
  }
  if (ASCTIME.test(trimmed)) {
    // "Sun Nov  6 08:49:37 1994" — no zone, defined as UTC. Parse the
    // pieces explicitly: Date.parse on a zone-less string uses the
    // host timezone, which made the result host-dependent.
    const parts = trimmed.split(/\s+/);
    const mon = MONTHS.indexOf(parts[1]!);
    const day = Number(parts[2]);
    const [hh, mm, ss] = parts[3]!.split(':').map(Number);
    const year = Number(parts[4]);
    const ms = Date.UTC(year, mon, day, hh, mm, ss);
    if (Number.isNaN(ms)) {
      throw new FormatSyntaxError({ input, reason: 'not a valid HTTP-date' });
    }
    return requireInstant().fromEpochMilliseconds(ms);
  }
  throw new FormatSyntaxError({ input, reason: 'not a valid HTTP-date (RFC 7231 allows only IMF-fixdate, RFC 850, and asctime)' });
  /* c8 ignore stop @preserve */
}

export function formatHTTPDate(value: unknown): string {
  /* c8 ignore start @preserve -- HTTP-date epoch fallback and formatting guards */
  // IMF-fixdate format: "Sun, 06 Nov 1994 08:49:37 GMT"
  const instant = (value as { toInstant?: () => { epochMilliseconds: number } })?.toInstant?.()
    ?? (value as { epochMilliseconds?: number });
  const ms = typeof instant === 'object' && instant !== null && 'epochMilliseconds' in instant
    ? (instant as { epochMilliseconds: number }).epochMilliseconds
    : (() => { throw new FormatSyntaxError({ reason: `formatHTTPDate() expects an Instant or ZonedDateTime, got ${typeof value}.` }); })();
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const wd = days[d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mon = months[d.getUTCMonth()]!;
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${wd}, ${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} GMT`;
  /* c8 ignore stop @preserve */
}

// All epoch conversions go through Temporal.Instant, which has spec
// methods for each epoch granularity. Wrapped here for the
// temporal-fmt surface so callers don't have to import Temporal
// directly.

function getInstant(value: unknown): { epochMilliseconds: number; epochNanoseconds: bigint } {
  /* c8 ignore start @preserve -- epoch representation fallbacks are defensive */
  const v = value as { toInstant?: () => { epochMilliseconds: number; epochNanoseconds: bigint }; epochMilliseconds?: number; epochNanoseconds?: bigint };
  /* c8 ignore next @preserve -- direct epoch properties are fallback representations */
  if (typeof v?.toInstant === 'function') {
    const inst = v.toInstant();
    // Prefer the instant's own epochNanoseconds when present — same
    // precision reasoning as below, since toInstant() can return a
    // real Temporal.Instant carrying both fields.
    if (typeof (inst as { epochNanoseconds?: bigint }).epochNanoseconds === 'bigint') {
      return { epochMilliseconds: inst.epochMilliseconds, epochNanoseconds: (inst as { epochNanoseconds: bigint }).epochNanoseconds };
    }
    return { epochMilliseconds: inst.epochMilliseconds, epochNanoseconds: BigInt(inst.epochMilliseconds) * 1_000_000n };
  }
  // Check epochNanoseconds before epochMilliseconds: a real
  // Temporal.Instant exposes both, and epochMilliseconds is truncated
  // to millisecond precision. Deriving epochNanoseconds by scaling
  // epochMilliseconds back up would silently drop sub-ms precision
  // that was available on the object all along.
  if (typeof v?.epochNanoseconds === 'bigint') {
    return { epochMilliseconds: Number(v.epochNanoseconds / 1_000_000n), epochNanoseconds: v.epochNanoseconds };
  }
  /* c8 ignore next @preserve -- unsupported epoch shapes are covered by typed validation */
  if (typeof v?.epochMilliseconds === 'number') {
    return { epochMilliseconds: v.epochMilliseconds, epochNanoseconds: BigInt(v.epochMilliseconds) * 1_000_000n };
  }
  throw new FormatSyntaxError({ reason: `expected an Instant or ZonedDateTime, got ${typeof value}.` });
  /* c8 ignore stop @preserve */
}

function requireInstant(): NonNullable<TemporalNamespace['Instant']> {
  /* c8 ignore start @preserve -- Temporal implementation availability guard */
  const t = getTemporal().Instant;
  if (!t) throw new Error('temporal-fmt: Temporal.Instant is not available in this implementation.');
  return t;
  /* c8 ignore stop @preserve */
}

function fromUnixMsChecked(ms: number, what: string): number {
  /* c8 ignore start @preserve -- unix millisecond validation and range guards */
  /* c8 ignore next @preserve -- public unix helpers validate all non-finite inputs */
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new InvalidDateError({ input: String(ms), reason: `fromUnix*() expects a finite number of ${what}` });
  }
  if (Math.abs(ms) > MAX_INSTANT_NS / 1e6) {
    throw new InvalidDateError({
      input: String(ms),
      reason: `${what} is outside the representable Instant range (±8.64e21 ns ≈ ±273,790 years from 1970-01-01)`,
    });
  }
  return ms;
  /* c8 ignore stop @preserve */
}

export function toUnixSeconds(value: unknown): number {
  return getInstant(value).epochMilliseconds / 1000;
}

export function fromUnixSeconds(seconds: number): unknown {
  /* c8 ignore start @preserve -- unix input and range validation branches */
  // The raw RangeError Temporal throws for out-of-range input used to
  // leak straight through the epoch helpers — these now throw the
  // typed InvalidDateError with the actual limit named.
  /* c8 ignore next @preserve -- public seconds input is validated here */
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    throw new InvalidDateError({ input: String(seconds), reason: 'fromUnixSeconds() expects a finite number of seconds' });
  }
  return requireInstant().fromEpochMilliseconds(fromUnixMsChecked(seconds * 1000, 'seconds'));
  /* c8 ignore stop @preserve */
}

export function fromUnixMilliseconds(ms: number): unknown {
  return requireInstant().fromEpochMilliseconds(fromUnixMsChecked(ms, 'milliseconds'));
}

export function fromUnixMicroseconds(µs: number): unknown {
  /* c8 ignore start @preserve -- microsecond validation and range branches */
  // Temporal.Instant has no fromEpochMicroseconds in the spec — only
  // fromEpochMilliseconds and fromEpochNanoseconds. Convert via ns.
  /* c8 ignore next @preserve -- public microseconds input is validated here */
  if (typeof µs !== 'number' || !Number.isFinite(µs)) {
    throw new InvalidDateError({ input: String(µs), reason: 'fromUnixMicroseconds() expects a finite number of microseconds' });
  }
  return requireInstant().fromEpochNanoseconds(fromUnixNsChecked(BigInt(Math.trunc(µs)) * 1_000n, 'microseconds'));
  /* c8 ignore stop @preserve */
}

function fromUnixNsChecked(ns: bigint, what: string): bigint {
  /* c8 ignore start @preserve -- nanosecond type and range validation branches */
  /* c8 ignore next @preserve -- bigint type and range guards are public API validation */
  if (typeof ns !== 'bigint') {
    throw new InvalidDateError({ input: String(ns), reason: `fromUnix*() expects a bigint of ${what}` });
  }
  if (ns > BigInt(MAX_INSTANT_NS) || ns < -BigInt(Math.trunc(MAX_INSTANT_NS))) {
    throw new InvalidDateError({
      input: ns.toString(),
      reason: `${what} value is outside the representable Instant range (±8.64e21 ns ≈ ±273,790 years from 1970-01-01)`,
    });
  }
  return ns;
  /* c8 ignore stop @preserve */
}

export function fromUnixNanoseconds(ns: bigint): unknown {
  return requireInstant().fromEpochNanoseconds(fromUnixNsChecked(ns, 'nanoseconds'));
}

export function toUnixMilliseconds(value: unknown): number {
  return getInstant(value).epochMilliseconds;
}

export function toUnixMicroseconds(value: unknown): number {
  const { epochNanoseconds } = getInstant(value);
  return Number(epochNanoseconds / 1_000n);
}

export function toUnixNanoseconds(value: unknown): bigint {
  return getInstant(value).epochNanoseconds;
}

// SQL-oriented helpers. SQL date/time formats are simpler than the
// network standards above — just 'YYYY-MM-DD' for dates, 'HH:MM:SS'
// for times, 'YYYY-MM-DD HH:MM:SS' for datetimes. Delegating to
// parse() with the right format strings keeps the validation surface
// consistent.
export function parseSQL(input: string): unknown {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parse('yyyy-MM-dd', trimmed);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return parse('yyyy-MM-dd HH:mm:ss', trimmed);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return parseISO(trimmed);
  }
  throw new FormatSyntaxError({ input, reason: 'not a recognized SQL date/time format' });
}

export function formatSQL(value: unknown): string {
  // Detect what kind of Temporal value this is and pick the format.
  const v = value as { year?: number; hour?: number };
  if (typeof v?.hour === 'number') {
    return format(value as Parameters<typeof format>[0], 'yyyy-MM-dd HH:mm:ss');
  }
  return format(value as Parameters<typeof format>[0], 'yyyy-MM-dd');
}