# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.7.x   | :x:       |
| < 0.7   | :x:       |

`0.7.x` is now **End of Life** and is no longer maintained. Do not open
issues for bugs, security problems, or other problems specific to the
`0.7.x` branch.

## Reporting a vulnerability

Please don't open a public issue for a security problem — use
[private vulnerability reporting](../../security/advisories/new) instead.

For vulnerabilities specific to the `0.7.x` branch, please do not open an
issue for the branch. Report the vulnerability privately if you believe it
also affects a supported version.

Include what you'd include in a normal bug report: the token string and
input that trigger it, what you expected, what actually happened. If it's
specific to a runtime or `Temporal` polyfill version, mention that too.

We'll acknowledge reports within a few days and let you know if it's
confirmed as a real issue. Once there's a fix, we'll credit you in the
release notes unless you'd rather stay anonymous — just say so in the
report.