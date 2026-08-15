# Version Support

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :x:                |
| < 0.6   | :x:                |

`0.8.x` is the current active line. New features, bug fixes, security fixes,
and parser hardening land here first.

`0.7.x` is still supported and is the previous maintained release line.
Bug fixes and security fixes continue to land there where they are
appropriate for the branch.

`0.6.x` is now end of life. It no longer receives bug fixes or security
fixes. Upgrade to `0.8.x` or `0.7.x` instead.

### Unsupported versions

Everything below `0.7.0` is unsupported.

| Version | Supported |
| ------- | --------- |
| 0.6.x   | :x:       |
| 0.5.x   | :x:       |
| 0.3.x   | :x:       |
| 0.2.x   | :x:       |
| 0.1.x   | :x:       |

These versions are no longer maintained. Upgrading is the fix.

## 0.8.0

`0.8.0` is the new active release line and includes parser and security
hardening.

Notable changes include:

- Ambiguous unpadded numeric token parsing no longer expands every possible
  split. Candidate exploration is bounded so deliberately ambiguous formats
  cannot cause combinatorial CPU or memory growth.
- `parse()` rejects excessively large input before attempting regex matching.
- Locale calendar detection now uses canonicalized `Intl.Locale` data instead
  of relying on the original locale string's casing or formatting.
- Timezone parsing supports fixed-offset Temporal timezone identifiers while
  continuing to reject identifiers that are not valid timezone strings.
- Extended and signed years supported by Temporal can be formatted and parsed
  without changing the existing `yyyy` token grammar.
- Cache keys no longer depend on ambiguous string concatenation.
- CI and release workflows no longer depend on floating GitHub Action versions
  or `npm@latest`.
- Regression tests cover the parser hardening and the affected Temporal edge
  cases.

The existing token grammar remains unchanged. In particular, `yyyy` still
requires exactly four digits, and repeated fields retain the established
last-occurrence behavior.

## Behavior changes relevant to upgrading

Several changes affect whether upgrading resolves something you might be
relying on:

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
- **`0.8.0`** — timezone parsing accepts valid fixed-offset Temporal timezone
  identifiers. Invalid timezone identifiers continue to fail during pattern
  matching.