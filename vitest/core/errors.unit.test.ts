import { describe, expect, it } from 'vitest';
import {
  TemporalFmtError,
  FormatSyntaxError,
  UnknownTokenError,
  ParseMismatchError,
  InvalidDateError,
  InvalidTimeError,
  InvalidOffsetError,
  InvalidTimeZoneError,
  InvalidCalendarError,
  AmbiguousInputError,
  InvalidLocaleError,
  InvalidDurationError,
  wrapUntypedError,
  type TemporalFmtErrorFields,
  type TemporalFmtErrorCode,
} from '../../src/core/errors.js';

describe('TemporalFmtError', () => {
  it('carries structured fields and serializes via toJSON', () => {
    const err = new TemporalFmtError('custom message', {
      code: 'PARSE_MISMATCH',
      input: 'in',
      format: 'fmt',
      reason: 'why',
    });
    expect(err.message).toBe('custom message');
    expect(err.code).toBe('PARSE_MISMATCH');
    expect(typeof err.toJSON).toBe('function');
    expect(err.toJSON()).toMatchObject({ code: 'PARSE_MISMATCH', input: 'in' });
  });
});

describe('FormatSyntaxError', () => {
  it('builds a default message from the given fields', () => {
    const err = new FormatSyntaxError({ format: 'xx', reason: 'bad' });
    expect(err.code).toBe('FORMAT_SYNTAX_ERROR');
    expect(err.message).toContain('xx');
    expect(err.message).toContain('bad');
    expect(err).toBeInstanceOf(TemporalFmtError);
  });
});

describe('TemporalFmtError: full field surface', () => {
  it('stores every structured field', () => {
    const err = new TemporalFmtError('boom', {
      code: 'UNKNOWN_TOKEN',
      input: 'in',
      format: 'fmt',
      token: 'QQ',
      position: 7,
      expected: 'yyyy',
      actual: 'QQ',
      reason: 'why',
    });
    expect(err.name).toBe('TemporalFmtError');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('UNKNOWN_TOKEN');
    expect(err.input).toBe('in');
    expect(err.format).toBe('fmt');
    expect(err.token).toBe('QQ');
    expect(err.position).toBe(7);
    expect(err.expected).toBe('yyyy');
    expect(err.actual).toBe('QQ');
    expect(err.reason).toBe('why');
    expect(err.toJSON()).toEqual({
      name: 'TemporalFmtError',
      message: 'boom',
      code: 'UNKNOWN_TOKEN',
      input: 'in',
      format: 'fmt',
      token: 'QQ',
      position: 7,
      expected: 'yyyy',
      actual: 'QQ',
      reason: 'why',
    });
  });

  it('serializes unset fields as undefined', () => {
    const err = new TemporalFmtError('bare', { code: 'INVALID_DATE' });
    expect(err.toJSON()).toEqual({
      name: 'TemporalFmtError',
      message: 'bare',
      code: 'INVALID_DATE',
      input: undefined,
      format: undefined,
      token: undefined,
      position: undefined,
      expected: undefined,
      actual: undefined,
      reason: undefined,
    });
  });

  it('skips captureStackTrace when the engine lacks it', () => {
    // branch: typeof capture === 'function' false arm (line 106)
    const holder = Error as unknown as { captureStackTrace?: unknown };
    const saved = holder.captureStackTrace;
    holder.captureStackTrace = undefined;
    try {
      const err = new TemporalFmtError('no capture', { code: 'INVALID_TIME' });
      expect(err.message).toBe('no capture');
      expect(err).toBeInstanceOf(Error);
    } finally {
      holder.captureStackTrace = saved;
    }
  });
});

// Every subclass: default message with no fields (right arms of every `??`
// and the else arm of the reason ternary), full fields + reason (left/then
// arms), and an explicit message override.
type SubclassCtor = new (
  fields: Omit<TemporalFmtErrorFields, 'code'> & { message?: string },
) => TemporalFmtError;

