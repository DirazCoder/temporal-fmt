// Structured error classes for parse()/format() failures.
//
// As of 0.9.0, every throw site on the parse/format data path —
// tokenize.ts, pattern.ts, format.ts, parse.ts (parse/safeParse/tryParse/
// parseToParts/compileParser), and the two data-path throws in
// localeVocab.ts (partValue/assertNoCollision on the getLocaleVocab side)
// — throws these typed classes directly instead of plain
// `new Error(message)`. Every migrated site kept its exact pre-0.9.0
// message text — subclasses of TemporalFmtError still satisfy
// `instanceof Error` and message-matching regexes (e.g.
// `/token "HH" requires/`), so this was safe to do without a semver-major
// bump for either check. What *is* a breaking change for 0.9.0: code that
// specifically checked `err.constructor === Error` or `err.name ===
// 'Error'` will see a different name now (e.g. 'FormatSyntaxError'). See
// the 0.9.0 changelog entry.
//
// Not migrated, on purpose:
//  - localeVocab.ts's registration-time throws (assertValidVocab,
//    registerLocaleVocab itself) — these are config-time API-misuse
//    errors on data the developer supplies once at startup, not runtime
//    parse/format failures, so they don't fit this module's
//    TemporalFmtErrorCode taxonomy as-is. assertNoCollision is shared
//    between the registration path and the data path (getLocaleVocab), so
//    its throw stays plain `Error` for both until that split is done —
//    see the tracking note at its call site.
//
// wrapUntypedError() below still exists for localeVocab.ts's registration
// throws and for anything a caller passes into safeParse()/tryParse() from
// outside this package. On the data path, safeParse's `if (err instanceof
// TemporalFmtError) return { ok: false, error: err }` now catches every
// throw before it would reach the classifier, so the regex branches here
// are effectively dead for parse/format/tokenize/pattern — left in place
// as the fallback for anything not yet on a typed throw site.

export type TemporalFmtErrorCode =
  | 'FORMAT_SYNTAX_ERROR'
  | 'UNKNOWN_TOKEN'
  | 'PARSE_MISMATCH'
  | 'INVALID_DATE'
  | 'INVALID_TIME'
  | 'INVALID_OFFSET'
  | 'INVALID_TIME_ZONE'
  | 'INVALID_CALENDAR'
  | 'AMBIGUOUS_INPUT'
  | 'INVALID_LOCALE'
  | 'INVALID_DURATION';

export interface TemporalFmtErrorFields {
  code: TemporalFmtErrorCode;
  input?: string;
  format?: string;
  token?: string;
  position?: number;
  expected?: string;
  actual?: string;
  reason?: string;
}

// Base class. `message` is the human-readable summary; the structured
// fields are the machine-readable parts a linter or codemod reports on.
// `Error.captureStackTrace` is called manually (where available) so
// the stack points at the call site, not at this constructor — same
// pattern Node uses for its own error classes.
export class TemporalFmtError extends Error {
  readonly code: TemporalFmtErrorCode;
  readonly input?: string;
  readonly format?: string;
  readonly token?: string;
  readonly position?: number;
  readonly expected?: string;
  readonly actual?: string;
  readonly reason?: string;

  constructor(message: string, fields: TemporalFmtErrorFields) {
    super(message);
    this.name = 'TemporalFmtError';
    this.code = fields.code;
    this.input = fields.input;
    this.format = fields.format;
    this.token = fields.token;
    this.position = fields.position;
    this.expected = fields.expected;
    this.actual = fields.actual;
    this.reason = fields.reason;
    // Avoid setting the stack to point at this constructor — keeps it
    // useful. captureStackTrace is V8-only; on other engines the
    // default stack (this constructor line) is what callers get.
    const capture = (Error as unknown as { captureStackTrace?: (target: Error, ctor?: Function) => void }).captureStackTrace;
    if (typeof capture === 'function') {
      capture(this, this.constructor);
    }
  }

  // Lets callers do `err.toJSON()` for logging. Plain `Error` doesn't
  // serialize its non-enumerable fields; this picks them up explicitly.
  toJSON(): TemporalFmtErrorFields & { name: string; message: string } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      input: this.input,
      format: this.format,
      token: this.token,
      position: this.position,
      expected: this.expected,
      actual: this.actual,
      reason: this.reason,
    };
  }
}

// Each subclass fixes `code` so callers can switch on it without
// re-checking message text. The constructor takes only the fields
// that vary per call; `code` and a default `message` template are
// provided by the subclass.

export class FormatSyntaxError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `format string "${fields.format ?? ''}" has a syntax error${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'FORMAT_SYNTAX_ERROR', ...rest },
    );
    this.name = 'FormatSyntaxError';
  }
}

export class UnknownTokenError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `token "${fields.token ?? ''}" is not a recognized temporal-fmt token${fields.format ? ` in format string "${fields.format}"` : ''}.`,
      { code: 'UNKNOWN_TOKEN', ...rest },
    );
    this.name = 'UnknownTokenError';
  }
}

export class ParseMismatchError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `input "${fields.input ?? ''}" does not match format "${fields.format ?? ''}"${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'PARSE_MISMATCH', ...rest },
    );
    this.name = 'ParseMismatchError';
  }
}

