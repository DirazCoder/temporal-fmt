// Mod contract. A mod is a plain .mjs file that default-exports one of
// these — same shape whether it's fixing a locale bug, adding a holiday
// set, or registering a custom token. The actual file-loading (reading
// a mods/ folder, dynamic import) is Node-only and lives in
// scripts/loadMods.mjs, not here — this file only defines the shape a
// mod has to match, so it stays usable by non-Node consumers of the
// library too.

import { registerLocale, type ExtendedLocaleVocab } from './localeRegistry.js';
import { registerLocaleVocab, type LocaleVocab } from './localeVocab.js';
import { registerRelativeGrammar, type RelativeGrammar } from './relativeGrammar.js';
import { createFormatter, type FormatterOptions, type Formatter } from './extensibility.js';
import { createHolidayCalendar, type HolidaySpec, type HolidayCalendar } from './holidays.js';
import { getFormatImpl, getParseImpl, setFormatOverride, setParseOverride, getCompileFormatImpl, setCompileFormatOverride, getCompileParserImpl, setCompileParserOverride, getParseRelativeImpl, setParseRelativeOverride, getExplainFormatImpl, setExplainFormatOverride, getTokenizeFormatImpl, setTokenizeFormatOverride, getListTokensImpl, setListTokensOverride, getTokenInfoImpl, setTokenInfoOverride, getIsValidFormatImpl, setIsValidFormatOverride, getValidateFormatImpl, setValidateFormatOverride, getFieldForTokenImpl, setFieldForTokenOverride, getMonthsInYearImpl, setMonthsInYearOverride, getIsLeapYearImpl, setIsLeapYearOverride, getIsLeapMonthImpl, setIsLeapMonthOverride, getWeekOfYearImpl, setWeekOfYearOverride, getWeekYearImpl, setWeekYearOverride, getGetMonthImpl, setGetMonthOverride, getGetWeekdayImpl, setGetWeekdayOverride, getIsEqualImpl, setIsEqualOverride, getIsBeforeImpl, setIsBeforeOverride, getIsAfterImpl, setIsAfterOverride, getClampImpl, setClampOverride, getIsBetweenImpl, setIsBetweenOverride, getIsTodayImpl, setIsTodayOverride, getIsTomorrowImpl, setIsTomorrowOverride, getIsYesterdayImpl, setIsYesterdayOverride, getIsSameDayImpl, setIsSameDayOverride, getIsSameWeekImpl, setIsSameWeekOverride, getIsSameMonthImpl, setIsSameMonthOverride, getIsSameQuarterImpl, setIsSameQuarterOverride, getIsSameYearImpl, setIsSameYearOverride, getIsWeekdayImpl, setIsWeekdayOverride, getFloorImpl, setFloorOverride, getCeilImpl, setCeilOverride, getTruncateImpl, setTruncateOverride, getParseRFC3339Impl, setParseRFC3339Override, getFormatRFC3339Impl, setFormatRFC3339Override, getParseRFC2822Impl, setParseRFC2822Override, getParseHTTPDateImpl, setParseHTTPDateOverride, getFromUnixMicrosecondsImpl, setFromUnixMicrosecondsOverride, getFromUnixNanosecondsImpl, setFromUnixNanosecondsOverride, getToUnixSecondsImpl, setToUnixSecondsOverride, getToUnixMillisecondsImpl, setToUnixMillisecondsOverride, getToUnixMicrosecondsImpl, setToUnixMicrosecondsOverride, getToUnixNanosecondsImpl, setToUnixNanosecondsOverride, getParseSQLImpl, setParseSQLOverride, getFormatSQLImpl, setFormatSQLOverride, getFormatDurationToPartsImpl, setFormatDurationToPartsOverride, getParseDurationImpl, setParseDurationOverride, getParseISODurationImpl, setParseISODurationOverride, getFormatISODurationImpl, setFormatISODurationOverride, getBalanceDurationImpl, setBalanceDurationOverride, getCompareDurationImpl, setCompareDurationOverride, getSubtractDurationImpl, setSubtractDurationOverride, getGetLocaleImpl, setGetLocaleOverride, getHasLocaleImpl, setHasLocaleOverride, getCreateConfigImpl, setCreateConfigOverride, getMergeWithConfigImpl, setMergeWithConfigOverride, getListRegisteredGrammarsImpl, setListRegisteredGrammarsOverride, getIntervalImpl, setIntervalOverride, getOverlapsImpl, setOverlapsOverride, getIntersectionImpl, setIntersectionOverride, getUnionImpl, setUnionOverride, getMergeIntervalsImpl, setMergeIntervalsOverride, getFormatRangeToPartsImpl, setFormatRangeToPartsOverride, getBetweenImpl, setBetweenOverride, getParseRRuleImpl, setParseRRuleOverride, getFormatRRuleImpl, setFormatRRuleOverride, getCreateBusinessCalendarImpl, setCreateBusinessCalendarOverride, getSubtractBusinessDaysImpl, setSubtractBusinessDaysOverride, getNextHolidayImpl, setNextHolidayOverride, getPreviousHolidayImpl, setPreviousHolidayOverride, getResolveZonedImpl, setResolveZonedOverride, getGetNextTransitionImpl, setGetNextTransitionOverride, getGetPreviousTransitionImpl, setGetPreviousTransitionOverride, getPossibleInstantsForImpl, setPossibleInstantsForOverride, getGetAutocompleteDataImpl, setGetAutocompleteDataOverride, getGetHoverDocsImpl, setGetHoverDocsOverride, getGetInlineDiagnosticsImpl, setGetInlineDiagnosticsOverride, getPreviewFormatImpl, setPreviewFormatOverride, getGetDocUrlImpl, setGetDocUrlOverride, getTranslateDateFnsFormatStringImpl, setTranslateDateFnsFormatStringOverride } from './runtime.js';
import type { compileFormat as compileFormatBase } from './format.js';
import type { compileParser as compileParserBase } from './parse.js';
import type { parseRelative as parseRelativeBase } from './parseRelative.js';
import type { explainFormat as explainFormatBase, tokenizeFormat as tokenizeFormatBase, listTokens as listTokensBase, tokenInfo as tokenInfoBase, isValidFormat as isValidFormatBase, validateFormat as validateFormatBase, fieldForToken as fieldForTokenBase } from './analyze.js';
import type { monthsInYear as monthsInYearBase, isLeapYear as isLeapYearBase, isLeapMonth as isLeapMonthBase, weekOfYear as weekOfYearBase, weekYear as weekYearBase, getMonth as getMonthBase, getWeekday as getWeekdayBase } from './calendarUtils.js';
import type { isEqual as isEqualBase, isBefore as isBeforeBase, isAfter as isAfterBase, clamp as clampBase, isBetween as isBetweenBase, isToday as isTodayBase, isTomorrow as isTomorrowBase, isYesterday as isYesterdayBase, isSameDay as isSameDayBase, isSameWeek as isSameWeekBase, isSameMonth as isSameMonthBase, isSameQuarter as isSameQuarterBase, isSameYear as isSameYearBase, isWeekday as isWeekdayBase } from './comparison.js';
import type { floor as floorBase, ceil as ceilBase, truncate as truncateBase } from './rounding.js';
import type { parseRFC3339 as parseRFC3339Base, formatRFC3339 as formatRFC3339Base, parseRFC2822 as parseRFC2822Base, parseHTTPDate as parseHTTPDateBase, fromUnixMicroseconds as fromUnixMicrosecondsBase, fromUnixNanoseconds as fromUnixNanosecondsBase, toUnixSeconds as toUnixSecondsBase, toUnixMilliseconds as toUnixMillisecondsBase, toUnixMicroseconds as toUnixMicrosecondsBase, toUnixNanoseconds as toUnixNanosecondsBase, parseSQL as parseSQLBase, formatSQL as formatSQLBase } from './serialization.js';
import type { formatDurationToParts as formatDurationToPartsBase, parseDuration as parseDurationBase, parseISODuration as parseISODurationBase, formatISODuration as formatISODurationBase, balanceDuration as balanceDurationBase, compareDuration as compareDurationBase, subtractDuration as subtractDurationBase } from './duration.js';
import type { getLocale as getLocaleBase, hasLocale as hasLocaleBase } from './localeRegistry.js';
import type { createConfig as createConfigBase, mergeWithConfig as mergeWithConfigBase } from './config.js';
import type { listRegisteredGrammars as listRegisteredGrammarsBase } from './relativeGrammar.js';
import type { interval as intervalBase, overlaps as overlapsBase, intersection as intersectionBase, union as unionBase, mergeIntervals as mergeIntervalsBase, formatRangeToParts as formatRangeToPartsBase } from './interval.js';
import type { between as betweenBase, parseRRule as parseRRuleBase, formatRRule as formatRRuleBase } from './recurrence.js';
import type { createBusinessCalendar as createBusinessCalendarBase, subtractBusinessDays as subtractBusinessDaysBase } from './businessCalendar.js';
import type { nextHoliday as nextHolidayBase, previousHoliday as previousHolidayBase } from './holidays.js';
import type { resolveZoned as resolveZonedBase, getNextTransition as getNextTransitionBase, getPreviousTransition as getPreviousTransitionBase, possibleInstantsFor as possibleInstantsForBase } from './timezone.js';
import type { getAutocompleteData as getAutocompleteDataBase, getHoverDocs as getHoverDocsBase, getInlineDiagnostics as getInlineDiagnosticsBase, previewFormat as previewFormatBase, getDocUrl as getDocUrlBase } from './ideData.js';
import type { translateDateFnsFormatString as translateDateFnsFormatStringBase } from './codemod.js';
import type { format as FormatFn } from './format.js';
import type { parse as ParseFn } from './parse.js';

