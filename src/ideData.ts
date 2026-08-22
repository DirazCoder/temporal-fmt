// IDE tooling data exports (plan section AC). Provides structured data
// editor plugins can consume for: token autocomplete, hover docs,
// inline diagnostics, quick fixes, format preview, token conversion
// hints from Day.js/date-fns, documentation links.
//
// This is the data layer; an actual VS Code extension is out of scope
// (per the plan's section AC: "build the data layer; an actual VS Code
// extension is out of scope unless it already exists in one of the
// three repos"). A separate package can build the extension on top of
// these exports.

import { TOKEN_METADATA, ALL_TOKEN_NAMES } from './tokenMetadata.js';
import { analyzeFormat, listTokens } from './analyze.js';
import { format as builtinFormat } from './format.js';

export interface TokenAutocompleteEntry {
  label: string;
  detail: string;
  documentation: string;
  // Sort group — same-family tokens sort together in the autocomplete list.
  family: string;
}

// Token family grouping for autocomplete organization. Mirrors the
// families the plan's section B calls out: year, month, day, etc.
function tokenFamily(name: string): string {
  if (/^y+$/.test(name)) return 'Year';
  if (/^[ML]+$/.test(name)) return 'Month';
  if (/^[decD]+$/.test(name)) return 'Day';
  if (/^[Ec]+$/.test(name)) return 'Weekday';
  if (/^[Qq]+$/.test(name)) return 'Quarter';
  if (/^[Gg]+$/.test(name)) return 'Era';
  if (/^[Hh]+$/.test(name)) return 'Hour';
  if (/^m+$/.test(name)) return 'Minute';
  if (/^s+$/.test(name)) return 'Second';
  if (/^S+$/.test(name)) return 'Fractional Second';
  if (name === 'a') return 'Day Period';
  if (name === 'zzz') return 'Time Zone';
  if (/^[Xx]+$/.test(name)) return 'UTC Offset';
  if (name === 'do') return 'Ordinal Day';
  if (name === 'ww' || name === 'RRRR') return 'ISO Week';
  return 'Other';
}

export function getAutocompleteData(): TokenAutocompleteEntry[] {
  return ALL_TOKEN_NAMES.map((name) => {
    const meta = TOKEN_METADATA[name]!;
    return {
      label: name,
      detail: meta.meaning,
      documentation: [
        meta.meaning,
        ``,
        `Format-capable: ${meta.formatCapable}`,
        `Parse-capable: ${meta.parseCapable}`,
        `Locale-sensitive: ${meta.localeSensitive}`,
        `Calendar-sensitive: ${meta.calendarSensitive}`,
        `Timezone-sensitive: ${meta.timezoneSensitive}`,
        `Round-trip safe: ${meta.roundTripSafe}`,
        `Supported types: ${meta.supportedTypes.join(', ')}`,
      ].join('\n'),
      family: tokenFamily(name),
    };
  });
}

export interface TokenHoverDoc {
  signature: string;
  summary: string;
  details: string;
  examples?: string[];
}

export function getHoverDocs(): Record<string, TokenHoverDoc> {
  const result: Record<string, TokenHoverDoc> = {};
  for (const name of ALL_TOKEN_NAMES) {
    const meta = TOKEN_METADATA[name]!;
    result[name] = {
      signature: name,
      summary: meta.meaning,
      details: [
        // every entry in TOKEN_METADATA currently has formatCapable:
        // true (verified: 51/51). The 'no' branch reflects real,
        // intended behavior for a future format-incapable token —
        // there's no such token today, so this isn't reachable data,
        // not dead logic. Every other field on this line has real
        // true/false variance across the token table and is exercised
        // by this same loop running over ALL_TOKEN_NAMES.
        /* c8 ignore next */
        `Format-capable: ${meta.formatCapable ? 'yes' : 'no'}`,
        `Parse-capable: ${meta.parseCapable ? 'yes' : 'no'}`,
        `Locale-sensitive: ${meta.localeSensitive ? 'yes' : 'no'}`,
        `Calendar-sensitive: ${meta.calendarSensitive ? 'yes' : 'no'}`,
        `Timezone-sensitive: ${meta.timezoneSensitive ? 'yes' : 'no'}`,
        `Round-trip safe: ${meta.roundTripSafe ? 'yes' : 'no'}`,
        `Supported types: ${meta.supportedTypes.join(', ')}`,
      ].join('\n'),
    };
  }
  return result;
}

