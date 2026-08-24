// relative time stuff. formatDistance() over in formatDistance.ts is
// still the main one, this just adds formatRelative() / formatRelativeToNow()
// on top.
//
// the difference between these that keeps tripping people up:
//   formatDistance(date1, date2) -> "3 days ago" / "in 2 hours"
//     just describes the gap, hands unit picking + pluralization off to Intl
//   formatRelative(date, baseDate) -> "yesterday" / "tomorrow" / "today" /
//     "in 3 days" / "last week"
//     this one's calendar-relative, not ms-based. so "in 1 day" always means
//     tomorrow even if it's technically only 23 hours from now
//   formatRelativeToNow(date) -> literally just formatRelative(date, now)

import { differenceInDays } from './arithmetic.js';
import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';
import { normalizeLocaleTag } from './localeVocab.js';
import { InvalidLocaleError } from './errors.js';

export interface FormatRelativeOptions extends FormatOptions {
  // 'auto' (default) — Intl picks natural stuff like "yesterday"/"tomorrow"
  // when it's ±1 or 0. 'always' forces the stricter "1 day ago" style always.
  numeric?: 'always' | 'auto';
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
const MAX_RTF_CACHE_SIZE = 100;

function getRtf(locale: string, numeric: 'always' | 'auto'): Intl.RelativeTimeFormat {
  // reusing the same cache shape formatDistance.ts already has
  const key = `${locale}|${numeric}`;
  let rtf = rtfCache.get(key);
  if (rtf) return rtf;
  if (rtfCache.size >= MAX_RTF_CACHE_SIZE) {
    const oldestKey = rtfCache.keys().next().value;
    if (oldestKey !== undefined) rtfCache.delete(oldestKey);
  }
  try {
    rtf = new Intl.RelativeTimeFormat(normalizeLocaleTag(locale), { numeric });
  } catch (err) {
    // bad locale tags just throw a plain RangeError from Intl, wrap it in
    // our own error type instead. every failure here IS a RangeError anyway
    // so we're not losing anything by converting unconditionally — the
    // original message still comes through in `reason`
    throw new InvalidLocaleError({ actual: locale, reason: (err as Error).message });
  }
  rtfCache.set(key, rtf);
  return rtf;
}

// describes date1 as if you were standing at date2. uses differenceInDays
// (counts calendar boundaries, not literal 24hr chunks) so something like
// "2026-08-04 23:59" vs "2026-08-05 00:00" correctly says "yesterday",
// not "1 second ago" which would be technically true but useless
//
// differenceInDays(a, b) gives b - a, but we want date1 - date2 here so
// positive = future relative to date2. hence the argument swap below
export function formatRelative(
  date1: unknown,
  date2: unknown,
  options: FormatRelativeOptions = {},
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const numeric = options.numeric ?? 'auto';
  const rtf = getRtf(locale, numeric);
  const dayDiff = -differenceInDays(date1, date2);
  const absDays = Math.abs(dayDiff);

  if (absDays === 0) {
    return rtf.format(0, 'day'); // shows up as "now"
  }
  if (absDays < 7) {
    return rtf.format(dayDiff, 'day');
  }
  if (absDays < 30) {
    return rtf.format(-Math.trunc(-dayDiff / 7), 'week');
  }
  if (absDays < 365) {
    return rtf.format(-Math.trunc(-dayDiff / 30), 'month');
  }
  return rtf.format(-Math.trunc(-dayDiff / 365), 'year');
}

export function formatRelativeToNow(
  date: unknown,
  options: FormatRelativeOptions = {},
): string {
  // just uses whatever the system clock says right now as the reference
  const now = new Date();
  const nowFields = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
  return formatRelative(date, nowFields, options);
}
