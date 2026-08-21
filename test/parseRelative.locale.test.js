import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelative, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Locale-aware parseRelative tests. Each of es/fr/de gets its own
// grammar (per-language phrase patterns, shared matching engine). The
// English default-path tests live in parseRelative.test.js — that file
// also pins the byte-identical-to-pre-change behavior of the no-locale
// path. This file covers the new locale path: every phrase class the
// English grammar supports has an equivalent idiom in each language,
// plus adversarial cases for the same-day-of-week ambiguity and for
// unrecognized input (which must throw, not guess).
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// 2026-08-04 is a Tuesday — same reference the English tests use, so
// the offsets resolve the same way across languages.
const REFERENCE = Temporal.PlainDate.from('2026-08-04');

function asIso(result) {
  return result.toString();
}

test('Spanish: day offsets (hoy / mañana / ayer)', () => {
  assert.equal(asIso(parseRelative('hoy', REFERENCE, { locale: 'es-ES' })), '2026-08-04');
  assert.equal(asIso(parseRelative('mañana', REFERENCE, { locale: 'es-ES' })), '2026-08-05');
  assert.equal(asIso(parseRelative('ayer', REFERENCE, { locale: 'es-ES' })), '2026-08-03');
  // Case-insensitive
  assert.equal(asIso(parseRelative('HOY', REFERENCE, { locale: 'es-ES' })), '2026-08-04');
});

test('Spanish: weekday references (prefix and suffix variants)', () => {
  // "el próximo martes" said on Tuesday → 7 days out (strictly future,
  // same convention as English "next Tuesday" on Tuesday). All three
  // Spanish shapes — prefix with article, prefix without article, and
  // suffix — must resolve the same way.
  assert.equal(asIso(parseRelative('el próximo martes', REFERENCE, { locale: 'es-ES' })), '2026-08-11');
  assert.equal(asIso(parseRelative('próximo martes', REFERENCE, { locale: 'es-ES' })), '2026-08-11');
  assert.equal(asIso(parseRelative('martes próximo', REFERENCE, { locale: 'es-ES' })), '2026-08-11');
  // Next Friday: 3 days out (Tue → Fri = +3)
  assert.equal(asIso(parseRelative('el próximo viernes', REFERENCE, { locale: 'es-ES' })), '2026-08-07');
  // "el martes pasado" — last Tuesday, strictly past. Said on a
  // Tuesday → 7 days ago, same as English "last Tuesday".
  assert.equal(asIso(parseRelative('el martes pasado', REFERENCE, { locale: 'es-ES' })), '2026-07-28');
  assert.equal(asIso(parseRelative('martes pasado', REFERENCE, { locale: 'es-ES' })), '2026-07-28');
  // "este miércoles" — this Wednesday of the current ISO week.
  assert.equal(asIso(parseRelative('este miércoles', REFERENCE, { locale: 'es-ES' })), '2026-08-05');
});

test('Spanish: diacritic-stripped input still matches (miercoles, dias, etc.)', () => {
  // Many input methods skip accents; rejecting "miercoles" when the
  // intent is unambiguous ("miércoles") would be pedantic in a way
  // the English grammar (case-insensitive on top of canonical spelling)
  // isn't. Both sides of the match get the same normalization applied.
  assert.equal(asIso(parseRelative('este miercoles', REFERENCE, { locale: 'es-ES' })), '2026-08-05');
  assert.equal(asIso(parseRelative('en 3 dias', REFERENCE, { locale: 'es-ES' })), '2026-08-07');
  assert.equal(asIso(parseRelative('hace 1 año', REFERENCE, { locale: 'es-ES' })), '2025-08-04');
});

