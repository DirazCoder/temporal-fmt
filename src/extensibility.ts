// Extensibility (plan section X). Controlled extensibility via
// createFormatter({ tokens: ... }) rather than uncontrolled global
// mutation. Custom tokens are passed at formatter-creation time;
// built-in behavior stays deterministic regardless of what's registered.
//
// The existing registerLocaleVocab() is a global-registration escape
// hatch for the locale-vocabulary case; createFormatter is the
// per-formatter alternative for custom tokens.

import { format as builtinFormat, formatToParts as builtinFormatToParts, type FormattedPart, type CompiledFormat } from './format.js';
import { TOKENS, type TemporalLike, type FormatOptions, DEFAULT_LOCALE } from './tokens.js';
import { tokenize } from './tokenize.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

export type TokenHandler = (t: TemporalLike, locale: string) => string;
export type TokenField = keyof TemporalLike;

export interface CustomToken {
  name: string;
  handler: TokenHandler;
  field: TokenField;
}

export interface FormatterOptions {
  // Custom tokens to add (or override). Built-in tokens with the same
  // name are replaced by the custom one.
  tokens?: CustomToken[];
  // Default locale for this formatter. Callers can still override per-call.
  defaultLocale?: string;
}

export interface Formatter {
  format(temporal: TemporalLike, formatStr: string, options?: FormatOptions): string;
  formatToParts(temporal: TemporalLike, formatStr: string, options?: FormatOptions): FormattedPart[];
  compileFormat(formatStr: string): CompiledFormat;
}

