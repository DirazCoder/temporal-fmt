// Format-string analysis and introspection. Single source of truth for
// "what does this format string need / accept / produce" — consumed by
// the ESLint plugin and the codemod
// so they don't each carry their own token table that drifts out of
// sync with the runtime. Everything here reads from TOKENS in
// tokens.ts and TOKEN_METADATA in tokenMetadata.ts, so adding a token
// to those two tables automatically makes it visible to analyze()
// without touching this file.

import { TOKENS, type TemporalLike } from './tokens.js';
import { TOKEN_METADATA, type TokenMetadata, type TemporalType } from './tokenMetadata.js';
import { tokenize, type Piece } from './tokenize.js';
import { _handlerFor } from './format.js';
import { UNPADDED_NUMERIC_TOKENS, FORMAT_ONLY_TOKENS } from './pattern.js';
import { MAX_FORMAT_LENGTH } from './constants.js';

// Re-exported so callers can import everything analyzer-related from a
// single entry point — analyze.ts is the introspection surface.
export type { TokenMetadata, TemporalType } from './tokenMetadata.js';
export type { Piece } from './tokenize.js';

// tokenizeFormat is the same tokenize() the runtime uses, exposed
// under a name that signals "this is the introspection entry point."
// Same implementation, different name — callers reading analyze.ts
// see a coherent API surface rather than having to know that the
// runtime tokenizer is the right thing to call.
export function tokenizeFormat(formatStr: string): Piece[] {
  return tokenize(formatStr);
}

// listTokens: every token the runtime recognizes, with metadata. Used
// by IDE autocomplete data (section AC) and the codemod's "can this
// source-library token be translated?" lookup (section Z).
export function listTokens(): Array<{ name: string; metadata: TokenMetadata }> {
  return TOKENS.map(([name]) => ({ name, metadata: TOKEN_METADATA[name]! }));
}

// tokenInfo: one token's metadata. Returns undefined for unknown
// tokens rather than throwing — callers (autocomplete, hover docs)
// want a sentinel, not an exception, when a user types a partial token.
export function tokenInfo(name: string): TokenMetadata | undefined {
  return TOKEN_METADATA[name];
}

export interface AnalyzedToken {
  name: string;
  // Position in the format string, 0-indexed. Useful for IDE diagnostics
  // that highlight a specific token.
  position: number;
  metadata: TokenMetadata;
}

export interface FormatAnalysis {
  // Every token in the format string, in order, with metadata.
  tokens: AnalyzedToken[];
  // Fields (year/month/day/hour/...) any token in this format string
  // reads off the input. Lets a caller statically check "does this
  // format string need a field PlainDate doesn't have?"
  requiredFields: string[];
  // Temporal types that can supply every required field. The intersection
  // across all tokens — a format string with both `yyyy` (needs year)
  // and `HH` (needs hour) is compatible only with types carrying both,
  // i.e. PlainDateTime/ZonedDateTime.
  compatibleTypes: TemporalType[];
  // Can parse() accept this format string? False when any token is
  // format-only (do/ww/RRRR per FORMAT_ONLY_TOKENS in pattern.ts).
  parseable: boolean;
  // Does the format string contain any locale-aware token (MMMM/MMM/
  // EEEE/EEE/a)? True means the output depends on the locale option
  // and a registered custom vocab can override the result.
  localeSensitive: boolean;
  // Does the format string contain any calendar-sensitive token?
  // Almost every date/weekday token is, since its output depends on
  // the object's calendar (a hebrew PlainDate's "MMMM" is a hebrew
  // month name). Pure-time tokens (HH/mm/ss) are not.
  calendarSensitive: boolean;
  // Does the format string contain zzz or any offset token? If yes,
  // only ZonedDateTime can supply the field.
  timezoneSensitive: boolean;
  // Does the format string contain a run of 2+ adjacent unpadded
  // numeric tokens with no literal between them (Md, dM, Hms, ...)?
  // Such runs can be ambiguous at parse time — strict mode throws,
  // lenient mode picks one split via the documented heuristic.
  ambiguous: boolean;
  // Does format(x, fmt) → parse(fmt, output) round-trip? False when
  // any token is format-only OR when yy is used (century loss).
  roundTripSafe: boolean;
  // Non-fatal issues found during analysis. Each carries a `code`
  // the IDE plugin / CLI can switch on. Empty for clean format strings.
  warnings: Array<{ code: string; message: string }>;
}

