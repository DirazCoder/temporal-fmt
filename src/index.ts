export { format, formatToParts, compileFormat, type FormattedPart, type CompiledFormat } from './format.js';
export { parse, safeParse, tryParse, parseToParts, compileParser, type SafeParseResult, type ParsedPart, type CompiledParser } from './parse.js';
export { setTemporal } from './temporalProvider.js';
export { formatDuration } from './formatDuration.js';
export { formatDistance, formatDistanceToNow } from './formatDistance.js';
export { parseRelative } from './parseRelative.js';
export { registerLocaleVocab } from './localeVocab.js';
export type { LocaleVocab } from './localeVocab.js';
export type { TemporalLike, FormatOptions } from './tokens.js';
export type { DurationFormatOptions } from './formatDuration.js';
export type { FormatDistanceOptions, DistanceCutoffs } from './formatDistance.js';
export type { ParseRelativeOptions } from './parseRelative.js';
export type { TemporalNamespace } from './temporalProvider.js';

// type guards
export {
  isTemporal, isInstant, isPlainDate, isPlainTime, isPlainDateTime,
  isZonedDateTime, isPlainYearMonth, isPlainMonthDay, isDuration,
  assertTemporal, assertInstant, assertPlainDate, assertPlainTime,
  assertPlainDateTime, assertZonedDateTime, assertPlainYearMonth,
  assertPlainMonthDay, assertDuration,
} from './typeGuards.js';

// typed errors
export {
  TemporalFmtError, FormatSyntaxError, UnknownTokenError, ParseMismatchError,
  InvalidDateError, InvalidTimeError, InvalidOffsetError, InvalidTimeZoneError,
  InvalidCalendarError, AmbiguousInputError, InvalidLocaleError, InvalidDurationError,
  type TemporalFmtErrorFields, type TemporalFmtErrorCode,
} from './errors.js';

// analyzer / introspection
export {
  analyzeFormat, explainFormat, tokenizeFormat, listTokens, tokenInfo,
  isValidFormat, validateFormat, fieldForToken,
  type FormatAnalysis, type AnalyzedToken, type TokenMetadata, type TemporalType,
} from './analyze.js';

// token metadata (re-exported as a top-level surface for
// callers like the ESLint plugin that want the table directly without
// going through analyzeFormat)
export { TOKEN_METADATA, ALL_TOKEN_NAMES } from './tokenMetadata.js';
export { FORMAT_ONLY_TOKENS } from './pattern.js';

// calendar utilities
export {
  daysInMonth, daysInYear, monthsInYear, isLeapYear, isLeapMonth,
  dayOfYearHelper as dayOfYear, weekOfYear, weekYear,
  getQuarter, getMonth, getWeekday, startOf, endOf, asDateFieldView,
  type DateFieldView, type StartOfUnit, type QuarterOptions,
} from './calendarUtils.js';

// date arithmetic
export {
  add, subtract, difference,
  addYears, addMonths, addWeeks, addDays, addHours, addMinutes, addSeconds, addMilliseconds,
  subtractYears, subtractMonths, subtractWeeks, subtractDays, subtractHours, subtractMinutes, subtractSeconds, subtractMilliseconds,
  differenceInYears, differenceInMonths, differenceInWeeks, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds, differenceInMilliseconds,
  type AddUnit, type DiffUnit,
} from './arithmetic.js';

// comparison
export {
  compare, isEqual, isBefore, isAfter, min, max, clamp, isBetween,
  isToday, isTomorrow, isYesterday,
  isSameDay, isSameWeek, isSameMonth, isSameQuarter, isSameYear,
  isWeekend, isWeekday,
} from './comparison.js';

// rounding
export { round, floor, ceil, truncate, roundDuration, type RoundOptions, type DurationFields } from './rounding.js';

// serialization
export {
  parseISO, formatISO,
  parseRFC3339, formatRFC3339,
  parseRFC2822, formatRFC2822,
  parseHTTPDate, formatHTTPDate,
  fromUnixSeconds, fromUnixMilliseconds, fromUnixMicroseconds, fromUnixNanoseconds,
  toUnixSeconds, toUnixMilliseconds, toUnixMicroseconds, toUnixNanoseconds,
  parseSQL, formatSQL,
} from './serialization.js';

// duration (extended)
export {
  formatDurationToParts, parseDuration, parseISODuration, formatISODuration,
  balanceDuration, totalDuration, compareDuration, addDuration, subtractDuration,
} from './duration.js';
export { roundDuration as roundDurationAlias } from './rounding.js';

// relative time
export { formatRelative, formatRelativeToNow, type FormatRelativeOptions } from './relativeTime.js';

// locale registration
export { registerLocale, getLocale, hasLocale, type ExtendedLocaleVocab } from './localeRegistry.js';

// numbering systems
export {
  convertDigits, convertDigitsToAscii, applyNumbering, applyParseNumbering,
  SUPPORTED_NUMBERING_SYSTEMS, type NumberingSystem, type NumberingFormatOptions,
} from './numbering.js';

// config
export { createConfig, mergeWithConfig, DEFAULT_CONFIG, type TemporalFmtConfig } from './config.js';

// relative-grammar registration
export { registerRelativeGrammar, listRegisteredGrammars, type RelativeGrammar, type RelativeGrammarMatch } from './relativeGrammar.js';

// intervals
export {
  interval, contains as intervalContains, overlaps, intersects,
  isBefore as intervalIsBefore, isAfter as intervalIsAfter,
  intersection, union, difference as intervalDifference,
  subtract as intervalSubtract, mergeIntervals, splitInterval,
  formatRange, formatRangeToParts,
  type Interval, type IntervalBounds,
} from './interval.js';

// recurrence
export {
  recurrence, take, skip, between,
  parseRRule, formatRRule,
  type RecurrenceRule, type RecurrenceFrequency, type RecurrenceIterator,
} from './recurrence.js';

// business calendar
export {
  createBusinessCalendar, isBusinessDay, addBusinessDays, subtractBusinessDays,
  differenceInBusinessDays, nextBusinessDay, previousBusinessDay,
  type BusinessCalendar, type BusinessCalendarOptions,
} from './businessCalendar.js';

// holiday framework
export {
  createHolidayCalendar, nextHoliday, previousHoliday, holidaysBetween,
  type HolidayCalendar, type HolidaySpec,
} from './holidays.js';

// timezone subsystem
export {
  resolveZoned, getTimeZone, getOffset, getOffsetNanoseconds, isDST,
  getNextTransition, getPreviousTransition, getTransitions, possibleInstantsFor,
  type DisambiguationMode, type ResolveZonedOptions,
} from './timezone.js';

// extensibility
export {
  createFormatter,
  type Formatter, type FormatterOptions, type CustomToken, type TokenHandler, type TokenField,
} from './extensibility.js';

// IDE tooling data
export {
  getAutocompleteData, getHoverDocs, getInlineDiagnostics,
  previewFormat, getDocUrl,
  DAYJS_TO_TEMPORAL_FMT, DATE_FNS_TO_TEMPORAL_FMT,
  type TokenAutocompleteEntry, type TokenHoverDoc,
  type InlineDiagnostic, type TokenConversionHint,
} from './ideData.js';

// Day.js / date-fns translation — backs the CLI's `translate` subcommand
// (see scripts/cli.mjs)
export {
  translateDayjsFormatString, translateDateFnsFormatString,
} from './codemod.js';
