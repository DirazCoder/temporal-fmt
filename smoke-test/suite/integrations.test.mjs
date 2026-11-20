import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Temporal as PolyfillTemporal } from 'temporal-polyfill/full';
import {
  addBusinessDays,
  createBusinessCalendar,
  createConfig,
  createFormatter,
  createHolidayCalendar,
  getAutocompleteData,
  holidaysBetween,
  isBusinessDay,
  listRegisteredGrammars,
  nextBusinessDay,
  previewFormat,
  registerRelativeGrammar,
  setTemporal,
  translateDayjsFormatString,
} from 'temporal-fmt';

const Temporal = globalThis.Temporal ?? PolyfillTemporal;
setTemporal(Temporal);

test('business and holiday calendars work together', () => {
  const holidays = createHolidayCalendar([{ month: 8, day: 5, name: 'Test holiday' }]);
  const calendar = createBusinessCalendar({ holidays });
  const date = Temporal.PlainDate.from('2026-08-04');
  assert.equal(isBusinessDay(calendar, date), true);
  assert.equal(addBusinessDays(calendar, date, 1).day, 6);
  assert.equal(holidaysBetween(holidays, date, Temporal.PlainDate.from('2026-08-06')).length, 1);
  assert.equal(nextBusinessDay(calendar, date).day, 6);
});

test('configuration, custom formatting, codemods, and IDE helpers are published', () => {
  assert.equal(createConfig({ locale: 'fr-FR' }).locale, 'fr-FR');
  const custom = createFormatter({
    tokens: [{ name: 'YYYYYY', handler: (value) => String(value.year).padStart(6, '0'), field: 'year' }],
  });
  assert.equal(custom.format(Temporal.PlainDate.from('2026-08-04'), 'YYYYYY'), '002026');
  assert.equal(translateDayjsFormatString('YYYY-MM-DD'), 'yyyy-MM-dd');
  assert.ok(getAutocompleteData().some((entry) => entry.label === 'yyyy'));
  assert.equal(previewFormat('yyyy-MM-dd'), '2026-08-04');
});

test('relative grammar registration is available to consumers', () => {
  const language = 'smoke-test';
  const matcher = (input) => input === 'tomorrow' ? { days: 1 } : null;
  registerRelativeGrammar({ language, matchers: [matcher] });
  assert.ok(listRegisteredGrammars().includes(language));
});
