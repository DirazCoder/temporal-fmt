// Runtime override registry for format() and parse(). Exists for one
// reason: mods (see modApi.ts) need to be able to swap the real
// implementation everywhere it's used, not just for whoever imports
// `format` from the package root. Without this, `interval.ts`'s
// formatRange() and `serialization.ts`'s formatSQL() would keep calling
// the original format() forever, since they'd still hold their own
// direct reference to it — a mod's fix would look like it worked (the
// export changed) while half the library silently ignored it. That gap
// is worse than not having overrides at all, so every internal call
// site that used to `import { format } from './format.js'` now goes
// through getFormatImpl()/getParseImpl() instead.
//
// format.ts and parse.ts themselves are untouched — this module sits
// beside them, not inside them. Baseline behavior with no mods loaded
// is exactly what it always was; this is pure indirection, not a
// rewrite of either implementation.

import { format as baseFormat, formatToParts as baseFormatToParts } from './format.js';
import { parse as baseParse } from './parse.js';
import { safeParse as base_safeParse, tryParse as base_tryParse, parseToParts as base_parseToParts } from './parse.js';
import { formatDistance as base_formatDistance, formatDistanceToNow as base_formatDistanceToNow } from './formatDistance.js';
import { daysInYear as base_daysInYear, getQuarter as base_getQuarter, startOf as base_startOf, endOf as base_endOf } from './calendarUtils.js';
import { subtract as base_subtract, difference as base_difference } from './arithmetic.js';
import { min as base_min, max as base_max, isWeekend as base_isWeekend } from './comparison.js';
import { round as base_round } from './rounding.js';
import { parseISO as base_parseISO, formatISO as base_formatISO, formatRFC2822 as base_formatRFC2822, formatHTTPDate as base_formatHTTPDate, fromUnixSeconds as base_fromUnixSeconds, fromUnixMilliseconds as base_fromUnixMilliseconds } from './serialization.js';
import { totalDuration as base_totalDuration, addDuration as base_addDuration } from './duration.js';
import { formatRelative as base_formatRelative, formatRelativeToNow as base_formatRelativeToNow } from './relativeTime.js';
import { convertDigits as base_convertDigits, convertDigitsToAscii as base_convertDigitsToAscii } from './numbering.js';
import { intersects as base_intersects, splitInterval as base_splitInterval, formatRange as base_formatRange } from './interval.js';
import { recurrence as base_recurrence, take as base_take, skip as base_skip } from './recurrence.js';
import { isBusinessDay as base_isBusinessDay, addBusinessDays as base_addBusinessDays, differenceInBusinessDays as base_differenceInBusinessDays, nextBusinessDay as base_nextBusinessDay, previousBusinessDay as base_previousBusinessDay } from './businessCalendar.js';
import { holidaysBetween as base_holidaysBetween } from './holidays.js';
import { getTimeZone as base_getTimeZone, getOffset as base_getOffset, getOffsetNanoseconds as base_getOffsetNanoseconds, isDST as base_isDST, getTransitions as base_getTransitions } from './timezone.js';
import { translateDayjsFormatString as base_translateDayjsFormatString } from './codemod.js';

type FormatFn = typeof baseFormat;
type FormatToPartsFn = typeof baseFormatToParts;
type ParseFn = typeof baseParse;

interface OverrideRecord<Fn> {
  impl: Fn;
  // which mod installed this, so a collision or a "what's active right
  // now" query can name it instead of just saying "something"
  installedBy: string;
}

let formatOverride: OverrideRecord<FormatFn> | undefined;
let formatToPartsOverride: OverrideRecord<FormatToPartsFn> | undefined;
let parseOverride: OverrideRecord<ParseFn> | undefined;

export function getFormatImpl(): FormatFn {
  return formatOverride ? formatOverride.impl : baseFormat;
}

export function getFormatToPartsImpl(): FormatToPartsFn {
  return formatToPartsOverride ? formatToPartsOverride.impl : baseFormatToParts;
}

export function getParseImpl(): ParseFn {
  return parseOverride ? parseOverride.impl : baseParse;
}

