import test from 'node:test';
import assert from 'node:assert/strict';
import './terminal.js';

const { evaluateLibraryExpression } = globalThis.TemporalFmtTerminal;

const library = {
  format: (value, pattern, options) => `${value.name}:${pattern}:${options.locale}`,
  apply: (value, callback) => callback(value),
};

test('evaluates library calls with object literals and terminal bindings', () => {
  const result = evaluateLibraryExpression(
    "format(now, 'yyyy-MM-dd', { locale })",
    library,
    {},
    { now: { name: 'now' }, locale: 'en-GB' },
  );
  assert.equal(result, 'now:yyyy-MM-dd:en-GB');
});

test('supports nested Temporal calls, arrays, and expression callbacks', () => {
  const Temporal = {
    PlainDate: {
      from: (value) => ({ toString: () => value }),
    },
  };
  const result = evaluateLibraryExpression(
    "[1, 2, 3].filter(value => value > 1).map(value => value * 2)",
    library,
    Temporal,
  );
  assert.deepEqual(result, [4, 6]);
  assert.equal(
    evaluateLibraryExpression("Temporal.PlainDate.from('2026-08-04').toString()", library, Temporal),
    '2026-08-04',
  );
});

test('rejects browser globals, unsafe properties, and statement syntax', () => {
  assert.throws(() => evaluateLibraryExpression('window.document', library, {}), /Unknown name "window"/);
  assert.throws(() => evaluateLibraryExpression('({}).constructor', library, {}), /not available/);
  assert.throws(() => evaluateLibraryExpression('format("yyyy"); window.alert(1)', library, {}), /Unexpected character/);
});
