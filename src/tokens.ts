// Pad a number with leading zeros to `len` digits.
export function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

// Minimal duck-typed shape covering every field we might read off a Temporal
// object. Not every field exists on every type (PlainDate has no .hour, for
// example) — callers check for undefined before formatting a token.
export interface TemporalLike {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  timeZoneId?: string;
  dayOfWeek?: number; // 1 (Mon) - 7 (Sun), per Temporal spec
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Each token renders itself from a TemporalLike. The third tuple element
// below names the field it depends on, so format.ts can check for undefined
// before calling the handler (e.g. `HH` needs `.hour`, which PlainDate lacks).
type TokenHandler = (t: TemporalLike) => string;

// Longest tokens first — the tokenizer is greedy, so "yyyy" must be tried
// before "yy" or it'll never match.
export const TOKENS: Array<[string, TokenHandler, keyof TemporalLike]> = [
  ['yyyy', (t) => pad(t.year!, 4), 'year'],
  ['yy', (t) => pad(t.year! % 100, 2), 'year'],
  ['MMMM', (t) => MONTHS_LONG[t.month! - 1], 'month'],
  ['MMM', (t) => MONTHS_SHORT[t.month! - 1], 'month'],
  ['MM', (t) => pad(t.month!, 2), 'month'],
  ['M', (t) => String(t.month!), 'month'],
  ['dd', (t) => pad(t.day!, 2), 'day'],
  ['d', (t) => String(t.day!), 'day'],
  ['EEEE', (t) => DAYS_LONG[t.dayOfWeek! - 1], 'dayOfWeek'],
  ['EEE', (t) => DAYS_SHORT[t.dayOfWeek! - 1], 'dayOfWeek'],
  ['HH', (t) => pad(t.hour!, 2), 'hour'],
  ['H', (t) => String(t.hour!), 'hour'],
  ['hh', (t) => pad(t.hour! % 12 || 12, 2), 'hour'],
  ['h', (t) => String(t.hour! % 12 || 12), 'hour'],
  ['mm', (t) => pad(t.minute!, 2), 'minute'],
  ['m', (t) => String(t.minute!), 'minute'],
  ['ss', (t) => pad(t.second!, 2), 'second'],
  ['s', (t) => String(t.second!), 'second'],
  ['SSS', (t) => pad(t.millisecond!, 3), 'millisecond'],
  ['a', (t) => (t.hour! < 12 ? 'AM' : 'PM'), 'hour'],
  ['zzz', (t) => t.timeZoneId!, 'timeZoneId'],
];