// Thrown on a second mod trying to override the same point — see
// modApi.ts's ModContext.overrideFormat/overrideParse for why this is a
// hard failure rather than last-write-wins like locale/token
// registration: two mods silently fighting over how dates get
// formatted is a correctness bug in whatever app depends on this
// library, not a cosmetic surprise.
export class OverrideConflictError extends Error {
  constructor(
    public readonly point: string,
    public readonly existingOwner: string,
    public readonly attemptedBy: string
  ) {
    super(
      `temporal-fmt: "${point}" is already overridden by mod "${existingOwner}" — ` +
      `mod "${attemptedBy}" can't also override it. Only one mod may hold each override ` +
      `point; if "${attemptedBy}" needs "${existingOwner}"'s behavior included, that logic ` +
      `needs to move into whichever mod ends up owning the override, not be layered ` +
      `through a second overrideFormat()/overrideParse() call.`
    );
    this.name = 'OverrideConflictError';
  }
}

export function setFormatOverride(impl: FormatFn, installedBy: string): void {
  if (formatOverride) throw new OverrideConflictError('format', formatOverride.installedBy, installedBy);
  formatOverride = { impl, installedBy };
}

export function setFormatToPartsOverride(impl: FormatToPartsFn, installedBy: string): void {
  if (formatToPartsOverride) throw new OverrideConflictError('formatToParts', formatToPartsOverride.installedBy, installedBy);
  formatToPartsOverride = { impl, installedBy };
}

export function setParseOverride(impl: ParseFn, installedBy: string): void {
  if (parseOverride) throw new OverrideConflictError('parse', parseOverride.installedBy, installedBy);
  parseOverride = { impl, installedBy };
}

// Test-only escape hatch — vitest runs all suites in one process, so
// without this, an override installed in one test file's mod-loading
// test would leak into every test that runs after it.
export function _resetOverridesForTesting(): void {
  formatOverride = undefined;
  formatToPartsOverride = undefined;
  parseOverride = undefined;
}

// Resets the 81 generated override points (see bottom of file) — split
// from the block above so that block still reads clearly as "the three
// hand-written ones," and this one can be regenerated wholesale by
// generate.mjs without touching hand-written code.


import { compileFormat as base_compileFormat } from './format.js';
import { compileParser as base_compileParser } from './parse.js';
import { parseRelative as base_parseRelative } from './parseRelative.js';
import { explainFormat as base_explainFormat, tokenizeFormat as base_tokenizeFormat, listTokens as base_listTokens, tokenInfo as base_tokenInfo, isValidFormat as base_isValidFormat, validateFormat as base_validateFormat, fieldForToken as base_fieldForToken } from './analyze.js';
import { monthsInYear as base_monthsInYear, isLeapYear as base_isLeapYear, isLeapMonth as base_isLeapMonth, weekOfYear as base_weekOfYear, weekYear as base_weekYear, getMonth as base_getMonth, getWeekday as base_getWeekday } from './calendarUtils.js';
import { isEqual as base_isEqual, isBefore as base_isBefore, isAfter as base_isAfter, clamp as base_clamp, isBetween as base_isBetween, isToday as base_isToday, isTomorrow as base_isTomorrow, isYesterday as base_isYesterday, isSameDay as base_isSameDay, isSameWeek as base_isSameWeek, isSameMonth as base_isSameMonth, isSameQuarter as base_isSameQuarter, isSameYear as base_isSameYear, isWeekday as base_isWeekday } from './comparison.js';
import { floor as base_floor, ceil as base_ceil, truncate as base_truncate } from './rounding.js';
import { parseRFC3339 as base_parseRFC3339, formatRFC3339 as base_formatRFC3339, parseRFC2822 as base_parseRFC2822, parseHTTPDate as base_parseHTTPDate, fromUnixMicroseconds as base_fromUnixMicroseconds, fromUnixNanoseconds as base_fromUnixNanoseconds, toUnixSeconds as base_toUnixSeconds, toUnixMilliseconds as base_toUnixMilliseconds, toUnixMicroseconds as base_toUnixMicroseconds, toUnixNanoseconds as base_toUnixNanoseconds, parseSQL as base_parseSQL, formatSQL as base_formatSQL } from './serialization.js';
import { formatDurationToParts as base_formatDurationToParts, parseDuration as base_parseDuration, parseISODuration as base_parseISODuration, formatISODuration as base_formatISODuration, balanceDuration as base_balanceDuration, compareDuration as base_compareDuration, subtractDuration as base_subtractDuration } from './duration.js';
import { getLocale as base_getLocale, hasLocale as base_hasLocale } from './localeRegistry.js';
import { createConfig as base_createConfig, mergeWithConfig as base_mergeWithConfig } from './config.js';
import { listRegisteredGrammars as base_listRegisteredGrammars } from './relativeGrammar.js';
import { interval as base_interval, overlaps as base_overlaps, intersection as base_intersection, union as base_union, mergeIntervals as base_mergeIntervals, formatRangeToParts as base_formatRangeToParts } from './interval.js';
import { between as base_between, parseRRule as base_parseRRule, formatRRule as base_formatRRule } from './recurrence.js';
import { createBusinessCalendar as base_createBusinessCalendar, subtractBusinessDays as base_subtractBusinessDays } from './businessCalendar.js';
import { nextHoliday as base_nextHoliday, previousHoliday as base_previousHoliday } from './holidays.js';
import { resolveZoned as base_resolveZoned, getNextTransition as base_getNextTransition, getPreviousTransition as base_getPreviousTransition, possibleInstantsFor as base_possibleInstantsFor } from './timezone.js';
import { getAutocompleteData as base_getAutocompleteData, getHoverDocs as base_getHoverDocs, getInlineDiagnostics as base_getInlineDiagnostics, previewFormat as base_previewFormat, getDocUrl as base_getDocUrl } from './ideData.js';
import { translateDateFnsFormatString as base_translateDateFnsFormatString } from './codemod.js';