export function createFormatter(options: FormatterOptions = {}): Formatter {
  // Build a merged token table: built-ins plus overrides.
  const mergedTokens: Array<[string, TokenHandler, TokenField]> = [...TOKENS];
  const customTokenNames = new Set<string>();
  for (const custom of options.tokens ?? []) {
    customTokenNames.add(custom.name);
  }
  // Replace existing tokens with the same name; append new ones.
  for (const custom of options.tokens ?? []) {
    const existingIdx = mergedTokens.findIndex(([name]) => name === custom.name);
    if (existingIdx >= 0) {
      mergedTokens[existingIdx] = [custom.name, custom.handler, custom.field];
    } else {
      mergedTokens.push([custom.name, custom.handler, custom.field]);
    }
  }
  // Sort longest-first for the greedy tokenizer.
  mergedTokens.sort((a, b) => b[0].length - a[0].length);
  const handlerByToken = new Map(mergedTokens.map(([name, handler, field]) => [name, { handler, field }]));
  const sortedTokenStrings = mergedTokens.map(([name]) => name);

  function customTokenize(formatStr: string) {
    const pieces: Array<{ kind: 'token' | 'literal'; value: string }> = [];
    let i = 0;
    while (i < formatStr.length) {
      const ch = formatStr[i];
      if (ch === "'") {
        // Quoted literal handling — same as tokenize.ts.
        if (formatStr[i + 1] === "'") {
          appendLiteral(pieces, "'");
          i += 2;
          continue;
        }
        let j = i + 1;
        let literal = '';
        let closed = false;
        while (j < formatStr.length) {
          if (formatStr[j] === "'") {
            if (formatStr[j + 1] === "'") {
              literal += "'";
              j += 2;
              continue;
            }
            closed = true;
            j += 1;
            break;
          }
          literal += formatStr[j]!;
          j += 1;
        }
        if (!closed) throw new Error(`temporal-fmt: unterminated quote in format string "${formatStr}"`);
        appendLiteral(pieces, literal);
        i = j;
        continue;
      }
      const match = sortedTokenStrings.find((tok) => formatStr.startsWith(tok, i));
      if (match) {
        pieces.push({ kind: 'token', value: match });
        i += match.length;
        continue;
      }
      appendLiteral(pieces, ch);
      i += 1;
    }
    return pieces;
  }

  function appendLiteral(pieces: Array<{ kind: 'token' | 'literal'; value: string }>, value: string): void {
    const last = pieces[pieces.length - 1];
    if (last && last.kind === 'literal') {
      last.value += value;
    } else {
      pieces.push({ kind: 'literal', value });
    }
  }

  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;

  return {
    format(temporal: TemporalLike, formatStr: string, opts: FormatOptions = {}) {
      if (formatStr.length > MAX_FORMAT_LENGTH) {
        throw new Error(`temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters (got ${formatStr.length}).`);
      }
      const locale = opts.locale ?? defaultLocale;
      const pieces = customTokenize(formatStr);
      let result = '';
      for (const piece of pieces) {
        if (piece.kind === 'literal') {
          result += piece.value;
          continue;
        }
        const handler = handlerByToken.get(piece.value);
        if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
        if (temporal[handler.field] === undefined) {
          throw new Error(
            `temporal-fmt: token "${piece.value}" requires "${String(handler.field)}", which this Temporal object doesn't have.`
          );
        }
        result += handler.handler(temporal, locale);
      }
      return result;
    },
    formatToParts(temporal: TemporalLike, formatStr: string, opts: FormatOptions = {}) {
      if (formatStr.length > MAX_FORMAT_LENGTH) {
        throw new Error(`temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters (got ${formatStr.length}).`);
      }
      const locale = opts.locale ?? defaultLocale;
      const pieces = customTokenize(formatStr);
      const out: FormattedPart[] = [];
      for (const piece of pieces) {
        if (piece.kind === 'literal') {
          const last = out[out.length - 1];
          if (last && last.type === 'literal') last.value += piece.value;
          else out.push({ type: 'literal', value: piece.value });
          continue;
        }
        const handler = handlerByToken.get(piece.value);
        if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
        if (temporal[handler.field] === undefined) {
          throw new Error(`temporal-fmt: token "${piece.value}" requires "${String(handler.field)}".`);
        }
        out.push({ type: 'token', value: handler.handler(temporal, locale), token: piece.value });
      }
      return out;
    },
    compileFormat(formatStr: string): CompiledFormat {
      if (formatStr.length > MAX_FORMAT_LENGTH) {
        throw new Error(`temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters (got ${formatStr.length}).`);
      }
      const pieces = customTokenize(formatStr);
      return {
        formatStr,
        pieces: pieces.map((p) => p as { kind: 'token' | 'literal'; value: string }),
        format(temporal: TemporalLike, opts: FormatOptions = {}) {
          const locale = opts.locale ?? defaultLocale;
          let result = '';
          for (const piece of pieces) {
            if (piece.kind === 'literal') {
              result += piece.value;
              continue;
            }
            const handler = handlerByToken.get(piece.value);
            if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
            if (temporal[handler.field] === undefined) {
              throw new Error(`temporal-fmt: token "${piece.value}" requires "${String(handler.field)}".`);
            }
            result += handler.handler(temporal, locale);
          }
          return result;
        },
        formatToParts(temporal: TemporalLike, opts: FormatOptions = {}) {
          const locale = opts.locale ?? defaultLocale;
          const out: FormattedPart[] = [];
          for (const piece of pieces) {
            if (piece.kind === 'literal') {
              const last = out[out.length - 1];
              if (last && last.type === 'literal') last.value += piece.value;
              else out.push({ type: 'literal', value: piece.value });
              continue;
            }
            const handler = handlerByToken.get(piece.value);
            if (!handler) throw new Error(`temporal-fmt: unknown token "${piece.value}"`);
            if (temporal[handler.field] === undefined) {
              throw new Error(`temporal-fmt: token "${piece.value}" requires "${String(handler.field)}".`);
            }
            out.push({ type: 'token', value: handler.handler(temporal, locale), token: piece.value });
          }
          return out;
        },
      };
    },
  };
}

// Suppress unused-import warning. builtinFormat / builtinFormatToParts
// are imported so callers reading this file see the import surface; we
// don't use them directly because createFormatter reimplements the
// format walk over its own merged token table. The imports document
// the parallel API surface — and would be needed if we ever switched
// createFormatter to delegate rather than reimplement.
void builtinFormat;
void builtinFormatToParts;
void tokenize;