// Deliberately just the public registration functions, re-typed here so
// a mod only ever touches the library through the same surface any other
// consumer would. No access to internal token tables, tokenizer state,
// etc. — a mod that needs more than this is a real feature request for
// the library itself, not something to route around by reaching into
// internals that could shift under it without notice.
//
// overrideFormat/overrideParse are the one deliberate exception to
// "additive only": they let a mod replace the actual format()/parse()
// implementation everywhere in the library, not just register new data
// alongside the existing behavior — see runtime.ts for how that's made
// consistent across internal call sites, and README -> Mods for why
// this is capped at one override per point instead of allowing
// multiple mods to stack silently.
export interface ModContext {
  registerLocale(locale: string, vocab: ExtendedLocaleVocab): void;
  registerLocaleVocab(locale: string, vocab: LocaleVocab): void;
  registerRelativeGrammar(grammar: RelativeGrammar): void;
  createFormatter(options?: FormatterOptions): Formatter;
  createHolidayCalendar(specs: HolidaySpec[]): HolidayCalendar;
  // `impl` receives the current format()/parse() as its first argument
  // (always the original built-in — only one mod can hold this override
  // at a time, see below, so there's never a "previous mod's override"
  // to receive instead). Call it to keep the existing behavior for
  // cases you're not trying to change, or ignore it entirely to replace
  // the implementation outright.
  //
  // Only one mod may hold each override. A second overrideFormat()/
  // overrideParse() call — from any mod, even one that `requires` the
  // first — throws immediately. This is a real limitation, not just
  // strictness for its own sake: there's no mechanism here for two
  // separate mod files to both wrap the same point in sequence, only
  // for one mod's own implementation to wrap the original once. If two
  // mods both need to change format()'s behavior, one of them has to
  // incorporate the other's fix directly rather than layering through
  // the override system.
  overrideFormat(impl: (original: typeof FormatFn, ...args: Parameters<typeof FormatFn>) => ReturnType<typeof FormatFn>): void;
  overrideParse(impl: (original: typeof ParseFn, ...args: Parameters<typeof ParseFn>) => ReturnType<typeof ParseFn>): void;
  overrideCompileFormat(impl: (original: typeof compileFormatBase, ...args: Parameters<typeof compileFormatBase>) => ReturnType<typeof compileFormatBase>): void;
  overrideCompileParser(impl: (original: typeof compileParserBase, ...args: Parameters<typeof compileParserBase>) => ReturnType<typeof compileParserBase>): void;
  overrideParseRelative(impl: (original: typeof parseRelativeBase, ...args: Parameters<typeof parseRelativeBase>) => ReturnType<typeof parseRelativeBase>): void;
  overrideExplainFormat(impl: (original: typeof explainFormatBase, ...args: Parameters<typeof explainFormatBase>) => ReturnType<typeof explainFormatBase>): void;
  overrideTokenizeFormat(impl: (original: typeof tokenizeFormatBase, ...args: Parameters<typeof tokenizeFormatBase>) => ReturnType<typeof tokenizeFormatBase>): void;
  overrideListTokens(impl: (original: typeof listTokensBase, ...args: Parameters<typeof listTokensBase>) => ReturnType<typeof listTokensBase>): void;
  overrideTokenInfo(impl: (original: typeof tokenInfoBase, ...args: Parameters<typeof tokenInfoBase>) => ReturnType<typeof tokenInfoBase>): void;
  overrideIsValidFormat(impl: (original: typeof isValidFormatBase, ...args: Parameters<typeof isValidFormatBase>) => ReturnType<typeof isValidFormatBase>): void;
  overrideValidateFormat(impl: (original: typeof validateFormatBase, ...args: Parameters<typeof validateFormatBase>) => ReturnType<typeof validateFormatBase>): void;
  overrideFieldForToken(impl: (original: typeof fieldForTokenBase, ...args: Parameters<typeof fieldForTokenBase>) => ReturnType<typeof fieldForTokenBase>): void;
  overrideMonthsInYear(impl: (original: typeof monthsInYearBase, ...args: Parameters<typeof monthsInYearBase>) => ReturnType<typeof monthsInYearBase>): void;
  overrideIsLeapYear(impl: (original: typeof isLeapYearBase, ...args: Parameters<typeof isLeapYearBase>) => ReturnType<typeof isLeapYearBase>): void;
  overrideIsLeapMonth(impl: (original: typeof isLeapMonthBase, ...args: Parameters<typeof isLeapMonthBase>) => ReturnType<typeof isLeapMonthBase>): void;
  overrideWeekOfYear(impl: (original: typeof weekOfYearBase, ...args: Parameters<typeof weekOfYearBase>) => ReturnType<typeof weekOfYearBase>): void;
  overrideWeekYear(impl: (original: typeof weekYearBase, ...args: Parameters<typeof weekYearBase>) => ReturnType<typeof weekYearBase>): void;
  overrideGetMonth(impl: (original: typeof getMonthBase, ...args: Parameters<typeof getMonthBase>) => ReturnType<typeof getMonthBase>): void;
  overrideGetWeekday(impl: (original: typeof getWeekdayBase, ...args: Parameters<typeof getWeekdayBase>) => ReturnType<typeof getWeekdayBase>): void;
  overrideIsEqual(impl: (original: typeof isEqualBase, ...args: Parameters<typeof isEqualBase>) => ReturnType<typeof isEqualBase>): void;
  overrideIsBefore(impl: (original: typeof isBeforeBase, ...args: Parameters<typeof isBeforeBase>) => ReturnType<typeof isBeforeBase>): void;
  overrideIsAfter(impl: (original: typeof isAfterBase, ...args: Parameters<typeof isAfterBase>) => ReturnType<typeof isAfterBase>): void;
  overrideClamp(impl: (original: typeof clampBase, ...args: Parameters<typeof clampBase>) => ReturnType<typeof clampBase>): void;
  overrideIsBetween(impl: (original: typeof isBetweenBase, ...args: Parameters<typeof isBetweenBase>) => ReturnType<typeof isBetweenBase>): void;
  overrideIsToday(impl: (original: typeof isTodayBase, ...args: Parameters<typeof isTodayBase>) => ReturnType<typeof isTodayBase>): void;
  overrideIsTomorrow(impl: (original: typeof isTomorrowBase, ...args: Parameters<typeof isTomorrowBase>) => ReturnType<typeof isTomorrowBase>): void;
  overrideIsYesterday(impl: (original: typeof isYesterdayBase, ...args: Parameters<typeof isYesterdayBase>) => ReturnType<typeof isYesterdayBase>): void;
  overrideIsSameDay(impl: (original: typeof isSameDayBase, ...args: Parameters<typeof isSameDayBase>) => ReturnType<typeof isSameDayBase>): void;
  overrideIsSameWeek(impl: (original: typeof isSameWeekBase, ...args: Parameters<typeof isSameWeekBase>) => ReturnType<typeof isSameWeekBase>): void;
  overrideIsSameMonth(impl: (original: typeof isSameMonthBase, ...args: Parameters<typeof isSameMonthBase>) => ReturnType<typeof isSameMonthBase>): void;
  overrideIsSameQuarter(impl: (original: typeof isSameQuarterBase, ...args: Parameters<typeof isSameQuarterBase>) => ReturnType<typeof isSameQuarterBase>): void;
  overrideIsSameYear(impl: (original: typeof isSameYearBase, ...args: Parameters<typeof isSameYearBase>) => ReturnType<typeof isSameYearBase>): void;
  overrideIsWeekday(impl: (original: typeof isWeekdayBase, ...args: Parameters<typeof isWeekdayBase>) => ReturnType<typeof isWeekdayBase>): void;
  overrideFloor(impl: (original: typeof floorBase, ...args: Parameters<typeof floorBase>) => ReturnType<typeof floorBase>): void;
  overrideCeil(impl: (original: typeof ceilBase, ...args: Parameters<typeof ceilBase>) => ReturnType<typeof ceilBase>): void;
  overrideTruncate(impl: (original: typeof truncateBase, ...args: Parameters<typeof truncateBase>) => ReturnType<typeof truncateBase>): void;
  overrideParseRFC3339(impl: (original: typeof parseRFC3339Base, ...args: Parameters<typeof parseRFC3339Base>) => ReturnType<typeof parseRFC3339Base>): void;
  overrideFormatRFC3339(impl: (original: typeof formatRFC3339Base, ...args: Parameters<typeof formatRFC3339Base>) => ReturnType<typeof formatRFC3339Base>): void;
  overrideParseRFC2822(impl: (original: typeof parseRFC2822Base, ...args: Parameters<typeof parseRFC2822Base>) => ReturnType<typeof parseRFC2822Base>): void;
  overrideParseHTTPDate(impl: (original: typeof parseHTTPDateBase, ...args: Parameters<typeof parseHTTPDateBase>) => ReturnType<typeof parseHTTPDateBase>): void;
  overrideFromUnixMicroseconds(impl: (original: typeof fromUnixMicrosecondsBase, ...args: Parameters<typeof fromUnixMicrosecondsBase>) => ReturnType<typeof fromUnixMicrosecondsBase>): void;
  overrideFromUnixNanoseconds(impl: (original: typeof fromUnixNanosecondsBase, ...args: Parameters<typeof fromUnixNanosecondsBase>) => ReturnType<typeof fromUnixNanosecondsBase>): void;
  overrideToUnixSeconds(impl: (original: typeof toUnixSecondsBase, ...args: Parameters<typeof toUnixSecondsBase>) => ReturnType<typeof toUnixSecondsBase>): void;
  overrideToUnixMilliseconds(impl: (original: typeof toUnixMillisecondsBase, ...args: Parameters<typeof toUnixMillisecondsBase>) => ReturnType<typeof toUnixMillisecondsBase>): void;
  overrideToUnixMicroseconds(impl: (original: typeof toUnixMicrosecondsBase, ...args: Parameters<typeof toUnixMicrosecondsBase>) => ReturnType<typeof toUnixMicrosecondsBase>): void;
  overrideToUnixNanoseconds(impl: (original: typeof toUnixNanosecondsBase, ...args: Parameters<typeof toUnixNanosecondsBase>) => ReturnType<typeof toUnixNanosecondsBase>): void;
  overrideParseSQL(impl: (original: typeof parseSQLBase, ...args: Parameters<typeof parseSQLBase>) => ReturnType<typeof parseSQLBase>): void;
  overrideFormatSQL(impl: (original: typeof formatSQLBase, ...args: Parameters<typeof formatSQLBase>) => ReturnType<typeof formatSQLBase>): void;
  overrideFormatDurationToParts(impl: (original: typeof formatDurationToPartsBase, ...args: Parameters<typeof formatDurationToPartsBase>) => ReturnType<typeof formatDurationToPartsBase>): void;
  overrideParseDuration(impl: (original: typeof parseDurationBase, ...args: Parameters<typeof parseDurationBase>) => ReturnType<typeof parseDurationBase>): void;
  overrideParseISODuration(impl: (original: typeof parseISODurationBase, ...args: Parameters<typeof parseISODurationBase>) => ReturnType<typeof parseISODurationBase>): void;
  overrideFormatISODuration(impl: (original: typeof formatISODurationBase, ...args: Parameters<typeof formatISODurationBase>) => ReturnType<typeof formatISODurationBase>): void;
  overrideBalanceDuration(impl: (original: typeof balanceDurationBase, ...args: Parameters<typeof balanceDurationBase>) => ReturnType<typeof balanceDurationBase>): void;
  overrideCompareDuration(impl: (original: typeof compareDurationBase, ...args: Parameters<typeof compareDurationBase>) => ReturnType<typeof compareDurationBase>): void;
  overrideSubtractDuration(impl: (original: typeof subtractDurationBase, ...args: Parameters<typeof subtractDurationBase>) => ReturnType<typeof subtractDurationBase>): void;
  overrideGetLocale(impl: (original: typeof getLocaleBase, ...args: Parameters<typeof getLocaleBase>) => ReturnType<typeof getLocaleBase>): void;
  overrideHasLocale(impl: (original: typeof hasLocaleBase, ...args: Parameters<typeof hasLocaleBase>) => ReturnType<typeof hasLocaleBase>): void;
  overrideCreateConfig(impl: (original: typeof createConfigBase, ...args: Parameters<typeof createConfigBase>) => ReturnType<typeof createConfigBase>): void;
  overrideMergeWithConfig(impl: (original: typeof mergeWithConfigBase, ...args: Parameters<typeof mergeWithConfigBase>) => ReturnType<typeof mergeWithConfigBase>): void;
  overrideListRegisteredGrammars(impl: (original: typeof listRegisteredGrammarsBase, ...args: Parameters<typeof listRegisteredGrammarsBase>) => ReturnType<typeof listRegisteredGrammarsBase>): void;
  overrideInterval(impl: (original: typeof intervalBase, ...args: Parameters<typeof intervalBase>) => ReturnType<typeof intervalBase>): void;
  overrideOverlaps(impl: (original: typeof overlapsBase, ...args: Parameters<typeof overlapsBase>) => ReturnType<typeof overlapsBase>): void;
  overrideIntersection(impl: (original: typeof intersectionBase, ...args: Parameters<typeof intersectionBase>) => ReturnType<typeof intersectionBase>): void;
  overrideUnion(impl: (original: typeof unionBase, ...args: Parameters<typeof unionBase>) => ReturnType<typeof unionBase>): void;
  overrideMergeIntervals(impl: (original: typeof mergeIntervalsBase, ...args: Parameters<typeof mergeIntervalsBase>) => ReturnType<typeof mergeIntervalsBase>): void;
  overrideFormatRangeToParts(impl: (original: typeof formatRangeToPartsBase, ...args: Parameters<typeof formatRangeToPartsBase>) => ReturnType<typeof formatRangeToPartsBase>): void;
  overrideBetween(impl: (original: typeof betweenBase, ...args: Parameters<typeof betweenBase>) => ReturnType<typeof betweenBase>): void;
  overrideParseRRule(impl: (original: typeof parseRRuleBase, ...args: Parameters<typeof parseRRuleBase>) => ReturnType<typeof parseRRuleBase>): void;
  overrideFormatRRule(impl: (original: typeof formatRRuleBase, ...args: Parameters<typeof formatRRuleBase>) => ReturnType<typeof formatRRuleBase>): void;
  overrideCreateBusinessCalendar(impl: (original: typeof createBusinessCalendarBase, ...args: Parameters<typeof createBusinessCalendarBase>) => ReturnType<typeof createBusinessCalendarBase>): void;
  overrideSubtractBusinessDays(impl: (original: typeof subtractBusinessDaysBase, ...args: Parameters<typeof subtractBusinessDaysBase>) => ReturnType<typeof subtractBusinessDaysBase>): void;
  overrideNextHoliday(impl: (original: typeof nextHolidayBase, ...args: Parameters<typeof nextHolidayBase>) => ReturnType<typeof nextHolidayBase>): void;
  overridePreviousHoliday(impl: (original: typeof previousHolidayBase, ...args: Parameters<typeof previousHolidayBase>) => ReturnType<typeof previousHolidayBase>): void;
  overrideResolveZoned(impl: (original: typeof resolveZonedBase, ...args: Parameters<typeof resolveZonedBase>) => ReturnType<typeof resolveZonedBase>): void;
  overrideGetNextTransition(impl: (original: typeof getNextTransitionBase, ...args: Parameters<typeof getNextTransitionBase>) => ReturnType<typeof getNextTransitionBase>): void;
  overrideGetPreviousTransition(impl: (original: typeof getPreviousTransitionBase, ...args: Parameters<typeof getPreviousTransitionBase>) => ReturnType<typeof getPreviousTransitionBase>): void;
  overridePossibleInstantsFor(impl: (original: typeof possibleInstantsForBase, ...args: Parameters<typeof possibleInstantsForBase>) => ReturnType<typeof possibleInstantsForBase>): void;
  overrideGetAutocompleteData(impl: (original: typeof getAutocompleteDataBase, ...args: Parameters<typeof getAutocompleteDataBase>) => ReturnType<typeof getAutocompleteDataBase>): void;
  overrideGetHoverDocs(impl: (original: typeof getHoverDocsBase, ...args: Parameters<typeof getHoverDocsBase>) => ReturnType<typeof getHoverDocsBase>): void;
  overrideGetInlineDiagnostics(impl: (original: typeof getInlineDiagnosticsBase, ...args: Parameters<typeof getInlineDiagnosticsBase>) => ReturnType<typeof getInlineDiagnosticsBase>): void;
  overridePreviewFormat(impl: (original: typeof previewFormatBase, ...args: Parameters<typeof previewFormatBase>) => ReturnType<typeof previewFormatBase>): void;
  overrideGetDocUrl(impl: (original: typeof getDocUrlBase, ...args: Parameters<typeof getDocUrlBase>) => ReturnType<typeof getDocUrlBase>): void;
  overrideTranslateDateFnsFormatString(impl: (original: typeof translateDateFnsFormatStringBase, ...args: Parameters<typeof translateDateFnsFormatStringBase>) => ReturnType<typeof translateDateFnsFormatStringBase>): void;
}