// --- Generated override points below ---
// Same pattern as format/parse above, generalized: one owner per named
// point, hard collision (not last-write-wins) because two mods silently
// fighting over a function's behavior is a correctness bug in whatever
// depends on this library, not a cosmetic surprise. createOverridable
// exists so this section doesn't repeat the same five-line shape 126
// times by hand — the behavior is identical to formatOverride/
// parseOverride above, just factored into one generic instead of typed
// out per function.
function createOverridable<Fn>(base: Fn, pointName: string) {
  let current: OverrideRecord<Fn> | undefined;
  return {
    get: (): Fn => (current ? current.impl : base),
    set: (impl: Fn, installedBy: string): void => {
      if (current) throw new OverrideConflictError(pointName, current.installedBy, installedBy);
      current = { impl, installedBy };
    },
    /* c8 ignore start @preserve -- reset() is only ever called from
     * _resetGeneratedOverridesForTesting(), which itself is a
     * vitest-only escape hatch not exported from dist/index.js (see its
     * own doc comment below) — so this function has no path reachable
     * from test/*.test.js, which imports only the public dist/index.js
     * surface. Covered instead by vitest/modApi.unit.test.ts's afterEach
     * hook, which calls _resetGeneratedOverridesForTesting() directly
     * against src/runtime.js on every run. */
    reset: (): void => { current = undefined; },
    /* c8 ignore stop @preserve */
  };
}
 

