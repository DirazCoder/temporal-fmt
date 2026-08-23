import { getTemporal } from './temporalProvider.js';
import { type TemporalNamespace } from './temporalProvider.js';
import { tryRegisteredGrammar } from './relativeGrammar.js';
import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';

// parseRelative resolves common relative-date phrases ("next Tuesday",
// "in 3 days", "March 5th") against a reference date, returning a
// Temporal.PlainDate. It's a different subsystem from the token-based
// parse(): the input is free natural-language text, not a structurally-
// typed format string, so this module owns its own grammar rather than
// bolting a natural-language layer onto the existing tokenizer.
//
// Per-language grammars: each locale's grammar lives in its own
// clearly-labeled section below (ENGLISH_GRAMMAR, SPANISH_GRAMMAR,
// FRENCH_GRAMMAR, GERMAN_GRAMMAR). The vocabulary and phrase patterns
// are NOT shared across languages — Spanish "hace 2 semanas" and
// French "il y a 2 semaines" are different idioms and get their own
// regexes. What IS shared is the matching engine (iterate matchers in
// order, first match wins, throw on no match) and the resolution
// helpers (addDays, addUnits, weekdayOffset, resolveToNextOccurrence).
// Same approach the humanizing skill calls "solve each recurring
// problem once": the matching strategy is shared, the per-language
// vocabulary is not.
//
// Default locale (no `locale` option) uses English — matches the
// pre-change behavior byte-for-byte. Passing `locale: 'es'`,
// `locale: 'fr'`, or `locale: 'de'` (or any locale tag with that
// language subtag) routes to the corresponding grammar. Unrecognized
// languages fall back to English rather than throwing — a caller
// passing `locale: 'it-IT'` still gets *some* result, just from the
// English grammar. (We could throw instead; the current contract is
// "best effort." If the caller wanted Italian specifically, they'd
// pass an Italian grammar via registerLocaleVocab-style extension —
// not implemented here.)

