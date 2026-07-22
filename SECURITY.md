# Security Policy

## Supported versions

The latest published `1.x` release of `@devezindigital/cookie-consent` receives
security fixes. Please upgrade to the newest version before reporting an issue.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through either channel:

- **GitHub** — [Report a vulnerability](https://github.com/DevezinDigital/cookie-consent-widget/security/advisories/new)
  (Security → Advisories → Report a vulnerability). This requires GitHub's
  private vulnerability reporting to be enabled on the repo.
- **Email** — privacy@devezindigital.com

Please include a description of the issue, steps to reproduce, affected
version(s), and the impact you foresee. We aim to acknowledge reports within
3 business days and to ship a fix or mitigation for confirmed issues as quickly
as is practical.

## Scope

This repository is a client React package plus a serverless consent API. Areas
where reports are especially welcome:

- The serverless handlers in `api/` (authentication, CORS, rate limiting, input
  validation, SQL construction).
- Per-site token and admin-token handling in `lib/auth.js`.
- Anything that could expose personal data (IP addresses, consent records) or
  bypass the GDPR deletion endpoint's admin gate.

## Handling of secrets

No live credentials belong in this repository. All secrets are supplied at
runtime via environment variables (serverless API) or the `site_tokens`
database table — see [`.env.example`](.env.example) and [`CLAUDE.md`](CLAUDE.md).
Commits are scanned for leaked secrets by
[`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml)
(gitleaks + TruffleHog). If you believe a secret was committed, treat it as
compromised: rotate it immediately and report it via the channels above.