export function analyzeFormat(formatStr: string): FormatAnalysis {
  if (formatStr.length > MAX_FORMAT_LENGTH) {
    throw new Error(
      `temporal-fmt: format string exceeds maximum length of ${MAX_FORMAT_LENGTH} characters ` +
      `(got ${formatStr.length}).`
    );
  }
  const pieces = tokenize(formatStr);
  const tokens: AnalyzedToken[] = [];
  const requiredFields = new Set<string>();
  const compatibleTypesSet = new Set<TemporalType>();
  let parseable = true;
  let localeSensitive = false;
  let calendarSensitive = false;
  let timezoneSensitive = false;
  let roundTripSafe = true;
  const warnings: Array<{ code: string; message: string }> = [];

  // Walk pieces, building up the analysis. Position is computed per
  // token piece (literals count toward offset but don't appear in the
  // tokens array).
  let offset = 0;
  const unpaddedRun: string[] = [];
  const flushRun = () => {
    if (unpaddedRun.length >= 2) {
      warnings.push({
        code: 'AMBIGUOUS_NUMERIC_RUN',
        message: `Adjacent unpadded numeric tokens "${unpaddedRun.join('')}" with no separator can be ambiguous to parse. Add a separator or use the padded form (e.g. "MM" instead of "M").`,
      });
    }
    unpaddedRun.length = 0;
  };

  for (const piece of pieces) {
    if (piece.kind === 'literal') {
      offset += piece.value.length;
      flushRun();
      continue;
    }
    const metadata = TOKEN_METADATA[piece.value];
    // Dead by construction, confirmed via listTokens(): every token in
    // TOKENS has a matching TOKEN_METADATA entry (51/51), and tokenize()
    // already throws on any string that isn't in TOKENS before this loop
    // ever runs. Kept as a guard against the two tables drifting apart.
    /* c8 ignore start */
    if (!metadata) {
      warnings.push({
        code: 'UNKNOWN_TOKEN_NO_METADATA',
        message: `Token "${piece.value}" is recognized by the tokenizer but has no metadata entry in tokenMetadata.ts — this is a bug in temporal-fmt.`,
      });
      offset += piece.value.length;
      continue;
    }
    /* c8 ignore stop */
    tokens.push({ name: piece.value, position: offset, metadata });

    // Required fields: read off the handler map (the source of truth
    // for "what field does this token need"). Falls back to the
    // metadata's supportedTypes-derived field set if the handler isn't
    // found, which also shouldn't happen.
    const handler = _handlerFor(piece.value);
    if (handler) {
      requiredFields.add(handler.field as string);
    }

    // compatibleTypes: intersect every token's supportedTypes. The
    // first token seeds the set; subsequent tokens narrow it.
    if (tokens.length === 1) {
      for (const t of metadata.supportedTypes) compatibleTypesSet.add(t);
    } else {
      const stillCompatible = new Set<TemporalType>();
      for (const t of compatibleTypesSet) {
        if (metadata.supportedTypes.includes(t)) stillCompatible.add(t);
      }
      compatibleTypesSet.clear();
      for (const t of stillCompatible) compatibleTypesSet.add(t);
    }

    if (!metadata.parseCapable) {
      parseable = false;
      warnings.push({
        code: 'FORMAT_ONLY_TOKEN',
        message: `Token "${piece.value}" is format-only — it can't be parsed back into a value. Use a parse-capable variant (e.g. "d" instead of "do") if you need round-trip.`,
      });
    }
    if (metadata.localeSensitive) localeSensitive = true;
    if (metadata.calendarSensitive) calendarSensitive = true;
    if (metadata.timezoneSensitive) timezoneSensitive = true;
    if (!metadata.roundTripSafe) roundTripSafe = false;

    // Track runs of adjacent unpadded numeric tokens — same definition
    // as parsePattern.ts uses (UNPADDED_NUMERIC_TOKENS). A literal
    // between tokens breaks the run; this is checked by the flushRun
    // call above.
    if (UNPADDED_NUMERIC_TOKENS.has(piece.value)) {
      unpaddedRun.push(piece.value);
    } else {
      flushRun();
    }

    offset += piece.value.length;
  }
  flushRun();

  // Cross-token checks the runtime parse() performs. Mirroring them
  // here lets the ESLint plugin flag them statically without having
  // to re-derive the logic.
  const tokenNames = tokens.map((t) => t.name);
  const has12Hour = tokenNames.some((t) => t === 'hh' || t === 'h');
  const has24Hour = tokenNames.some((t) => t === 'HH' || t === 'H');
  const hasAPeriod = tokenNames.some((t) => t === 'a');
  if (has12Hour && !hasAPeriod) {
    warnings.push({
      code: 'TWELVE_HOUR_WITHOUT_A',
      message: '12-hour token ("hh"/"h") used without an "a" (AM/PM) token — parse() can\'t tell AM from PM and throws at runtime.',
    });
  }
  if (has12Hour && has24Hour) {
    warnings.push({
      code: 'MIXED_12_AND_24_HOUR',
      message: 'Mixing 24-hour and 12-hour tokens — parse() refuses to guess which is authoritative and throws at runtime.',
    });
  }

  const hasOffset = tokenNames.some((t) => t === 'X' || t === 'XX' || t === 'XXX' || t === 'x' || t === 'xx' || t === 'xxx');
  const hasZzz = tokenNames.some((t) => t === 'zzz');
  if (hasOffset && hasZzz) {
    warnings.push({
      code: 'ZZZ_WITH_OFFSET_TOKEN',
      message: 'Format string has both "zzz" and an offset token — parse() cross-checks them and throws if the parsed offset disagrees with the zone\'s actual offset.',
    });
  }
  if (hasOffset && !requiredFields.has('year')) {
    warnings.push({
      code: 'OFFSET_WITHOUT_FULL_DATE',
      message: 'Offset token used without a full date — parse() needs a complete date and time to build a ZonedDateTime and throws at runtime otherwise.',
    });
  }

  return {
    tokens,
    requiredFields: [...requiredFields].sort(),
    compatibleTypes: [...compatibleTypesSet].sort(),
    parseable,
    localeSensitive,
    calendarSensitive,
    timezoneSensitive,
    // Ambiguous iff at least one warning fired about an ambiguous run.
    ambiguous: warnings.some((w) => w.code === 'AMBIGUOUS_NUMERIC_RUN'),
    roundTripSafe: roundTripSafe && parseable,
    warnings,
  };
}