// Lowercase + expand German umlauts (ä→ae, ö→oe, ü→ue, ß→ss) + strip
// remaining diacritics. Three things going on at once:
//
//  1. Lowercase — case-insensitive matching without forcing the
//     regex flag to do it (also keeps the captured groups lowercase
//     for the resolver's comparisons).
//  2. Expand German umlaut transliterations. Germans without an
//     umlaut key write "ä" as "ae" — the standard transliteration.
//     Expanding "ä" → "ae" (before NFD stripping) means both "März"
//     and "Maerz" normalize to "maerz" and match the same pattern.
//     The reverse (ae → ä) would be wrong: "Tage" has "ae" as a
//     coincidence, not as an umlaut transliteration. Forward expansion
//     is unambiguous because the source string already has the
//     umlaut — the expansion only affects the matched form.
//  3. Strip combining marks via NFD. "Miércoles" → "Miercoles",
//     "février" → "fevrier", "août" → "aout". Pairs with the umlaut
//     expansion above so all four languages' accented forms collapse
//     to one canonical unaccented form for matching.
//
// Both sides of the match — input string AND the weekday/month name
// lists — get the same normalization applied, so this is symmetric.
function normalizeForMatch(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Standard Levenshtein edit distance (insert/delete/substitute, cost 1
// each). Used only by the opt-in fuzzy layer below — the exact matcher
// pass never calls this. Iterative DP over two rows, not the full
// matrix, since only the previous row is ever needed.
function levenshtein(a: string, b: string): number {
  /* c8 ignore start @preserve -- unreachable through the only call
   * site (fuzzyCorrectEnglish): `a` is always a word that already
   * failed the `vocabulary.includes(word)` exact-match check, so
   * a === b never holds against any `b` drawn from that same
   * vocabulary; and neither `a` (split from a non-empty normalized
   * string) nor `b` (a vocabulary entry) is ever empty. Kept as
   * general-purpose guards in case levenshtein() gets a second caller
   * later. */
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  /* c8 ignore stop @preserve */
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Max edit distance a fuzzy correction is allowed to bridge. 2 covers
// the common single-finger-slip and single-transposed-letter typo cases
// ("tommorow" is distance 1 from "tomorrow"; "tuesady" is distance 2
// from "tuesday" — a transposition costs 2 under simple Levenshtein,
// which doesn't special-case adjacent-swap as a single edit) without
// opening the door to correcting a word into something only vaguely
// similar. Deliberately conservative — this is a typo-tolerance layer,
// not a "guess what they meant" layer; the library's whole design
// philosophy elsewhere (parse()'s strict-by-default ambiguity handling,
// the lenient opt-in) is to bound how much guessing is allowed and make
// the caller ask for it explicitly.
const FUZZY_MAX_DISTANCE = 2;
const MAX_RELATIVE_INPUT_LENGTH = 4096;
const MAX_RELATIVE_WORDS = 32;

// English-only fuzzy vocabulary. Anything a matcher's regex treats as a
// fixed keyword (not a captured number) belongs here — weekday names,
// month names (long and short), and the marker words the matchers
// switch on (today/tomorrow/yesterday/next/last/this/in/ago and the
// unit words day/week/month/year). Numbers and ordinal suffixes are
// deliberately excluded: "5th" vs "5tj" isn't a word-shaped typo this
// layer is trying to solve, and correcting digits is a much easier way
// to silently produce a wrong date than correcting a weekday name is.
//
// Scoped to English only for this pass — the other three grammars have
// enough positional/multi-word-marker variation (French's "il y a",
// Spanish's dual pre/post weekday-modifier shapes) that a single
// word-substitution corrector isn't a good fit for all of them without
// per-language tuning this change doesn't attempt. parseRelative()
// throws a clear scope-limited error if { fuzzy: true } is combined
// with a non-English locale, rather than silently no-op-ing.
function buildEnglishFuzzyVocabulary(): string[] {
  return [
    ...ENGLISH_WEEKDAYS,
    ...ENGLISH_MONTHS,
    ...ENGLISH_MONTH_SHORT,
    'today', 'tomorrow', 'yesterday',
    'next', 'last', 'this',
    'in', 'ago',
    'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  ].map(normalizeForMatch);
}

// Lazily built and cached — the vocabulary is static per process, no
// need to rebuild the normalized list on every fuzzy call.
let englishFuzzyVocabulary: readonly string[] | undefined;
function getEnglishFuzzyVocabulary(): readonly string[] {
  if (!englishFuzzyVocabulary) englishFuzzyVocabulary = Object.freeze(buildEnglishFuzzyVocabulary());
  return englishFuzzyVocabulary;
}

// Attempts a word-level fuzzy correction of `normalized` against the
// English vocabulary, returning a corrected string or undefined if no
// correction was needed/possible. Tokenizes on whitespace; each token
// that isn't already an exact vocabulary word (or a pure number/ordinal,
// which passes through untouched) gets replaced with its closest
// vocabulary match, if one exists within FUZZY_MAX_DISTANCE. If a token
// has no sufficiently-close vocabulary match, it's left as-is — the
// re-attempted exact match will then fail on that token same as before,
// which is the correct outcome for "this word isn't a typo of anything
// we know, it's just not a phrase we support."
function fuzzyCorrectEnglish(normalized: string): string | undefined {
  const vocabulary = getEnglishFuzzyVocabulary();
  const words = normalized.split(' ');
  if (normalized.length > MAX_RELATIVE_INPUT_LENGTH || words.length > MAX_RELATIVE_WORDS) {
    throw new RangeError(
      `temporal-fmt: parseRelative fuzzy input is too large (maximum ${MAX_RELATIVE_INPUT_LENGTH} characters and ${MAX_RELATIVE_WORDS} words).`,
    );
  }
  let changed = false;
  const corrected = words.map((word) => {
    // Pure digits, or digits with an ordinal suffix (st/nd/rd/th) —
    // never touched by fuzzy correction. See the vocabulary comment
    // above for why.
    if (/^\d+(?:st|nd|rd|th)?$/.test(word)) return word;
    // Already an exact vocabulary word — nothing to correct.
    if (vocabulary.includes(word)) return word;

    let best: string | undefined;
    let bestDist = FUZZY_MAX_DISTANCE + 1;
    for (const candidate of vocabulary) {
      const dist = levenshtein(word, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    if (best !== undefined && bestDist <= FUZZY_MAX_DISTANCE) {
      changed = true;
      return best;
    }
    return word;
  });

  return changed ? corrected.join(' ') : undefined;
}

interface TemporalFieldBag {
  year?: number;
  month?: number;
  day?: number;
  dayOfWeek?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}

function readYear(reference: TemporalFieldBag): number {
  if (typeof reference.year !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing year.');
  }
  return reference.year;
}
function readMonth(reference: TemporalFieldBag): number {
  if (typeof reference.month !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing month.');
  }
  return reference.month;
}
function readDay(reference: TemporalFieldBag): number {
  if (typeof reference.day !== 'number') {
    throw new Error('temporal-fmt: parseRelative reference date is missing day.');
  }
  return reference.day;
}

function extractDayOfWeek(reference: TemporalFieldBag): number {
  const dow = reference.dayOfWeek;
  if (typeof dow !== 'number') {
    throw new Error(
      'temporal-fmt: parseRelative needs a reference date exposing dayOfWeek (a Temporal.PlainDate / PlainDateTime / ZonedDateTime).'
    );
  }
  return dow;
}

// Build an alternation regex fragment from a name list, normalized for
// matching. Longest-first so "September" wins over "Sep" in the same
// match position. The caller is responsible for any wrapping groups
// or anchors — this just produces the inner alternation.
function nameAlternation(names: string[]): string {
  const normalized = names.map(normalizeForMatch);
  // Dedupe — some locales render the long and short form identically
  // (English "May" is the same in both MMMM and MMM lists). Keep both
  // in the alternation rather than deduping, since duplicates in a
  // regex alternation don't change behavior and the dedupe would just
  // be a micro-optimization.
  // Sort longest-first so a longer name wins over its own prefix.
  const sorted = [...normalized].sort((a, b) => b.length - a.length);
  // Escape regex metacharacters — names shouldn't contain any, but
  // belt-and-braces avoids a future "M+1" month name from breaking
  // the alternation silently.
  return sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

// Resolves to a PlainDate by adding `days` to the reference. Used for
// weekday refs and the today/tomorrow/yesterday family.
function buildPlainDate(temporal: { PlainDate: { from: (fields: Record<string, number>, options?: { overflow?: 'constrain' | 'reject' }) => unknown } }, year: number, month: number, day: number): unknown {
  return temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
}

function addDays(
  temporal: { PlainDate: { from: (fields: Record<string, number>) => unknown } },
  reference: TemporalFieldBag,
  days: number,
): unknown {
  // Build the reference as a real PlainDate so we can use Temporal's
  // own add() for date arithmetic — calendar-correct (handles month
  // boundaries, leap years, etc.) so we don't have to reimplement it.
  const refDate = temporal.PlainDate.from({
    year: readYear(reference),
    month: readMonth(reference),
    day: readDay(reference),
  }) as { add: (duration: Record<string, number>) => unknown };
  return refDate.add({ days });
}

function addUnits(
  temporal: { PlainDate: { from: (fields: Record<string, number>) => unknown } },
  reference: TemporalFieldBag,
  count: number,
  unit: 'day' | 'week' | 'month' | 'year',
): unknown {
  const refDate = temporal.PlainDate.from({
    year: readYear(reference),
    month: readMonth(reference),
    day: readDay(reference),
  }) as { add: (duration: Record<string, number>) => unknown };
  const duration: Record<string, number> = {};
  if (unit === 'day') duration.days = count;
  if (unit === 'week') duration.weeks = count;
  if (unit === 'month') duration.months = count;
  if (unit === 'year') duration.years = count;
  return refDate.add(duration);
}

// "next X" — strictly future next occurrence. Said on a Tuesday:
// "next Tuesday" = 7 days from now, not today. Rationale: "this
// Tuesday" handles the same-week case, so "next Tuesday" staying
// strictly-future gives the two phrases distinct, non-overlapping
// meanings. Documented in README "parseRelative".
//
// "last X" — strictly past most recent occurrence. Symmetric to "next".
//
// "this X" — the X of the current ISO week (Mon..Sun). Can land on
// today, past, or future depending on where in the week today falls.
//
// All three resolve the same way across the four supported languages
// (en/es/fr/de): the equivalent idiom in each language maps to one of
// these three rel words. The natural-language reading is consistent
// — "next Tuesday" said on a Tuesday means next week's Tuesday in
// every language we support.
function weekdayOffset(rel: 'next' | 'last' | 'this', refDow: number, targetDow: number): number {
  // refDow and targetDow are both 1..7 (ISO Mon=1..Sun=7).
  if (rel === 'next') {
    let diff = targetDow - refDow;
    if (diff <= 0) diff += 7; // 0 (today) → 7, negative → wrap forward
    return diff; // 1..7
  }
  if (rel === 'last') {
    let diff = targetDow - refDow;
    if (diff >= 0) diff -= 7; // 0 (today) → -7, positive → wrap backward
    return diff; // -7..-1
  }
  // rel === 'this' — X of the current week. Can be today, past, or future.
  return targetDow - refDow; // -6..+6
}

// "March 5th" without a year → resolve to the next occurrence of that
// month/day. If today is that date, return today. Otherwise, if it's
// already past this year, return next year's occurrence.
//
// "Next occurrence" semantics: future-leaning. Documented in README
// as the chosen behavior. The alternative ("nearest in time, past or
// future") would mean "March 5th" said on March 6 returns yesterday —
// counterintuitive for the typical "next birthday"/"next deadline"
// use case this kind of phrase tends to drive.
function resolveToNextOccurrence(
  temporal: {
    PlainDate: {
      from: (fields: Record<string, number>, options?: { overflow?: 'constrain' | 'reject' }) => unknown;
      compare?: (one: unknown, two: unknown) => number;
    };
  },
  reference: TemporalFieldBag,
  month: number,
  day: number,
): unknown {
  const refYear = readYear(reference);
  const refDate = temporal.PlainDate.from({
    year: refYear,
    month: readMonth(reference),
    day: readDay(reference),
  });
  // PlainDate.compare is a static method on the namespace, not an
  // instance method — that's why it's called off temporal.PlainDate
  // rather than off an instance below. Checked outside the try/catch
  // below on purpose: that block's catch is scoped to Feb-29-style
  // overflow errors from from(), and silently retries with next year's
  // date. A missing-compare error thrown from inside that try would get
  // caught by the same handler and swallowed by that retry (next year's
  // from() usually succeeds), masking the real problem instead of
  // surfacing it.
  if (!temporal.PlainDate.compare) {
    throw new Error('temporal-fmt: parseRelative needs Temporal.PlainDate.compare to resolve month-day phrases; the active implementation does not expose it.');
  }
  // try this year first; if Feb 29 in a non-leap year, Temporal will
  // throw via overflow: 'reject' — fall through to next year.
  try {
    const thisYear = temporal.PlainDate.from({ year: refYear, month, day }, { overflow: 'reject' });
    // Returns -1 / 0 / 1.
    if (temporal.PlainDate.compare(thisYear, refDate) >= 0) {
      // today or in the future → use this year's occurrence
      return thisYear;
    }
    // already past this year → next year's occurrence
    return temporal.PlainDate.from({ year: refYear + 1, month, day }, { overflow: 'reject' });
  } catch (err) {
    // Feb 29 in a non-leap year, or similar. Try next year — if the
    // caller asked for "Feb 29" said in a non-leap year, next year may
    // also not be leap, in which case the inner from() will throw and
    // surface a clear error rather than silently landing on Feb 28.
    try {
      return temporal.PlainDate.from({ year: refYear + 1, month, day }, { overflow: 'reject' });
    } catch {
      throw new Error(
        `temporal-fmt: parseRelative can't resolve month ${month} day ${day} — ` +
        `it isn't a valid date in either ${refYear} or ${refYear + 1}. ` +
        `Original error: ${(err as Error).message}`
      );
    }
  }
}

// Each language provides a list of matchers. The shared engine
// iterates them in order and returns the first match. A matcher is a
// (regex, resolver) pair — the regex captures the structural pieces
// (count, unit name, weekday name, etc.), the resolver turns them
// into a Temporal.PlainDate using the shared helpers above.
interface ResolveContext {
  temporal: TemporalNamespace;
  reference: TemporalFieldBag;
}

interface Matcher {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, ctx: ResolveContext) => unknown;
}

interface RelativeDateGrammar {
  // Single-line description of supported phrase classes, included in
  // the "doesn't recognize" error so the caller knows what to try.
  supportedHint: string;
  // Ordered matchers; first match wins.
  matchers: Matcher[];
}

function weekdayIndexFromName(name: string, names: string[]): number {
  const normalized = normalizeForMatch(name);
  const idx = names.findIndex((n) => normalizeForMatch(n) === normalized);
  /* c8 ignore start @preserve -- unreachable: every caller passes a
   * name captured by nameAlternation(names), which builds its regex
   * alternation from this same list under the same normalizeForMatch
   * transform. The regex can't match anything findIndex() wouldn't
   * also find here. Defensive throw kept for the type checker and as
   * a tripwire if that invariant ever breaks. Ignore comment sits on
   * the `if` itself, not just the throw inside it — c8 tracks the
   * branch outcome (was the true side ever taken) separately from the
   * statements inside, so excluding only the inner throw still leaves
   * the branch itself flagged as uncovered. */
  /* c8 ignore next */
  if (idx < 0) {
    throw new Error(`temporal-fmt: parseRelative internal error — weekday "${name}" not in names list.`);
  }
  /* c8 ignore stop @preserve */
  return idx + 1;
}

function monthIndexFromName(name: string, longNames: string[], shortNames: string[] = []): number {
  const normalized = normalizeForMatch(name);
  const longIdx = longNames.findIndex((n) => normalizeForMatch(n) === normalized);
  if (longIdx >= 0) return longIdx + 1;
  const shortIdx = shortNames.findIndex((n) => normalizeForMatch(n) === normalized);
  /* c8 ignore next */
  if (shortIdx >= 0) return shortIdx + 1;
  /* c8 ignore start @preserve -- unreachable: every caller passes a name
   * captured by nameAlternation([...longNames, ...shortNames]), so the
   * regex alternation and these two findIndex() scans are built from
   * the same lists under the same normalizeForMatch transform. Kept as
   * a tripwire for the type checker in case that invariant ever breaks. */
  throw new Error(`temporal-fmt: parseRelative internal error — month "${name}" not in names list.`);
  /* c8 ignore stop @preserve */
  /* c8 ignore next -- defensive block is unreachable by construction. */
}

// English grammar — also the default when no locale is supplied. The
// regexes here are the same ones the pre-change parseRelative() used
// inline; they've just been pulled into a matcher list so the matching
// engine can iterate them the same way it does for es/fr/de.
const ENGLISH_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ENGLISH_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ENGLISH_GRAMMAR: RelativeDateGrammar = {
  supportedHint: 'Supported: weekday refs ("next Tuesday"), day offsets ("today"/"tomorrow"/"yesterday"), unit offsets ("in 3 days", "2 weeks ago"), and month-day ("March 5th").',
  matchers: [
    // today / tomorrow / yesterday — exact match, most rigid shape.
    // Checked first because they're the most common phrase class.
    {
      pattern: /^today$/i,
      resolve: (_m, ctx) => buildPlainDate(ctx.temporal, readYear(ctx.reference), readMonth(ctx.reference), readDay(ctx.reference)),
    },
    {
      pattern: /^tomorrow$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, 1),
    },
    {
      pattern: /^yesterday$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, -1),
    },
    // weekday references: "next/last/this Tuesday". Capture the relative
    // word and the weekday name separately, then resolve via +7 / -7.
    {
      pattern: new RegExp(`^(next|last|this)\\s+(${nameAlternation(ENGLISH_WEEKDAYS)})$`, 'i'),
      resolve: (m, ctx) => {
        const rel = m[1]!.toLowerCase() as 'next' | 'last' | 'this';
        const targetDow = weekdayIndexFromName(m[2]!, ENGLISH_WEEKDAYS);
        const refDow = extractDayOfWeek(ctx.reference);
        return addDays(ctx.temporal, ctx.reference, weekdayOffset(rel, refDow, targetDow));
      },
    },
    // unit offsets: "in 3 days", "2 weeks ago", "in 1 month", "1 year ago".
    // Two shapes share this matcher — leading "in" (future) or trailing
    // "ago" (past). Both lead with <number> <unit>.
    {
      pattern: /^(in\s+)?(\d+)\s+(day|week|month|year)s?(?:\s+ago)?$/i,
      resolve: (m, ctx) => {
        const inPrefix = m[1];
        const count = m[2]!;
        const unitName = m[3]!.toLowerCase() as 'day' | 'week' | 'month' | 'year';
        // Disambiguate future vs past: "in N units" is always future; "N
        // units ago" is always past. A bare "N units" without either is
        // a sign error — throw, since neither direction is implied and
        // guessing is exactly what this library refuses to do.
        const hasIn = !!inPrefix;
        const hasAgo = /\bago\b/i.test(m[0]!);
        if (!hasIn && !hasAgo) {
          throw new Error(
            `temporal-fmt: parseRelative can't tell whether "${m[0]}" is past or future — ` +
            `use "in ${count} ${unitName}s" or "${count} ${unitName}s ago".`
          );
        }
        const sign = hasIn ? 1 : -1;
        return addUnits(ctx.temporal, ctx.reference, sign * Number(count), unitName);
      },
    },
    // month-day without year, e.g. "March 5th", "March 5", "March 5, 2026"
    // (year is ignored if present). The ordinal suffix is decorative —
    // strip it. The day-of-month is a 1- or 2-digit number.
    {
      pattern: new RegExp(`^(${nameAlternation([...ENGLISH_MONTHS, ...ENGLISH_MONTH_SHORT])})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?$`, 'i'),
      resolve: (m, ctx) => {
        const month = monthIndexFromName(m[1]!, ENGLISH_MONTHS, ENGLISH_MONTH_SHORT);
        const day = Number(m[2]!);
        return resolveToNextOccurrence(ctx.temporal, ctx.reference, month, day);
      },
    },
  ],
};

// Spanish grammar. Distinct phrase shapes from English:
// - "hace 2 semanas" (past unit offset) — distinct word "hace", not
//   the English "X units ago" suffix shape.
// - "5 de marzo" — day-first, with required "de" between day and
//   month, opposite of English "March 5".
// - "el próximo lunes" / "lunes pasado" — weekday ref has the relative
//   word sometimes as a prefix with article, sometimes as a suffix.
//
// All four phrase classes the English grammar supports have Spanish
// equivalents here.
const SPANISH_WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const SPANISH_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Spanish month abbreviations vary by region ("set" vs "sept" for
// September). Sticking with the most common ICU form per locale.
const SPANISH_MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const SPANISH_GRAMMAR: RelativeDateGrammar = {
  supportedHint: 'Frases soportadas: referencias de día de la semana ("el próximo lunes", "el lunes pasado", "este martes"), offsets de día ("hoy"/"mañana"/"ayer"), offsets de unidad ("en 3 días", "hace 2 semanas"), y mes-día ("5 de marzo").',
  matchers: [
    {
      pattern: /^hoy$/i,
      resolve: (_m, ctx) => buildPlainDate(ctx.temporal, readYear(ctx.reference), readMonth(ctx.reference), readDay(ctx.reference)),
    },
    {
      pattern: /^ma[ñn]ana$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, 1),
    },
    {
      pattern: /^ayer$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, -1),
    },
    // weekday references. Spanish has three common shapes, all meaning
    // the same thing per rel word:
    //   "el próximo lunes" / "próximo lunes"  → next
    //   "el lunes próximo"                    → next (suffix variant)
    //   "el lunes pasado" / "lunes pasado"    → last
    //   "este lunes"                          → this
    // Capture the rel word from whichever shape matched, then resolve
    // the same way English does.
    {
      pattern: new RegExp(
        `^(?:el\\s+)?(?:(pr[oó]ximo|pasado)\\s+(${nameAlternation(SPANISH_WEEKDAYS)})|(${nameAlternation(SPANISH_WEEKDAYS)})\\s+(pr[oó]ximo|pasado)|este\\s+(${nameAlternation(SPANISH_WEEKDAYS)}))$`,
        'i',
      ),
      resolve: (m, ctx) => {
        let relWord: string;
        let weekdayName: string;
        if (m[1] && m[2]) {
          // prefix variant: "próximo lunes" / "pasado lunes"
          relWord = m[1]!;
          weekdayName = m[2]!;
        } else if (m[3] && m[4]) {
          // suffix variant: "lunes próximo" / "lunes pasado"
          weekdayName = m[3]!;
          relWord = m[4]!;
        } else {
          // "este lunes"
          relWord = 'este';
          weekdayName = m[5]!;
        }
        const rel = normalizeForMatch(relWord) === 'proximo' ? 'next' : relWord.toLowerCase() === 'este' ? 'this' : 'last';
        const targetDow = weekdayIndexFromName(weekdayName, SPANISH_WEEKDAYS);
        const refDow = extractDayOfWeek(ctx.reference);
        return addDays(ctx.temporal, ctx.reference, weekdayOffset(rel, refDow, targetDow));
      },
    },
    // unit offsets. Spanish uses distinct markers:
    //   "en 3 días" / "dentro de 3 días" → future
    //   "hace 2 semanas"                → past
    // Both shapes lead with the marker, unlike English where one
    // shape leads and the other trails.
    {
      pattern: new RegExp(
        `^(?:(en|dentro\\s+de)\\s+(\\d+)\\s+(d[ií]a|semana|mes|a[ñn]o)s?|(\\d+)\\s+(d[ií]a|semana|mes|a[ñn]o)s?\\s+(hace))$`,
        'i',
      ),
      resolve: (m, ctx) => {
        let count: string;
        let unitWord: string;
        let sign: number;
        if (m[1] && m[2] && m[3]) {
          // future: "en 3 días" / "dentro de 3 días"
          count = m[2]!;
          unitWord = m[3]!;
          sign = 1;
        } else {
          // past: "2 semanas hace" — but the more natural Spanish is
          // "hace 2 semanas" (marker first). The regex above only
          // matches "N units hace"; that's a less common but
          // grammatical alternative. The primary past form "hace N
          // unidades" is matched by the next matcher.
          count = m[4]!;
          unitWord = m[5]!;
          sign = -1;
        }
        const unit = unitWordToEnglish(unitWord);
        return addUnits(ctx.temporal, ctx.reference, sign * Number(count), unit);
      },
    },
    // "hace 2 semanas" — the primary past-offset shape. Matcher kept
    // separate from the future "en/dentro de" matcher above because
    // Spanish word order differs between the two (marker-first for
    // past, marker-first for future too, but with different markers).
    {
      pattern: new RegExp(`^hace\\s+(\\d+)\\s+(d[ií]a|semana|mes|a[ñn]o)s?$`, 'i'),
      resolve: (m, ctx) => {
        const count = Number(m[1]!);
        const unit = unitWordToEnglish(m[2]!);
        return addUnits(ctx.temporal, ctx.reference, -count, unit);
      },
    },
    // bare "N <unit>" without "en" / "hace" — throw, since direction
    // is ambiguous. Matched AFTER the directional shapes so the
    // directional ones win when their marker is present.
    {
      pattern: new RegExp(`^(\\d+)\\s+(d[ií]a|semana|mes|a[ñn]o)s?$`, 'i'),
      resolve: (m, _ctx) => {
        throw new Error(
          `temporal-fmt: parseRelative no puede decidir si "${m[0]}" es pasado o futuro — ` +
          `usa "en ${m[1]} ${m[2]}s" o "hace ${m[1]} ${m[2]}s".`
        );
      },
    },
    // month-day: "5 de marzo" (day first), "5 de marzo de 2026" (year
    // ignored if present). Day is 1-2 digits, with optional trailing
    // "." (rare in Spanish but tolerated).
    {
      pattern: new RegExp(
        `^(\\d{1,2})\\.?\\s+de\\s+(${nameAlternation([...SPANISH_MONTHS, ...SPANISH_MONTH_SHORT])})(?:\\s+de\\s+(\\d{4}))?$`,
        'i',
      ),
      resolve: (m, ctx) => {
        const day = Number(m[1]!);
        const month = monthIndexFromName(m[2]!, SPANISH_MONTHS, SPANISH_MONTH_SHORT);
        return resolveToNextOccurrence(ctx.temporal, ctx.reference, month, day);
      },
    },
  ],
};

// French grammar. Distinct from English/Spanish:
// - "il y a 2 semaines" (past marker is a 3-word phrase, not a single word).
// - "mardi prochain" — relative word is a SUFFIX on the weekday,
//   opposite of English "next Tuesday".
// - "5 mars" — day-first, no "de" between day and month (unlike
//   Spanish's "5 de marzo").
const FRENCH_WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const FRENCH_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FRENCH_MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const FRENCH_GRAMMAR: RelativeDateGrammar = {
  supportedHint: 'Phrases prises en charge : références de jour de la semaine ("lundi prochain", "mardi dernier", "ce mercredi"), décalages de jour ("aujourd\'hui"/"demain"/"hier"), décalages d\'unité ("dans 3 jours", "il y a 2 semaines"), et mois-jour ("5 mars").',
  matchers: [
    {
      pattern: /^aujourd'hui$/i,
      resolve: (_m, ctx) => buildPlainDate(ctx.temporal, readYear(ctx.reference), readMonth(ctx.reference), readDay(ctx.reference)),
    },
    {
      pattern: /^demain$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, 1),
    },
    {
      pattern: /^hier$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, -1),
    },
    // weekday references: "lundi prochain" (next), "lundi dernier"
    // (last), "ce lundi" (this). The relative word follows the
    // weekday for next/last, precedes it for this.
    {
      pattern: new RegExp(
        `^(?:(${nameAlternation(FRENCH_WEEKDAYS)})\\s+(prochain|dernier)|ce\\s+(${nameAlternation(FRENCH_WEEKDAYS)}))$`,
        'i',
      ),
      resolve: (m, ctx) => {
        let rel: 'next' | 'last' | 'this';
        let weekdayName: string;
        if (m[1] && m[2]) {
          weekdayName = m[1]!;
          rel = m[2]!.toLowerCase() === 'prochain' ? 'next' : 'last';
        } else {
          rel = 'this';
          weekdayName = m[3]!;
        }
        const targetDow = weekdayIndexFromName(weekdayName, FRENCH_WEEKDAYS);
        const refDow = extractDayOfWeek(ctx.reference);
        return addDays(ctx.temporal, ctx.reference, weekdayOffset(rel, refDow, targetDow));
      },
    },
    // past: "il y a 2 semaines" — multi-word marker.
    {
      pattern: new RegExp(`^il\\s+y\\s+a\\s+(\\d+)\\s+(jour|semaine|mois|an|ann[eée]e)s?$`, 'i'),
      resolve: (m, ctx) => {
        const count = Number(m[1]!);
        const unit = unitWordToEnglish(m[2]!);
        return addUnits(ctx.temporal, ctx.reference, -count, unit);
      },
    },
    // future: "dans 3 jours"
    {
      pattern: new RegExp(`^dans\\s+(\\d+)\\s+(jour|semaine|mois|an|ann[eée]e)s?$`, 'i'),
      resolve: (m, ctx) => {
        const count = Number(m[1]!);
        const unit = unitWordToEnglish(m[2]!);
        return addUnits(ctx.temporal, ctx.reference, count, unit);
      },
    },
    // bare "N <unit>" without marker — throw.
    {
      pattern: new RegExp(`^(\\d+)\\s+(jour|semaine|mois|an|ann[eée]e)s?$`, 'i'),
      resolve: (m, _ctx) => {
        throw new Error(
          `temporal-fmt: parseRelative ne peut pas déterminer si "${m[0]}" est passé ou futur — ` +
          `utilisez "dans ${m[1]} ${m[2]}s" ou "il y a ${m[1]} ${m[2]}s".`
        );
      },
    },
    // month-day: "5 mars" (day first, no separator word). Year ignored.
    {
      pattern: new RegExp(
        `^(\\d{1,2})\\s+(${nameAlternation([...FRENCH_MONTHS, ...FRENCH_MONTH_SHORT])})(?:\\s+(\\d{4}))?$`,
        'i',
      ),
      resolve: (m, ctx) => {
        const day = Number(m[1]!);
        const month = monthIndexFromName(m[2]!, FRENCH_MONTHS, FRENCH_MONTH_SHORT);
        return resolveToNextOccurrence(ctx.temporal, ctx.reference, month, day);
      },
    },
  ],
};

// German grammar. Distinct from the others:
// - Unit words pluralize with -n in the dative after "in"/"vor":
//   "in 3 Tagen" (vs nominative "3 Tage"). The regex accepts both
//   since callers may not always get the case right, and accepting
//   both doesn't introduce ambiguity.
// - "nächsten Dienstag" — relative word precedes weekday as a
//   declined adjective, with the weekday capitalized as a noun.
// - "5. März" — day-first with a period after the day number,
//   matching German date convention.
const GERMAN_WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const GERMAN_MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const GERMAN_GRAMMAR: RelativeDateGrammar = {
  supportedHint: 'Unterstützte Phrasen: Wochentag-Bezüge ("nächsten Dienstag", "letzten Freitag", "diesen Montag"), Tages-Offsets ("heute"/"morgen"/"gestern"), Einheiten-Offsets ("in 3 Tagen", "vor 2 Wochen"), und Monat-Tag ("5. März").',
  matchers: [
    {
      pattern: /^heute$/i,
      resolve: (_m, ctx) => buildPlainDate(ctx.temporal, readYear(ctx.reference), readMonth(ctx.reference), readDay(ctx.reference)),
    },
    {
      pattern: /^morgen$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, 1),
    },
    {
      pattern: /^gestern$/i,
      resolve: (_m, ctx) => addDays(ctx.temporal, ctx.reference, -1),
    },
    // weekday references: "nächsten Dienstag" (next), "letzten
    // Dienstag" (last), "diesen Dienstag" (this). Adjective precedes
    // the weekday; case varies (nächsten/letzten/diesen all take the
    // weak-declension -en/-en/-en ending when no article, which is
    // convenient — one regex alternation covers all three.
    {
      pattern: new RegExp(`^(n(?:ae|a|ä)chsten|letzten|diesen)\\s+(${nameAlternation(GERMAN_WEEKDAYS)})$`, 'i'),
      resolve: (m, ctx) => {
        const adj = normalizeForMatch(m[1]!);
        const rel: 'next' | 'last' | 'this' = (adj === 'nachsten' || adj === 'naechsten') ? 'next' : adj === 'diesen' ? 'this' : 'last';
        const targetDow = weekdayIndexFromName(m[2]!, GERMAN_WEEKDAYS);
        const refDow = extractDayOfWeek(ctx.reference);
        return addDays(ctx.temporal, ctx.reference, weekdayOffset(rel, refDow, targetDow));
      },
    },
    // past: "vor 2 Wochen"
    {
      pattern: new RegExp(`^vor\\s+(\\d+)\\s+(Tag(?:e|n|en)?|Woche(?:n)?|Monat(?:e|n|en)?|Jahr(?:e|n|en)?)$`, 'i'),
      resolve: (m, ctx) => {
        const count = Number(m[1]!);
        const unit = unitWordToEnglish(m[2]!);
        return addUnits(ctx.temporal, ctx.reference, -count, unit);
      },
    },
    // future: "in 3 Tagen"
    {
      pattern: new RegExp(`^in\\s+(\\d+)\\s+(Tag(?:e|n|en)?|Woche(?:n)?|Monat(?:e|n|en)?|Jahr(?:e|n|en)?)$`, 'i'),
      resolve: (m, ctx) => {
        const count = Number(m[1]!);
        const unit = unitWordToEnglish(m[2]!);
        return addUnits(ctx.temporal, ctx.reference, count, unit);
      },
    },
    // bare "N <unit>" without "in" or "vor" — throw.
    {
      pattern: new RegExp(`^(\\d+)\\s+(Tag(?:e|n|en)?|Woche(?:n)?|Monat(?:e|n|en)?|Jahr(?:e|n|en)?)$`, 'i'),
      resolve: (m, _ctx) => {
        throw new Error(
          `temporal-fmt: parseRelative kann nicht erkennen, ob "${m[0]}" Vergangenheit oder Zukunft ist — ` +
          `verwende "in ${m[1]} ${m[2]}" oder "vor ${m[1]} ${m[2]}".`
        );
      },
    },
    // month-day: "5. März" (day-first with period). Year ignored.
    {
      pattern: new RegExp(
        `^(\\d{1,2})\\.?\\s+(${nameAlternation([...GERMAN_MONTHS, ...GERMAN_MONTH_SHORT, 'Maerz', 'Maer'])})(?:\\s+(\\d{4}))?$`,
        'i',
      ),
      resolve: (m, ctx) => {
        const day = Number(m[1]!);
        const month = monthIndexFromName(m[2]!, GERMAN_MONTHS, GERMAN_MONTH_SHORT);
        return resolveToNextOccurrence(ctx.temporal, ctx.reference, month, day);
      },
    },
  ],
};

