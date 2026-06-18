# @devezindigital/cookie-consent

GDPR/CCPA-compliant cookie consent system with centralized logging for multi-site deployment. Built for Next.js projects using a shared package architecture.

---

## What's included

- **`CookieProvider`** — React context that manages consent state, version checking, and preference persistence
- **`consent-api-client`** — fire-and-forget consent event logger for compliance audit trails
- **`cookie-constants`** — shared types and constants (`CookiePreferences`, `CONSENT_VERSION`, storage keys, etc.)
- **CLI scaffolding tool** — copies ready-to-use UI components into your project

---

## Installation

Install the package directly from GitHub:

```bash
npm install github:DevezinDigital/cookie-consent-widget
```

To pin to a specific version:

```bash
npm install github:DevezinDigital/cookie-consent-widget#v1.0.0
```

---

## CLI — Scaffold template files

After installing the package, run the CLI to copy the UI components into your project:

```bash
npx github:DevezinDigital/cookie-consent-widget
```

This copies the Next.js (App Router) template files into your project:

```
lib/site-config.ts
lib/analytics-service.ts
components/cookies/CookieBanner.tsx
components/cookies/CookieConsentWrapper.tsx
components/cookies/CookiePreferencesModal.tsx
components/cookies/ManageCookiesButton.tsx
components/cookies/OpenCookiesButton.tsx
components/cookies/PageTracking.tsx
app/cookie-policy/page.tsx
```

Files that already exist in your project are skipped — nothing is overwritten.

After scaffolding, update `lib/site-config.ts`: site name, contact details,
policy text, and `COOKIE_CONFIG.policyUrl` (where the banner and modal link
to — defaults to `/cookie-policy`, matching the scaffolded policy page).