// `modName` is threaded through so a conflict error can name which mod
// owns an existing override, and which mod's overrideFormat()/
// overrideParse() call is the one being rejected — buildModContext()
// alone has no way to know who's calling it, only the loader does.
export function buildModContextFor(modName: string): ModContext {
  return {
    registerLocale,
    registerLocaleVocab,
    registerRelativeGrammar,
    createFormatter,
    createHolidayCalendar,
    overrideFormat(impl) {
      const original = getFormatImpl();
      setFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideParse(impl) {
      const original = getParseImpl();
      setParseOverride((...args) => impl(original, ...args), modName);
    },
    overrideCompileFormat(impl) {
      const original = getCompileFormatImpl();
      setCompileFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideCompileParser(impl) {
      const original = getCompileParserImpl();
      setCompileParserOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseRelative(impl) {
      const original = getParseRelativeImpl();
      setParseRelativeOverride((...args) => impl(original, ...args), modName);
    },
    overrideExplainFormat(impl) {
      const original = getExplainFormatImpl();
      setExplainFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideTokenizeFormat(impl) {
      const original = getTokenizeFormatImpl();
      setTokenizeFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideListTokens(impl) {
      const original = getListTokensImpl();
      setListTokensOverride((...args) => impl(original, ...args), modName);
    },
    overrideTokenInfo(impl) {
      const original = getTokenInfoImpl();
      setTokenInfoOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsValidFormat(impl) {
      const original = getIsValidFormatImpl();
      setIsValidFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideValidateFormat(impl) {
      const original = getValidateFormatImpl();
      setValidateFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideFieldForToken(impl) {
      const original = getFieldForTokenImpl();
      setFieldForTokenOverride((...args) => impl(original, ...args), modName);
    },
    overrideMonthsInYear(impl) {
      const original = getMonthsInYearImpl();
      setMonthsInYearOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsLeapYear(impl) {
      const original = getIsLeapYearImpl();
      setIsLeapYearOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsLeapMonth(impl) {
      const original = getIsLeapMonthImpl();
      setIsLeapMonthOverride((...args) => impl(original, ...args), modName);
    },
    overrideWeekOfYear(impl) {
      const original = getWeekOfYearImpl();
      setWeekOfYearOverride((...args) => impl(original, ...args), modName);
    },
    overrideWeekYear(impl) {
      const original = getWeekYearImpl();
      setWeekYearOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetMonth(impl) {
      const original = getGetMonthImpl();
      setGetMonthOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetWeekday(impl) {
      const original = getGetWeekdayImpl();
      setGetWeekdayOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsEqual(impl) {
      const original = getIsEqualImpl();
      setIsEqualOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsBefore(impl) {
      const original = getIsBeforeImpl();
      setIsBeforeOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsAfter(impl) {
      const original = getIsAfterImpl();
      setIsAfterOverride((...args) => impl(original, ...args), modName);
    },
    overrideClamp(impl) {
      const original = getClampImpl();
      setClampOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsBetween(impl) {
      const original = getIsBetweenImpl();
      setIsBetweenOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsToday(impl) {
      const original = getIsTodayImpl();
      setIsTodayOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsTomorrow(impl) {
      const original = getIsTomorrowImpl();
      setIsTomorrowOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsYesterday(impl) {
      const original = getIsYesterdayImpl();
      setIsYesterdayOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsSameDay(impl) {
      const original = getIsSameDayImpl();
      setIsSameDayOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsSameWeek(impl) {
      const original = getIsSameWeekImpl();
      setIsSameWeekOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsSameMonth(impl) {
      const original = getIsSameMonthImpl();
      setIsSameMonthOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsSameQuarter(impl) {
      const original = getIsSameQuarterImpl();
      setIsSameQuarterOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsSameYear(impl) {
      const original = getIsSameYearImpl();
      setIsSameYearOverride((...args) => impl(original, ...args), modName);
    },
    overrideIsWeekday(impl) {
      const original = getIsWeekdayImpl();
      setIsWeekdayOverride((...args) => impl(original, ...args), modName);
    },
    overrideFloor(impl) {
      const original = getFloorImpl();
      setFloorOverride((...args) => impl(original, ...args), modName);
    },
    overrideCeil(impl) {
      const original = getCeilImpl();
      setCeilOverride((...args) => impl(original, ...args), modName);
    },
    overrideTruncate(impl) {
      const original = getTruncateImpl();
      setTruncateOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseRFC3339(impl) {
      const original = getParseRFC3339Impl();
      setParseRFC3339Override((...args) => impl(original, ...args), modName);
    },
    overrideFormatRFC3339(impl) {
      const original = getFormatRFC3339Impl();
      setFormatRFC3339Override((...args) => impl(original, ...args), modName);
    },
    overrideParseRFC2822(impl) {
      const original = getParseRFC2822Impl();
      setParseRFC2822Override((...args) => impl(original, ...args), modName);
    },
    overrideParseHTTPDate(impl) {
      const original = getParseHTTPDateImpl();
      setParseHTTPDateOverride((...args) => impl(original, ...args), modName);
    },
    overrideFromUnixMicroseconds(impl) {
      const original = getFromUnixMicrosecondsImpl();
      setFromUnixMicrosecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideFromUnixNanoseconds(impl) {
      const original = getFromUnixNanosecondsImpl();
      setFromUnixNanosecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideToUnixSeconds(impl) {
      const original = getToUnixSecondsImpl();
      setToUnixSecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideToUnixMilliseconds(impl) {
      const original = getToUnixMillisecondsImpl();
      setToUnixMillisecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideToUnixMicroseconds(impl) {
      const original = getToUnixMicrosecondsImpl();
      setToUnixMicrosecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideToUnixNanoseconds(impl) {
      const original = getToUnixNanosecondsImpl();
      setToUnixNanosecondsOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseSQL(impl) {
      const original = getParseSQLImpl();
      setParseSQLOverride((...args) => impl(original, ...args), modName);
    },
    overrideFormatSQL(impl) {
      const original = getFormatSQLImpl();
      setFormatSQLOverride((...args) => impl(original, ...args), modName);
    },
    overrideFormatDurationToParts(impl) {
      const original = getFormatDurationToPartsImpl();
      setFormatDurationToPartsOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseDuration(impl) {
      const original = getParseDurationImpl();
      setParseDurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseISODuration(impl) {
      const original = getParseISODurationImpl();
      setParseISODurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideFormatISODuration(impl) {
      const original = getFormatISODurationImpl();
      setFormatISODurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideBalanceDuration(impl) {
      const original = getBalanceDurationImpl();
      setBalanceDurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideCompareDuration(impl) {
      const original = getCompareDurationImpl();
      setCompareDurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideSubtractDuration(impl) {
      const original = getSubtractDurationImpl();
      setSubtractDurationOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetLocale(impl) {
      const original = getGetLocaleImpl();
      setGetLocaleOverride((...args) => impl(original, ...args), modName);
    },
    overrideHasLocale(impl) {
      const original = getHasLocaleImpl();
      setHasLocaleOverride((...args) => impl(original, ...args), modName);
    },
    overrideCreateConfig(impl) {
      const original = getCreateConfigImpl();
      setCreateConfigOverride((...args) => impl(original, ...args), modName);
    },
    overrideMergeWithConfig(impl) {
      const original = getMergeWithConfigImpl();
      setMergeWithConfigOverride((...args) => impl(original, ...args), modName);
    },
    overrideListRegisteredGrammars(impl) {
      const original = getListRegisteredGrammarsImpl();
      setListRegisteredGrammarsOverride((...args) => impl(original, ...args), modName);
    },
    overrideInterval(impl) {
      const original = getIntervalImpl();
      setIntervalOverride((...args) => impl(original, ...args), modName);
    },
    overrideOverlaps(impl) {
      const original = getOverlapsImpl();
      setOverlapsOverride((...args) => impl(original, ...args), modName);
    },
    overrideIntersection(impl) {
      const original = getIntersectionImpl();
      setIntersectionOverride((...args) => impl(original, ...args), modName);
    },
    overrideUnion(impl) {
      const original = getUnionImpl();
      setUnionOverride((...args) => impl(original, ...args), modName);
    },
    overrideMergeIntervals(impl) {
      const original = getMergeIntervalsImpl();
      setMergeIntervalsOverride((...args) => impl(original, ...args), modName);
    },
    overrideFormatRangeToParts(impl) {
      const original = getFormatRangeToPartsImpl();
      setFormatRangeToPartsOverride((...args) => impl(original, ...args), modName);
    },
    overrideBetween(impl) {
      const original = getBetweenImpl();
      setBetweenOverride((...args) => impl(original, ...args), modName);
    },
    overrideParseRRule(impl) {
      const original = getParseRRuleImpl();
      setParseRRuleOverride((...args) => impl(original, ...args), modName);
    },
    overrideFormatRRule(impl) {
      const original = getFormatRRuleImpl();
      setFormatRRuleOverride((...args) => impl(original, ...args), modName);
    },
    overrideCreateBusinessCalendar(impl) {
      const original = getCreateBusinessCalendarImpl();
      setCreateBusinessCalendarOverride((...args) => impl(original, ...args), modName);
    },
    overrideSubtractBusinessDays(impl) {
      const original = getSubtractBusinessDaysImpl();
      setSubtractBusinessDaysOverride((...args) => impl(original, ...args), modName);
    },
    overrideNextHoliday(impl) {
      const original = getNextHolidayImpl();
      setNextHolidayOverride((...args) => impl(original, ...args), modName);
    },
    overridePreviousHoliday(impl) {
      const original = getPreviousHolidayImpl();
      setPreviousHolidayOverride((...args) => impl(original, ...args), modName);
    },
    overrideResolveZoned(impl) {
      const original = getResolveZonedImpl();
      setResolveZonedOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetNextTransition(impl) {
      const original = getGetNextTransitionImpl();
      setGetNextTransitionOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetPreviousTransition(impl) {
      const original = getGetPreviousTransitionImpl();
      setGetPreviousTransitionOverride((...args) => impl(original, ...args), modName);
    },
    overridePossibleInstantsFor(impl) {
      const original = getPossibleInstantsForImpl();
      setPossibleInstantsForOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetAutocompleteData(impl) {
      const original = getGetAutocompleteDataImpl();
      setGetAutocompleteDataOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetHoverDocs(impl) {
      const original = getGetHoverDocsImpl();
      setGetHoverDocsOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetInlineDiagnostics(impl) {
      const original = getGetInlineDiagnosticsImpl();
      setGetInlineDiagnosticsOverride((...args) => impl(original, ...args), modName);
    },
    overridePreviewFormat(impl) {
      const original = getPreviewFormatImpl();
      setPreviewFormatOverride((...args) => impl(original, ...args), modName);
    },
    overrideGetDocUrl(impl) {
      const original = getGetDocUrlImpl();
      setGetDocUrlOverride((...args) => impl(original, ...args), modName);
    },
    overrideTranslateDateFnsFormatString(impl) {
      const original = getTranslateDateFnsFormatStringImpl();
      setTranslateDateFnsFormatStringOverride((...args) => impl(original, ...args), modName);
    },
  };
}

// Convenience for callers that don't need per-mod attribution on
// override conflicts (tests, ad-hoc scripts) — same behavior, generic
// owner name.
export function buildModContext(): ModContext {
  return buildModContextFor('(unattributed)');
}

export interface ModRegistrationKey {
  // which ModContext method was called
  kind: 'locale' | 'localeVocab' | 'relativeGrammar' | 'formatterTokens' | 'overrideFormat' | 'overrideParse';
  // the locale tag, grammar language, custom token name, or (for the two
  // override kinds) just the literal string 'format'/'parse' — there's
  // only one of each to conflict on, unlike the keyed registrations above
  key: string;
}

// Wraps a ModContext so the loader can tell which mod touched which
// registration key — a locale tag, a relative-grammar language, a custom
// token name, or the format/parse override point. Registration itself
// stays last-write-wins (unchanged behavior for every other caller of
// registerLocale/etc.); this only exists to let the loader report "mods
// A and B both registered locale 'fr-CA'" as a conflict, since silently
// overwriting a mod's locale with another mod's locale is exactly the
// kind of thing a mod author needs to know happened, even though the
// registration functions themselves have no opinion on it.
//
// overrideFormat/overrideParse are different from the rest: they don't
// silently overwrite on conflict, setFormatOverride/setParseOverride
// throw OverrideConflictError immediately (see runtime.ts) rather than
// letting the loader discover a collision after the fact. They're
// tracked here anyway so a successful override still shows up in the
// load report the same way a successful locale registration does.
export function buildTrackedModContext(modName: string, onRegister: (key: ModRegistrationKey) => void): ModContext {
  const base = buildModContextFor(modName);
  return {
    // Everything not called out below (all 81 zero-fan-out override
    // points from runtime.ts, plus createHolidayCalendar) passes through
    // untracked — see the comment on createHolidayCalendar's own case
    // above for why untracked is correct for it, and generate.mjs for
    // why we don't hand-list 81 identical `overrideXxx(impl) { base.
    // overrideXxx(impl); onRegister(...) }` pass-throughs here: none of
    // them have a shared key two mods could conflict on the way a locale
    // tag or token name does, so there's nothing meaningful to track.
    ...base,
    registerLocale(locale, vocab) {
      onRegister({ kind: 'locale', key: locale });
      base.registerLocale(locale, vocab);
    },
    registerLocaleVocab(locale, vocab) {
      onRegister({ kind: 'localeVocab', key: locale });
      base.registerLocaleVocab(locale, vocab);
    },
    registerRelativeGrammar(grammar) {
      onRegister({ kind: 'relativeGrammar', key: grammar.language });
      base.registerRelativeGrammar(grammar);
    },
    createFormatter(options) {
      for (const token of options?.tokens ?? []) {
        onRegister({ kind: 'formatterTokens', key: token.name });
      }
      return base.createFormatter(options);
    },
    createHolidayCalendar(specs) {
      // Not tracked: createHolidayCalendar returns a fresh, unshared
      // HolidayCalendar rather than registering into global state, so two
      // mods calling it can never collide with each other the way a
      // locale-tag or token-name registration can — there's no shared key
      // to conflict on.
      return base.createHolidayCalendar(specs);
    },
    overrideFormat(impl) {
      base.overrideFormat(impl); // throws OverrideConflictError before onRegister if already taken
      onRegister({ kind: 'overrideFormat', key: 'format' });
    },
    overrideParse(impl) {
      base.overrideParse(impl);
      onRegister({ kind: 'overrideParse', key: 'parse' });
    },
  };
}

export interface Mod {
  name: string;
  // shown in the loader's report, otherwise unused — mods aren't
  // version-checked against the host library right now
  version?: string;
  // other mods' `name` fields that must load (and register) before this
  // one. missing or circular dependencies fail just this mod, not the
  // whole batch — see scripts/loadMods.mjs
  requires?: string[];
  // load-order tiebreak within the same dependency layer. higher loads
  // later, so a higher-priority mod's registrations win over a
  // lower-priority one's on the same key (locale tag, token name, etc —
  // registration itself is already last-write-wins, priority just makes
  // "which write is last" something a mod author can control instead of
  // leaving it to alphabetical filename order). defaults to 0.
  priority?: number;
  // Resolved user settings, or {} if this mod declared no config schema
  // (or can't — a loose .mjs mod has no manifest to declare one in;
  // only a .tfmod's mod.json can). Untyped here on purpose: the shape
  // comes from mod.json's "config" array, which is data the loader
  // reads at runtime, not something this type-level interface can see.
  // A mod author who wants real types for their own settings should
  // declare their own interface and cast, the same way they'd type
  // anything else sourced from JSON.
  register(ctx: ModContext, config: Record<string, unknown>): void | Promise<void>;
}

export function isMod(value: unknown): value is Mod {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.length === 0) return false;
  if (typeof v.register !== 'function') return false;
  if (v.requires !== undefined && !(Array.isArray(v.requires) && v.requires.every((r) => typeof r === 'string'))) return false;
  if (v.priority !== undefined && typeof v.priority !== 'number') return false;
  return true;
}
