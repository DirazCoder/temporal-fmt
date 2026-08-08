# Version Support

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :white_check_mark: (critical fixes only) |
| < 0.6   | :x:                |

`0.7.x` is the one actively getting new stuff — features and fixes land
there first. `0.6.x` only gets critical/security fixes, no new features.

`0.6.x` is also a change in policy, not just the next line in order. Every
version before it went straight to dead the moment the next one shipped —
no backport window, no fixes-only period, nothing. `0.6.x` is the first one
getting different treatment: once `0.7.x` (or whatever comes next) becomes
the active line, `0.6.x` drops to critical-fixes-only instead of dying
immediately. That's new going forward, not something applied backwards to
older lines.

### Unsupported versions

Everything below `0.6.0` is dead — no fixes, security or otherwise, land on
these no matter how many people are still on them. Each one went EOL the
moment the version right after it came out.

| Version | Supported |
| ------- | --------- |
| 0.5.x   | :x:       |
| 0.3.x   | :x:       |
| 0.2.x   | :x:       |
| 0.1.x   | :x:       |

These predate the backport policy, so upgrading — not a backport — is the
fix if you're on one of these.

## Behavior changes relevant to upgrading

Two changes in the version history affect whether upgrading actually fixes
something you might be relying on — noting them here since "should I
upgrade" is often a security-adjacent question:

- **`0.3.0`** — `format()` now throws on format strings over 1000
  characters, and `yy` now throws on negative years instead of silently
  truncating them (a negative year truncated to two digits was
  indistinguishable from a positive one). If you're catching all errors
  from `format()` generically, these are new throw paths to be aware of.
- **`0.7.2`** — `parse()` now throws when a format string mixes a
  24-hour token (`HH`/`H`) with a 12-hour token (`hh`/`h`), instead of
  silently picking one. **This has not been backported to `0.6.x`** — if
  you're on `0.6.x` and calling `parse()` with a format string that mixes
  those tokens, it'll still silently mispick the hour rather than error.
  Upgrading to `0.7.x` is the only way to get the throw.
