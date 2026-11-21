import {
  formatISO, parseISO,
  formatRFC2822, parseRFC2822,
  formatRFC3339, parseRFC3339,
  formatHTTPDate, parseHTTPDate,
  formatSQL, parseSQL,
  toUnixSeconds, toUnixMilliseconds,
  fromUnixSeconds, fromUnixMilliseconds,
} from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const plainDate = Temporal.PlainDate.from('2024-07-04');
  const plainDt   = Temporal.PlainDateTime.from('2024-07-04T14:30:05.123');
  const zoned     = Temporal.ZonedDateTime.from('2024-07-04T14:30:05.123+00:00[UTC]');
  const instant   = Temporal.Instant.from('2024-07-04T14:30:05.123Z');

  const isoDateStr  = '2024-07-04';
  const isoDtStr    = '2024-07-04T14:30:05.123';
  const rfc2822Str  = 'Thu, 04 Jul 2024 14:30:05 +0000';
  const rfc3339Str  = '2024-07-04T14:30:05.123Z';
  const httpStr     = 'Thu, 04 Jul 2024 14:30:05 GMT';
  const sqlStr      = '2024-07-04 14:30:05';
  const epochSec    = 1720103405;
  const epochMs     = 1720103405123;

  bench
    .add('formatISO PlainDate',          () => formatISO(plainDate))
    .add('formatISO PlainDateTime',      () => formatISO(plainDt))
    .add('parseISO date string',         () => parseISO(isoDateStr))
    .add('parseISO datetime string',     () => parseISO(isoDtStr))
    .add('formatRFC2822',                () => formatRFC2822(zoned))
    .add('parseRFC2822',                 () => parseRFC2822(rfc2822Str))
    .add('formatRFC3339',                () => formatRFC3339(instant))
    .add('parseRFC3339',                 () => parseRFC3339(rfc3339Str))
    .add('formatHTTPDate',               () => formatHTTPDate(instant))
    .add('parseHTTPDate',                () => parseHTTPDate(httpStr))
    .add('formatSQL PlainDateTime',      () => formatSQL(plainDt))
    .add('parseSQL datetime string',     () => parseSQL(sqlStr))
    .add('toUnixSeconds ZonedDateTime',  () => toUnixSeconds(zoned))
    .add('toUnixMilliseconds Instant',   () => toUnixMilliseconds(instant))
    .add('fromUnixSeconds',              () => fromUnixSeconds(epochSec))
    .add('fromUnixMilliseconds',         () => fromUnixMilliseconds(epochMs));

  return bench;
}
