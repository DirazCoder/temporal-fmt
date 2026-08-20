// Structured error classes for parse()/format() failures. The existing
// throw sites in parse.ts/format.ts/tokenize.ts/pattern.ts/localeVocab.ts
// all throw plain `new Error(message)` with descriptive strings, and
// existing tests assert on those strings — so this module does NOT
// retroactively migrate those sites. Migration would change error
// identity for any caller using `instanceof Error`, and would force
// every test that matches `/token "HH" requires/` to be rewritten.
//
// What this module does: provide typed error classes carrying
// `code/input/format/token/position/expected/actual/reason` fields, so
// safeParse()/tryParse() (which don't throw) can return rich diagnostics
// to callers who need them. The ESLint plugin and codemod will consume
// these via safeParse. The legacy throw-then-catch surface stays
// byte-identical to 0.8.x.

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
  if (/time ?zone/i.test(msg) && /no valid pattern/i.test(msg)) {
    return new InvalidTimeZoneError({ input: context.input, format: context.format, reason: msg });
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