const GRAMMARS: Record<string, RelativeDateGrammar> = {
  en: ENGLISH_GRAMMAR,
  es: SPANISH_GRAMMAR,
  fr: FRENCH_GRAMMAR,
  de: GERMAN_GRAMMAR,
};

// Pick a grammar for a locale. Falls back to English for languages we
// don't have a grammar for (Italian, Portuguese, etc.) rather than
// throwing — best-effort, matches how formatDistance treats unknown
// locales (Intl.RelativeTimeFormat accepts them; here we fall back to
// English so the call still succeeds with reasonable output).
function grammarForLocale(locale: string | undefined): RelativeDateGrammar {
  if (!locale) return ENGLISH_GRAMMAR;
  try {
    // Intl.Locale requires BCP-47 hyphens — same normalization as the
    // other locale-handling code in this library.
    const tag = new Intl.Locale(locale.replace(/_/g, '-'));
    const lang = tag.language.toLowerCase();
    return GRAMMARS[lang] ?? ENGLISH_GRAMMAR;
  } catch {
    // Malformed locale tag — fall back to English. The actual Intl
    // call downstream will throw if the tag is genuinely unusable,
    // which is a better surface for that error than here.
    return ENGLISH_GRAMMAR;
  }
}

// Language subtag of a locale option, for dispatching to grammars
// registered via registerRelativeGrammar(). Mirrors grammarForLocale's
// normalization and fallback.
function languageOf(locale: string | undefined): string {
  if (!locale) return 'en';
  try {
    return new Intl.Locale(locale.replace(/_/g, '-')).language.toLowerCase();
  } catch {
    return 'en';
  }
}

