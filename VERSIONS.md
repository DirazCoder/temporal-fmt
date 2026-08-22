# Version Support

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :x:                |
| < 0.6   | :x:                |

`0.8.x` is the current active release line. New features, bug fixes,
security fixes, and parser hardening land here first.

`0.7.x` is still supported and is the previous maintained release line.
Security fixes continue to land there where they are appropriate for the
branch.

`0.6.x` and everything before it is end of life and no longer receives
fixes. Upgrade to `0.8.x` or `0.7.x` instead.

## Breaking / behavior changes by version

Changes that affect whether upgrading resolves something you're relying
on, or that could change existing behavior:

- **`0.3.0`** — `format()` now throws on format strings over 1000
  characters, and `yy` now throws on negative years instead of silently
  truncating them.

- **`0.7.2`** — `parse()` now throws when a format string mixes a
  24-hour token (`HH`/`H`) with a 12-hour token (`hh`/`h`), instead of
  silently picking one.

- **`0.8.0`** — parser ambiguity handling is bounded to prevent
  combinatorial resource exhaustion. Oversized parse input is also rejected
  before regex processing. These changes can cause previously accepted
  attacker-controlled or pathological inputs to throw instead.

- **`0.8.0`** — timezone parsing accepts valid fixed-offset Temporal
  timezone identifiers. Invalid timezone identifiers continue to fail during
  pattern matching.

- **`0.8.3`** — `do`, `Q`, `QQQ`, `ww`, and `RRRR` add new formatting
  capabilities. The existing token grammar remains unchanged.

- **`0.8.3`** — `formatDuration()`, `formatDistance()`, and
  `parseRelative()` add new APIs without changing the existing
  `format()` and `parse()` call signatures.

- **`0.8.3`** — `parse()` remains strict by default. The new `lenient`
  option is opt-in, so existing calls without the option retain the
  previous ambiguity behavior.

- **`0.8.3`** — `QQQ` parsing cross-checks the parsed quarter against
  month/date information in the same format string and throws when those
  values disagree.

- **`0.8.3`** — `registerLocaleVocab()` validates vocabulary when it is
  registered, so malformed locale data may now throw earlier than it would
  have during a later format or parse operation.

- **`0.8.6`** — none. `formatDuration`, `parseRelative`, and
  `formatDistance` gained locale/cutoff options that are opt-in; every
  existing call without the new options is byte-identical to `0.8.5`.