const compileFormatRegistry = createOverridable(base_compileFormat, 'compileFormat');
const compileParserRegistry = createOverridable(base_compileParser, 'compileParser');
const parseRelativeRegistry = createOverridable(base_parseRelative, 'parseRelative');
const explainFormatRegistry = createOverridable(base_explainFormat, 'explainFormat');
const tokenizeFormatRegistry = createOverridable(base_tokenizeFormat, 'tokenizeFormat');
const listTokensRegistry = createOverridable(base_listTokens, 'listTokens');
const tokenInfoRegistry = createOverridable(base_tokenInfo, 'tokenInfo');
const isValidFormatRegistry = createOverridable(base_isValidFormat, 'isValidFormat');
const validateFormatRegistry = createOverridable(base_validateFormat, 'validateFormat');
const fieldForTokenRegistry = createOverridable(base_fieldForToken, 'fieldForToken');
const monthsInYearRegistry = createOverridable(base_monthsInYear, 'monthsInYear');
const isLeapYearRegistry = createOverridable(base_isLeapYear, 'isLeapYear');
const isLeapMonthRegistry = createOverridable(base_isLeapMonth, 'isLeapMonth');
const weekOfYearRegistry = createOverridable(base_weekOfYear, 'weekOfYear');
const weekYearRegistry = createOverridable(base_weekYear, 'weekYear');
const getMonthRegistry = createOverridable(base_getMonth, 'getMonth');
const getWeekdayRegistry = createOverridable(base_getWeekday, 'getWeekday');
const isEqualRegistry = createOverridable(base_isEqual, 'isEqual');
const isBeforeRegistry = createOverridable(base_isBefore, 'isBefore');
const isAfterRegistry = createOverridable(base_isAfter, 'isAfter');
const clampRegistry = createOverridable(base_clamp, 'clamp');
const isBetweenRegistry = createOverridable(base_isBetween, 'isBetween');
const isTodayRegistry = createOverridable(base_isToday, 'isToday');
const isTomorrowRegistry = createOverridable(base_isTomorrow, 'isTomorrow');
const isYesterdayRegistry = createOverridable(base_isYesterday, 'isYesterday');
const isSameDayRegistry = createOverridable(base_isSameDay, 'isSameDay');
const isSameWeekRegistry = createOverridable(base_isSameWeek, 'isSameWeek');
const isSameMonthRegistry = createOverridable(base_isSameMonth, 'isSameMonth');
const isSameQuarterRegistry = createOverridable(base_isSameQuarter, 'isSameQuarter');
const isSameYearRegistry = createOverridable(base_isSameYear, 'isSameYear');
const isWeekdayRegistry = createOverridable(base_isWeekday, 'isWeekday');
const floorRegistry = createOverridable(base_floor, 'floor');
const ceilRegistry = createOverridable(base_ceil, 'ceil');
const truncateRegistry = createOverridable(base_truncate, 'truncate');
const parseRFC3339Registry = createOverridable(base_parseRFC3339, 'parseRFC3339');
const formatRFC3339Registry = createOverridable(base_formatRFC3339, 'formatRFC3339');
const parseRFC2822Registry = createOverridable(base_parseRFC2822, 'parseRFC2822');
const parseHTTPDateRegistry = createOverridable(base_parseHTTPDate, 'parseHTTPDate');
const fromUnixMicrosecondsRegistry = createOverridable(base_fromUnixMicroseconds, 'fromUnixMicroseconds');
const fromUnixNanosecondsRegistry = createOverridable(base_fromUnixNanoseconds, 'fromUnixNanoseconds');
const toUnixSecondsRegistry = createOverridable(base_toUnixSeconds, 'toUnixSeconds');
const toUnixMillisecondsRegistry = createOverridable(base_toUnixMilliseconds, 'toUnixMilliseconds');
const toUnixMicrosecondsRegistry = createOverridable(base_toUnixMicroseconds, 'toUnixMicroseconds');
const toUnixNanosecondsRegistry = createOverridable(base_toUnixNanoseconds, 'toUnixNanoseconds');
const parseSQLRegistry = createOverridable(base_parseSQL, 'parseSQL');
const formatSQLRegistry = createOverridable(base_formatSQL, 'formatSQL');
const formatDurationToPartsRegistry = createOverridable(base_formatDurationToParts, 'formatDurationToParts');
const parseDurationRegistry = createOverridable(base_parseDuration, 'parseDuration');
const parseISODurationRegistry = createOverridable(base_parseISODuration, 'parseISODuration');
const formatISODurationRegistry = createOverridable(base_formatISODuration, 'formatISODuration');
const balanceDurationRegistry = createOverridable(base_balanceDuration, 'balanceDuration');
const compareDurationRegistry = createOverridable(base_compareDuration, 'compareDuration');
const subtractDurationRegistry = createOverridable(base_subtractDuration, 'subtractDuration');
const getLocaleRegistry = createOverridable(base_getLocale, 'getLocale');
const hasLocaleRegistry = createOverridable(base_hasLocale, 'hasLocale');
const createConfigRegistry = createOverridable(base_createConfig, 'createConfig');
const mergeWithConfigRegistry = createOverridable(base_mergeWithConfig, 'mergeWithConfig');
const listRegisteredGrammarsRegistry = createOverridable(base_listRegisteredGrammars, 'listRegisteredGrammars');
const intervalRegistry = createOverridable(base_interval, 'interval');
const overlapsRegistry = createOverridable(base_overlaps, 'overlaps');
const intersectionRegistry = createOverridable(base_intersection, 'intersection');
const unionRegistry = createOverridable(base_union, 'union');
const mergeIntervalsRegistry = createOverridable(base_mergeIntervals, 'mergeIntervals');
const formatRangeToPartsRegistry = createOverridable(base_formatRangeToParts, 'formatRangeToParts');
const betweenRegistry = createOverridable(base_between, 'between');
const parseRRuleRegistry = createOverridable(base_parseRRule, 'parseRRule');
const formatRRuleRegistry = createOverridable(base_formatRRule, 'formatRRule');
const createBusinessCalendarRegistry = createOverridable(base_createBusinessCalendar, 'createBusinessCalendar');
const subtractBusinessDaysRegistry = createOverridable(base_subtractBusinessDays, 'subtractBusinessDays');
const nextHolidayRegistry = createOverridable(base_nextHoliday, 'nextHoliday');
const previousHolidayRegistry = createOverridable(base_previousHoliday, 'previousHoliday');
const resolveZonedRegistry = createOverridable(base_resolveZoned, 'resolveZoned');
const getNextTransitionRegistry = createOverridable(base_getNextTransition, 'getNextTransition');
const getPreviousTransitionRegistry = createOverridable(base_getPreviousTransition, 'getPreviousTransition');
const possibleInstantsForRegistry = createOverridable(base_possibleInstantsFor, 'possibleInstantsFor');
const getAutocompleteDataRegistry = createOverridable(base_getAutocompleteData, 'getAutocompleteData');
const getHoverDocsRegistry = createOverridable(base_getHoverDocs, 'getHoverDocs');
const getInlineDiagnosticsRegistry = createOverridable(base_getInlineDiagnostics, 'getInlineDiagnostics');
const previewFormatRegistry = createOverridable(base_previewFormat, 'previewFormat');
const getDocUrlRegistry = createOverridable(base_getDocUrl, 'getDocUrl');
const translateDateFnsFormatStringRegistry = createOverridable(base_translateDateFnsFormatString, 'translateDateFnsFormatString');

