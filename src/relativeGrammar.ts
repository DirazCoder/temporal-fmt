// Relative-grammar registration. Extends the existing
// parseRelative.ts with an extension point for registering additional
// grammars beyond the four built in (English, Spanish, French, German).
//
// The existing parseRelative() detects the language from the locale
// option and dispatches to the matching grammar. registerRelativeGrammar()
// lets a caller add a new language without modifying parseRelative.ts.
//
// Grammar shape: a list of matchers, each returning either a Temporal
// field bag describing the resolved date or null. parseRelative tries
// each matcher in order until one matches. This mirrors the ENGLISH/
// SPANISH/FRENCH/GERMAN_GRAMMAR structure parseRelative already uses
// internally.

import { getTemporal, type TemporalNamespace } from './temporalProvider.js';

export interface RelativeGrammarMatch {
  // The Temporal fields the matcher resolved. Used to construct a
  // PlainDate / PlainDateTime via Temporal.PlainDate.from().
  year?: number;
  month?: number;
  day?: number;
  // Optional: instead of computing fields directly, return a function
  // that takes the reference date and returns the resolved date. Used
  // for phrases like "next Tuesday" that depend on the reference's
  // weekday.
  resolve?: (reference: { year: number; month: number; day: number; dayOfWeek: number }) => { year: number; month: number; day: number };
}

export interface RelativeGrammar {
  // Locale language subtag this grammar handles ('en', 'es', etc.).
  // Matched against the `locale` option's language subtag.
  language: string;
  // Matchers in priority order. First match wins.
  matchers: Array<(input: string) => RelativeGrammarMatch | null>;
}

const registeredGrammars: RelativeGrammar[] = [];

export function registerRelativeGrammar(grammar: RelativeGrammar): void {
  if (typeof grammar.language !== 'string' || grammar.language.length === 0) {
    throw new Error('temporal-fmt: registerRelativeGrammar requires a non-empty language string.');
  }
  if (!Array.isArray(grammar.matchers) || grammar.matchers.length === 0) {
    throw new Error('temporal-fmt: registerRelativeGrammar requires at least one matcher.');
  }
  // Replace any existing grammar for the same language.
  const existingIdx = registeredGrammars.findIndex((g) => g.language === grammar.language);
  if (existingIdx >= 0) {
    registeredGrammars[existingIdx] = grammar;
  } else {
    registeredGrammars.push(grammar);
  }
}

// Called by parseRelative() to try registered grammars before falling
// back to the built-in ones. Returns the resolved Temporal.PlainDate or
// null if no registered grammar matched.
export function tryRegisteredGrammar(
  language: string,
  input: string,
  reference: { year: number; month: number; day: number; dayOfWeek: number },
): unknown | null {
  for (const grammar of registeredGrammars) {
    if (grammar.language !== language) continue;
    for (const matcher of grammar.matchers) {
      const match = matcher(input);
      if (match === null) continue;
      const temporal = getTemporal();
      if (match.resolve) {
        const fields = match.resolve(reference);
        return temporal.PlainDate.from(fields, { overflow: 'reject' });
      }
      return temporal.PlainDate.from(
        { year: match.year ?? reference.year, month: match.month ?? reference.month, day: match.day ?? reference.day },
        { overflow: 'reject' },
      );
    }
  }
  return null;
}

// Returns the list of registered languages (for introspection).
export function listRegisteredGrammars(): string[] {
  return registeredGrammars.map((g) => g.language);
}

// Suppress unused import — TemporalNamespace is referenced by the type
// signature above (via the return type of tryRegisteredGrammar, which
// is the result of temporal.PlainDate.from).
void (undefined as unknown as TemporalNamespace);
