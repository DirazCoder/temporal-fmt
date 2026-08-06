# Security Policy

## Supported versions

`temporal-fmt` doesn't have multiple major versions in active use yet — only
the latest release on npm is supported. Security fixes land there; there's
no back-porting to older versions until that's actually a real scenario.

## Reporting a vulnerability

Please don't open a public issue for a security problem — use
[private vulnerability reporting](../../security/advisories/new) instead.
That gets it to us without publishing the details (or the exploit) before
there's a fix.

Include what you'd include in a normal bug report: the token string and
input that trigger it, what you expected, what actually happened. If it's
specific to a runtime or `Temporal` polyfill version, mention that too.

We'll acknowledge reports within a few days and let you know if it's
confirmed as a real issue. Once there's a fix, we'll credit you in the
release notes unless you'd rather stay anonymous — just say so in the
report.
