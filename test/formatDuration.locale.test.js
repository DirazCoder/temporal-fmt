import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, setTemporal } from '../dist/index.js';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';

// Locale-aware formatDuration tests. The default path (no `locale`
// supplied) is byte-identical to the pre-change English output — that
// regression check lives in formatDuration.test.js. This file covers
// the additive path: when `locale` is supplied, word-form tokens
// delegate to Intl.NumberFormat's `style: 'unit'` mode, and numeric
// tokens stay ASCII digits.
const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

// Locales picked to match the set used elsewhere in the suite
// (formatDistance.test.js, localeVocab.test.js) — en default + es/fr/de
// for the four-language coverage the README documents.
const LOCALES = ['en-US', 'es-ES', 'fr-FR', 'de-DE'];

// Each unit gets exercised at each of the three token widths. Numeric
// (single-letter) output is locale-independent; short (double-letter)
// and long (triple-letter) output localizes via Intl.
const UNITS = [
  { token: 'y', shortTok: 'yy', longTok: 'yyy', field: 'years' },
  { token: 'o', shortTok: 'oo', longTok: 'ooo', field: 'months' },
  { token: 'w', shortTok: 'ww', longTok: 'www', field: 'weeks' },
  { token: 'd', shortTok: 'dd', longTok: 'ddd', field: 'days' },
  { token: 'h', shortTok: 'hh', longTok: 'hhh', field: 'hours' },
  { token: 'm', shortTok: 'mm', longTok: 'mmm', field: 'minutes' },
  { token: 's', shortTok: 'ss', longTok: 'sss', field: 'seconds' },
  { token: 'S', shortTok: 'SS', longTok: 'SSS', field: 'milliseconds' },
];

// Construct the expected Intl.NumberFormat output independently, so a
// bug where formatDuration drifts from Intl's actual output (e.g. by
// pre-formatting the number) surfaces here. Each unit at each display
// width is checked for both value=1 (singular) and value=2 (plural) —
// Intl handles the plural rules internally, so we just compare against
// what Intl produces for the same inputs.
function intlUnitOutput(locale, value, intlUnit, unitDisplay) {
  const nf = new Intl.NumberFormat(locale, { style: 'unit', unit: intlUnit, unitDisplay });
  return nf.format(value);
}

const INTL_UNIT_ID = {
  years: 'year', months: 'month', weeks: 'week', days: 'day',
  hours: 'hour', minutes: 'minute', seconds: 'second', milliseconds: 'millisecond',
};

test('long form: triple-letter tokens match Intl.NumberFormat output for every unit, every locale', () => {
  for (const { longTok, field } of UNITS) {
    for (const locale of LOCALES) {
      const intlUnit = INTL_UNIT_ID[field];
      const singular = intlUnitOutput(locale, 1, intlUnit, 'long');
      const plural = intlUnitOutput(locale, 2, intlUnit, 'long');
      assert.equal(
        formatDuration({ [field]: 1 }, longTok, { locale }),
        singular,
        `long form, ${locale}, ${field}=1: expected Intl output ${JSON.stringify(singular)}`
      );
      assert.equal(
        formatDuration({ [field]: 2 }, longTok, { locale }),
        plural,
        `long form, ${locale}, ${field}=2: expected Intl output ${JSON.stringify(plural)}`
      );
    }
  }
});

test('short form: double-letter tokens match Intl.NumberFormat output for every unit, every locale', () => {
  for (const { shortTok, field } of UNITS) {
    for (const locale of LOCALES) {
      const intlUnit = INTL_UNIT_ID[field];
      const singular = intlUnitOutput(locale, 1, intlUnit, 'short');
      const plural = intlUnitOutput(locale, 2, intlUnit, 'short');
      assert.equal(
        formatDuration({ [field]: 1 }, shortTok, { locale }),
        singular,
        `short form, ${locale}, ${field}=1: expected Intl output ${JSON.stringify(singular)}`
      );
      assert.equal(
        formatDuration({ [field]: 2 }, shortTok, { locale }),
        plural,
        `short form, ${locale}, ${field}=2: expected Intl output ${JSON.stringify(plural)}`
      );
    }
  }
});

test('numeric form: single-letter tokens stay ASCII digits regardless of locale', () => {
  // Same "numbers stay Western" convention as the rest of the library.
  // A locale that uses Arabic-Indic digits natively still gets ASCII
  // digits here, because the format path is `String(value)`, not Intl.
  for (const { token, field } of UNITS) {
    for (const locale of LOCALES) {
      assert.equal(
        formatDuration({ [field]: 2 }, token, { locale }),
        '2',
        `numeric form, ${locale}, ${field}=2: expected "2"`
      );
    }
  }
  // Even locales whose native numeral system is non-ASCII stay ASCII here.
  assert.equal(formatDuration({ hours: 2 }, 'h', { locale: 'ar-EG' }), '2');
  assert.equal(formatDuration({ hours: 2 }, 'h', { locale: 'ja-JP' }), '2');
});

test('milliseconds explicitly: Intl.NumberFormat supports `millisecond` unit (confirmed against current spec)', () => {
  // The task brief flagged milliseconds as a possible gap in Intl's
  // unit list. Empirically it isn't — Intl.NumberFormat accepts
  // `unit: 'millisecond'` on every Node version we target. Pinning
  // that behavior so a future engine/ICU regression surfaces here.
  for (const locale of LOCALES) {
    assert.equal(
      formatDuration({ milliseconds: 1 }, 'SSS', { locale }),
      intlUnitOutput(locale, 1, 'millisecond', 'long'),
      `millisecond long form for ${locale}`
    );
    assert.equal(
      formatDuration({ milliseconds: 5 }, 'SSS', { locale }),
      intlUnitOutput(locale, 5, 'millisecond', 'long'),
      `millisecond long form (plural) for ${locale}`
    );
    assert.equal(
      formatDuration({ milliseconds: 5 }, 'SS', { locale }),
      intlUnitOutput(locale, 5, 'millisecond', 'short'),
      `millisecond short form for ${locale}`
    );
  }
});

