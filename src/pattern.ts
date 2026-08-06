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
    // supportedValuesOf('timeZone') leaves out 'UTC', but format() can
    // produce it from a real ZonedDateTime — without this, parse() couldn't
    // parse our own library's own output back.
    timeZoneFragment = alternation([...supportedValuesOf('timeZone'), 'UTC']);
  } else {
    // no Intl.supportedValuesOf — match on shape only
    timeZoneFragment = '[A-Za-z_]+(?:\\/[A-Za-z_+\\-0-9]+)+|UTC';
  }
  return timeZoneFragment;
}

// mirrors the ranges pad() in tokens.ts actually produces — keep in sync
// if those ever change
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

export function tokenFragment(token: string, locale: string): string {
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
      throw new Error(`temporal-fmt: unknown token "${token}"`);
  }
}
