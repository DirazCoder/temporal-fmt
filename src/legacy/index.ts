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

import {
  format as typedFormat,
  formatToParts as typedFormatToParts,
  compileFormat as typedCompileFormat,
  type CompiledFormat,
  type FormattedPart,
} from '../format.js';
import {
  parse as typedParse,
  safeParse as typedSafeParse,
  tryParse as typedTryParse,
  parseToParts as typedParseToParts,
  compileParser as typedCompileParser,
  type CompiledParser,
  type ParsedPart,
} from '../parse.js';
import type { TemporalLike } from '../tokens.js';
import type { NumberingFormatOptions, NumberingParseOptions } from '../numbering.js';
import { TemporalFmtError } from '../errors.js';

export type LegacySafeParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: Error };

export type LegacyCompiledParser = Omit<CompiledParser, 'safeParse'> & {
  safeParse(input: string, options?: NumberingParseOptions): LegacySafeParseResult;
};

function withLegacyErrors<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TemporalFmtError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

function toLegacySafeParseResult(result: ReturnType<typeof typedSafeParse>): LegacySafeParseResult {
  return result.ok
    ? result
    : { ok: false, error: new Error(result.error.message) };
}

export function format(
  temporal: TemporalLike,
  formatStr: string,
  options: NumberingFormatOptions = {},
): string {
  return withLegacyErrors(() => typedFormat(temporal, formatStr, options));
}

export function formatToParts(
  temporal: TemporalLike,
  formatStr: string,
  options: NumberingFormatOptions = {},
): FormattedPart[] {
  return withLegacyErrors(() => typedFormatToParts(temporal, formatStr, options));
}

export function compileFormat(formatStr: string): CompiledFormat {
  const compiled = withLegacyErrors(() => typedCompileFormat(formatStr));
  return {
    ...compiled,
    format: (temporal, options) => withLegacyErrors(() => compiled.format(temporal, options)),
    formatToParts: (temporal, options) => withLegacyErrors(() => compiled.formatToParts(temporal, options)),
  };
}

export function parse(formatStr: string, input: string, options: NumberingParseOptions = {}): unknown | undefined {
  return withLegacyErrors(() => typedParse(formatStr, input, options));
}

export function safeParse(
  formatStr: string,
  input: string,
  options: NumberingParseOptions = {},
): LegacySafeParseResult {
  return toLegacySafeParseResult(typedSafeParse(formatStr, input, options));
}

export function tryParse(formatStr: string, input: string, options: NumberingParseOptions = {}): unknown | undefined {
  return typedTryParse(formatStr, input, options);
}

export function parseToParts(
  formatStr: string,
  input: string,
  options: NumberingParseOptions = {},
): ParsedPart[] {
  return withLegacyErrors(() => typedParseToParts(formatStr, input, options));
}

export function compileParser(formatStr: string, options: NumberingParseOptions = {}): LegacyCompiledParser {
  const compiled = withLegacyErrors(() => typedCompileParser(formatStr, options));
  return {
    ...compiled,
    parse: (input, callOptions) => withLegacyErrors(() => compiled.parse(input, callOptions)),
    safeParse: (input, callOptions) => toLegacySafeParseResult(compiled.safeParse(input, callOptions)),
    tryParse: (input, callOptions) => compiled.tryParse(input, callOptions),
    parseToParts: (input, callOptions) => withLegacyErrors(() => compiled.parseToParts(input, callOptions)),
  };
}

export { matchesFormat } from './matchesFormat.js';
