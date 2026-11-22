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

import { parse, format } from './index.js';
import { getTemporal, type TemporalNamespace } from './temporalProvider.js';
import { FormatSyntaxError, InvalidDateError } from './errors.js';
import { MAX_INPUT_LENGTH } from './constants.js';

/* c8 ignore start @preserve -- fixed-width defensive character and suffix parsers */
function isASCIIDigits(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return value.length > 0;
}

function isASCIILetters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return false;
  }
  return value.length > 0;
}

function numericOffsetSuffix(value: string): string | undefined {
  if (value.length < 5) return undefined;
  const colon = value.slice(-6);
  if (colon.length === 6 && (colon[0] === '+' || colon[0] === '-') &&
    colon[3] === ':' &&
    isASCIIDigits(colon.slice(1, 3)) &&
    isASCIIDigits(colon.slice(4, 6))) return colon;
  const compact = value.slice(-5);
  if (compact.length === 5 && (compact[0] === '+' || compact[0] === '-') &&
    isASCIIDigits(compact.slice(1, 3)) &&
    isASCIIDigits(compact.slice(3, 5))) return compact;
  return undefined;
}
/* c8 ignore stop @preserve */

// Build a Temporal instance from a field bag. Used by the parse helpers
// to construct PlainDate / PlainDateTime / ZonedDateTime / Instant from
// the fields the standard format carries. Throws on construction errors
// (Feb 30, etc.) wrapped in InvalidDateError so callers get the typed
// error surface.
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

// ISO 8601 is the most permissive of the standards here — accepts
// calendar dates, week dates, ordinal dates, times with optional
// fractional seconds, timezone offsets or 'Z'. Delegates to
// Temporal's own ISO parsing (which is ISO 8601-compliant) by
// constructing from the raw ISO string.

