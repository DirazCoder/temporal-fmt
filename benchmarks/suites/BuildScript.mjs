import { parse, safeParse, compileParser } from '../../dist/index.js';

export default function buildSuite(Temporal, Bench) {
  const bench = new Bench({ time: 1000, warmupTime: 500 });

  // Compiled parsers — cache the regex/token work done on the first call.
  const parseDateCompiled     = compileParser('yyyy-MM-dd');
  const parseDateTimeCompiled = compileParser("yyyy-MM-dd'T'HH:mm:ss.SSS");
  const parseZonedCompiled    = compileParser("yyyy-MM-dd'T'HH:mm:ssxxx'['zzz']'");
  const parse12hCompiled      = compileParser('hh:mm:ss a');

  bench
    .add('parse PlainDate  yyyy-MM-dd (cold)',              () => parse('yyyy-MM-dd', '2024-07-04'))
    .add('parse PlainDate  yyyy-MM-dd (compiled)',          () => parseDateCompiled.parse('2024-07-04'))
    .add('parse PlainDate  MM/dd/yyyy',                     () => parse('MM/dd/yyyy', '07/04/2024'))
    .add('parse PlainTime  HH:mm:ss.SSS',                   () => parse('HH:mm:ss.SSS', '14:30:05.123'))
    .add('parse PlainTime  12h hh:mm:ss a (compiled)',      () => parse12hCompiled.parse('02:30:05 PM'))
    .add('parse PlainDateTime full + ms (cold)',            () => parse("yyyy-MM-dd'T'HH:mm:ss.SSS", '2024-07-04T14:30:05.123'))
    .add('parse PlainDateTime full + ms (compiled)',        () => parseDateTimeCompiled.parse('2024-07-04T14:30:05.123'))
    .add('parse ZonedDateTime with offset+zone (cold)',     () => parse("yyyy-MM-dd'T'HH:mm:ssxxx'['zzz']'", '2024-07-04T14:30:05-04:00[America/New_York]'))
    .add('parse ZonedDateTime with offset+zone (compiled)', () => parseZonedCompiled.parse('2024-07-04T14:30:05-04:00[America/New_York]'))
    .add('safeParse PlainDate valid input',                 () => safeParse('yyyy-MM-dd', '2024-07-04'))
    .add('safeParse PlainDate invalid input',               () => safeParse('yyyy-MM-dd', 'not-a-date'))
    .add('parse PlainDate  yy-MM-dd (2-digit year)',        () => parse('yy-MM-dd', '24-07-04'));

  return bench;
}