test('Spanish: unit offsets (en N X / hace N X)', () => {
  assert.equal(asIso(parseRelative('en 3 días', REFERENCE, { locale: 'es-ES' })), '2026-08-07');
  assert.equal(asIso(parseRelative('en 1 mes', REFERENCE, { locale: 'es-ES' })), '2026-09-04');
  assert.equal(asIso(parseRelative('en 1 año', REFERENCE, { locale: 'es-ES' })), '2027-08-04');
  assert.equal(asIso(parseRelative('hace 2 semanas', REFERENCE, { locale: 'es-ES' })), '2026-07-21');
  assert.equal(asIso(parseRelative('hace 1 mes', REFERENCE, { locale: 'es-ES' })), '2026-07-04');
  assert.equal(asIso(parseRelative('hace 1 año', REFERENCE, { locale: 'es-ES' })), '2025-08-04');
  // "dentro de N X" — alternative future marker
  assert.equal(asIso(parseRelative('dentro de 3 días', REFERENCE, { locale: 'es-ES' })), '2026-08-07');
  // "N X hace" — marker-last past form, less common than "hace N X"
  // above but still grammatical.
  assert.equal(asIso(parseRelative('2 semanas hace', REFERENCE, { locale: 'es-ES' })), '2026-07-21');
});

test('Spanish: month-day without year (5 de marzo)', () => {
  // Day-first, "de" between day and month — opposite of English
  // "March 5". Year (if supplied) is ignored; result resolves to the
  // next occurrence (future-leaning, same as English).
  assert.equal(asIso(parseRelative('5 de marzo', REFERENCE, { locale: 'es-ES' })), '2027-03-05');
  assert.equal(asIso(parseRelative('5 de marzo de 2030', REFERENCE, { locale: 'es-ES' })), '2027-03-05');
  // Today's date returns today
  assert.equal(asIso(parseRelative('4 de agosto', REFERENCE, { locale: 'es-ES' })), '2026-08-04');
  // Upcoming this year
  assert.equal(asIso(parseRelative('25 de diciembre', REFERENCE, { locale: 'es-ES' })), '2026-12-25');
});

test('Spanish adversarial: "3 días" without "en" or "hace" throws (no direction inferred)', () => {
  // Same ambiguity philosophy as English "5 days" — refuses to guess
  // past vs future. Error message is in Spanish to point at the
  // disambiguation options in the user's language.
  assert.throws(
    () => parseRelative('3 días', REFERENCE, { locale: 'es-ES' }),
    /no puede decidir si "3 dias" es pasado o futuro/
  );
});

test('Spanish adversarial: unrecognized phrase throws (not guess)', () => {
  assert.throws(
    () => parseRelative('el gato azul', REFERENCE, { locale: 'es-ES' }),
    /doesn't recognize "el gato azul"/
  );
  // Error message includes the supported-phrase hint in Spanish.
  assert.throws(
    () => parseRelative('xyz', REFERENCE, { locale: 'es-ES' }),
    /Frases soportadas/
  );
});

test('Spanish: case-insensitive weekday and month names', () => {
  assert.equal(asIso(parseRelative('EL PRÓXIMO MARTES', REFERENCE, { locale: 'es-ES' })), '2026-08-11');
  assert.equal(asIso(parseRelative('5 DE MARZO', REFERENCE, { locale: 'es-ES' })), '2027-03-05');
});

test('Spanish: same-day-of-week ambiguity resolves same as English', () => {
  // "próximo martes" said on Tuesday → 7 days out, NOT today. Same
  // convention as English "next Tuesday" on Tuesday. Documented in
  // README as a cross-language consistent choice.
  assert.equal(asIso(parseRelative('próximo martes', REFERENCE, { locale: 'es-ES' })), '2026-08-11');
  // Symmetric: "martes pasado" on Tuesday → 7 days ago.
  assert.equal(asIso(parseRelative('martes pasado', REFERENCE, { locale: 'es-ES' })), '2026-07-28');
});

test('French: day offsets (aujourd\'hui / demain / hier)', () => {
  assert.equal(asIso(parseRelative("aujourd'hui", REFERENCE, { locale: 'fr-FR' })), '2026-08-04');
  assert.equal(asIso(parseRelative('demain', REFERENCE, { locale: 'fr-FR' })), '2026-08-05');
  assert.equal(asIso(parseRelative('hier', REFERENCE, { locale: 'fr-FR' })), '2026-08-03');
});

