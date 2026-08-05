import type { Piece } from './tokenize.js';
import { getLocaleVocab } from './localeVocab.js';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(values: string[]): string {
  return `(?:${values.map(escapeRegExp).join('|')})`;
}

let timeZoneFragment: string | undefined;

function getTimeZoneFragment(): string {
  if (timeZoneFragment) {
    return timeZoneFragment;
  }
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    timeZoneFragment = alternation(supportedValuesOf('timeZone'));
  } else {
    // older engines without Intl.supportedValuesOf — fall back to shape only
    timeZoneFragment = '[A-Za-z_]+(?:\\/[A-Za-z_+\\-0-9]+)+';
  }
  return timeZoneFragment;
}

// Fixed-shape numeric fragments that mirror the ranges TOKENS actually
// produces (see pad()/modulo logic there)
const NUMERIC_FRAGMENTS: Record<string, string> = {
  yyyy: '\\d{4}',
  yy: '\\d{2}',
  MM: '(?:0[1-9]|1[0-2])',
  M: '(?:[1-9]|1[0-2])',
  dd: '(?:0[1-9]|[12]\\d|3[01])',
  d: '(?:[1-9]|[12]\\d|3[01])',
  HH: '(?:[01]\\d|2[0-3])',
  H: '(?:[0-9]|1\\d|2[0-3])',
  hh: '(?:0[1-9]|1[0-2])',
  h: '(?:[1-9]|1[0-2])',
  mm: '(?:[0-5]\\d)',
  m: '(?:[0-9]|[1-5]\\d)',
  ss: '(?:[0-5]\\d)',
  s: '(?:[0-9]|[1-5]\\d)',
  SSS: '\\d{3}',
};

function tokenFragment(token: string, locale: string): string {
  const numeric = NUMERIC_FRAGMENTS[token];
  if (numeric) {
    return numeric;
  }

  const vocab = getLocaleVocab(locale);
  switch (token) {
    case 'MMMM': return alternation(vocab.monthLong);
    case 'MMM': return alternation(vocab.monthShort);
    case 'EEEE': return alternation(vocab.weekdayLong);
    case 'EEE': return alternation(vocab.weekdayShort);
    case 'a': return alternation(vocab.dayPeriod);
    case 'zzz': return getTimeZoneFragment();
    default:
      // shouldn't happen — tokenize() only emits tokens from TOKENS
      throw new Error(`temporal-fmt: unknown token "${token}"`);
  }
}

/**
 * Compiles tokenize() output into a single anchored regex source string
 * that matches exactly the strings format() could plausibly have produced
 * for some Temporal value in the given locale.
 */
export function buildPatternSource(pieces: Piece[], locale: string): string {
  let source = '';
  for (const piece of pieces) {
    source += piece.kind === 'literal' ? escapeRegExp(piece.value) : tokenFragment(piece.value, locale);
  }
  return `^(?:${source})$`;
}
