import { describe, expect, it } from 'vitest';
import { parseRelative } from '../src/parseRelative.js';
import { setTemporal, type TemporalNamespace } from '../src/temporalProvider.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Unit tests for the locale-aware path of parseRelative. The
// public-API test/parseRelative.locale.test.js covers the full
// surface against dist/. These go straight at src/ so a regression
// in the per-language grammar (a wrong capture group, a missing
// matcher) surfaces with the actual matcher state in the failure
// message rather than as a wrong date three layers up.

const Temporal = (globalThis.Temporal ?? PolyfillTemporal) as unknown as TemporalNamespace;
setTemporal(Temporal);

const REFERENCE = Temporal.PlainDate.from({ year: 2026, month: 8, day: 4 }); // Tuesday

function asIso(result: unknown): string {
  return (result as { toString(): string }).toString();
}

describe('parseRelative: Spanish grammar', () => {
  it('resolves day offsets (hoy / mañana / ayer)', () => {
    expect(asIso(parseRelative('hoy', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-04');
    expect(asIso(parseRelative('mañana', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-05');
    expect(asIso(parseRelative('ayer', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-03');
  });

  it('resolves weekday references in all three shapes (prefix with article, prefix without, suffix)', () => {
    expect(asIso(parseRelative('el próximo martes', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('próximo martes', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('martes próximo', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('el martes pasado', REFERENCE, { locale: 'es-ES' }))).toBe('2026-07-28');
    expect(asIso(parseRelative('este miércoles', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-05');
  });

  it('matches diacritic-stripped input (miercoles, dias, etc.)', () => {
    expect(asIso(parseRelative('este miercoles', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-05');
    expect(asIso(parseRelative('en 3 dias', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-07');
  });

  it('resolves unit offsets (en N X / hace N X)', () => {
    expect(asIso(parseRelative('en 3 días', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-07');
    expect(asIso(parseRelative('hace 2 semanas', REFERENCE, { locale: 'es-ES' }))).toBe('2026-07-21');
    expect(asIso(parseRelative('en 1 mes', REFERENCE, { locale: 'es-ES' }))).toBe('2026-09-04');
    expect(asIso(parseRelative('hace 1 año', REFERENCE, { locale: 'es-ES' }))).toBe('2025-08-04');
  });

  it('resolves month-day without year (5 de marzo → next occurrence)', () => {
    expect(asIso(parseRelative('5 de marzo', REFERENCE, { locale: 'es-ES' }))).toBe('2027-03-05');
    expect(asIso(parseRelative('4 de agosto', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-04');
  });

  it('throws on bare "3 días" without "en" or "hace" (direction ambiguous)', () => {
    expect(() => parseRelative('3 días', REFERENCE, { locale: 'es-ES' })).toThrow(/no puede decidir si "3 dias"/);
  });

  it('throws on unrecognized phrase', () => {
    expect(() => parseRelative('el gato azul', REFERENCE, { locale: 'es-ES' })).toThrow(/doesn't recognize "el gato azul"/);
  });

  it('resolves the same-day-of-week ambiguity the same way as English (7 days out, not today)', () => {
    expect(asIso(parseRelative('próximo martes', REFERENCE, { locale: 'es-ES' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('martes pasado', REFERENCE, { locale: 'es-ES' }))).toBe('2026-07-28');
  });
});

describe('parseRelative: French grammar', () => {
  it('resolves day offsets (aujourd\'hui / demain / hier)', () => {
    expect(asIso(parseRelative("aujourd'hui", REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-04');
    expect(asIso(parseRelative('demain', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-05');
    expect(asIso(parseRelative('hier', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-03');
  });

  it('resolves weekday references with suffix shape (lundi prochain / lundi dernier / ce lundi)', () => {
    expect(asIso(parseRelative('mardi prochain', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('mardi dernier', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-07-28');
    expect(asIso(parseRelative('ce mercredi', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-05');
  });

  it('resolves unit offsets (dans N X / il y a N X)', () => {
    expect(asIso(parseRelative('dans 3 jours', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-07');
    expect(asIso(parseRelative('il y a 2 semaines', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-07-21');
    expect(asIso(parseRelative('dans 1 mois', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-09-04');
    expect(asIso(parseRelative('il y a 1 an', REFERENCE, { locale: 'fr-FR' }))).toBe('2025-08-04');
  });

  it('resolves month-day without year (5 mars)', () => {
    expect(asIso(parseRelative('5 mars', REFERENCE, { locale: 'fr-FR' }))).toBe('2027-03-05');
    expect(asIso(parseRelative('4 août', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-04');
    // Diacritic-stripped input also matches.
    expect(asIso(parseRelative('4 aout', REFERENCE, { locale: 'fr-FR' }))).toBe('2026-08-04');
  });

  it('throws on bare "3 jours" without direction marker', () => {
    expect(() => parseRelative('3 jours', REFERENCE, { locale: 'fr-FR' })).toThrow(/ne peut pas déterminer si "3 jours"/);
  });

  it('throws on unrecognized phrase', () => {
    expect(() => parseRelative('le chat bleu', REFERENCE, { locale: 'fr-FR' })).toThrow(/doesn't recognize "le chat bleu"/);
  });
});

describe('parseRelative: German grammar', () => {
  it('resolves day offsets (heute / morgen / gestern)', () => {
    expect(asIso(parseRelative('heute', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-04');
    expect(asIso(parseRelative('morgen', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-05');
    expect(asIso(parseRelative('gestern', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-03');
  });

  it('resolves weekday references (nächsten / letzten / diesen + weekday)', () => {
    expect(asIso(parseRelative('nächsten Dienstag', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('letzten Dienstag', REFERENCE, { locale: 'de-DE' }))).toBe('2026-07-28');
    expect(asIso(parseRelative('diesen Mittwoch', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-05');
  });

  it('accepts the "ae" transliteration for "nächsten" and "März"', () => {
    expect(asIso(parseRelative('naechsten Dienstag', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-11');
    expect(asIso(parseRelative('5. Maerz', REFERENCE, { locale: 'de-DE' }))).toBe('2027-03-05');
  });

  it('accepts both singular and dative-plural -n forms for unit offsets', () => {
    expect(asIso(parseRelative('in 3 Tagen', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-07');
    expect(asIso(parseRelative('in 3 Tag', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-07');
    expect(asIso(parseRelative('in 2 Monaten', REFERENCE, { locale: 'de-DE' }))).toBe('2026-10-04');
    expect(asIso(parseRelative('vor 2 Wochen', REFERENCE, { locale: 'de-DE' }))).toBe('2026-07-21');
  });

  it('accepts nominative plural -e form too (3 Tage, 2 Monate, etc.)', () => {
    // The bare "N <unit>" matcher needs to catch the -e plural so it
    // can throw the direction-ambiguous error, not the unrecognized
    // error. So the regex must accept "Tage" alongside "Tag"/"Tagen".
    expect(() => parseRelative('3 Tage', REFERENCE, { locale: 'de-DE' })).toThrow(/kann nicht erkennen, ob "3 tage"/);
  });

  it('resolves month-day without year (5. März)', () => {
    expect(asIso(parseRelative('5. März', REFERENCE, { locale: 'de-DE' }))).toBe('2027-03-05');
    expect(asIso(parseRelative('4. August', REFERENCE, { locale: 'de-DE' }))).toBe('2026-08-04');
  });

  it('throws on unrecognized phrase', () => {
    expect(() => parseRelative('die blaue Katze', REFERENCE, { locale: 'de-DE' })).toThrow(/doesn't recognize "die blaue Katze"/);
  });
});

describe('parseRelative: default English path is unchanged', () => {
  it('resolves English phrases the same way as before the multi-language refactor', () => {
    expect(asIso(parseRelative('today', REFERENCE))).toBe('2026-08-04');
    expect(asIso(parseRelative('next Tuesday', REFERENCE))).toBe('2026-08-11');
    expect(asIso(parseRelative('in 3 days', REFERENCE))).toBe('2026-08-07');
    expect(asIso(parseRelative('March 5th', REFERENCE))).toBe('2027-03-05');
  });

  it('throws on bare "5 days" without direction marker (English)', () => {
    expect(() => parseRelative('5 days', REFERENCE)).toThrow(/can't tell whether "5 days"/);
  });
});

describe('parseRelative: locale routing', () => {
  it('routes by language subtag (es-AR == es, fr-CA == fr, de-AT == de)', () => {
    expect(asIso(parseRelative('hoy', REFERENCE, { locale: 'es-AR' }))).toBe('2026-08-04');
    expect(asIso(parseRelative("aujourd'hui", REFERENCE, { locale: 'fr-CA' }))).toBe('2026-08-04');
    expect(asIso(parseRelative('heute', REFERENCE, { locale: 'de-AT' }))).toBe('2026-08-04');
  });

  it('falls back to English grammar for unsupported languages (best-effort)', () => {
    expect(asIso(parseRelative('today', REFERENCE, { locale: 'it-IT' }))).toBe('2026-08-04');
    expect(asIso(parseRelative('today', REFERENCE, { locale: 'pt-BR' }))).toBe('2026-08-04');
  });
});