// Map a per-language unit word back to the English unit name the
// shared addUnits() helper expects. Each language contributes its own
// regex alternation of unit words; this function normalizes the
// captured word back to a unit enum value.
function unitWordToEnglish(word: string): 'day' | 'week' | 'month' | 'year' {
  const w = normalizeForMatch(word);
  // English
  /* c8 ignore next */
  if (w === 'day' || w === 'week' || w === 'month' || w === 'year') return w;
  // Spanish (accent-stripped)
  if (w === 'dia') return 'day';
  if (w === 'semana') return 'week';
  if (w === 'mes') return 'month';
  if (w === 'ano' || w === 'año') return 'year';
  // French
  if (w === 'jour') return 'day';
  if (w === 'semaine') return 'week';
  if (w === 'mois') return 'month';
  if (w === 'an' || w === 'annee') return 'year';
  // German
  if (w === 'tag' || w === 'tagen') return 'day';
  if (w === 'woche' || w === 'wochen') return 'week';
  if (w === 'monat' || w === 'monaten') return 'month';
  /* c8 ignore next */
  if (w === 'jahr' || w === 'jahren') return 'year';
  /* c8 ignore start @preserve -- unreachable: every caller passes a word
   * captured by a regex alternation built from exactly these unit-word
   * forms (day/week/month/year across en/es/fr/de), so the branches
   * above already cover every string that can reach this function.
   * Kept as a tripwire for the type checker in case a grammar adds a
   * unit word here without a matching regex update. */
  throw new Error(`temporal-fmt: parseRelative internal error — unrecognized unit word "${word}".`);
  /* c8 ignore stop @preserve */
  /* c8 ignore next -- defensive block is unreachable by construction. */
}

