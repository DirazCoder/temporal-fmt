# Security Policy

For which lines currently get fixes, whether that's fixes-only or full
support, and what's fully end-of-life, see [VERSIONS.md](VERSIONS.md) —
that's the file that actually needs updating as versions move, not this
one.

## Reporting a vulnerability

Please don't open a public issue for a security problem — use
[private vulnerability reporting](../../security/advisories/new) instead.
That gets it to us without publishing the details (or the exploit) before
there's a fix.

Include what you'd include in a normal bug report: the token string and
input that trigger it, what you expected, what actually happened. If
it's specific to a runtime or `Temporal` polyfill version, say so — that's
what tells us which supported line it needs fixing (or backporting) on.

We'll acknowledge reports within a few days and let you know if it's
confirmed as a real issue. Once there's a fix, we'll credit you in the
release notes unless you'd rather stay anonymous — just say so in the
report.
