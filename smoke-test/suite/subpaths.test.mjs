import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as formatEntry from 'temporal-fmt/format';
import * as parseEntry from 'temporal-fmt/parse';
import * as legacyEntry from 'temporal-fmt/legacy';
import * as durationEntry from 'temporal-fmt/duration';
import * as relativeEntry from 'temporal-fmt/relative';
import * as intervalEntry from 'temporal-fmt/interval';
import * as calendarEntry from 'temporal-fmt/calendar';
import * as timezoneEntry from 'temporal-fmt/timezone';
import * as recurrenceEntry from 'temporal-fmt/recurrence';
import * as localeEntry from 'temporal-fmt/locale';

test('every documented subpath resolves and exposes its public API', () => {
  assert.equal(typeof formatEntry.format, 'function');
  assert.equal(typeof parseEntry.parse, 'function');
  assert.equal(typeof legacyEntry.matchesFormat, 'function');
  assert.equal(typeof durationEntry.parseDuration, 'function');
  assert.equal(typeof durationEntry.formatDuration, 'function', 'README documents formatDuration from temporal-fmt/duration');
  assert.equal(typeof relativeEntry.formatRelative, 'function');
  assert.equal(typeof intervalEntry.interval, 'function');
  assert.equal(typeof calendarEntry.daysInMonth, 'function');
  assert.equal(typeof timezoneEntry.resolveZoned, 'function');
  assert.equal(typeof recurrenceEntry.recurrence, 'function');
  assert.equal(typeof localeEntry.registerLocale, 'function');
});