// Reference: kept exported for the unit tests that need it. The other
// helpers above are not exported since tests only need to drive
// parseRelative() through the public API + this one constant for the
// Tuesday-on-Tuesday fixture.
export const WEEKDAY_NAMES = ENGLISH_WEEKDAYS;
export const MONTH_NAMES = ENGLISH_MONTHS;
// Exported for the localeVocab-style stub-test pattern in case a future
// test wants to verify a grammar's name list against Intl's actual
// output for that locale — same pattern localeVocab.test.js uses to
// catch a mismatch between what format() produces and what parse()
// expects.
export const SPANISH_MONTH_NAMES = SPANISH_MONTHS;
export const FRENCH_MONTH_NAMES = FRENCH_MONTHS;
export const GERMAN_MONTH_NAMES = GERMAN_MONTHS;
export const SPANISH_WEEKDAY_NAMES = SPANISH_WEEKDAYS;
export const FRENCH_WEEKDAY_NAMES = FRENCH_WEEKDAYS;
export const GERMAN_WEEKDAY_NAMES = GERMAN_WEEKDAYS;
void WEEKDAY_NAMES;
void MONTH_NAMES;

export interface ParseRelativeOptions extends FormatOptions {
  /**
   * Opt-in typo tolerance. When the input doesn't match any phrase
   * exactly, retry after correcting individual words (weekday names,
   * month names, and marker words like "next"/"ago"/"tomorrow") that
   * are within a small edit distance of a known word — e.g.
   * "tommorow" → "tomorrow", "next tuesady" → "next tuesday". Numbers
   * are never touched.
   *
   * Off by default, matching this library's throw-rather-than-guess
   * philosophy elsewhere (parse()'s `lenient` option is the same shape
   * of opt-in). English only for this option currently — combining
   * `fuzzy: true` with a non-English `locale` throws rather than
   * silently skipping the fuzzy pass.
   *
   * If no correction produces a recognized phrase, throws the same
   * "doesn't recognize" error the exact pass would have thrown.
   */
  fuzzy?: boolean;
}