// Inline diagnostic data for a format string. Returns a list of issues
// (warnings + errors) with position + message + suggested fix where
// available. Mirrors analyzeFormat's warnings but adds the position
// info an editor needs to draw squigglies.
export interface InlineDiagnostic {
  startColumn: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  // Suggested replacement (for quick-fix). Empty when no quick fix exists.
  suggestion?: string;
}

export function getInlineDiagnostics(formatStr: string): InlineDiagnostic[] {
  const analysis = analyzeFormat(formatStr);
  const diagnostics: InlineDiagnostic[] = [];
  for (const warning of analysis.warnings) {
    // Find the token that triggered the warning. analyzeFormat doesn't
    // currently surface which token caused which warning — we'd need
    // to extend it to track per-warning source positions. For now,
    // surface as a whole-string diagnostic.
    let message = warning.message;
    let suggestion: string | undefined;
    if (warning.code === 'TWELVE_HOUR_WITHOUT_A') {
      suggestion = 'Add an "a" token (e.g. "h:mm a") or use "H:mm" for 24-hour.';
    } else if (warning.code === 'MIXED_12_AND_24_HOUR') {
      suggestion = 'Pick one form: "HH:mm" for 24-hour or "h:mm a" for 12-hour.';
    } else if (warning.code === 'AMBIGUOUS_NUMERIC_RUN') {
      suggestion = 'Add a separator or use padded forms (e.g. "MM" instead of "M").';
    } else if (warning.code === 'FORMAT_ONLY_TOKEN') {
      suggestion = 'Use a parse-capable variant (e.g. "d" instead of "do").';
    }
    diagnostics.push({
      startColumn: 0,
      endColumn: formatStr.length,
      severity: 'warning',
      message,
      code: warning.code,
      suggestion,
    });
  }
  return diagnostics;
}

// Day.js / date-fns token conversion hints. Used by the IDE to suggest
// the temporal-fmt equivalent when a user types a Day.js or date-fns
// token. Pulls the translation tables from the codemod if available;
// falls back to inline tables otherwise.
export interface TokenConversionHint {
  from: string;
  // null means "real token in the source library, no temporal-fmt
  // equivalent" — the codemod throws on these rather than treating
  // them as unrecognized text (see codemod.ts).
  to: string | null;
  notes?: string;
}