export class InvalidDateError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `input "${fields.input ?? ''}" does not describe a valid date${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_DATE', ...rest },
    );
    this.name = 'InvalidDateError';
  }
}

/* c8 ignore start @preserve -- InvalidTimeError is part of the public
   error-class surface (exported from index.ts, code 'INVALID_TIME')
   but nothing in this package constructs one. Investigated wiring it
   in the same way InvalidTimeZoneError was just wired (see parse.ts's
   zzz-validation loop): checked whether hour/minute/second have a
   post-match semantic range check the way zone ids do. They don't —
   pattern.ts's regex fragments for HH/H/hh/h/mm/m/ss/s already enforce
   their valid ranges at the regex level (e.g. HH is '(?:[01]\d|2[0-3])',
   which can't match "99" in the first place), so an out-of-range time
   is rejected as a plain shape mismatch before any semantic check
   could run. There's no live gap to hook this into without inventing a
   redundant check purely to give this class a body. Left unconstructed
   until the library actually has a real invalid-time case to report. */
export class InvalidTimeError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `input "${fields.input ?? ''}" does not describe a valid time${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_TIME', ...rest },
    );
    this.name = 'InvalidTimeError';
  }
}
/* c8 ignore stop @preserve */

export class InvalidOffsetError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `offset "${fields.actual ?? ''}" is invalid${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_OFFSET', ...rest },
    );
    this.name = 'InvalidOffsetError';
  }
}

export class InvalidTimeZoneError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `time zone "${fields.actual ?? ''}" is not a recognized IANA time zone or fixed offset${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_TIME_ZONE', ...rest },
    );
    this.name = 'InvalidTimeZoneError';
  }
}

/* c8 ignore start @preserve -- InvalidCalendarError is part of the
   public error-class surface (exported from index.ts, code
   'INVALID_CALENDAR') but nothing in this package constructs one.
   Checked for a wiring opportunity the same way InvalidTimeZoneError
   got one: there's no user-supplied calendar identifier anywhere in
   the library to validate against a supported list. resolveCalendar()
   in parse.ts derives the calendar entirely from Intl's own resolution
   of the locale string — it's never handed an arbitrary "calendar"
   value a caller could get wrong. There's no live input to reject.
   Left unconstructed until the library actually accepts a calendar
   parameter that could be invalid. */
export class InvalidCalendarError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `calendar "${fields.actual ?? ''}" is not supported${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_CALENDAR', ...rest },
    );
    this.name = 'InvalidCalendarError';
  }
}
/* c8 ignore stop @preserve */

export class AmbiguousInputError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `input "${fields.input ?? ''}" is ambiguous${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'AMBIGUOUS_INPUT', ...rest },
    );
    this.name = 'AmbiguousInputError';
  }
}

export class InvalidLocaleError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `locale "${fields.actual ?? ''}" is not a valid BCP-47 tag${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_LOCALE', ...rest },
    );
    this.name = 'InvalidLocaleError';
  }
}

export class InvalidDurationError extends TemporalFmtError {
  constructor(fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string }) {
    const { message, ...rest } = fields;
    super(
      message ?? `duration is invalid${fields.reason ? `: ${fields.reason}` : ''}.`,
      { code: 'INVALID_DURATION', ...rest },
    );
    this.name = 'InvalidDurationError';
  }
}

// Wraps a plain Error thrown from a code path that hasn't been
// migrated to typed errors yet. Carries the original message in
// `reason` so callers reading the typed surface still see what
// failed. Used by safeParse() in parse.ts.
//
// As of the 0.9.0 migration, every throw site on the parse/format data
// path throws a TemporalFmtError directly, so safeParse's `instanceof
// TemporalFmtError` check always passes before this function would be
// called — nothing in the current test suite reaches any branch below.
// Kept as the safety net for wrapping a future unmigrated throw site
// (see the c8-ignored call in parse.ts's safeParse), same reasoning as
// that call site: removing this would silently drop the "safeParse
// always returns a TemporalFmtError" contract the moment anyone adds a
// throw new Error(...) without wiring a typed class for it.
/* c8 ignore start @preserve -- unreachable from the current test suite,
   see rationale above */
export function wrapUntypedError(err: Error, context: { input?: string; format?: string }): TemporalFmtError {
  // Try to classify by inspecting the message — covers the existing
  // parse()/format() throw sites without modifying them. Anything
  // that doesn't match a known pattern falls through to a generic
  // ParseMismatchError, which still has the structured fields.
  const msg = err.message;
  if (/unknown token|isn't a recognized token/.test(msg)) {
    return new UnknownTokenError({ input: context.input, format: context.format, reason: msg });
  }
  if (/ambiguous/i.test(msg)) {
    return new AmbiguousInputError({ input: context.input, format: context.format, reason: msg });
  }
  if (/offset/.test(msg) && /out of range|exceeds|doesn't match the shape/i.test(msg)) {
    return new InvalidOffsetError({ input: context.input, format: context.format, reason: msg });
  }
  if (/no valid pattern matches/i.test(msg)) {
    return new ParseMismatchError({ input: context.input, format: context.format, reason: msg });
  }
  if (/doesn't describe a valid date\/time|incomplete date|weekday token|quarter token/.test(msg)) {
    return new InvalidDateError({ input: context.input, format: context.format, reason: msg });
  }
  const lowerMsg = msg.toLowerCase();
  const mentionsLocale = lowerMsg.includes('locale');
  if (
    (mentionsLocale && (lowerMsg.includes('produced no') || lowerMsg.includes('not a valid'))) ||
    lowerMsg.includes('cutoffs must be')
  ) {
    return new InvalidLocaleError({ input: context.input, format: context.format, reason: msg });
  }
  if (/format string exceeds maximum length|input exceeds maximum length|unterminated quote|isn't a recognized token/i.test(msg)) {
    return new FormatSyntaxError({ input: context.input, format: context.format, reason: msg });
  }
  return new ParseMismatchError({ input: context.input, format: context.format, reason: msg });
}
/* c8 ignore stop @preserve */