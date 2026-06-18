# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`@devezindigital/cookie-consent` — a shared npm package providing GDPR/CCPA-compliant cookie consent management for multi-site deployment. It is a React library (not a standalone app) consumed by Next.js sites.

## Commands

```bash
npm run build        # Build with Rollup → dist/ (two entries: main + /constants)
npm run dev          # Build in watch mode
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run lint         # eslint . (TS/TSX + api/lib JS + templates)
npm run format       # prettier --write .   (format:check to verify)
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + test + build and fails if
the committed `dist/` is out of date relative to source.

## Architecture

### Two-layer system

1. **Client-side React package** (this repo) — installed as `@devezindigital/cookie-consent` in consuming sites. Provides the `CookieProvider`, hooks, types, and an API client.
2. **Serverless API** (`api/` directory) — Vercel serverless functions deployed separately. Receives consent events, writes to Neon Postgres (compliance records) and Axiom (operational logs, optional). Rate-limited via Upstash Redis (fails open if unconfigured).

### Key modules

- `index.ts` — Public API surface (the `.` entry, built with `"use client"`). Deliberately controls what is exported vs internal. Read the "Deliberately not exported" section before adding exports.
- `constants.ts` — **Server-safe** entry (`@devezindigital/cookie-consent/constants`), built WITHOUT the `"use client"` banner. Re-exports the pure constants/types/presets (`CONSENT_VERSION`, `COOKIE_CATEGORIES`, `acceptAllPreferences`, `essentialOnlyPreferences`, …) so Server Components can import them without the client tax. See the `exports` map in `package.json`.
- `context/CookieProvider.tsx` — Core React provider. Manages consent state in localStorage, fires analytics initialization, logs consent events fire-and-forget, and flushes any buffered (previously-failed) consent events on mount. Uses dependency injection for both `consentApi` config and `analyticsService`.
- `services/consent-api-client.ts` — HTTP client that POSTs consent events to the serverless endpoint. Never throws. Retries once on transient failure, then buffers failed events in a capped localStorage queue (`flushConsentQueue` re-sends them on next mount). Each event carries a client-generated `eventId` for server-side idempotency. Config is passed in (not read from env vars) to stay framework-agnostic.
- `types/cookie-constants.ts` — Shared types and constants (canonical source). Defines `CookiePreferences`, `ConsentEvent`, storage keys, `CONSENT_VERSION`, category metadata, and the `acceptAllPreferences`/`essentialOnlyPreferences` presets.
- `lib/cookie-constants.ts` — **Deprecated re-export shim.** Now just re-exports the canonical `types/cookie-constants.ts` (with a `CookieCategoryInfo` → `CookieCategory` back-compat alias). It previously held a divergent copy whose `CONSENT_VERSION` drifted ("1.0.0" vs canonical "1.0"); consolidated to a single source of truth.
- `api/consent.js` — Serverless handler: per-request CORS (origin allowlist) → rate limit → auth → validate (shape/size) → Neon insert → Axiom log (bounded). Idempotent on the client-supplied `eventId` (duplicate `event_id` → 200).
- `api/consent-deletion.js` — GDPR erasure endpoint: soft-deletes PII from consent_logs, keeps record shell. **Server-only** — gated on the `CONSENT_ADMIN_TOKEN` secret (`x-admin-token` header), NOT the public per-site token. Emits no CORS headers. Records the requester (`x-requested-by`) in `deletion_requests`.
- `db/schema.sql` — Postgres schema for `site_tokens`, `consent_logs`, and `deletion_requests` (run once in the Neon SQL Editor). Sites are registered by inserting a row into `site_tokens` — no code change or redeploy.
- `lib/auth.js` — Per-site token authentication via `x-consent-token` header, verified against the `site_tokens` table (domain normalized: lowercase, `www.` stripped; constant-time compare; 60s in-memory cache). Also exports `getSiteToken` (shared with the CORS allowlist) and `authenticateAdmin` (server-only admin secret for the deletion endpoint). Handlers rate-limit before authenticating so spam hits the limiter, not the database.
- `lib/cors.js` — Per-request CORS for the API. Echoes the request `Origin` only when it maps to a registered, active `site_tokens` domain (reuses auth's cache); unknown origins get no header. Replaces the old wildcard in `vercel.json`.
- `lib/db.js` — Single memoized Neon client (`db()`), created once per warm serverless instance and reused across invocations.
- `lib/clientIp.js` — Resolves the client IP, preferring Vercel's platform-validated `x-real-ip` over `x-forwarded-for` (documents the spoofing-prevention assumption).
- `lib/respond.js` — Shared `fail(res, status, code, message)` helper emitting a consistent `{ error: { code, message } }` envelope across both handlers.
- `lib/rateLimit.js` — Fixed-window rate limiter (20 req/60s). Prefers Upstash Redis; degrades to a per-instance in-memory limiter when Redis is unconfigured/unreachable (never fully open). Configured-Redis errors log `[RATELIMIT_REDIS_DOWN]`. `checkRateLimit(id, { failClosed })` — the deletion endpoint fails closed.
- `templates/nextjs/lib/analytics-service.ts` — The single canonical implementation of `AnalyticsServiceInterface` for GA4 (Consent Mode v2) + Cloudflare + Vercel Analytics. This is the copy scaffolded into consuming sites; sites customize it. (The former duplicate `lib/analytics-service.ts` was removed to stop drift.)
- `docs/usage.md` — Integration guide showing how consuming Next.js sites wire up the package. (Was `usage.ts`, a file of commented-out code; moved to Markdown.)

### Design patterns

- **Dependency injection**: `CookieProvider` accepts `analyticsService` and `consentApi` as props rather than importing implementations directly. This keeps the package framework-agnostic.
- **localStorage as source of truth**: Consent preferences are written to localStorage first; the API log is a secondary fire-and-forget side effect.
- **Module-level modal opener**: `registerPreferencesOpener()` stores a callback at module scope so the preferences modal can be opened from outside React (e.g., `window.openCookieManager()`).
- **Three-category model**: `essential` (always true), `analytics` (GA4 consent-gated), `marketing` (reserved for future use).
- **Cookie profile (per-site)**: `SiteCookieProfile` (`{ essential: true, analytics, marketing }`) declares which categories a site actually uses. `CookieProvider` accepts it via `config.cookieProfile` (defaults to all-true if omitted, for back-compat); it sanitizes preferences to the declared categories and **skips compliance logging for essential-only sites** (no consent decision to record). `profileRequiresBanner(profile)` drives banner/modal/manage-button visibility (true iff `analytics || marketing`). `acceptAllPreferences(profile?)` enables only the declared categories — without a profile it stays all-true. Templates read a single `COOKIE_CONFIG.cookieProfile`; `getActivePrivacySections()` filters the policy page's category-specific sections to match. Four resulting modes: essential-only (no banner), analytics-only, marketing-only, full.
- **CONSENT_VERSION**: Bumping this string re-shows the consent banner to all users, satisfying GDPR re-consent requirements.

## Environment Variables (serverless API)

The API functions require: `DATABASE_URL` (Neon pooled connection string), `IP_SALT`, and `CONSENT_ADMIN_TOKEN` (server-only secret gating the deletion endpoint — never `NEXT_PUBLIC_*`). Per-site domain keys live in the `site_tokens` database table, not env vars. Optional: `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` (rate limiting — degrades to an in-memory limiter without them), `AXIOM_TOKEN` + `AXIOM_DATASET` (operational logging — skipped without them).

Consuming sites need: `NEXT_PUBLIC_CONSENT_API`, `NEXT_PUBLIC_SITE_CONSENT_TOKEN` (a _coarse domain key_, not a secret — it ships to browsers), `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`.

Note: `@neondatabase/serverless` and `@upstash/redis` are **devDependencies** (server-only — used by `api/`/`lib/`, not the published client bundle), so consuming sites don't install them. Vercel installs them at build time for the API functions.