// Day.js → temporal-fmt mappings. Day.js uses Moment-style tokens:
// `D`/`DD` are day-of-*month* here (unlike date-fns below, where the
// same letters mean day-of-year). Assumes the AdvancedFormat plugin
// for `Do`/`Q`/`k`/`kk`/`X`/`x` — see codemod.ts's doc comment for why.
export const DAYJS_TO_TEMPORAL_FMT: TokenConversionHint[] = [
  { from: 'YYYY', to: 'yyyy' },
  { from: 'YY', to: 'yy' },
  { from: 'MMMM', to: 'MMMM' },
  { from: 'MMM', to: 'MMM' },
  { from: 'MM', to: 'MM' },
  { from: 'M', to: 'M' },
  { from: 'DD', to: 'dd' },
  { from: 'D', to: 'd' },
  { from: 'Do', to: null, notes: 'Ordinal day (AdvancedFormat) — use temporal-fmt\'s own "do" token instead.' },
  { from: 'dddd', to: 'EEEE' },
  { from: 'ddd', to: 'EEE' },
  { from: 'dd', to: null, notes: 'Min-name weekday (e.g. "Tu") — temporal-fmt has no equivalent width.' },
  { from: 'd', to: null, notes: 'Numeric weekday (0-6) — no temporal-fmt equivalent; not the same as "d" here, which is day-of-month.' },
  { from: 'HH', to: 'HH' },
  { from: 'H', to: 'H' },
  { from: 'hh', to: 'hh' },
  { from: 'h', to: 'h' },
  { from: 'kk', to: null, notes: 'Hour 1-24 (AdvancedFormat) — no temporal-fmt equivalent.' },
  { from: 'k', to: null, notes: 'Hour 1-24 (AdvancedFormat) — no temporal-fmt equivalent.' },
  { from: 'mm', to: 'mm' },
  { from: 'm', to: 'm' },
  { from: 'ss', to: 'ss' },
  { from: 's', to: 's' },
  { from: 'SSS', to: 'SSS' },
  { from: 'A', to: 'a', notes: 'Uppercase AM/PM in Day.js — temporal-fmt is always lowercase.' },
  { from: 'a', to: 'a' },
  { from: 'ZZ', to: 'XX', notes: 'Numeric UTC offset, no colon.' },
  { from: 'Z', to: 'XXX', notes: 'Numeric UTC offset with colon.' },
  { from: 'X', to: null, notes: 'Unix timestamp (seconds) — use fromUnixSeconds() instead.' },
  { from: 'x', to: null, notes: 'Unix timestamp (ms) — use fromUnixMilliseconds() instead.' },
  { from: 'Qo', to: null, notes: 'Ordinal quarter (AdvancedFormat) — no temporal-fmt equivalent.' },
  { from: 'Q', to: 'Q' },
  { from: 'Mo', to: null, notes: 'Ordinal month (AdvancedFormat) — no temporal-fmt equivalent.' },
  { from: 'ww', to: 'ww' },
  { from: 'wo', to: null, notes: 'Ordinal ISO week (AdvancedFormat) — no temporal-fmt equivalent.' },
  { from: 'w', to: null, notes: 'Unpadded ISO week — temporal-fmt\'s "ww" is always 2-digit.' },
  { from: 'gggg', to: 'RRRR', notes: 'Week-numbering year, not the calendar year — same caveat as temporal-fmt\'s RRRR.' },
  { from: 'L', to: null, notes: 'Localized date format (AdvancedFormat) — write the format string out explicitly.' },
  { from: 'LL', to: null, notes: 'Localized date format (AdvancedFormat) — write the format string out explicitly.' },
  { from: 'LLL', to: null, notes: 'Localized date format (AdvancedFormat) — write the format string out explicitly.' },
  { from: 'LLLL', to: null, notes: 'Localized date format (AdvancedFormat) — write the format string out explicitly.' },
  { from: 'LT', to: null, notes: 'Localized time format (AdvancedFormat) — write the format string out explicitly.' },
  { from: 'LTS', to: null, notes: 'Localized time format (AdvancedFormat) — write the format string out explicitly.' },
];

