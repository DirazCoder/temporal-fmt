// Per-token metadata: the structured descriptor the plan's section B
// asks for (meaning, format-capable?, parse-capable?, locale-sensitive?,
// calendar-sensitive?, timezone-sensitive?, supported Temporal types,
// round-trip-safe?). One table, kept in sync with TOKENS in tokens.ts
// by tests (see test/tokenMetadata.test.js — every entry in TOKENS has
// a metadata entry, and vice versa).
//
// This is the single source of truth that analyzeFormat() (section E)
// and the ESLint plugin / codemod (Phase 3) consume — never read the
// TOKENS array directly for metadata; use TOKEN_METADATA here, or the
// tokenInfo() / listTokens() wrappers in analyze.ts.

import type { TemporalLike } from './tokens.js';

export type TemporalType =
  | 'Instant'
  | 'PlainDate'
  | 'PlainTime'
  | 'PlainDateTime'
  | 'ZonedDateTime'
  | 'PlainYearMonth'
  | 'PlainMonthDay';

export interface TokenMetadata {
  // Short human-readable description of what the token represents.
  meaning: string;
  // True if format() accepts this token. Every token in TOKENS is
  // format-capable by construction; this flag exists so the table is
  // self-describing for callers (the codemod) that work with token
  // families including format-only tokens from other libraries.
  formatCapable: boolean;
  // True if parse() accepts this token. False for `do`, `ww`, `RRRR`
  // — see FORMAT_ONLY_TOKENS in pattern.ts.
  parseCapable: boolean;
  // True if the output depends on locale (resolves via Intl or
  // custom vocab). MMMM/MMM/EEEE/EEE/a are true; everything else is
  // numeric ASCII and locale-independent.
  localeSensitive: boolean;
  // True if the output depends on the calendar (gregory, hebrew,
  // etc.). Locale-aware tokens inherit calendar sensitivity from
  // the Intl path (a hebrew PlainDate's month name depends on the
  // hebrew calendar). Year/month/day numeric tokens are calendar-
  // sensitive in principle (a Hebrew year/month renders differently
  // than a Gregorian one) but stay ISO-numeric on the format side
  // because tokens.ts reads straight off TemporalLike fields, which
  // are already calendar-specific by the time format() sees them.
  calendarSensitive: boolean;
  // True if the token requires a timeZoneId or offset field — i.e.
  // only ZonedDateTime supports it. zzz and the six offset tokens
  // (X/XX/XXX/x/xx/xxx) are timezone-sensitive.
  timezoneSensitive: boolean;
  // Which Temporal types can supply the field this token needs.
  // PlainTime can't supply year; PlainDate can't supply hour; only
  // ZonedDateTime carries timeZoneId/offset.
  supportedTypes: TemporalType[];
  // True if format(x, fmt) → parse(fmt, output) round-trips back to
  // a value equal to x. False when the format is fundamentally lossy:
  // `do` (ordinal suffix isn't structurally parseable), `ww`/`RRRR`
  // (week + weekday alone can't reconstruct a date without an extra
  // disambiguator), `yy` (two-digit year loses century — strptime
  // heuristic resolves it, but the heuristic isn't symmetric with
  // how `yy` formats BCE years, so round-trip only works for years
  // where 00-68/69-99 lands back on the same century).
  roundTripSafe: boolean;
}

// Helper: which Temporal types carry each field. Centralized here so
// the supportedTypes arrays below stay short and the table is easy to
// audit. Mirrors the field checks in tokens.ts (handler third tuple
// element).
const TYPES_WITH: Record<string, TemporalType[]> = {
  year: ['PlainDate', 'PlainDateTime', 'ZonedDateTime', 'PlainYearMonth'],
  month: ['PlainDate', 'PlainDateTime', 'ZonedDateTime', 'PlainYearMonth', 'PlainMonthDay'],
  day: ['PlainDate', 'PlainDateTime', 'ZonedDateTime', 'PlainMonthDay'],
  hour: ['PlainTime', 'PlainDateTime', 'ZonedDateTime', 'Instant'],
  minute: ['PlainTime', 'PlainDateTime', 'ZonedDateTime', 'Instant'],
  second: ['PlainTime', 'PlainDateTime', 'ZonedDateTime', 'Instant'],
  millisecond: ['PlainTime', 'PlainDateTime', 'ZonedDateTime', 'Instant'],
  dayOfWeek: ['PlainDate', 'PlainDateTime', 'ZonedDateTime'],
  timeZoneId: ['ZonedDateTime'],
  offset: ['ZonedDateTime'],
};

