// lets people register their own relative-date grammars on top of
// parseRelative.ts, which only ships with English/Spanish/French/German
// baked in.
//
// parseRelative() looks at the locale option, figures out the language,
// and dispatches. registerRelativeGrammar() means someone can bolt on
// a new language without touching parseRelative.ts itself.
//
// a grammar is just a list of matchers, each one either resolves to a
// Temporal field bag or returns null. tries them in order, first match
// wins — same shape as the ENGLISH/SPANISH/FRENCH/GERMAN_GRAMMAR objects
// parseRelative already has internally, just made pluggable

import { getTemporal, type TemporalNamespace } from './temporalProvider.js';

export interface RelativeGrammarMatch {
  // whatever fields the matcher figured out, gets fed to Temporal.PlainDate.from()
  year?: number;
  month?: number;
  day?: number;
  // for cases like "next Tuesday" where you can't compute the fields
  // without knowing the reference date's weekday first — pass a function
  // instead of raw fields
  resolve?: (reference: { year: number; month: number; day: number; dayOfWeek: number }) => { year: number; month: number; day: number };
}

export interface RelativeGrammar {
  // language subtag ('en', 'es', etc), matched against the locale option
  language: string;
  // tried top to bottom, first one that matches wins
  matchers: Array<(input: string) => RelativeGrammarMatch | null>;
}

// cap so nobody can loop registerRelativeGrammar() and blow up the array
// (and the scan in tryRegisteredGrammar with it) forever. re-registering
// an existing language doesn't count against this, only actually new ones.
// same idea as what registerLocaleVocab does for custom vocabs
const MAX_REGISTERED_GRAMMARS = 100;

const registeredGrammars: RelativeGrammar[] = [];

export function registerRelativeGrammar(grammar: RelativeGrammar): void {
  if (typeof grammar.language !== 'string' || grammar.language.length === 0) {
    throw new Error('temporal-fmt: registerRelativeGrammar requires a non-empty language string.');
  }
  if (!Array.isArray(grammar.matchers) || grammar.matchers.length === 0) {
    throw new Error('temporal-fmt: registerRelativeGrammar requires at least one matcher.');
  }
  // if this language's already registered, just swap it out
  const existingIdx = registeredGrammars.findIndex((g) => g.language === grammar.language);
  if (existingIdx >= 0) {
    registeredGrammars[existingIdx] = grammar;
  } else {
    if (registeredGrammars.length >= MAX_REGISTERED_GRAMMARS) {
      throw new RangeError(`temporal-fmt: registerRelativeGrammar reached the ${MAX_REGISTERED_GRAMMARS}-grammar limit.`);
    }
    registeredGrammars.push(grammar);
  }
}

// parseRelative() calls this first, before falling back to the built-ins.
// null means nothing registered matched
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

// just for introspection, lists what's registered
export function listRegisteredGrammars(): string[] {
  return registeredGrammars.map((g) => g.language);
}

// this is just here so TS doesn't complain about the unused import —
// TemporalNamespace shows up in the type signature above but not as a
// real runtime reference
void (undefined as unknown as TemporalNamespace);
