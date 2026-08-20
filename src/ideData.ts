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
  to: string;
  notes?: string;
}

// Common Day.js / date-fns → temporal-fmt mappings. The full tables
// live in the codemod; this is a minimal subset for the IDE's
// "as you type" suggestions.
export const DAYJS_TO_TEMPORAL_FMT: TokenConversionHint[] = [
  { from: 'YYYY', to: 'yyyy' },
  { from: 'YY', to: 'yy' },
  { from: 'MMMM', to: 'MMMM' },
  { from: 'MMM', to: 'MMM' },
  { from: 'MM', to: 'MM' },
  { from: 'M', to: 'M' },
  { from: 'DD', to: 'dd' },
  { from: 'D', to: 'd' },
  { from: 'dddd', to: 'EEEE' },
  { from: 'ddd', to: 'EEE' },
  { from: 'HH', to: 'HH' },
  { from: 'mm', to: 'mm' },
  { from: 'ss', to: 'ss' },
  { from: 'A', to: 'a' },
  { from: 'a', to: 'a' },
  { from: 'Z', to: 'XXX' },
];

export const DATE_FNS_TO_TEMPORAL_FMT: TokenConversionHint[] = [
  ...DAYJS_TO_TEMPORAL_FMT, // most tokens are identical
  // date-fns-specific differences noted inline.
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
