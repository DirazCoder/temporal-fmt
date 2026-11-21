import {
  add, subtract, difference,
  addDays, addMonths, addYears, addHours, addMinutes,
  differenceInDays, differenceInMonths, differenceInHours,
} from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const date  = Temporal.PlainDate.from('2024-01-15');
  const dateB = Temporal.PlainDate.from('2024-07-04');
  const dt    = Temporal.PlainDateTime.from('2024-01-15T10:30:00');
  const zoned = Temporal.ZonedDateTime.from('2024-01-15T10:30:00[America/New_York]');
  const monthEnd = Temporal.PlainDate.from('2024-01-31');

  // Crossing DST is intentional — it exercises the non-trivial path.
  const zonedDst = Temporal.ZonedDateTime.from('2024-03-10T01:00:00[America/New_York]');

  bench
    .add('addDays PlainDate +1',                   () => addDays(date, 1))
    .add('addDays PlainDate +365',                 () => addDays(date, 365))
    .add('addMonths PlainDate +1',                 () => addMonths(date, 1))
    .add('addMonths PlainDate +6 (cross month-end)', () => addMonths(monthEnd, 1))
    .add('addYears PlainDate +1',                  () => addYears(date, 1))
    .add('addHours PlainDateTime +3',              () => addHours(dt, 3))
    .add('addMinutes PlainDateTime +90',           () => addMinutes(dt, 90))
    .add('add PlainDate {months:1,days:5}',        () => add(date, { months: 1, days: 5 }))
    .add('add ZonedDateTime +1 day across DST',    () => addDays(zonedDst, 1))
    .add('subtract PlainDate -30 days',            () => subtract(date, { days: 30 }))
    .add('differenceInDays PlainDate',             () => differenceInDays(date, dateB))
    .add('differenceInMonths PlainDate',           () => differenceInMonths(date, dateB))
    .add('differenceInHours PlainDateTime',        () => differenceInHours(dt, dt.add({ hours: 72 })))
    .add('difference PlainDate largest unit=month',() => difference(date, dateB, { largestUnit: 'month' }))
    .add('difference ZonedDateTime largest=hour',  () => difference(zoned, zoned.add({ hours: 25 }), { largestUnit: 'hour' }));

  return bench;
}
