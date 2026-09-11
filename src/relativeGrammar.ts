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
  if (grammar.language.length > 35) {
    throw new RangeError(`temporal-fmt: registerRelativeGrammar language tags must be at most 35 characters (got ${grammar.language.length}).`);
  }
  if (!Array.isArray(grammar.matchers) || grammar.matchers.length === 0) {
    throw new Error('temporal-fmt: registerRelativeGrammar requires at least one matcher.');
  }
  // Every matcher runs on untrusted parseRelative input — a non-function
  // entry used to register fine and then blow up every subsequent
  // parseRelative() call for that locale with a raw V8 TypeError
  // ("matcher is not a function"). Cap the count for the same reason the
  // grammar count is capped: every registered matcher is scanned per
  // parseRelative call.
  if (grammar.matchers.length > 1000) {
    throw new RangeError(`temporal-fmt: registerRelativeGrammar accepts at most 1000 matchers (got ${grammar.matchers.length}).`);
  }
  if (!grammar.matchers.every((m) => typeof m === 'function')) {
    throw new Error('temporal-fmt: registerRelativeGrammar matchers must all be functions.');
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
      // One throwing matcher shouldn't take parseRelative() down with a
      // raw error — treat it as "no match" and let the next matcher (or
      // the built-in grammars) try. Registered matchers are third-party
      // code; isolating their failures is the registration boundary's
      // job.
      let match: RelativeGrammarMatch | null;
      try {
        match = matcher(input);
      } catch {
        continue;
      }
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