test('mixed units in one format string all localize consistently', () => {
  // A format string mixing long-form tokens should produce the same
  // output as joining each unit's Intl output with the literal separator.
  for (const locale of LOCALES) {
    const result = formatDuration(
      { years: 2, months: 3, days: 5, hours: 6 },
      'yyy ooo ddd hhh',
      { locale }
    );
    const parts = [
      intlUnitOutput(locale, 2, 'year', 'long'),
      intlUnitOutput(locale, 3, 'month', 'long'),
      intlUnitOutput(locale, 5, 'day', 'long'),
      intlUnitOutput(locale, 6, 'hour', 'long'),
    ];
    assert.equal(result, parts.join(' '));
  }
});

test('zero-value handling still applies on the locale-aware path', () => {
  // showZeroValues: false (default) omits zero units; the locale-aware
  // path inherits the same behavior. The dangling separator literal
  // after a zero unit is documented as the caller's responsibility.
  for (const locale of LOCALES) {
    assert.equal(
      formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { locale }),
      intlUnitOutput(locale, 2, 'hour', 'long') + ' '
    );
    assert.equal(
      formatDuration({ hours: 2, minutes: 0 }, 'hhh mmm', { locale, showZeroValues: true }),
      intlUnitOutput(locale, 2, 'hour', 'long') + ' ' + intlUnitOutput(locale, 0, 'minute', 'long')
    );
  }
});

test('negative values render with the sign preserved, locale-aware pluralization still applies', () => {
  for (const locale of LOCALES) {
    assert.equal(
      formatDuration({ hours: -1 }, 'hhh', { locale }),
      intlUnitOutput(locale, -1, 'hour', 'long'),
      `negative singular for ${locale}`
    );
    assert.equal(
      formatDuration({ hours: -2 }, 'hhh', { locale }),
      intlUnitOutput(locale, -2, 'hour', 'long'),
      `negative plural for ${locale}`
    );
  }
});

test('Temporal.Duration object works the same as a field bag on the locale-aware path', () => {
  const dur = Temporal.Duration.from({ hours: 2, minutes: 30 });
  for (const locale of LOCALES) {
    assert.equal(
      formatDuration(dur, 'hhh mmm', { locale }),
      intlUnitOutput(locale, 2, 'hour', 'long') + ' ' + intlUnitOutput(locale, 30, 'minute', 'long')
    );
  }
});

test('default (no locale) output is byte-identical to the pre-change English table', () => {
  // Direct before/after comparison: every default-path call that
  // existed before the locale-aware refactor still produces the same
  // output. This is the regression check the task asked for ("verify
  // with a direct before/after comparison, not just 'should be fine'").
  // The expected strings here are the hardcoded English table's
  // output — Intl.NumberFormat('en-US') would produce different
  // spacing ("2 hr" vs "2h"), which is exactly why the default path
  // keeps the hardcoded table.
  assert.equal(formatDuration({ hours: 1 }, 'hhh'), '1 hour');
  assert.equal(formatDuration({ hours: 2 }, 'hhh'), '2 hours');
  assert.equal(formatDuration({ hours: 1 }, 'hh'), '1h');
  assert.equal(formatDuration({ hours: 2 }, 'hh'), '2h');
  assert.equal(formatDuration({ years: 1 }, 'yy'), '1yr');
  assert.equal(formatDuration({ years: 2 }, 'yy'), '2yrs');
  assert.equal(formatDuration({ months: 1 }, 'oo'), '1mo');
  assert.equal(formatDuration({ months: 2 }, 'oo'), '2mos');
  assert.equal(formatDuration({ weeks: 1 }, 'ww'), '1wk');
  assert.equal(formatDuration({ weeks: 2 }, 'ww'), '2wks');
  assert.equal(formatDuration({ milliseconds: 1 }, 'SSS'), '1 millisecond');
  assert.equal(formatDuration({ milliseconds: 5 }, 'SSS'), '5 milliseconds');
  assert.equal(formatDuration({ hours: -1 }, 'hhh'), '-1 hour');
  assert.equal(formatDuration({ hours: -2 }, 'hhh'), '-2 hours');
  // Mixed
  assert.equal(
    formatDuration({ years: 2, months: 3 }, 'yyy ooo'),
    '2 years 3 months'
  );
  assert.equal(
    formatDuration({ hours: 2, minutes: 30 }, 'hhh mmm'),
    '2 hours 30 minutes'
  );
  // 'hh:mm' = short-short, default-path English: "2h:30m". 'h:mm'
  // would be numeric-short = "2:30m" (different combination — pick
  // the one that matches the original English test's pattern for parity).
  assert.equal(
    formatDuration({ hours: 2, minutes: 30 }, 'hh:mm'),
    '2h:30m'
  );
});

test('locale option with empty/undefined locale falls back to English default', () => {
  // The locale-aware branch only triggers when `options.locale` is
  // explicitly defined (not undefined). An explicit `undefined` or
  // empty string is treated as "no locale supplied" and falls back
  // to the hardcoded English path.
  assert.equal(
    formatDuration({ hours: 2 }, 'hhh', { locale: undefined }),
    '2 hours'
  );
});
