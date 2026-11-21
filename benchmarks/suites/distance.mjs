import { formatDistance, formatDuration, formatRelative } from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const now       = Temporal.PlainDateTime.from('2024-07-04T12:00:00');
  const fewMins   = Temporal.PlainDateTime.from('2024-07-04T12:04:00');
  const yesterday = Temporal.PlainDateTime.from('2024-07-03T12:00:00');
  const lastMonth = Temporal.PlainDateTime.from('2024-06-04T12:00:00');
  const lastYear  = Temporal.PlainDateTime.from('2023-07-04T12:00:00');

  // formatDuration uses repeated-letter tokens: yyy=years, ooo=months,
  // www=weeks, ddd=days, hhh=hours, mmm=minutes, sss=seconds.
  const daysAndTime  = new Temporal.Duration(0, 0, 0, 2, 3, 15);
  const mixedFields  = new Temporal.Duration(1, 6, 0, 12, 4, 30, 15);

  bench
    .add('formatDistance <1 min',                () => formatDistance(now, fewMins))
    .add('formatDistance ~1 day',                () => formatDistance(now, yesterday))
    .add('formatDistance ~1 month',              () => formatDistance(now, lastMonth))
    .add('formatDistance ~1 year',               () => formatDistance(now, lastYear))
    .add('formatDistance addSuffix past',        () => formatDistance(now, yesterday, { addSuffix: true }))
    .add('formatDistance addSuffix future',      () => formatDistance(yesterday, now, { addSuffix: true }))
    .add('formatDuration ddd hhh mmm sss',       () => formatDuration(daysAndTime, 'ddd hhh mmm sss'))
    .add('formatDuration yyy ooo ddd hhh mmm',   () => formatDuration(mixedFields, 'yyy ooo ddd hhh mmm'))
    .add('formatRelative yesterday',             () => formatRelative(yesterday, now))
    .add('formatRelative last year',             () => formatRelative(lastYear, now));

  return bench;
}