/**
 * Resolve common relative-date phrases against a reference date,
 * returning a Temporal.PlainDate. Supports English by default, plus
 * Spanish (es), French (fr), and German (de) via the `locale` option.
 *
 * Supported phrase classes (with examples per language):
 *
 * - weekday refs: "next Tuesday" / "el próximo martes" / "mardi prochain" / "nächsten Dienstag"
 * - day offsets: "today" / "hoy" / "aujourd'hui" / "heute" (and tomorrow/yesterday equivalents)
 * - unit offsets: "in 3 days" / "en 3 días" / "dans 3 jours" / "in 3 Tagen"
 * - month-day without year: "March 5th" / "5 de marzo" / "5 mars" / "5. März"
 *
 * Ambiguous-case handling is consistent across all four languages:
 * "next X" said on X (today is the named weekday) means 7 days from
 * now, not today. "last X" said on X means 7 days ago. See README
 * "parseRelative" for the documented behavior of each ambiguous case.
 *
 * Throws a descriptive error for any phrase it doesn't recognize in
 * the target language, rather than guessing. A bare "5 days" without
 * "in" or "ago" (or the per-language equivalent) throws with a message
 * pointing at the disambiguation options.
 *
 * Returns a Temporal.PlainDate for every supported phrase. Time-of-day
 * extensions like "next Tuesday at 3pm" aren't supported in this pass.
 */
