import { format, compileFormat } from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  const plainDate     = Temporal.PlainDate.from('2024-07-04');
  const plainTime     = Temporal.PlainTime.from('14:30:05.123456789');
  const plainDateTime = Temporal.PlainDateTime.from('2024-07-04T14:30:05.123456789');
  const zoned         = Temporal.ZonedDateTime.from('2024-07-04T14:30:05.123456789[America/New_York]');

  // Compiled handles — created once, reused across all iterations.
  // This is what a real caller using compileFormat() gets after the first call.
  const compiledDate     = compileFormat('yyyy-MM-dd');
  const compiledDateTime = compileFormat("yyyy-MM-dd'T'HH:mm:ss.SSS");
  const compiledZoned    = compileFormat("yyyy-MM-dd'T'HH:mm:ss.SSSxxx'['zzz']'");

  bench
    .add('format PlainDate  yyyy-MM-dd (cold)',         () => format(plainDate, 'yyyy-MM-dd'))
    .add('format PlainDate  yyyy-MM-dd (compiled)',     () => compiledDate.format(plainDate))
    .add('format PlainTime  HH:mm:ss.SSS',              () => format(plainTime, 'HH:mm:ss.SSS'))
    .add('format PlainDateTime yyyy-MM-dd HH:mm:ss',   () => format(plainDateTime, 'yyyy-MM-dd HH:mm:ss'))
    .add('format PlainDateTime full + ms (compiled)',   () => compiledDateTime.format(plainDateTime))
    .add('format PlainDateTime 12h hh:mm:ss a',         () => format(plainDateTime, 'hh:mm:ss a'))
    .add('format ZonedDateTime with offset xxx',        () => format(zoned, "yyyy-MM-dd'T'HH:mm:ssxxx"))
    .add('format ZonedDateTime full + zone (compiled)', () => compiledZoned.format(zoned))
    .add('format PlainDate  MM/dd/yyyy',                () => format(plainDate, 'MM/dd/yyyy'))
    .add('format PlainDateTime SSS (ms only)',          () => format(plainDateTime, 'SSS'))
    .add('format PlainDateTime SSSSSSSSS (ns)',         () => format(plainDateTime, 'SSSSSSSSS'));

  return bench;
}