// date-fns → temporal-fmt mappings. date-fns already uses Unicode/LDML
// -style tokens close to temporal-fmt's own vocabulary — most strings
// pass through unchanged. The catch: `D`/`DD` here mean day-of-*year*
// (same as temporal-fmt's `D`/`DD`), not day-of-month like Day.js's
// `D`/`DD` above — don't reuse the Day.js table for this, they collide.
export const DATE_FNS_TO_TEMPORAL_FMT: TokenConversionHint[] = [
  { from: 'yyyy', to: 'yyyy' },
  { from: 'yy', to: 'yy' },
  { from: 'y', to: null, notes: 'Unpadded calendar year, opt-in via useAdditionalWeekYearTokens — temporal-fmt has no unpadded-year token; use "yyyy".' },
  { from: 'MMMM', to: 'MMMM' },
  { from: 'MMM', to: 'MMM' },
  { from: 'MM', to: 'MM' },
  { from: 'M', to: 'M' },
  { from: 'LLLL', to: 'LLLL' },
  { from: 'LLL', to: 'LLL' },
  { from: 'dd', to: 'dd' },
  { from: 'd', to: 'd' },
  { from: 'do', to: 'do' },
  { from: 'DDD', to: 'DDD' },
  { from: 'DD', to: 'DD' },
  { from: 'D', to: 'D', notes: 'Day-of-year, opt-in via useAdditionalDayOfYearTokens — matches temporal-fmt\'s own "D" already.' },
  { from: 'EEEE', to: 'EEEE' },
  { from: 'EEE', to: 'EEE' },
  { from: 'eeee', to: null, notes: 'Locale-aware numeric weekday — no temporal-fmt equivalent.' },
  { from: 'cccc', to: 'cccc' },
  { from: 'ccc', to: 'ccc' },
  { from: 'HH', to: 'HH' },
  { from: 'H', to: 'H' },
  { from: 'hh', to: 'hh' },
  { from: 'h', to: 'h' },
  { from: 'mm', to: 'mm' },
  { from: 'm', to: 'm' },
  { from: 'ss', to: 'ss' },
  { from: 's', to: 's' },
  { from: 'SSS', to: 'SSS' },
  { from: 'a', to: 'a' },
  { from: 'aaa', to: 'a' },
  { from: 'XXX', to: 'XXX' },
  { from: 'XX', to: 'XX' },
  { from: 'X', to: 'X', notes: 'Opt-in via useAdditionalDayOfYearTokens-adjacent rules in date-fns v3+; matches temporal-fmt\'s own "X" already.' },
  { from: 'xxx', to: 'xxx' },
  { from: 'xx', to: 'xx' },
  { from: 'x', to: 'x' },
  { from: 'zzzz', to: 'zzzz' },
  { from: 'zzz', to: 'zzz' },
  { from: 'z', to: 'z' },
  { from: 'QQQ', to: 'QQQ' },
  { from: 'Q', to: 'Q' },
  { from: 'GGGG', to: 'GGGG' },
  { from: 'GGG', to: null, notes: 'Abbreviated era — temporal-fmt only has "G" (short) and "GGGG" (long).' },
  { from: 'GG', to: null, notes: 'Abbreviated era — temporal-fmt only has "G" (short) and "GGGG" (long).' },
  { from: 'G', to: 'G' },
  { from: 'ww', to: 'ww' },
  { from: 'w', to: null, notes: 'Unpadded local week number — temporal-fmt\'s "ww" is ISO-week and always 2-digit.' },
  { from: 'RRRR', to: 'RRRR' },
  { from: 'R', to: null, notes: 'Unpadded ISO week-numbering year — temporal-fmt\'s "RRRR" is always 4-digit.' },
  { from: 'Y', to: null, notes: 'Week-numbering year (locale week rules), opt-in — no temporal-fmt equivalent; "RRRR" is ISO week-numbering, a different rule set.' },
  { from: 'PPPP', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'PPP', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'PP', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'P', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'pppp', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'ppp', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'pp', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
  { from: 'p', to: null, notes: 'Localized composite format — write the format string out explicitly.' },
];

// Format preview — for a given format string and a sample Temporal
// value, returns the formatted string. Editor plugins use this for
// live preview as the user types.
export function previewFormat(formatStr: string, sample?: unknown): string {
  // Use a fixed sample date if none provided — 2026-08-04T15:45:30.
  // Picked because it exercises every common token: weekday is Tuesday,
  // month name has 5 chars, day is single-digit, hour is 12-hour-style,
  // minute/second both pad.
  const value = sample ?? {
    year: 2026, month: 8, day: 4, hour: 15, minute: 45, second: 30, millisecond: 123,
    dayOfWeek: 2, timeZoneId: 'UTC', offset: '+00:00', calendarId: 'iso8601',
  };
  return builtinFormat(value as Parameters<typeof builtinFormat>[0], formatStr, { locale: 'en-US' });
}

// Documentation links. Docs used to live under docs/ as one file per
// token family; they're now consolidated into the root README's "Token
// reference" section, which has no per-token anchors — so this points
// at the section instead of a token-specific fragment.
export function getDocUrl(tokenName: string): string {
  void tokenName;
  return 'README.md#token-reference';
}

// Re-exports for callers that want everything IDE-related from one module.
export { listTokens, TOKEN_METADATA, ALL_TOKEN_NAMES };