// Every token in TOKENS gets an entry here. Adding a token to TOKENS
// without adding one here makes test/tokenMetadata.test.js fail.
export const TOKEN_METADATA: Record<string, TokenMetadata> = {
  yyyy: {
    meaning: 'Four-digit year (preserves sign for BCE; no truncation).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.year, roundTripSafe: true,
  },
  yy: {
    meaning: 'Two-digit year (year % 100). Throws on negative years.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.year, roundTripSafe: false,
  },
  MMMM: {
    meaning: 'Long month name (locale-aware, e.g. "January", "janvier").',
    formatCapable: true, parseCapable: true, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  MMM: {
    meaning: 'Short month name (locale-aware, e.g. "Jan", "janv.").',
    formatCapable: true, parseCapable: true, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  MM: {
    meaning: 'Two-digit month (01-12, zero-padded).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  M: {
    meaning: 'One- or two-digit month (1-12, no padding).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  dd: {
    meaning: 'Two-digit day-of-month (01-31, zero-padded).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: true,
  },
  d: {
    meaning: 'One- or two-digit day-of-month (1-31, no padding).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: true,
  },
  EEEE: {
    meaning: 'Long weekday name (locale-aware, e.g. "Monday", "lundi"). Parse cross-checks against the parsed date.',
    formatCapable: true, parseCapable: true, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: true,
  },
  EEE: {
    meaning: 'Short weekday name (locale-aware, e.g. "Mon", "lun."). Parse cross-checks against the parsed date.',
    formatCapable: true, parseCapable: true, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: true,
  },
  HH: {
    meaning: 'Two-digit hour, 24-hour clock (00-23, zero-padded).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.hour, roundTripSafe: true,
  },
  H: {
    meaning: 'One- or two-digit hour, 24-hour clock (0-23, no padding).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.hour, roundTripSafe: true,
  },
  hh: {
    meaning: 'Two-digit hour, 12-hour clock (01-12, zero-padded). Requires `a` token on parse.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.hour, roundTripSafe: true,
  },
  h: {
    meaning: 'One- or two-digit hour, 12-hour clock (1-12, no padding). Requires `a` token on parse.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.hour, roundTripSafe: true,
  },
  mm: {
    meaning: 'Two-digit minute (00-59, zero-padded).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.minute, roundTripSafe: true,
  },
  m: {
    meaning: 'One- or two-digit minute (0-59, no padding).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.minute, roundTripSafe: true,
  },
  ss: {
    meaning: 'Two-digit second (00-59, zero-padded).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.second, roundTripSafe: true,
  },
  s: {
    meaning: 'One- or two-digit second (0-59, no padding).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.second, roundTripSafe: true,
  },
  S: {
    meaning: 'Fractional second, 1 digit (tenths of a second).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SS: {
    meaning: 'Fractional second, 2 digits (hundredths of a second).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSS: {
    meaning: 'Fractional second, 3 digits (milliseconds).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSS: {
    meaning: 'Fractional second, 4 digits (tens of microseconds).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSSS: {
    meaning: 'Fractional second, 5 digits (hundred-thousandths of a second).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSSSS: {
    meaning: 'Fractional second, 6 digits (microseconds).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSSSSS: {
    meaning: 'Fractional second, 7 digits (tens of nanoseconds).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSSSSSS: {
    meaning: 'Fractional second, 8 digits (hundred-millionths of a second).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  SSSSSSSSS: {
    meaning: 'Fractional second, 9 digits (nanoseconds).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.millisecond, roundTripSafe: true,
  },
  a: {
    meaning: 'Day period (locale-aware: "AM"/"PM", "午前"/"午後", etc.). Required alongside 12-hour tokens on parse.',
    formatCapable: true, parseCapable: true, localeSensitive: true, calendarSensitive: false, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.hour, roundTripSafe: true,
  },
  zzz: {
    meaning: 'IANA time zone id (e.g. "America/New_York") or fixed offset ("+05:30"). Requires full date+time on parse.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.timeZoneId, roundTripSafe: true,
  },
  X: {
    meaning: 'Numeric UTC offset, short (Z for UTC, ±HH[MM] otherwise). Minutes omitted when zero.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  XX: {
    meaning: 'Numeric UTC offset, no colon (Z for UTC, ±HHMM otherwise).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  XXX: {
    meaning: 'Numeric UTC offset, with colon (Z for UTC, ±HH:MM otherwise).',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  x: {
    meaning: 'Numeric UTC offset, short, never Z (always ±HH[MM]). Lowercase variant of X.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  xx: {
    meaning: 'Numeric UTC offset, no colon, never Z (always ±HHMM). Lowercase variant of XX.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  xxx: {
    meaning: 'Numeric UTC offset, with colon, never Z (always ±HH:MM). Lowercase variant of XXX.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.offset, roundTripSafe: true,
  },
  do: {
    meaning: 'Ordinal day-of-month with English suffix ("1st", "2nd", "3rd", "4th", ... 21st, 22nd, ...). Format-only — not parseable.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: false,
  },
  Q: {
    meaning: 'Quarter as a digit (1-4). Derived from month.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  QQQ: {
    meaning: 'Quarter with "Q" prefix ("Q1".."Q4"). Derived from month.',
    formatCapable: true, parseCapable: true, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  ww: {
    meaning: 'ISO 8601 week number (01-53). Format-only — week alone can\'t reconstruct a date.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: false,
  },
  RRRR: {
    meaning: 'ISO 8601 week-numbering year (4-digit, may differ from calendar year at year boundaries). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: false,
  },
  D: {
    meaning: 'Day of year, unpadded (1-366). Format-only — parsing requires resolving against a year.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: false,
  },
  DD: {
    meaning: 'Day of year, 2-digit minimum (01-366). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: false,
  },
  DDD: {
    meaning: 'Day of year, 3-digit zero-padded (001-366). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: false, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.day, roundTripSafe: false,
  },
  LLLL: {
    meaning: 'Stand-alone long month name (nominative case in Slavic locales). Identical to MMMM in most locales.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  LLL: {
    meaning: 'Stand-alone short month name. Identical to MMM in most locales.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.month, roundTripSafe: true,
  },
  cccc: {
    meaning: 'Stand-alone long weekday name. Identical to EEEE in most locales.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: true,
  },
  ccc: {
    meaning: 'Stand-alone short weekday name. Identical to EEE in most locales.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.dayOfWeek, roundTripSafe: true,
  },
  GGGG: {
    meaning: 'Long era name (locale-aware, e.g. "Anno Domini"/"Before Christ"). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.year, roundTripSafe: false,
  },
  G: {
    meaning: 'Short era name (locale-aware, e.g. "AD"/"BC"). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: true, timezoneSensitive: false,
    supportedTypes: TYPES_WITH.year, roundTripSafe: false,
  },
  zzzz: {
    meaning: 'Localized long timezone name (e.g. "Eastern Standard Time"). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.timeZoneId, roundTripSafe: false,
  },
  z: {
    meaning: 'Localized short timezone name (e.g. "EST"). Format-only.',
    formatCapable: true, parseCapable: false, localeSensitive: true, calendarSensitive: false, timezoneSensitive: true,
    supportedTypes: TYPES_WITH.timeZoneId, roundTripSafe: false,
  },

};

export const ALL_TOKEN_NAMES: string[] = Object.keys(TOKEN_METADATA);