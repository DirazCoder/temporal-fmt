# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :white_check_mark: (critical fixes only) |
| < 0.6   | :x:                |

`0.7.x` is the actively developed line — new features and fixes land there
first. `0.6.x` is kept alive as a backport line for people who can't yet
upgrade; it only receives critical/security fixes, not new features. Once
`0.6.x` no longer has real users depending on it, it'll be dropped from this
table, same as any future old line will be dropped once its time comes.

### Unsupported versions

Everything below `0.6.0` is end-of-life — no fixes, security or otherwise,
land on these lines regardless of how many people are still on them.

| Version | Supported |
| ------- | --------- |
| 0.5.x   | :x:       |
| 0.3.x   | :x:       |
| 0.2.x   | :x:       |
| 0.1.x   | :x:       |

If you're on one of these, the fix is to upgrade, not a backport — they
predate the `0.6.x` cutoff and won't get one.

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

## Reporting a vulnerability

Please don't open a public issue for a security problem — use
[private vulnerability reporting](../../security/advisories/new) instead.
That gets it to us without publishing the details (or the exploit) before
there's a fix.

Include what you'd include in a normal bug report: the token string and
input that trigger it, what you expected, what actually happened. If it's
specific to a runtime or `Temporal` polyfill version, mention that too —
that's what tells us whether it needs to be backported to `0.6.x` as well
as fixed on `0.7.x`.

We'll acknowledge reports within a few days and let you know if it's
confirmed as a real issue. Once there's a fix, we'll credit you in the
release notes unless you'd rather stay anonymous — just say so in the
report.