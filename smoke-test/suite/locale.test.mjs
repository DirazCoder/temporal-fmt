import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  convertDigits,
  format,
  getLocale,
  hasLocale,
  registerLocale,
  setTemporal,
} from 'temporal-fmt';
import { registerLocale as registerLocaleSubpath } from 'temporal-fmt/locale';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('locale registration is usable through both root and locale subpath exports', () => {
  const locale = 'smoke-locale';
  const vocab = {
    monthLong: Array.from({ length: 12 }, (_, i) => `Month${i + 1}`),
    monthShort: Array.from({ length: 12 }, (_, i) => `M${i + 1}`),
    weekdayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    dayPeriod: ['AM', 'PM'],
    quartersLong: ['Quarter one', 'Quarter two', 'Quarter three', 'Quarter four'],
  };
  registerLocaleSubpath(locale, vocab);

  assert.equal(hasLocale(locale), true);
  assert.deepEqual(getLocale(locale)?.quartersLong, vocab.quartersLong);
  assert.equal(format(Temporal.PlainDate.from('2026-08-04'), 'MMMM', { locale }), 'Month8');
});

test('digit conversion supports locale numbering systems', () => {
  assert.equal(convertDigits('2026', 'latn'), '2026');
  assert.equal(convertDigits('2026', 'arab'), '٢٠٢٦');
});
