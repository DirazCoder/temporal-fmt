// Central configuration (plan section H). Per-call options are the
// default convention throughout this library (see formatDistance's
// cutoffs precedent — explicitly NOT a global). This module provides
// a typed ConfigOptions surface that callers can build once and pass
// to any temporal-fmt function, plus a set of defaults that mirror
// the existing per-call defaults.
//
// No global mutable state. The plan is explicit: "No mysterious
// mutable global state — this is a hard constraint, not a preference."
// This module honors that: createConfig() returns an immutable config
// object; there is no setConfig().

import { DEFAULT_LOCALE } from './tokens.js';
import type { NumberingSystem } from './numbering.js';

export interface TemporalFmtConfig {
  // BCP-47 locale tag. Default 'en-US'.
  locale: string;
  // Calendar identifier ('gregory', 'hebrew', etc.) or undefined to
  // use the locale's default.
  calendar?: string;
  // IANA timezone id ('America/New_York', etc.) or undefined to use
  // the system timezone.
  timezone?: string;
  // Numbering system. Default 'latn'.
  numberingSystem: NumberingSystem | string;
  // ISO week rules: 1 = Monday, 7 = Sunday. Default 1 (matches the
  // existing isoWeek.ts convention).
  firstDayOfWeek: 1 | 7;
  // Rounding mode for round()/roundDuration(). Default 'nearest'.
  roundingMode: 'nearest' | 'floor' | 'ceil' | 'trunc';
  // Disambiguation for ZonedDateTime construction during gaps/overlaps.
  // Default 'compatible' (Temporal's default).
  disambiguation: 'compatible' | 'earlier' | 'later' | 'reject';
  // Overflow mode for field construction (Feb 30 etc.).
  // Default 'reject' (matches parse()'s existing behavior).
  overflow: 'constrain' | 'reject';
  // Parse leniency. Default false (strict).
  parseLenient: boolean;
  // Duration zero-value display. Default false (omit zeros).
  durationShowZeroValues: boolean;
}

export const DEFAULT_CONFIG: TemporalFmtConfig = {
  locale: DEFAULT_LOCALE,
  numberingSystem: 'latn',
  firstDayOfWeek: 1,
  roundingMode: 'nearest',
  disambiguation: 'compatible',
  overflow: 'reject',
  parseLenient: false,
  durationShowZeroValues: false,
};

// Creates a config object with the caller's overrides merged onto
// the defaults. Returns a frozen object so callers can't mutate it
// after the fact — same immutability convention as Temporal's own
// options.
export function createConfig(overrides: Partial<TemporalFmtConfig> = {}): Readonly<TemporalFmtConfig> {
  const merged: TemporalFmtConfig = { ...DEFAULT_CONFIG, ...overrides };
  // Validate.
  if (typeof merged.locale !== 'string' || merged.locale.length === 0) {
    throw new Error(`temporal-fmt: config.locale must be a non-empty string (got ${String(merged.locale)}).`);
  }
  if (merged.firstDayOfWeek !== 1 && merged.firstDayOfWeek !== 7) {
    throw new Error(`temporal-fmt: config.firstDayOfWeek must be 1 (Monday) or 7 (Sunday) (got ${merged.firstDayOfWeek}).`);
  }
  if (!['nearest', 'floor', 'ceil', 'trunc'].includes(merged.roundingMode)) {
    throw new Error(`temporal-fmt: config.roundingMode "${merged.roundingMode}" is not recognized.`);
  }
  if (!['compatible', 'earlier', 'later', 'reject'].includes(merged.disambiguation)) {
    throw new Error(`temporal-fmt: config.disambiguation "${merged.disambiguation}" is not recognized.`);
  }
  if (!['constrain', 'reject'].includes(merged.overflow)) {
    throw new Error(`temporal-fmt: config.overflow "${merged.overflow}" is not recognized.`);
  }
  return Object.freeze(merged);
}

// Merges a per-call options object with a config. Per-call options take
// precedence. Used by format()/parse()/etc. to fold a caller's config
// into the per-call options they pass.
export function mergeWithConfig<T extends Record<string, unknown>>(
  config: Readonly<TemporalFmtConfig> | undefined,
  perCall: T,
): T & { locale?: string; calendar?: string; timezone?: string; numberingSystem?: string; lenient?: boolean } {
  if (!config) return perCall;
  const result = { ...perCall } as T & { locale?: string; calendar?: string; timezone?: string; numberingSystem?: string; lenient?: boolean };
  // Only fill in fields the per-call options don't specify.
  if (result.locale === undefined) result.locale = config.locale;
  if (result.calendar === undefined && config.calendar !== undefined) result.calendar = config.calendar;
  if (result.timezone === undefined && config.timezone !== undefined) result.timezone = config.timezone;
  if (result.numberingSystem === undefined) result.numberingSystem = config.numberingSystem;
  if (result.lenient === undefined && config.parseLenient) result.lenient = true;
  return result;
}