const SUBCLASSES: Array<{
  label: string;
  Ctor: SubclassCtor;
  name: string;
  code: TemporalFmtErrorCode;
  emptyMsg: string;
  fields: Omit<TemporalFmtErrorFields, 'code'>;
  fullMsg: string;
}> = [
  {
    label: 'FormatSyntaxError',
    Ctor: FormatSyntaxError,
    name: 'FormatSyntaxError',
    code: 'FORMAT_SYNTAX_ERROR',
    emptyMsg: 'format string "" has a syntax error.',
    fields: { format: 'yy-', reason: 'why' },
    fullMsg: 'format string "yy-" has a syntax error: why.',
  },
  {
    label: 'UnknownTokenError',
    Ctor: UnknownTokenError,
    name: 'UnknownTokenError',
    code: 'UNKNOWN_TOKEN',
    emptyMsg: 'token "" is not a recognized temporal-fmt token.',
    fields: { token: 'QQ', format: 'f', reason: 'why' },
    fullMsg: 'token "QQ" is not a recognized temporal-fmt token in format string "f".',
  },
  {
    label: 'ParseMismatchError',
    Ctor: ParseMismatchError,
    name: 'ParseMismatchError',
    code: 'PARSE_MISMATCH',
    emptyMsg: 'input "" does not match format "".',
    fields: { input: 'in', format: 'fmt', reason: 'why' },
    fullMsg: 'input "in" does not match format "fmt": why.',
  },
  {
    label: 'InvalidDateError',
    Ctor: InvalidDateError,
    name: 'InvalidDateError',
    code: 'INVALID_DATE',
    emptyMsg: 'input "" does not describe a valid date.',
    fields: { input: '2026-02-31', reason: 'why' },
    fullMsg: 'input "2026-02-31" does not describe a valid date: why.',
  },
  {
    label: 'InvalidTimeError',
    Ctor: InvalidTimeError,
    name: 'InvalidTimeError',
    code: 'INVALID_TIME',
    emptyMsg: 'input "" does not describe a valid time.',
    fields: { input: '25:61', reason: 'why' },
    fullMsg: 'input "25:61" does not describe a valid time: why.',
  },
  {
    label: 'InvalidOffsetError',
    Ctor: InvalidOffsetError,
    name: 'InvalidOffsetError',
    code: 'INVALID_OFFSET',
    emptyMsg: 'offset "" is invalid.',
    fields: { actual: '+99:99', reason: 'why' },
    fullMsg: 'offset "+99:99" is invalid: why.',
  },
  {
    label: 'InvalidTimeZoneError',
    Ctor: InvalidTimeZoneError,
    name: 'InvalidTimeZoneError',
    code: 'INVALID_TIME_ZONE',
    emptyMsg: 'time zone "" is not a recognized IANA time zone or fixed offset.',
    fields: { actual: 'Mars/Phobos', reason: 'why' },
    fullMsg: 'time zone "Mars/Phobos" is not a recognized IANA time zone or fixed offset: why.',
  },
  {
    label: 'InvalidCalendarError',
    Ctor: InvalidCalendarError,
    name: 'InvalidCalendarError',
    code: 'INVALID_CALENDAR',
    emptyMsg: 'calendar "" is not supported.',
    fields: { actual: 'sumerian', reason: 'why' },
    fullMsg: 'calendar "sumerian" is not supported: why.',
  },
  {
    label: 'AmbiguousInputError',
    Ctor: AmbiguousInputError,
    name: 'AmbiguousInputError',
    code: 'AMBIGUOUS_INPUT',
    emptyMsg: 'input "" is ambiguous.',
    fields: { input: '121', reason: 'why' },
    fullMsg: 'input "121" is ambiguous: why.',
  },
  {
    label: 'InvalidLocaleError',
    Ctor: InvalidLocaleError,
    name: 'InvalidLocaleError',
    code: 'INVALID_LOCALE',
    emptyMsg: 'locale "" is not a valid BCP-47 tag.',
    fields: { actual: 'not-a-tag', reason: 'why' },
    fullMsg: 'locale "not-a-tag" is not a valid BCP-47 tag: why.',
  },
  {
    label: 'InvalidDurationError',
    Ctor: InvalidDurationError,
    name: 'InvalidDurationError',
    code: 'INVALID_DURATION',
    emptyMsg: 'duration is invalid.',
    fields: { reason: 'why' },
    fullMsg: 'duration is invalid: why.',
  },
];

