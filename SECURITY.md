# Security Policy

For which versions get fixes (including which ones are critical-fixes-only
or fully end-of-life) and behavior changes across versions that affect
whether upgrading actually resolves something you're hitting, see
[VERSIONS.md](VERSIONS.md).

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