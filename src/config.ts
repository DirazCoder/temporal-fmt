// central config stuff. per-call options is the convention we use
// everywhere else in this lib (formatDistance's cutoffs did it this way
// first — deliberately NOT a global). so this module just gives callers
// a typed config object they can build once and pass around, defaults
// match whatever the per-call defaults already were.
//
// no global mutable state, on purpose. don't want a setConfig() anywhere —
// createConfig() just hands back a frozen object and that's it.

import { DEFAULT_LOCALE } from './tokens.js';
import type { NumberingSystem } from './numbering.js';

export interface TemporalFmtConfig {
  // BCP-47 tag, defaults to 'en-US'
  locale: string;
  // 'gregory', 'hebrew', whatever — leave undefined and it'll just use
  // whatever the locale defaults to
  calendar?: string;
  // IANA id like 'America/New_York', or leave it undefined for system tz
  timezone?: string;
  // defaults to 'latn'
  numberingSystem: NumberingSystem | string;
  // 1 = Monday, 7 = Sunday. default's 1, matches what isoWeek.ts already does
  firstDayOfWeek: 1 | 7;
  // for round()/roundDuration(), defaults to 'nearest'
  roundingMode: 'nearest' | 'floor' | 'ceil' | 'trunc';
  // what to do when a ZonedDateTime construction hits a gap/overlap.
  // defaults to 'compatible' since that's Temporal's own default too
  disambiguation: 'compatible' | 'earlier' | 'later' | 'reject';
  // handles stuff like Feb 30 when building fields. defaults to 'reject',
  // same as what parse() already did before this existed
  overflow: 'constrain' | 'reject';
  // strict by default (false)
  parseLenient: boolean;
  // false by default so zero values just get omitted, not printed
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

// merges whatever overrides get passed in on top of the defaults, then
// freezes it so nobody can mutate it after — Temporal's own options
// work this way too so figured we'd match that
export function createConfig(overrides: Partial<TemporalFmtConfig> = {}): Readonly<TemporalFmtConfig> {
  const merged: TemporalFmtConfig = { ...DEFAULT_CONFIG, ...overrides };
  // sanity checks before we freeze it
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

// merges a config into per-call options — whatever's already set in
// per-call wins. format()/parse()/etc use this to fold config in
interface ConfigOverrides {
  locale?: string;
  calendar?: string;
  timezone?: string;
  numberingSystem?: string;
  lenient?: boolean;
}

export function mergeWithConfig<T extends Record<string, unknown>>(
  config: Readonly<TemporalFmtConfig> | undefined,
  perCall: T,
): Record<string, unknown> & ConfigOverrides {
  if (!config) return perCall;
  // Returns a fresh object typed by its own actual shape (perCall's
  // fields plus these five, each optionally overridden) instead of
  // asserting the result back into the generic T. A `{ ...perCall } as T
  // & {...}` cast here previously claimed a freshly spread object was
  // still exactly T, which isn't something a spread can guarantee for an
  // arbitrary caller-supplied T — tsc rightly rejected that once this
  // generic got exercised through a real call site (mergeWithConfig's
  // override wrapper in modApi.ts). Nothing in this codebase currently
  // calls mergeWithConfig and relies on getting T back rather than this
  // wider shape, so there's no correctness cost to being honest about
  // what's actually returned.
  const extras: ConfigOverrides = {};
  if (perCall.locale === undefined) extras.locale = config.locale;
  if (perCall.calendar === undefined && config.calendar !== undefined) extras.calendar = config.calendar;
  if (perCall.timezone === undefined && config.timezone !== undefined) extras.timezone = config.timezone;
  if (perCall.numberingSystem === undefined) extras.numberingSystem = config.numberingSystem;
  if (perCall.lenient === undefined && config.parseLenient) extras.lenient = true;
  return { ...perCall, ...extras };
}