describe.each(SUBCLASSES)('$label', (spec) => {
  it('builds the default message when no fields are given', () => {
    const err = new spec.Ctor({});
    expect(err.name).toBe(spec.name);
    expect(err.code).toBe(spec.code);
    expect(err.message).toBe(spec.emptyMsg);
    expect(err).toBeInstanceOf(TemporalFmtError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(spec.Ctor);
    expect(err.toJSON()).toMatchObject({ name: spec.name, code: spec.code, message: spec.emptyMsg });
  });

  it('renders field values into the default message', () => {
    const err = new spec.Ctor({ ...spec.fields });
    expect(err.message).toBe(spec.fullMsg);
    expect(err.code).toBe(spec.code);
    // every field passed lands on the instance and in toJSON()
    expect(err.toJSON()).toMatchObject(spec.fields);
  });

  it('prefers an explicit message over the template', () => {
    const err = new spec.Ctor({ message: 'custom override' });
    expect(err.message).toBe('custom override');
    expect(err.code).toBe(spec.code);
    expect(err.name).toBe(spec.name);
  });
});

describe('wrapUntypedError', () => {
  const ctx = { input: 'in', format: 'fmt' };

  it('classifies unknown-token messages', () => {
    // first regex arm: "unknown token"
    const e1 = wrapUntypedError(new Error('unknown token "Q"'), ctx);
    expect(e1).toBeInstanceOf(UnknownTokenError);
    expect(e1.code).toBe('UNKNOWN_TOKEN');
    // first regex arm: "isn't a recognized token"
    const e2 = wrapUntypedError(new Error(`temporal-fmt: "QQQ" isn't a recognized token — did you mean "QQ"?`), ctx);
    expect(e2).toBeInstanceOf(UnknownTokenError);
  });

  it('classifies ambiguous messages', () => {
    const e = wrapUntypedError(new Error('input is ambiguous'), ctx);
    expect(e).toBeInstanceOf(AmbiguousInputError);
    expect(e.code).toBe('AMBIGUOUS_INPUT');
  });

  it('classifies out-of-range offsets', () => {
    expect(wrapUntypedError(new Error('offset +99:99 out of range'), ctx)).toBeInstanceOf(InvalidOffsetError);
    expect(wrapUntypedError(new Error("offset doesn't match the shape"), ctx)).toBeInstanceOf(InvalidOffsetError);
  });

  it('lets an offset mention that is not a range failure fall through', () => {
    // branch: /offset/ true but the second regex false
    expect(wrapUntypedError(new Error('offset something else'), ctx)).toBeInstanceOf(ParseMismatchError);
  });

  it('classifies no-valid-pattern messages as ParseMismatchError', () => {
    expect(wrapUntypedError(new Error('no valid pattern matches this input'), ctx)).toBeInstanceOf(ParseMismatchError);
  });

  it('classifies invalid-date messages', () => {
    expect(wrapUntypedError(new Error("input doesn't describe a valid date/time"), ctx)).toBeInstanceOf(InvalidDateError);
    expect(wrapUntypedError(new Error('incomplete date'), ctx)).toBeInstanceOf(InvalidDateError);
    expect(wrapUntypedError(new Error('weekday token missing'), ctx)).toBeInstanceOf(InvalidDateError);
    expect(wrapUntypedError(new Error('quarter token mismatch'), ctx)).toBeInstanceOf(InvalidDateError);
  });

  it('classifies locale failures', () => {
    // mentionsLocale + "produced no"
    expect(wrapUntypedError(new Error('locale produced no parts'), ctx)).toBeInstanceOf(InvalidLocaleError);
    // mentionsLocale + "not a valid"
    expect(wrapUntypedError(new Error('locale tag not a valid one'), ctx)).toBeInstanceOf(InvalidLocaleError);
    // mentionsLocale but neither marker -> falls through
    expect(wrapUntypedError(new Error('locale with neither marker'), ctx)).toBeInstanceOf(ParseMismatchError);
    // "cutoffs must be" without a locale mention
    expect(wrapUntypedError(new Error('cutoffs must be ascending'), ctx)).toBeInstanceOf(InvalidLocaleError);
    // mentionsLocale false inner, "cutoffs must be" true
    expect(wrapUntypedError(new Error('locale junk; cutoffs must be ascending'), ctx)).toBeInstanceOf(InvalidLocaleError);
  });

  it('classifies format-syntax failures', () => {
    expect(wrapUntypedError(new Error('format string exceeds maximum length of 1000'), ctx)).toBeInstanceOf(FormatSyntaxError);
    expect(wrapUntypedError(new Error('input exceeds maximum length'), ctx)).toBeInstanceOf(FormatSyntaxError);
    expect(wrapUntypedError(new Error('unterminated quote in format string "x"'), ctx)).toBeInstanceOf(FormatSyntaxError);
    // the case-insensitive "isn't a recognized token" alternative (the
    // lowercase spelling hits the unknown-token branch first)
    expect(wrapUntypedError(new Error("ISN'T A RECOGNIZED TOKEN"), ctx)).toBeInstanceOf(FormatSyntaxError);
  });

  it('falls back to ParseMismatchError and keeps context and reason', () => {
    const e = wrapUntypedError(new Error('mystery failure'), ctx);
    expect(e).toBeInstanceOf(ParseMismatchError);
    expect(e.code).toBe('PARSE_MISMATCH');
    expect(e.name).toBe('ParseMismatchError');
    expect(e.input).toBe('in');
    expect(e.format).toBe('fmt');
    expect(e.reason).toBe('mystery failure');
  });
});
