import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { tokenize } from './tokenize.js';
import { buildPatternSource } from './pattern.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

const patternCache = new Map<string, RegExp>();
const MAX_CACHE_SIZE = 500;

function getPattern(formatStr: string, locale: string): RegExp {
  // \0 can't appear in a locale tag or format string, so it's a safe join char
  const key = locale + '\0' + formatStr;
  let pattern = patternCache.get(key);
  if (pattern) {
    return pattern;
  }
  if (patternCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = patternCache.keys().next().value;
    if (oldestKey !== undefined) patternCache.delete(oldestKey);
  }
  const source = buildPatternSource(tokenize(formatStr), locale);
  pattern = new RegExp(source, 'u');
  patternCache.set(key, pattern);
  return pattern;
}

/**
 * Checks if `input` could plausibly be format()'s output for this format
 * string. Shape and vocabulary only — no parsing, and Feb 30 still passes.
 *
 * @example
 * matchesFormat('yyyy-MM-dd HH:mm', '2026-08-04 15:45')   // true
 * matchesFormat('yyyy-MM', '2026-08-04T15:45:30')          // false
 */
export function matchesFormat(formatStr: string, input: string, options: FormatOptions = {}): boolean {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  return getPattern(formatStr, locale).test(input);
}