test('French: weekday references (lundi prochain / lundi dernier / ce lundi)', () => {
  // French puts the relative word AFTER the weekday (suffix), opposite
  // of English's prefix shape. "ce" precedes the weekday for "this".
  assert.equal(asIso(parseRelative('mardi prochain', REFERENCE, { locale: 'fr-FR' })), '2026-08-11');
  assert.equal(asIso(parseRelative('vendredi prochain', REFERENCE, { locale: 'fr-FR' })), '2026-08-07');
  assert.equal(asIso(parseRelative('mardi dernier', REFERENCE, { locale: 'fr-FR' })), '2026-07-28');
  assert.equal(asIso(parseRelative('ce mercredi', REFERENCE, { locale: 'fr-FR' })), '2026-08-05');
});

test('French: diacritic-stripped input still matches (aout, fevrier, etc.)', () => {
  assert.equal(asIso(parseRelative('4 aout', REFERENCE, { locale: 'fr-FR' })), '2026-08-04');
  assert.equal(asIso(parseRelative('5 fevrier', REFERENCE, { locale: 'fr-FR' })), '2027-02-05');
});

test('French: unit offsets (dans N X / il y a N X)', () => {
  assert.equal(asIso(parseRelative('dans 3 jours', REFERENCE, { locale: 'fr-FR' })), '2026-08-07');
  assert.equal(asIso(parseRelative('dans 1 mois', REFERENCE, { locale: 'fr-FR' })), '2026-09-04');
  assert.equal(asIso(parseRelative('dans 1 an', REFERENCE, { locale: 'fr-FR' })), '2027-08-04');
  assert.equal(asIso(parseRelative('il y a 2 semaines', REFERENCE, { locale: 'fr-FR' })), '2026-07-21');
  assert.equal(asIso(parseRelative('il y a 1 an', REFERENCE, { locale: 'fr-FR' })), '2025-08-04');
});

test('French: month-day without year (5 mars)', () => {
  // Day-first, no separator word between day and month (unlike
  // Spanish's "5 de marzo"). Year ignored if present.
  assert.equal(asIso(parseRelative('5 mars', REFERENCE, { locale: 'fr-FR' })), '2027-03-05');
  assert.equal(asIso(parseRelative('5 mars 2030', REFERENCE, { locale: 'fr-FR' })), '2027-03-05');
  assert.equal(asIso(parseRelative('4 août', REFERENCE, { locale: 'fr-FR' })), '2026-08-04');
});

test('French adversarial: "3 jours" without "dans" or "il y a" throws', () => {
  assert.throws(
    () => parseRelative('3 jours', REFERENCE, { locale: 'fr-FR' }),
    /ne peut pas déterminer si "3 jours" est passé ou futur/
  );
});

test('French adversarial: unrecognized phrase throws', () => {
  assert.throws(
    () => parseRelative('le chat bleu', REFERENCE, { locale: 'fr-FR' }),
    /doesn't recognize "le chat bleu"/
  );
  assert.throws(
    () => parseRelative('xyz', REFERENCE, { locale: 'fr-FR' }),
    /Phrases prises en charge/
  );
});

test('French: same-day-of-week ambiguity resolves same as English', () => {
  // "mardi prochain" said on Tuesday → 7 days out. Matches the
  // cross-language convention.
  assert.equal(asIso(parseRelative('mardi prochain', REFERENCE, { locale: 'fr-FR' })), '2026-08-11');
  assert.equal(asIso(parseRelative('mardi dernier', REFERENCE, { locale: 'fr-FR' })), '2026-07-28');
});

test('German: day offsets (heute / morgen / gestern)', () => {
  assert.equal(asIso(parseRelative('heute', REFERENCE, { locale: 'de-DE' })), '2026-08-04');
  assert.equal(asIso(parseRelative('morgen', REFERENCE, { locale: 'de-DE' })), '2026-08-05');
  assert.equal(asIso(parseRelative('gestern', REFERENCE, { locale: 'de-DE' })), '2026-08-03');
});

