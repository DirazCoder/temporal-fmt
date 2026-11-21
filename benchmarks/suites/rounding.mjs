import { round, floor, ceil, truncate, startOf, endOf } from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const dt    = Temporal.PlainDateTime.from('2024-07-04T14:37:52.456789123');
  const zoned = Temporal.ZonedDateTime.from('2024-07-04T14:37:52.456789123[America/New_York]');

  bench
    .add('round PlainDateTime to minute',      () => round(dt, { smallestUnit: 'minute' }))
    .add('round PlainDateTime to hour',        () => round(dt, { smallestUnit: 'hour' }))
    .add('round PlainDateTime to second',      () => round(dt, { smallestUnit: 'second' }))
    .add('round ZonedDateTime to minute',      () => round(zoned, { smallestUnit: 'minute' }))
    .add('floor PlainDateTime to hour',        () => floor(dt, 'hour'))
    .add('floor PlainDateTime to day',         () => floor(dt, 'day'))
    .add('ceil PlainDateTime to hour',         () => ceil(dt, 'hour'))
    .add('ceil PlainDateTime to minute',       () => ceil(dt, 'minute'))
    .add('truncate PlainDateTime to minute',   () => truncate(dt, 'minute'))
    .add('truncate PlainDateTime to second',   () => truncate(dt, 'second'))
    .add('startOf PlainDateTime day',          () => startOf(dt, 'day'))
    .add('startOf PlainDateTime month',        () => startOf(dt, 'month'))
    .add('startOf PlainDateTime year',         () => startOf(dt, 'year'))
    .add('startOf ZonedDateTime week',         () => startOf(zoned, 'week'))
    .add('endOf PlainDateTime day',            () => endOf(dt, 'day'))
    .add('endOf PlainDateTime month',          () => endOf(dt, 'month'));

  return bench;
}