The components use [Tailwind CSS](https://tailwindcss.com) (with shadcn/ui
design tokens like `bg-background` and `text-foreground`) and
[lucide-react](https://lucide.dev) icons. If your site uses neither,
restyle the copied components — they're yours after scaffolding.

---

## Basic wiring

Wrap your root layout with `CookieConsentWrapper` and mount the banner and modal:

```tsx
// app/layout.tsx
import { CookieConsentWrapper } from "@/components/cookies/CookieConsentWrapper";
import { CookieBanner } from "@/components/cookies/CookieBanner";
import { CookiePreferencesModal } from "@/components/cookies/CookiePreferencesModal";
import { PageTracking } from "@/components/cookies/PageTracking";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CookieConsentWrapper>
          <CookieBanner />
          <CookiePreferencesModal />
          <PageTracking />
          {children}
        </CookieConsentWrapper>
      </body>
    </html>
  );
}
```

---

## Cookie profile — what does this site use?

Most sites don't use every cookie category. `COOKIE_CONFIG.cookieProfile`
(in `lib/site-config.ts`) declares which categories a site actually uses, and
the banner, modal, consent logging, and policy page all adapt to it. Set each
to `true` only if you are using tools in that category:

```ts
// lib/site-config.ts
export const COOKIE_CONFIG = {
  cookieProfile: {
    essential: true as const, // always required
    analytics: false, // set true when you add GA4
    marketing: false, // set true when you add ad pixels
  },
  policyUrl: "/cookie-policy",
};
```

| `analytics` | `marketing` | Banner shown?       | Modal                  |
| ----------- | ----------- | ------------------- | ---------------------- |
| `false`     | `false`     | No (essential-only) | —                      |
| `true`      | `false`     | Yes                 | Analytics section only |
| `false`     | `true`      | Yes                 | Marketing section only |
| `true`      | `true`      | Yes                 | Both sections          |

The banner appears only when `analytics` or `marketing` is `true`. "Accept all"
enables only the categories the profile declares, and for an essential-only
site no banner shows and no consent event is logged (there's no decision to
record). Flip a category on when you add the tool — no component changes needed.

The provider also accepts the profile directly if you wire it yourself:

```tsx
<CookieProvider
  config={{
    analyticsService: AnalyticsService,
    cookieProfile: COOKIE_CONFIG.cookieProfile, // optional; defaults to all-true
  }}
>
```

Omitting `cookieProfile` keeps the previous all-categories behaviour, so
existing sites are unaffected until they opt in.

---

## Environment variables

Add these to your `.env.local`:

```bash
# Shared consent logging endpoint
NEXT_PUBLIC_CONSENT_API=https://your-consent-api.vercel.app/api/consent

# Per-site domain key (coarse attribution — NOT a secret).
# This ships to the browser via NEXT_PUBLIC_*, so treat it as public: it loosely
# ties a consent event to a domain, but cannot authenticate the site. The real
# front-door controls are the CORS origin allowlist + rate limiting on the API.
NEXT_PUBLIC_SITE_CONSENT_TOKEN=your-site-domain-key

# Analytics (optional — remove if not using GA4)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Analytics (optional — remove if not using Cloudflare)
NEXT_PUBLIC_CF_ANALYTICS_TOKEN=your-cf-token
```

---

## Backend setup (consent logging API)

The `api/` directory deploys as Vercel serverless functions and logs consent
events to Neon Postgres. One-time setup:

1. **Create a Neon project** at [console.neon.tech](https://console.neon.tech)
   (free plan is sufficient — compute auto-resumes on demand).
2. **Run the schema**: open the Neon SQL Editor and execute `db/schema.sql`.
3. **Set env vars** on the Vercel project that hosts this repo:

   | Variable                                    | Required    | Value                                                                                                                               |
   | ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                              | yes         | Neon **pooled** connection string                                                                                                   |
   | `IP_SALT`                                   | yes         | Random string (`openssl rand -hex 32`) — salts IP hashes                                                                            |
   | `CONSENT_ADMIN_TOKEN`                       | yes         | Random string (`openssl rand -hex 32`) — **server-only** secret gating the GDPR deletion endpoint. Never expose as `NEXT_PUBLIC_*`. |
   | `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` | recommended | Enables Redis rate limiting; degrades to a per-instance in-memory limiter without them                                              |
   | `AXIOM_TOKEN` / `AXIOM_DATASET`             | no          | Enables operational logging; skipped without them                                                                                   |

4. **Register each consuming site** in the `site_tokens` table. Generate a
   domain key (`openssl rand -hex 24`), then in the Neon SQL Editor:

   ```sql
   insert into site_tokens (domain, token, notes)
   values ('yoursite.com', '<domain-key>', 'My site');
   ```

   Give the site the same value as `NEXT_PUBLIC_SITE_CONSENT_TOKEN`. No API
   redeploy is needed when adding a site. Set `active = false` on a row to
   cut a site off. Registering a domain here also adds it to the **CORS origin
   allowlist** — only registered, active domains can call the API from a browser.

   > **Security model.** `NEXT_PUBLIC_SITE_CONSENT_TOKEN` is a _coarse domain
   > key_, not a secret — it ships to browsers and only attributes a consent
   > event to a domain. The actual protections on the public consent endpoint
   > are the CORS origin allowlist and rate limiting. The **GDPR deletion
   > endpoint** (`/api/consent-deletion`) is destructive and **server-only**:
   > it is gated on the `CONSENT_ADMIN_TOKEN` secret (sent as `x-admin-token`),
   > never the public site key, so a copied browser token cannot erase records.

5. **Redeploy** (push to `main`), then verify:

   ```bash
   curl -X POST https://cookie-consent.devezindigital.com/api/consent \
     -H "Content-Type: application/json" \
     -H "x-consent-token: <your-site-token>" \
     -d '{"site":{"domain":"yoursite.com","url":"https://yoursite.com"},
          "user":{"sessionId":"setup-test"},
          "consent":{"action":"granted","method":"banner","version":"1.0",
            "categories":{"essential":true,"analytics":true,"marketing":false}}}'
   ```

   A `{"eventId":"..."}` response means the event was written to Neon.

---

## Package exports

```ts
import {
  CookieProvider,
  useCookieConsent,
  useCookiePreferences,
  useAnalyticsConsent,
  registerPreferencesOpener,
  logConsentEvent,
  CONSENT_VERSION,
  CONSENT_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  COOKIE_CATEGORIES,
  acceptAllPreferences,
  essentialOnlyPreferences,
  profileRequiresBanner,
} from "@devezindigital/cookie-consent";

import type {
  CookiePreferences,
  CookieProviderConfig,
  AnalyticsServiceInterface,
  ConsentApiConfig,
  ConsentRecord,
  ConsentEvent,
  EventParams,
  CookieCategory,
  SiteCookieProfile,
} from "@devezindigital/cookie-consent";
```

---

## Requirements

- React 18 or 19
- Next.js 14–16 (App Router)
- TypeScript

The package itself has no Next.js dependency (only React peer deps), so it
works with any Next.js major in that range. Note that Next.js 15 LTS support
ends in October 2026 — keep consuming sites on Next.js 16+.