export const getCompileFormatImpl = compileFormatRegistry.get;
export const setCompileFormatOverride = compileFormatRegistry.set;
export const getCompileParserImpl = compileParserRegistry.get;
export const setCompileParserOverride = compileParserRegistry.set;
export const getParseRelativeImpl = parseRelativeRegistry.get;
export const setParseRelativeOverride = parseRelativeRegistry.set;
export const getExplainFormatImpl = explainFormatRegistry.get;
export const setExplainFormatOverride = explainFormatRegistry.set;
export const getTokenizeFormatImpl = tokenizeFormatRegistry.get;
export const setTokenizeFormatOverride = tokenizeFormatRegistry.set;
export const getListTokensImpl = listTokensRegistry.get;
export const setListTokensOverride = listTokensRegistry.set;
export const getTokenInfoImpl = tokenInfoRegistry.get;
export const setTokenInfoOverride = tokenInfoRegistry.set;
export const getIsValidFormatImpl = isValidFormatRegistry.get;
export const setIsValidFormatOverride = isValidFormatRegistry.set;
export const getValidateFormatImpl = validateFormatRegistry.get;
export const setValidateFormatOverride = validateFormatRegistry.set;
export const getFieldForTokenImpl = fieldForTokenRegistry.get;
export const setFieldForTokenOverride = fieldForTokenRegistry.set;
export const getMonthsInYearImpl = monthsInYearRegistry.get;
export const setMonthsInYearOverride = monthsInYearRegistry.set;
export const getIsLeapYearImpl = isLeapYearRegistry.get;
export const setIsLeapYearOverride = isLeapYearRegistry.set;
export const getIsLeapMonthImpl = isLeapMonthRegistry.get;
export const setIsLeapMonthOverride = isLeapMonthRegistry.set;
export const getWeekOfYearImpl = weekOfYearRegistry.get;
export const setWeekOfYearOverride = weekOfYearRegistry.set;
export const getWeekYearImpl = weekYearRegistry.get;
export const setWeekYearOverride = weekYearRegistry.set;
export const getGetMonthImpl = getMonthRegistry.get;
export const setGetMonthOverride = getMonthRegistry.set;
export const getGetWeekdayImpl = getWeekdayRegistry.get;
export const setGetWeekdayOverride = getWeekdayRegistry.set;
export const getIsEqualImpl = isEqualRegistry.get;
export const setIsEqualOverride = isEqualRegistry.set;
export const getIsBeforeImpl = isBeforeRegistry.get;
export const setIsBeforeOverride = isBeforeRegistry.set;
export const getIsAfterImpl = isAfterRegistry.get;
export const setIsAfterOverride = isAfterRegistry.set;
export const getClampImpl = clampRegistry.get;
export const setClampOverride = clampRegistry.set;
export const getIsBetweenImpl = isBetweenRegistry.get;
export const setIsBetweenOverride = isBetweenRegistry.set;
export const getIsTodayImpl = isTodayRegistry.get;
export const setIsTodayOverride = isTodayRegistry.set;
export const getIsTomorrowImpl = isTomorrowRegistry.get;
export const setIsTomorrowOverride = isTomorrowRegistry.set;
export const getIsYesterdayImpl = isYesterdayRegistry.get;
export const setIsYesterdayOverride = isYesterdayRegistry.set;
export const getIsSameDayImpl = isSameDayRegistry.get;
export const setIsSameDayOverride = isSameDayRegistry.set;
export const getIsSameWeekImpl = isSameWeekRegistry.get;
export const setIsSameWeekOverride = isSameWeekRegistry.set;
export const getIsSameMonthImpl = isSameMonthRegistry.get;
export const setIsSameMonthOverride = isSameMonthRegistry.set;
export const getIsSameQuarterImpl = isSameQuarterRegistry.get;
export const setIsSameQuarterOverride = isSameQuarterRegistry.set;
export const getIsSameYearImpl = isSameYearRegistry.get;
export const setIsSameYearOverride = isSameYearRegistry.set;
export const getIsWeekdayImpl = isWeekdayRegistry.get;
export const setIsWeekdayOverride = isWeekdayRegistry.set;
export const getFloorImpl = floorRegistry.get;
export const setFloorOverride = floorRegistry.set;
export const getCeilImpl = ceilRegistry.get;
export const setCeilOverride = ceilRegistry.set;
export const getTruncateImpl = truncateRegistry.get;
export const setTruncateOverride = truncateRegistry.set;
export const getParseRFC3339Impl = parseRFC3339Registry.get;
export const setParseRFC3339Override = parseRFC3339Registry.set;
export const getFormatRFC3339Impl = formatRFC3339Registry.get;
export const setFormatRFC3339Override = formatRFC3339Registry.set;
export const getParseRFC2822Impl = parseRFC2822Registry.get;
export const setParseRFC2822Override = parseRFC2822Registry.set;
export const getParseHTTPDateImpl = parseHTTPDateRegistry.get;
export const setParseHTTPDateOverride = parseHTTPDateRegistry.set;
export const getFromUnixMicrosecondsImpl = fromUnixMicrosecondsRegistry.get;
export const setFromUnixMicrosecondsOverride = fromUnixMicrosecondsRegistry.set;
export const getFromUnixNanosecondsImpl = fromUnixNanosecondsRegistry.get;
export const setFromUnixNanosecondsOverride = fromUnixNanosecondsRegistry.set;
export const getToUnixSecondsImpl = toUnixSecondsRegistry.get;
export const setToUnixSecondsOverride = toUnixSecondsRegistry.set;
export const getToUnixMillisecondsImpl = toUnixMillisecondsRegistry.get;
export const setToUnixMillisecondsOverride = toUnixMillisecondsRegistry.set;
export const getToUnixMicrosecondsImpl = toUnixMicrosecondsRegistry.get;
export const setToUnixMicrosecondsOverride = toUnixMicrosecondsRegistry.set;
export const getToUnixNanosecondsImpl = toUnixNanosecondsRegistry.get;
export const setToUnixNanosecondsOverride = toUnixNanosecondsRegistry.set;
export const getParseSQLImpl = parseSQLRegistry.get;
export const setParseSQLOverride = parseSQLRegistry.set;
export const getFormatSQLImpl = formatSQLRegistry.get;
export const setFormatSQLOverride = formatSQLRegistry.set;
export const getFormatDurationToPartsImpl = formatDurationToPartsRegistry.get;
export const setFormatDurationToPartsOverride = formatDurationToPartsRegistry.set;
export const getParseDurationImpl = parseDurationRegistry.get;
export const setParseDurationOverride = parseDurationRegistry.set;
export const getParseISODurationImpl = parseISODurationRegistry.get;
export const setParseISODurationOverride = parseISODurationRegistry.set;
export const getFormatISODurationImpl = formatISODurationRegistry.get;
export const setFormatISODurationOverride = formatISODurationRegistry.set;
export const getBalanceDurationImpl = balanceDurationRegistry.get;
export const setBalanceDurationOverride = balanceDurationRegistry.set;
export const getCompareDurationImpl = compareDurationRegistry.get;
export const setCompareDurationOverride = compareDurationRegistry.set;
export const getSubtractDurationImpl = subtractDurationRegistry.get;
export const setSubtractDurationOverride = subtractDurationRegistry.set;
export const getGetLocaleImpl = getLocaleRegistry.get;
export const setGetLocaleOverride = getLocaleRegistry.set;
export const getHasLocaleImpl = hasLocaleRegistry.get;
export const setHasLocaleOverride = hasLocaleRegistry.set;
export const getCreateConfigImpl = createConfigRegistry.get;
export const setCreateConfigOverride = createConfigRegistry.set;
export const getMergeWithConfigImpl = mergeWithConfigRegistry.get;
export const setMergeWithConfigOverride = mergeWithConfigRegistry.set;
export const getListRegisteredGrammarsImpl = listRegisteredGrammarsRegistry.get;
export const setListRegisteredGrammarsOverride = listRegisteredGrammarsRegistry.set;
export const getIntervalImpl = intervalRegistry.get;
export const setIntervalOverride = intervalRegistry.set;
export const getOverlapsImpl = overlapsRegistry.get;
export const setOverlapsOverride = overlapsRegistry.set;
export const getIntersectionImpl = intersectionRegistry.get;
export const setIntersectionOverride = intersectionRegistry.set;
export const getUnionImpl = unionRegistry.get;
export const setUnionOverride = unionRegistry.set;
export const getMergeIntervalsImpl = mergeIntervalsRegistry.get;
export const setMergeIntervalsOverride = mergeIntervalsRegistry.set;
export const getFormatRangeToPartsImpl = formatRangeToPartsRegistry.get;
export const setFormatRangeToPartsOverride = formatRangeToPartsRegistry.set;
export const getBetweenImpl = betweenRegistry.get;
export const setBetweenOverride = betweenRegistry.set;
export const getParseRRuleImpl = parseRRuleRegistry.get;
export const setParseRRuleOverride = parseRRuleRegistry.set;
export const getFormatRRuleImpl = formatRRuleRegistry.get;
export const setFormatRRuleOverride = formatRRuleRegistry.set;
export const getCreateBusinessCalendarImpl = createBusinessCalendarRegistry.get;
export const setCreateBusinessCalendarOverride = createBusinessCalendarRegistry.set;
export const getSubtractBusinessDaysImpl = subtractBusinessDaysRegistry.get;
export const setSubtractBusinessDaysOverride = subtractBusinessDaysRegistry.set;
export const getNextHolidayImpl = nextHolidayRegistry.get;
export const setNextHolidayOverride = nextHolidayRegistry.set;
export const getPreviousHolidayImpl = previousHolidayRegistry.get;
export const setPreviousHolidayOverride = previousHolidayRegistry.set;
export const getResolveZonedImpl = resolveZonedRegistry.get;
export const setResolveZonedOverride = resolveZonedRegistry.set;
export const getGetNextTransitionImpl = getNextTransitionRegistry.get;
export const setGetNextTransitionOverride = getNextTransitionRegistry.set;
export const getGetPreviousTransitionImpl = getPreviousTransitionRegistry.get;
export const setGetPreviousTransitionOverride = getPreviousTransitionRegistry.set;
export const getPossibleInstantsForImpl = possibleInstantsForRegistry.get;
export const setPossibleInstantsForOverride = possibleInstantsForRegistry.set;
export const getGetAutocompleteDataImpl = getAutocompleteDataRegistry.get;
export const setGetAutocompleteDataOverride = getAutocompleteDataRegistry.set;
export const getGetHoverDocsImpl = getHoverDocsRegistry.get;
export const setGetHoverDocsOverride = getHoverDocsRegistry.set;
export const getGetInlineDiagnosticsImpl = getInlineDiagnosticsRegistry.get;
export const setGetInlineDiagnosticsOverride = getInlineDiagnosticsRegistry.set;
export const getPreviewFormatImpl = previewFormatRegistry.get;
export const setPreviewFormatOverride = previewFormatRegistry.set;
export const getGetDocUrlImpl = getDocUrlRegistry.get;
export const setGetDocUrlOverride = getDocUrlRegistry.set;
export const getTranslateDateFnsFormatStringImpl = translateDateFnsFormatStringRegistry.get;
export const setTranslateDateFnsFormatStringOverride = translateDateFnsFormatStringRegistry.set;

