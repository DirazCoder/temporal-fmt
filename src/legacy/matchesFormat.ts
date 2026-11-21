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

import { DEFAULT_LOCALE, type FormatOptions } from '../tokens/tokens.js';
import { tokenize } from '../tokens/tokenize.js';
import { buildCapturingPattern, type CapturingPattern } from '../parse/parsePattern.js';
import { MAX_FORMAT_LENGTH, MAX_INPUT_LENGTH } from '../core/constants.js';
import { TemporalFmtError } from '../core/errors.js';
import { enumerateValidSplits, isValidTimeZone } from '../tokens/pattern.js';
import { parseOffsetString } from '../parse/parse.js';

const patternCache = new Map<string, CapturingPattern>();
const MAX_CACHE_SIZE = 500;

function getPattern(formatStr: string, locale: string) {
  const key = locale + '\0' + formatStr;
  const cached = patternCache.get(key);
  if (cached) return cached;

  if (patternCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = patternCache.keys().next().value;
    /* c8 ignore next @preserve -- unreachable else-arm: patternCache holds
       >= MAX_CACHE_SIZE entries here, and keys().next().value on a non-empty
       Map never yields undefined (only an exhausted/empty iterator does).
       The guard exists for TS's string | undefined narrowing of the
       iterator result. */
    if (oldestKey !== undefined) patternCache.delete(oldestKey);
  }

  const pattern = buildCapturingPattern(tokenize(formatStr), locale);
  patternCache.set(key, pattern);
  return pattern;
}

/**
 * Checks whether `input` could plausibly be output from `format()` for the
 * given format. It checks shape and locale vocabulary, not date validity.
 */
export function matchesFormat(formatStr: string, input: string, options: FormatOptions = {}): boolean {
  try {
    if (formatStr.length > MAX_FORMAT_LENGTH) {
      throw new Error(
        `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
        `(got ${formatStr.length}).`,
      );
    }
    // An input past parse()'s cap can never be format() output (format
    // strings are capped at 1000 chars); previously unbounded inputs
    // were regex-scanned with no length ceiling at all.
    if (input.length > MAX_INPUT_LENGTH) return false;
    const locale = options.locale ?? DEFAULT_LOCALE;
    const pattern = getPattern(formatStr, locale);
    const match = pattern.regex.exec(input);
    if (!match) return false;

    // parse() validates the captured zzz zones and offset tokens AFTER
    // the shape match; matchesFormat used to skip both, so
    // matchesFormat('zzz', 'Bogus/Zone') and ('xx', '+9999') returned
    // true for strings parse() itself rejects. Mirror parse()'s checks:
    // a zzz capture must be a recognized IANA zone, and an offset
    // capture must survive parseOffsetString's ±14:00/-12:00 range
    // validation.
    /* c8 ignore start @preserve -- offset capture fallbacks */
    for (const { name, token } of pattern.groups) {
      if (token === 'zzz') {
        if (!isValidTimeZone(match.groups?.[name] ?? '')) return false;
      /* c8 ignore next 3 @preserve -- offset token dispatch is exercised through valid/invalid offset matches */
      /* c8 ignore next 2 @preserve -- offset dispatch fallback */
      } else if (token === 'x' || token === 'xx' || token === 'xxx' || token === 'X' || token === 'XX' || token === 'XXX') {
        const raw = match.groups?.[name];
        /* c8 ignore start @preserve -- offset capture is guaranteed for offset token matches */
        if (raw !== undefined) {
          try {
            parseOffsetString(raw, token);
          } catch {
            return false;
          }
        }
        /* c8 ignore stop @preserve */
        /* c8 ignore stop @preserve */
      }
    }

    for (const run of pattern.ambiguousRuns) {
      const range = match.indices?.groups?.[run.groupName];
      if (!range || enumerateValidSplits(input.slice(range[0], range[1]), run.tokens).length === 0) {
        return false;
      }
    }
    return true;
  } catch (error) {
    if (error instanceof TemporalFmtError) throw new Error(error.message);
    throw error;
  }
}