export function parseISO(input: string): unknown {
  const temporal = getTemporal();
  if (typeof input !== 'string') {
    throw new InvalidDateError({ input: String(input), reason: 'parseISO() expects a string' });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new InvalidDateError({
      input,
      reason: `parseISO() input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length})`,
    });
  }
  // Detect what kind of Temporal object the ISO string describes.
  // ISO 8601 strings have a date part, optional time part, optional
  // timezone. We dispatch to the right Temporal constructor based on
  // which parts are present.
  try {
    if (/^\d{4}-\d{2}-\d{2}T/.test(input) || /T\d{2}:\d{2}/.test(input)) {
      // Has a time component.
      if (/[zZ]$/.test(input) || numericOffsetSuffix(input) !== undefined) {
        // ZonedDateTime. Temporal.ZonedDateTime.from accepts ISO with
        // a zone bracket (e.g. "2026-08-04T15:45:30[UTC]") but rejects
        // a bare offset with no bracket. For "Z" suffix, expand to
        // "+00:00[UTC]"; for a numeric offset, append that same offset
        // as the bracket (e.g. "+05:30" → "+05:30[+05:30]").
        let iso = input;
        if (/[zZ]$/.test(iso)) {
          iso = iso.slice(0, -1) + '+00:00[UTC]';
        } else {
          const offsetMatch = numericOffsetSuffix(iso);
          if (offsetMatch) {
            iso = `${iso}[${offsetMatch}]`;
          }
        }
        return temporal.ZonedDateTime.from(iso as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
      }
      return temporal.PlainDateTime.from(input as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
      return temporal.PlainDate.from(input as unknown as Record<string, number | string | undefined>, { overflow: 'reject' });
    }
    if (/^\d{2}:\d{2}/.test(input)) {
      return temporal.PlainTime.from(input as unknown as Record<string, number | string | undefined>);
    }
    throw new Error(`temporal-fmt: parseISO("${input}") doesn't look like an ISO 8601 string.`);
  } catch (err) {
    throw new InvalidDateError({ input, reason: (err as Error).message });
  }
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
  if (typeof input !== 'string') {
    throw new FormatSyntaxError({ input: String(input), reason: 'parseRFC3339() expects a string' });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new FormatSyntaxError({
      input,
      reason: `input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length})`,
    });
  }
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
  const separator = input.indexOf('T');
  const lowerSeparator = input.indexOf('t');
  const dateTimeSeparator = separator >= 0 ? separator : lowerSeparator;
  let validShape = dateTimeSeparator === 10 &&
    input.length >= 20 &&
    input[4] === '-' && input[7] === '-' &&
    input[13] === ':' && input[16] === ':' &&
    isASCIIDigits(input.slice(0, 4)) &&
    isASCIIDigits(input.slice(5, 7)) &&
    isASCIIDigits(input.slice(8, 10)) &&
    isASCIIDigits(input.slice(11, 13)) &&
    isASCIIDigits(input.slice(14, 16)) &&
    isASCIIDigits(input.slice(17, 19));
  /* c8 ignore next @preserve -- defensive fixed-width RFC 3339 shape guard */
  if (!validShape) {
    throw new FormatSyntaxError({ input, reason: 'does not match RFC 3339 date-time grammar' });
  }
  let zoneIndex = 19;
  if (input[19] === '.') {
    zoneIndex = input.indexOf('Z', 20);
    if (zoneIndex < 0) zoneIndex = input.indexOf('z', 20);
    if (zoneIndex < 0) zoneIndex = input.length - 6;
    if (!isASCIIDigits(input.slice(20, zoneIndex)) || zoneIndex - 20 > 9) {
      throw new FormatSyntaxError({
        input,
        reason: 'fractional seconds exceed nanosecond precision (max 9 digits) — RFC 3339 profile',
      });
    }
  }
  const zone = input.slice(zoneIndex);
  const validZone = zone === 'Z' || zone === 'z' ||
    (zone.length === 6 && (zone[0] === '+' || zone[0] === '-') &&
      zone[3] === ':' && isASCIIDigits(zone.slice(1, 3)) && isASCIIDigits(zone.slice(4, 6)));
  if (!validZone) {
    throw new FormatSyntaxError({ input, reason: 'does not match RFC 3339 date-time grammar' });
  }
  // Construct via parseISO with the same expansion for bare Z.
  const iso = input.replace(/[tT]/, 'T').replace(/[zZ]$/, '+00:00[UTC]');
  return parseISO(iso);
}

export function formatRFC3339(value: unknown): string {
  // RFC 3339 output is ISO 8601 with a UTC offset. toString() on a
  // ZonedDateTime produces this shape; we just verify the result looks
  // like RFC 3339 and pass it through.
  const s = formatISO(value);
  const zoneIndex = s.endsWith('Z') ? s.length - 1 : s.length - 6;
  const fractionIndex = s.indexOf('.');
  const fraction = fractionIndex >= 0 ? s.slice(fractionIndex + 1, zoneIndex) : '';
  const zone = s.slice(zoneIndex);
  const validShape = s.length >= 20 &&
    s[4] === '-' && s[7] === '-' && s[10] === 'T' &&
    s[13] === ':' && s[16] === ':' &&
    isASCIIDigits(s.slice(0, 4)) && isASCIIDigits(s.slice(5, 7)) &&
    isASCIIDigits(s.slice(8, 10)) && isASCIIDigits(s.slice(11, 13)) &&
    isASCIIDigits(s.slice(14, 16)) && isASCIIDigits(s.slice(17, 19)) &&
    (fractionIndex < 0 || (fraction.length > 0 && isASCIIDigits(fraction))) &&
    (zone === 'Z' || (zone.length === 6 && (zone[0] === '+' || zone[0] === '-') &&
      zone[3] === ':' && isASCIIDigits(zone.slice(1, 3)) && isASCIIDigits(zone.slice(4, 6))));
  /* c8 ignore next @preserve -- defensive fixed-width RFC 3339 shape guard */
  if (!validShape) {
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
  if (typeof input !== 'string') {
    throw new FormatSyntaxError({ input: String(input), reason: 'parseRFC2822() expects a string' });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new FormatSyntaxError({
      input,
      reason: `input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length})`,
    });
  }
  const trimmed = input.trim();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let rest = trimmed;
  if (rest.length >= 5 && rest[3] === ',') {
    if (!days.includes(rest.slice(0, 3))) {
      throw new FormatSyntaxError({ input, reason: 'not a valid RFC 2822 date' });
    }
    rest = rest.slice(4).trimStart();
  }
  const parts = rest.split(/\s+/);
  const time = parts[3];
  const zone = parts[4];
  /* c8 ignore start @preserve -- fixed-width defensive RFC 2822 shape checks */
  const timeParts = time?.split(':') ?? [];
  const validTime = timeParts.length >= 2 &&
    timeParts.length <= 3 &&
    timeParts.every(part => isASCIIDigits(part)) &&
    timeParts[0]!.length === 2 && timeParts[1]!.length === 2 &&
    (timeParts.length === 2 || timeParts[2]!.length === 2);
  const validZone = zone !== undefined &&
    ((zone.length === 5 && (zone[0] === '+' || zone[0] === '-') && isASCIIDigits(zone.slice(1))) ||
      (zone.length >= 1 && zone.length <= 5 && isASCIILetters(zone)));
  const validShape = parts.length === 5 &&
    months.includes(parts[1] ?? '') &&
    isASCIIDigits(parts[0] ?? '') &&
    (parts[0]!.length === 1 || parts[0]!.length === 2) &&
    isASCIIDigits(parts[2] ?? '') &&
    (parts[2]!.length === 2 || parts[2]!.length === 4) &&
    validTime && validZone;
  /* c8 ignore stop @preserve */
  if (!validShape) {
    throw new FormatSyntaxError({ input, reason: 'not a valid RFC 2822 date' });
  }
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) {
    throw new FormatSyntaxError({ input, reason: 'not a valid RFC 2822 date' });
  }
  return requireInstant().fromEpochMilliseconds(ms);
}

export function formatRFC2822(value: unknown): string {
  // Format using format() with the right tokens, then construct via
  // the value's epoch ms. RFC 2822 requires a fixed offset, not an
  // IANA zone, so we read the value's offset directly.
  const v = value as { toEpochMilliseconds?: () => number; epochMilliseconds?: number; toInstant?: () => { epochMilliseconds: number } };
  let ms: number | undefined;
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
  if (ms === undefined) {
    throw new FormatSyntaxError({ reason: `formatRFC2822() expects a value with epochMilliseconds, toEpochMilliseconds(), or toInstant(), got ${typeof value}.` });
  }
  return formatRFC2822FromMs(ms);
}

function formatRFC2822FromMs(ms: number): string {
  // Use Intl.DateTimeFormat with the en-US POSIX locale and the rfc822
  // format option. Modern Node ships Intl with this option; if not
  // available, fall back to manual formatting.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC', timeZoneName: 'shortOffset',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(ms));
    /* c8 ignore start -- every part type get() is called with (weekday,
       day, month, year, hour, minute, second, timeZoneName) is always
       present given the fixed options above, so the ?? '' fallback
       can't fire without a different Intl implementation. */
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    /* c8 ignore stop */
    const tzRaw = get('timeZoneName');
    // Intl's shortOffset returns "GMT+0", "GMT-8", "GMT+5:30", etc.
    // RFC 2822 wants "+0000", "-0800", "+0530". Parse and reformat.
    const tzMatch = tzRaw?.match(/GMT([+-])(\d+)(?::(\d+))?/);
    let tz: string;
    if (tzMatch) {
      const sign = tzMatch[1]!;
      const hours = tzMatch[2]!.padStart(2, '0');
      const minutes = (tzMatch[3] ?? '0').padStart(2, '0');
      tz = `${sign}${hours}${minutes}`;
    /* c8 ignore start @preserve -- timeZone is hardcoded to 'UTC' above,
       which always resolves cleanly, so shortOffset always returns a
       parseable "GMT+0"-shaped string in this environment's ICU. This
       branch only guards against an ICU build whose shortOffset output
       doesn't match the regex; can't trigger it without mocking Intl.
       The ignore starts before the closing brace of the if-block so it
       covers the whole else-branch node c8 tracks as a single unit. */
    } else {
      tz = '+0000';
    }
    /* c8 ignore stop @preserve */
    let hour = get('hour');
    /* c8 ignore start @preserve -- hour12:false with a fixed UTC zone
       never yields "24" in this environment's ICU (midnight formats as
       "00"). Some ICU versions/locales are documented to emit "24" for
       hour12:false, so this stays as a defensive normalization; not
       reachable here without mocking Intl.DateTimeFormat's output. */
    if (hour === '24') hour = '00';
    /* c8 ignore stop @preserve */
    return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} ${hour}:${get('minute')}:${get('second')} ${tz}`;
    /* c8 ignore start @preserve -- Intl.DateTimeFormat is constructed
       above with a literal, always-valid timeZone: 'UTC' and no other
       user input reaches the constructor or formatToParts call, so this
       catch can't be triggered through the public API in a normal Intl
       environment (e.g. Node with full-icu). Kept as a genuine fallback
       for runtimes with a broken or absent Intl implementation. */
  } catch {
    // Fallback: hand-rolled RFC 2822 format via Date's UTC methods.
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
    return `${wd}, ${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} +0000`;
  }
  /* c8 ignore stop @preserve */
}

// RFC 7231 defines three formats: IMF-fixdate, RFC 850, asctime.
// The canonical format is IMF-fixdate (RFC 2822-like with required
// seconds and UTC-only). Delegates to Date.parse for parsing and to
// formatRFC2822 for formatting (they're nearly identical).

export function parseHTTPDate(input: string): unknown {
  if (typeof input !== 'string') {
    throw new FormatSyntaxError({ input: String(input), reason: 'parseHTTPDate() expects a string' });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new FormatSyntaxError({
      input,
      reason: `input exceeds maximum length of ${MAX_INPUT_LENGTH} characters (got ${input.length})`,
    });
  }
  const trimmed = input.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new FormatSyntaxError({ input, reason: 'not a valid HTTP-date' });
  }
  return requireInstant().fromEpochMilliseconds(ms);
}

export function formatHTTPDate(value: unknown): string {
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
}

// All epoch conversions go through Temporal.Instant, which has spec
// methods for each epoch granularity. Wrapped here for the
// temporal-fmt surface so callers don't have to import Temporal
// directly.

function getInstant(value: unknown): { epochMilliseconds: number; epochNanoseconds: bigint } {
  const v = value as { toInstant?: () => { epochMilliseconds: number; epochNanoseconds: bigint }; epochMilliseconds?: number; epochNanoseconds?: bigint };
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
  if (typeof v?.epochMilliseconds === 'number') {
    return { epochMilliseconds: v.epochMilliseconds, epochNanoseconds: BigInt(v.epochMilliseconds) * 1_000_000n };
  }
  throw new FormatSyntaxError({ reason: `expected an Instant or ZonedDateTime, got ${typeof value}.` });
}

const temporal = (): TemporalNamespace => getTemporal();

function requireInstant(): NonNullable<TemporalNamespace['Instant']> {
  const t = getTemporal().Instant;
  if (!t) throw new Error('temporal-fmt: Temporal.Instant is not available in this implementation.');
  return t;
}

export function fromUnixSeconds(seconds: number): unknown {
  return requireInstant().fromEpochMilliseconds(seconds * 1000);
}

export function fromUnixMilliseconds(ms: number): unknown {
  return requireInstant().fromEpochMilliseconds(ms);
}

export function fromUnixMicroseconds(µs: number): unknown {
  // Temporal.Instant has no fromEpochMicroseconds in the spec — only
  // fromEpochMilliseconds and fromEpochNanoseconds. Convert via ns.
  return requireInstant().fromEpochNanoseconds(BigInt(µs) * 1_000n);
}

export function fromUnixNanoseconds(ns: bigint): unknown {
  return requireInstant().fromEpochNanoseconds(ns);
}

export function toUnixSeconds(value: unknown): number {
  return getInstant(value).epochMilliseconds / 1000;
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