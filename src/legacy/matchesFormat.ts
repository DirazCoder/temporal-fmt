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

import { DEFAULT_LOCALE, type FormatOptions } from '../tokens.js';
import { tokenize } from '../tokenize.js';
import { buildCapturingPattern, type CapturingPattern } from '../parsePattern.js';
import { MAX_FORMAT_LENGTH } from '../constants.js';
import { TemporalFmtError } from '../errors.js';
import { enumerateValidSplits } from '../pattern.js';

const patternCache = new Map<string, CapturingPattern>();
const MAX_CACHE_SIZE = 500;

function getPattern(formatStr: string, locale: string) {
  const key = locale + '\0' + formatStr;
  const cached = patternCache.get(key);
  if (cached) return cached;

  if (patternCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = patternCache.keys().next().value;
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
    const locale = options.locale ?? DEFAULT_LOCALE;
    const pattern = getPattern(formatStr, locale);
    const match = pattern.regex.exec(input);
    if (!match) return false;

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
