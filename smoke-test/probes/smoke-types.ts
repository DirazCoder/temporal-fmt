// Probe: do the published .d.ts files actually resolve and typecheck
// against a real installed copy? attw checks the exports map shape
// statically; this runs tsc against it for real, catching anything
// attw's shape check wouldn't (e.g. a type that resolves to the wrong
// file, or resolves but doesn't typecheck the way the source does).
import { format, formatDuration, legacyMatchesFormat, matchesFormat, parse, setTemporal } from 'temporal-fmt';
import type { TemporalNamespace } from 'temporal-fmt';
import { format as legacyFormat, parse as legacyParse } from 'temporal-fmt/legacy';
import { parseDuration } from 'temporal-fmt/duration';
import { formatRelative } from 'temporal-fmt/relative';
import { interval } from 'temporal-fmt/interval';
import { daysInMonth } from 'temporal-fmt/calendar';
import { resolveZoned } from 'temporal-fmt/timezone';
import { recurrence } from 'temporal-fmt/recurrence';
import { registerLocale } from 'temporal-fmt/locale';
import { Temporal } from 'temporal-polyfill/full';

// temporal-polyfill's PlainDate.from() etc. take a narrower PlainDateLike
// than TemporalNamespace's intentionally loose Record<string, ...> shape
// (see temporalProvider.ts) — same relationship native Temporal has to it.
// A real consumer hits this too; the cast here is what they'd write.
setTemporal(Temporal as unknown as TemporalNamespace);

const date = Temporal.PlainDate.from('2026-08-04');
const out: string = format(date, 'yyyy-MM-dd');
const parsed = parse('yyyy-MM-dd', '2026-08-04');
const legacyOut: string = legacyFormat(date, 'yyyy-MM-dd');
const legacyParsed = legacyParse('yyyy-MM-dd', '2026-08-04');
const legacyMatches: boolean = legacyMatchesFormat('yyyy-MM-dd', '2026-08-04');
const matches: boolean = matchesFormat('yyyy-MM-dd', '2026-08-04');

void out;
void parsed;
void legacyOut;
void legacyParsed;
void legacyMatches;
void matches;
void formatDuration({ hours: 2 }, 'hh');
void parseDuration('2h', 'hh');
void formatRelative(date, date);
void interval(date, date);
void daysInMonth(date);
void resolveZoned({ year: 2026, month: 8, day: 4 }, 'UTC');
void recurrence(date, { frequency: 'daily', interval: 1 });
void registerLocale;
