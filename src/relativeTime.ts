/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2026 DirazCoder
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// Relative time helpers. The existing formatDistance() in
// formatDistance.ts stays; this module adds formatRelative() and
// formatRelativeToNow().
//
// Semantic distinction:
//   formatDistance(date1, date2) — "3 days ago" / "in 2 hours"
//     Describes the gap between two values, delegating unit selection
//     and pluralization to Intl.RelativeTimeFormat.
//   formatRelative(date, baseDate) — "yesterday" / "tomorrow" / "today"
//     / "in 3 days" / "last week"
//     Calendar-relative: uses the calendar date diff, not the ms diff.
//     "in 1 day" means "tomorrow", even if it's 23 hours away.
//   formatRelativeToNow(date) — same as formatRelative(date, now)

import { differenceInDays } from './arithmetic.js';
import { DEFAULT_LOCALE, type FormatOptions } from './tokens.js';

export interface FormatRelativeOptions extends FormatOptions {
  // 'auto' (default) lets Intl.RelativeTimeFormat use natural forms like
  // "yesterday"/"tomorrow"/"now" when the value lands on ±1 or 0.
  // 'always' forces the strict "1 day ago"/"in 1 day" form.
  numeric?: 'always' | 'auto';
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
const MAX_RTF_CACHE_SIZE = 100;

function getRtf(locale: string, numeric: 'always' | 'auto'): Intl.RelativeTimeFormat {
  // Same cache shape as formatDistance.ts uses.
  const key = `${locale}|${numeric}`;
  let rtf = rtfCache.get(key);
  if (rtf) return rtf;
  if (rtfCache.size >= MAX_RTF_CACHE_SIZE) {
    const oldestKey = rtfCache.keys().next().value;
    if (oldestKey !== undefined) rtfCache.delete(oldestKey);
  }
  rtf = new Intl.RelativeTimeFormat(locale, { numeric });
  rtfCache.set(key, rtf);
  return rtf;
}

// Calendar-relative "describe date1 as if standing at date2" — uses
// differenceInDays (which counts date boundaries, not 24-hour periods),
// so "2026-08-04 23:59" relative to "2026-08-05 00:00" reads as
// "yesterday" (1 day ago), not "1 second ago".
//
// differenceInDays(a, b) returns b - a; for formatRelative(date1, date2)
// we want date1 - date2 (so positive means date1 is in the future relative
// to date2). Swap the argument order.
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
    return rtf.format(0, 'day'); // "now" / "in 0 days"
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
  // Use the system's current date as the reference. PlainDate.from a
  // JS Date so differenceInDays sees the right shape.
  const now = new Date();
  const nowFields = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
  return formatRelative(date, nowFields, options);
}