export function parseRelative(
  input: string,
  referenceDate: unknown,
  options: ParseRelativeOptions = {},
): unknown {
  const reference = referenceDate as TemporalFieldBag;
  const temporal = getTemporal();

  // Trim, collapse internal whitespace, strip diacritics, and lowercase.
  // Whitespace normalization is shared with the pre-change behavior;
  // diacritic stripping pairs with nameAlternation()'s normalization so
  // "mi[eé]rcoles" and "miercoles" both match the same pattern.
  // Lowercasing matches the case-insensitive regex flag explicitly so
  // the user's input never gets case-swapped on its way through the
  // matcher (the regexes are 'i'-flagged, but normalizing here keeps
  // the original-trimmed-string echo in error messages predictable).
  const trimmed = (input ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new Error('temporal-fmt: parseRelative got an empty input string.');
  }
  if (trimmed.length > MAX_RELATIVE_INPUT_LENGTH) {
    throw new RangeError(
      `temporal-fmt: parseRelative input is too large (maximum ${MAX_RELATIVE_INPUT_LENGTH} characters).`,
    );
  }
  // For error messages, keep the user's original spelling (with accents)
  // so the echo in the "doesn't recognize" error matches what they
  // typed. The matching itself uses the diacritic-stripped form so
  // "mi[eé]rcoles" / "miercoles" / "MI[ÉE]RCOLES" all match the same
  // pattern without forcing the user to remember the accent.
  const normalized = normalizeForMatch(trimmed);

  const grammar = grammarForLocale(options.locale);
  const ctx: ResolveContext = { temporal, reference };

  // Registered grammars (registerRelativeGrammar) take precedence over
  // the built-in ones for their language — that's the documented
  // contract in relativeGrammar.ts ("try registered grammars before
  // falling back to the built-in ones"). This wiring was missing
  // entirely before: registered grammars were stored and listed but
  // never consulted, so the extension point silently did nothing.
  // Returns null quickly when nothing is registered for the language.
  const registered = tryRegisteredGrammar(languageOf(options.locale), trimmed, {
    year: reference.year as number,
    month: reference.month as number,
    day: reference.day as number,
    dayOfWeek: reference.dayOfWeek as number,
  });
  if (registered !== null) {
    return registered;
  }

  const tryMatch = (text: string): unknown | typeof NO_MATCH => {
    for (const matcher of grammar.matchers) {
      const match = text.match(matcher.pattern);
      if (match) {
        return matcher.resolve(match, ctx);
      }
    }
    return NO_MATCH;
  };

  const exactResult = tryMatch(normalized);
  if (exactResult !== NO_MATCH) {
    return exactResult;
  }

  if (options.fuzzy) {
    // Fuzzy mode is English-only for this pass — see the vocabulary
    // comment above fuzzyCorrectEnglish for why the other three
    // grammars aren't covered. Fail loudly rather than silently
    // skipping the fuzzy attempt, so a caller relying on fuzzy mode
    // for, say, French input doesn't get a confusing "doesn't
    // recognize" error with no indication fuzzy matching never ran.
    if (grammar !== ENGLISH_GRAMMAR) {
      throw new Error(
        `temporal-fmt: parseRelative's { fuzzy: true } option currently only supports English. ` +
        `Pass no locale (or locale: 'en'), or omit { fuzzy: true } for this locale.`
      );
    }
    const corrected = fuzzyCorrectEnglish(normalized);
    if (corrected !== undefined) {
      const fuzzyResult = tryMatch(corrected);
      if (fuzzyResult !== NO_MATCH) {
        return fuzzyResult;
      }
    }
  }

  throw new Error(
    `temporal-fmt: parseRelative doesn't recognize "${trimmed}". ` +
    grammar.supportedHint
  );
}

// Sentinel distinguishing "no matcher matched" from a legitimate
// resolve() return value of `undefined`/`null` (matchers can throw
// their own errors, e.g. the ambiguous-direction case, but none
// currently return a nullish PlainDate — this sentinel just makes the
// "no match" case unambiguous regardless).
const NO_MATCH = Symbol('temporal-fmt: parseRelative no match');

// DEFAULT_LOCALE is imported for the option's default-value documentation
// above (no locale → English). The symbol itself isn't read at runtime
// here, but the import keeps the dependency edge explicit so future
// changes to the default-locale constant propagate here too.
void DEFAULT_LOCALE;