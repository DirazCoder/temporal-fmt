// Smoke test script for the three new features. Temporary, doesn't ship.
// Runs each feature against real sample inputs and reports actual
// input/output, so a regression in any of the three additive paths
// shows up here with a concrete repro rather than just "tests pass."
import { formatDuration, formatDistance, parseRelative, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Tuesday — same reference the test suite uses, so the offsets in the
// output match what the test fixtures show.
const REFERENCE = Temporal.PlainDate.from('2026-08-04');

function line(label, value) {
  console.log(`  ${label.padEnd(60)} → ${JSON.stringify(value)}`);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}

// Feature 1: Multi-language formatDuration via Intl.NumberFormat
section('Feature 1: formatDuration across en/es/fr/de at each unitDisplay width, including milliseconds');
const fourLocales = ['en-US', 'es-ES', 'fr-FR', 'de-DE'];
for (const locale of fourLocales) {
  console.log(`\n  -- locale: ${locale} --`);
  line(`numeric (h:m)`, formatDuration({ hours: 2, minutes: 30 }, 'h:m', { locale }));
  line(`short (hh:mm)`, formatDuration({ hours: 2, minutes: 30 }, 'hh:mm', { locale }));
  line(`long (hhh mmm)`, formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm', { locale }));
  line(`ms long singular (SSS, value=1)`, formatDuration({ milliseconds: 1 }, 'SSS', { locale }));
  line(`ms long plural (SSS, value=5)`, formatDuration({ milliseconds: 5 }, 'SSS', { locale }));
  line(`ms short (SS, value=5)`, formatDuration({ milliseconds: 5 }, 'SS', { locale }));
  line(`mixed long (yyy ooo ddd hhh)`, formatDuration({ years: 2, months: 3, days: 5, hours: 6 }, 'yyy ooo ddd hhh', { locale }));
}
console.log('\n  -- default (no locale) byte-identical to pre-change: --');
line(`default hhh (1 hour)`, formatDuration({ hours: 1 }, 'hhh'));
line(`default hhh (2 hours)`, formatDuration({ hours: 2 }, 'hhh'));
line(`default hh (1 hour)`, formatDuration({ hours: 1 }, 'hh'));
line(`default SSS (5 milliseconds)`, formatDuration({ milliseconds: 5 }, 'SSS'));

// Feature 2: Multi-language parseRelative
section('Feature 2: parseRelative across es/fr/de, including ambiguous and unrecognized inputs');
const localePhrases = [
  { locale: 'es-ES', phrases: [
    ['hoy', 'today'],
    ['mañana', 'tomorrow'],
    ['el próximo martes', 'next Tuesday (on Tuesday → 7d)'],
    ['martes pasado', 'last Tuesday (on Tuesday → 7d ago)'],
    ['este miércoles', 'this Wednesday'],
    ['en 3 días', 'in 3 days'],
    ['hace 2 semanas', '2 weeks ago'],
    ['5 de marzo', '5 March (next occurrence)'],
    ['3 días', 'AMBIGUOUS: bare "3 días" without en/hace → throw'],
    ['el gato azul', 'UNRECOGNIZED → throw'],
  ]},
  { locale: 'fr-FR', phrases: [
    ["aujourd'hui", 'today'],
    ['demain', 'tomorrow'],
    ['mardi prochain', 'next Tuesday (on Tuesday → 7d)'],
    ['mardi dernier', 'last Tuesday (on Tuesday → 7d ago)'],
    ['ce mercredi', 'this Wednesday'],
    ['dans 3 jours', 'in 3 days'],
    ['il y a 2 semaines', '2 weeks ago'],
    ['5 mars', '5 March (next occurrence)'],
    ['3 jours', 'AMBIGUOUS: bare "3 jours" without dans/il y a → throw'],
    ['le chat bleu', 'UNRECOGNIZED → throw'],
  ]},
  { locale: 'de-DE', phrases: [
    ['heute', 'today'],
    ['morgen', 'tomorrow'],
    ['nächsten Dienstag', 'next Tuesday (on Tuesday → 7d)'],
    ['letzten Dienstag', 'last Tuesday (on Tuesday → 7d ago)'],
    ['diesen Mittwoch', 'this Wednesday'],
    ['in 3 Tagen', 'in 3 days'],
    ['vor 2 Wochen', '2 weeks ago'],
    ['5. März', '5 March (next occurrence)'],
    ['3 Tage', 'AMBIGUOUS: bare "3 Tage" without in/vor → throw'],
    ['die blaue Katze', 'UNRECOGNIZED → throw'],
  ]},
];
for (const { locale, phrases } of localePhrases) {
  console.log(`\n  -- locale: ${locale} --`);
  for (const [phrase, description] of phrases) {
    try {
      const result = parseRelative(phrase, REFERENCE, { locale }).toString();
      line(`"${phrase}" (${description})`, result);
    } catch (e) {
      line(`"${phrase}" (${description})`, `THROW: ${e.message.split('\n')[0]}`);
    }
  }
}

// Feature 3: Configurable distance cutoffs for formatDistance
section('Feature 3: formatDistance with default cutoffs vs overridden cutoffs, same input crossing differently');
const today = REFERENCE;
const in5Days = today.add({ days: 5 });
const in14Days = today.add({ days: 14 });
const in20Days = today.add({ days: 20 });
console.log('\n  -- default cutoffs: 5d → days, 14d → days, 20d → days (all <30d) --');
line(`formatDistance(${in5Days}, ${today})`, formatDistance(in5Days, today));
line(`formatDistance(${in14Days}, ${today})`, formatDistance(in14Days, today));
line(`formatDistance(${in20Days}, ${today})`, formatDistance(in20Days, today));

console.log('\n  -- override days cutoff to 10 (5d → days, 14d → months, 20d → months): --');
line(`formatDistance(${in5Days}, ${today}, {cutoffs:{days:10}})`, formatDistance(in5Days, today, { cutoffs: { days: 10 } }));
line(`formatDistance(${in14Days}, ${today}, {cutoffs:{days:10}})`, formatDistance(in14Days, today, { cutoffs: { days: 10 } }));
line(`formatDistance(${in20Days}, ${today}, {cutoffs:{days:10}})`, formatDistance(in20Days, today, { cutoffs: { days: 10 } }));

console.log('\n  -- override days cutoff to 3 (5d → months, 14d → months, 20d → months): --');
line(`formatDistance(${in5Days}, ${today}, {cutoffs:{days:3}})`, formatDistance(in5Days, today, { cutoffs: { days: 3 } }));
line(`formatDistance(${in14Days}, ${today}, {cutoffs:{days:3}})`, formatDistance(in14Days, today, { cutoffs: { days: 3 } }));

console.log('\n  -- boundary edge: exactly at the default 30-day cutoff: --');
const in30d = today.add({ days: 30 });
const in29d = today.add({ days: 29 });
line(`formatDistance(${in29d}, ${today}) — 29d, default`, formatDistance(in29d, today));
line(`formatDistance(${in30d}, ${today}) — 30d exactly, default`, formatDistance(in30d, today));

console.log('\n  -- malformed cutoffs throw descriptively: --');
for (const cutoffs of [
  { seconds: -5 },
  { seconds: NaN },
  { seconds: Infinity },
  { seconds: 300, minutes: 1 },
]) {
  try {
    formatDistance(in5Days, today, { cutoffs });
    line(`cutoffs ${JSON.stringify(cutoffs)}`, 'NO THROW (BUG!)');
  } catch (e) {
    line(`cutoffs ${JSON.stringify(cutoffs)}`, `THROW: ${e.message.split('\n')[0]}`);
  }
}

console.log('\n=== smoke test complete ===');
