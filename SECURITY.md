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