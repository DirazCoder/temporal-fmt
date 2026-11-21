import {
  compare, isEqual, isBefore, isAfter,
  isSameDay, isSameMonth, isSameYear,
  isWeekend, isWeekday,
  min, max, clamp,
} from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const a     = Temporal.PlainDate.from('2024-07-04');
  const b     = Temporal.PlainDate.from('2024-07-05');
  const c     = Temporal.PlainDate.from('2024-07-15');
  const adt   = Temporal.PlainDateTime.from('2024-07-04T14:30:00');
  const bdt   = Temporal.PlainDateTime.from('2024-07-04T15:00:00');
  const dates = [a, c, b, Temporal.PlainDate.from('2024-01-01'), Temporal.PlainDate.from('2024-12-31')];

  bench
    .add('compare PlainDate equal',        () => compare(a, a))
    .add('compare PlainDate before',       () => compare(a, b))
    .add('compare PlainDateTime',          () => compare(adt, bdt))
    .add('isEqual PlainDate true',         () => isEqual(a, a))
    .add('isEqual PlainDate false',        () => isEqual(a, b))
    .add('isBefore PlainDate',             () => isBefore(a, b))
    .add('isAfter PlainDate',              () => isAfter(b, a))
    .add('isSameDay PlainDate true',       () => isSameDay(a, a))
    .add('isSameDay PlainDate false',      () => isSameDay(a, b))
    .add('isSameMonth',                    () => isSameMonth(a, b))
    .add('isSameYear',                     () => isSameYear(a, b))
    .add('isWeekend Thursday (false)',     () => isWeekend(a))
    .add('isWeekend Saturday (true)',      () => isWeekend(Temporal.PlainDate.from('2024-07-06')))
    .add('isWeekday',                      () => isWeekday(a))
    .add('min of 5 dates',                 () => min(dates))
    .add('max of 5 dates',                 () => max(dates))
    .add('clamp PlainDate in range',       () => clamp(b, a, c))
    .add('clamp PlainDate below range',    () => clamp(Temporal.PlainDate.from('2024-01-01'), a, c));

  return bench;
}