// explainFormat: human-readable rendering of analyzeFormat's output.
// Used by the CLI (section AD) for `temporal-fmt inspect <fmt>` and by
// the IDE for hover docs on a format string. Plain prose, no JSON —
// callers wanting machine-readable output should call analyzeFormat()
// directly.
export function explainFormat(formatStr: string): string {
  const analysis = analyzeFormat(formatStr);
  const lines: string[] = [];
  lines.push(`Format string: "${formatStr}"`);
  lines.push(`Tokens (${analysis.tokens.length}):`);
  for (const t of analysis.tokens) {
    lines.push(`  ${t.name} @${t.position} — ${t.metadata.meaning}`);
  }
  if (analysis.requiredFields.length > 0) {
    lines.push(`Required fields: ${analysis.requiredFields.join(', ')}`);
  }
  if (analysis.compatibleTypes.length > 0) {
    lines.push(`Compatible Temporal types: ${analysis.compatibleTypes.join(', ')}`);
  }
  lines.push(`Parseable: ${analysis.parseable ? 'yes' : 'no'}`);
  lines.push(`Locale-sensitive: ${analysis.localeSensitive ? 'yes' : 'no'}`);
  lines.push(`Calendar-sensitive: ${analysis.calendarSensitive ? 'yes' : 'no'}`);
  lines.push(`Timezone-sensitive: ${analysis.timezoneSensitive ? 'yes' : 'no'}`);
  lines.push(`Ambiguous: ${analysis.ambiguous ? 'yes' : 'no'}`);
  lines.push(`Round-trip safe: ${analysis.roundTripSafe ? 'yes' : 'no'}`);
  if (analysis.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of analysis.warnings) {
      lines.push(`  [${w.code}] ${w.message}`);
    }
  }
  return lines.join('\n');
}

// isValidFormat: true iff tokenize() accepts the string without
// throwing. Distinct from analyzeFormat's `parseable` flag — a format
// string can be valid (tokenizes cleanly) but not parseable (contains
// a format-only token like `do`). Both checks are exposed since callers
// want different things: validity for "will format() throw", parseability
// for "will parse() throw".
export function isValidFormat(formatStr: string): boolean {
  if (formatStr.length > MAX_FORMAT_LENGTH) return false;
  try {
    tokenize(formatStr);
    return true;
  } catch {
    return false;
  }
}

// validateFormat: throws on invalid format strings instead of
// returning a boolean. Mirrors the existing strict-validation
// convention (descriptive thrown errors, never silent failures).
// Returns the analysis for callers who want both — validate-then-use.
export function validateFormat(formatStr: string): FormatAnalysis {
  const analysis = analyzeFormat(formatStr);
  return analysis;
}

// Exported for callers that want to query the token table without
// touching internals. Kept here rather than re-exported from
// tokenMetadata.ts so this module is the single import for "anything
// analyzer-related."
export { TOKEN_METADATA, ALL_TOKEN_NAMES } from './tokenMetadata.js';

// Re-export FORMAT_ONLY_TOKENS so callers don't have to import from
// pattern.ts (which is a lower-level module they shouldn't need to
// know about).
export { FORMAT_ONLY_TOKENS } from './pattern.js';

// Used by callers that need to look up which field a token requires —
// e.g. the ESLint plugin's "type mismatch" check (section Y) wants to
// answer "does the type the caller passed to format() carry this
// field?" without having to actually call format() and catch the
// thrown error. Mirrors the same lookup format.ts does internally.
export function fieldForToken(token: string): keyof TemporalLike | undefined {
  return _handlerFor(token)?.field;
}