test('German: weekday references (nächsten / letzten / diesen + weekday)', () => {
  // Adjective precedes the weekday (declined), weekday capitalized as
  // a noun. "nächsten" / "letzten" / "diesen" all take the same -en
  // weak-declension ending when no article — convenient for one regex.
  assert.equal(asIso(parseRelative('nächsten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-08-11');
  assert.equal(asIso(parseRelative('nächsten Freitag', REFERENCE, { locale: 'de-DE' })), '2026-08-07');
  assert.equal(asIso(parseRelative('letzten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-07-28');
  assert.equal(asIso(parseRelative('diesen Mittwoch', REFERENCE, { locale: 'de-DE' })), '2026-08-05');
});

test('German: umlaut transliteration "ae" works for "nächsten" and "März"', () => {
  // Germans without an umlaut key write "ä" as "ae" — the standard
  // transliteration. Both forms must match.
  assert.equal(asIso(parseRelative('naechsten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-08-11');
  assert.equal(asIso(parseRelative('5. Maerz', REFERENCE, { locale: 'de-DE' })), '2027-03-05');
  // The accented form still works too.
  assert.equal(asIso(parseRelative('nächsten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-08-11');
  assert.equal(asIso(parseRelative('5. März', REFERENCE, { locale: 'de-DE' })), '2027-03-05');
});

test('German: unit offsets accept both singular and plural -n dative forms', () => {
  // After "in"/"vor", German uses the dative plural with -n suffix
  // ("in 3 Tagen"). The grammar accepts both this and the singular
  // ("in 3 Tag") so a caller who doesn't get the case right still
  // resolves the same date — accepting both doesn't introduce
  // ambiguity, since the value is what determines the offset.
  assert.equal(asIso(parseRelative('in 3 Tagen', REFERENCE, { locale: 'de-DE' })), '2026-08-07');
  assert.equal(asIso(parseRelative('in 3 Tag', REFERENCE, { locale: 'de-DE' })), '2026-08-07');
  assert.equal(asIso(parseRelative('in 1 Monat', REFERENCE, { locale: 'de-DE' })), '2026-09-04');
  assert.equal(asIso(parseRelative('in 2 Monaten', REFERENCE, { locale: 'de-DE' })), '2026-10-04');
  assert.equal(asIso(parseRelative('in 1 Jahr', REFERENCE, { locale: 'de-DE' })), '2027-08-04');
  assert.equal(asIso(parseRelative('vor 2 Wochen', REFERENCE, { locale: 'de-DE' })), '2026-07-21');
  assert.equal(asIso(parseRelative('vor 1 Jahr', REFERENCE, { locale: 'de-DE' })), '2025-08-04');
});

test('German: month-day without year (5. März)', () => {
  // Day-first with a period after the day number, per German date
  // convention. Year ignored if present.
  assert.equal(asIso(parseRelative('5. März', REFERENCE, { locale: 'de-DE' })), '2027-03-05');
  assert.equal(asIso(parseRelative('5. März 2030', REFERENCE, { locale: 'de-DE' })), '2027-03-05');
  assert.equal(asIso(parseRelative('4. August', REFERENCE, { locale: 'de-DE' })), '2026-08-04');
  // Period after day is optional
  assert.equal(asIso(parseRelative('5 März', REFERENCE, { locale: 'de-DE' })), '2027-03-05');
});

test('German adversarial: "3 Tage" without "in" or "vor" throws', () => {
  assert.throws(
    () => parseRelative('3 Tage', REFERENCE, { locale: 'de-DE' }),
    /kann nicht erkennen, ob "3 tage" Vergangenheit oder Zukunft ist/
  );
});

test('German adversarial: unrecognized phrase throws', () => {
  // Error message echoes the user's trimmed input (case preserved),
  // not the normalized form — same as English's behavior. Match the
  // actual user input, not a case-swapped version.
  assert.throws(
    () => parseRelative('die blaue Katze', REFERENCE, { locale: 'de-DE' }),
    /doesn't recognize "die blaue Katze"/
  );
  assert.throws(
    () => parseRelative('xyz', REFERENCE, { locale: 'de-DE' }),
    /Unterstützte Phrasen/
  );
});

test('German: same-day-of-week ambiguity resolves same as English', () => {
  assert.equal(asIso(parseRelative('nächsten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-08-11');
  assert.equal(asIso(parseRelative('letzten Dienstag', REFERENCE, { locale: 'de-DE' })), '2026-07-28');
});

test('English default (no locale) still works as before — byte-identical to pre-change', () => {
  // Sanity check that the multi-language refactor didn't break the
  // English default path. Detailed English tests are in
  // parseRelative.test.js — this is just a smoke check that the
  // shared matching engine still resolves English phrases correctly.
  assert.equal(asIso(parseRelative('today', REFERENCE)), '2026-08-04');
  assert.equal(asIso(parseRelative('next Tuesday', REFERENCE)), '2026-08-11');
  assert.equal(asIso(parseRelative('in 3 days', REFERENCE)), '2026-08-07');
  assert.equal(asIso(parseRelative('March 5th', REFERENCE)), '2027-03-05');
});

test('Unknown locale falls back to English grammar (best-effort, not a throw)', () => {
  // A locale we don't have a grammar for (Italian, Portuguese, etc.)
  // still gets a result — just from the English grammar. Matches how
  // formatDistance treats unknown locales: Intl accepts them, and
  // here we fall back to English so the call still succeeds with
  // reasonable output.
  assert.equal(asIso(parseRelative('today', REFERENCE, { locale: 'it-IT' })), '2026-08-04');
  assert.equal(asIso(parseRelative('today', REFERENCE, { locale: 'pt-BR' })), '2026-08-04');
});

test('Locale tag variants route to the right grammar (es-AR == es, fr-CA == fr, de-AT == de)', () => {
  // The grammar is selected by the language subtag only, so any region
  // variant of a supported language routes the same way.
  assert.equal(asIso(parseRelative('hoy', REFERENCE, { locale: 'es-AR' })), '2026-08-04');
  assert.equal(asIso(parseRelative("aujourd'hui", REFERENCE, { locale: 'fr-CA' })), '2026-08-04');
  assert.equal(asIso(parseRelative('heute', REFERENCE, { locale: 'de-AT' })), '2026-08-04');
});

test('Feb 29th handling is shared across all grammars (leap-year resolution)', () => {
  // The shared resolveToNextOccurrence helper handles Feb 29 in a
  // non-leap year by falling through to the next leap year. Each
  // grammar's month-day matcher exercises this path the same way —
  // the per-language input phrase routes to the same shared helper.
  const ref = Temporal.PlainDate.from('2023-01-01');
  assert.equal(asIso(parseRelative('Feb 29th', ref)), '2024-02-29');
  assert.equal(asIso(parseRelative('29 de febrero', ref, { locale: 'es-ES' })), '2024-02-29');
  assert.equal(asIso(parseRelative('29 février', ref, { locale: 'fr-FR' })), '2024-02-29');
  assert.equal(asIso(parseRelative('29. Februar', ref, { locale: 'de-DE' })), '2024-02-29');

  // 2-year non-leap window throws — same shared error message across
  // all grammars, since the leap-year resolution lives in the shared
  // helper, not the per-language matcher. Each language's phrase for
  // Feb 29 routes through the same throw.
  const ref2025 = Temporal.PlainDate.from('2025-01-01');
  const feb29PerLocale = [
    { phrase: 'Feb 29th', locale: undefined },
    { phrase: '29 de febrero', locale: 'es-ES' },
    { phrase: '29 février', locale: 'fr-FR' },
    { phrase: '29. Februar', locale: 'de-DE' },
  ];
  for (const { phrase, locale } of feb29PerLocale) {
    assert.throws(
      () => parseRelative(phrase, ref2025, locale ? { locale } : {}),
      /can't resolve month 2 day 29.*isn't a valid date in either 2025 or 2026/,
      `expected throw for phrase ${JSON.stringify(phrase)} locale ${JSON.stringify(locale)}`
    );
  }
});