// Resets the 81 generated override points above — split from
// _resetOverridesForTesting so that one still reads clearly as "the
// three hand-written ones," and this one can be regenerated wholesale
// by generate.mjs without touching hand-written code.
export function _resetGeneratedOverridesForTesting(): void {
  compileFormatRegistry.reset();
  compileParserRegistry.reset();
  parseRelativeRegistry.reset();
  explainFormatRegistry.reset();
  tokenizeFormatRegistry.reset();
  listTokensRegistry.reset();
  tokenInfoRegistry.reset();
  isValidFormatRegistry.reset();
  validateFormatRegistry.reset();
  fieldForTokenRegistry.reset();
  monthsInYearRegistry.reset();
  isLeapYearRegistry.reset();
  isLeapMonthRegistry.reset();
  weekOfYearRegistry.reset();
  weekYearRegistry.reset();
  getMonthRegistry.reset();
  getWeekdayRegistry.reset();
  isEqualRegistry.reset();
  isBeforeRegistry.reset();
  isAfterRegistry.reset();
  clampRegistry.reset();
  isBetweenRegistry.reset();
  isTodayRegistry.reset();
  isTomorrowRegistry.reset();
  isYesterdayRegistry.reset();
  isSameDayRegistry.reset();
  isSameWeekRegistry.reset();
  isSameMonthRegistry.reset();
  isSameQuarterRegistry.reset();
  isSameYearRegistry.reset();
  isWeekdayRegistry.reset();
  floorRegistry.reset();
  ceilRegistry.reset();
  truncateRegistry.reset();
  parseRFC3339Registry.reset();
  formatRFC3339Registry.reset();
  parseRFC2822Registry.reset();
  parseHTTPDateRegistry.reset();
  fromUnixMicrosecondsRegistry.reset();
  fromUnixNanosecondsRegistry.reset();
  toUnixSecondsRegistry.reset();
  toUnixMillisecondsRegistry.reset();
  toUnixMicrosecondsRegistry.reset();
  toUnixNanosecondsRegistry.reset();
  parseSQLRegistry.reset();
  formatSQLRegistry.reset();
  formatDurationToPartsRegistry.reset();
  parseDurationRegistry.reset();
  parseISODurationRegistry.reset();
  formatISODurationRegistry.reset();
  balanceDurationRegistry.reset();
  compareDurationRegistry.reset();
  subtractDurationRegistry.reset();
  getLocaleRegistry.reset();
  hasLocaleRegistry.reset();
  createConfigRegistry.reset();
  mergeWithConfigRegistry.reset();
  listRegisteredGrammarsRegistry.reset();
  intervalRegistry.reset();
  overlapsRegistry.reset();
  intersectionRegistry.reset();
  unionRegistry.reset();
  mergeIntervalsRegistry.reset();
  formatRangeToPartsRegistry.reset();
  betweenRegistry.reset();
  parseRRuleRegistry.reset();
  formatRRuleRegistry.reset();
  createBusinessCalendarRegistry.reset();
  subtractBusinessDaysRegistry.reset();
  nextHolidayRegistry.reset();
  previousHolidayRegistry.reset();
  resolveZonedRegistry.reset();
  getNextTransitionRegistry.reset();
  getPreviousTransitionRegistry.reset();
  possibleInstantsForRegistry.reset();
  getAutocompleteDataRegistry.reset();
  getHoverDocsRegistry.reset();
  getInlineDiagnosticsRegistry.reset();
  previewFormatRegistry.reset();
  getDocUrlRegistry.reset();
  translateDateFnsFormatStringRegistry.reset();
}
