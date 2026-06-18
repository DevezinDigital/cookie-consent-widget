# Cookie Consent Widget — Setup Guide

This document walks through everything needed to integrate the shared cookie consent
system into a new site built from this template. Complete every step in order during
initial site setup.

---

## Prerequisites

- The shared cookie consent app is deployed to Vercel and running
- You have access to the consent app's Vercel environment variables (to add a new site token)
- You have a Neon Postgres project for compliance storage (shared across all sites)

---

## Step 1 — Install the Package

Install directly from the GitHub repository — no npm account or publishing required:

```bash
npm install github:DevezinDigital/cookie-consent-widget
```

To pin to a specific version tag (recommended for production so installs are reproducible):

```bash
npm install github:DevezinDigital/cookie-consent-widget#v1.0.0
```

This will appear in `package.json` as:

```json
"dependencies": {
  "@devezindigital/cookie-consent": "github:DevezinDigital/cookie-consent-widget"
}
```

You also need `lucide-react` for the UI icons used by the cookie components:

```bash
npm install lucide-react
```

> **Note.** Installing from GitHub doesn't run a build step, so the package ships
> its prebuilt `dist/` in the repository. Pin a version tag (`#v1.0.0`) for
> reproducible installs.

> **Local development alternative** — if you're actively developing the package
> alongside a site, link it locally to avoid repeated commits and reinstalls:
>
> ```bash
> # In the cookie-consent package directory
> npm link
>
> # In this project
> npm link @devezindigital/cookie-consent
> ```

---

## Step 2 — Register Your Site's Domain Key

Each site gets a per-domain key so the consent API can attribute logs to the
correct domain. This is a _coarse domain key, not a secret_ — it ships to the
browser. Sites are registered in the `site_tokens` **database table**, so adding
one needs **no code change and no redeploy** of the consent app.

**2a. Generate a domain key**

Run this in your terminal to create a random value:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Copy the output — you will use it in Steps 3 and 4.

**2b. Register the site in the database**

In the Neon SQL Editor (the database backing the consent app), insert a row:

```sql
insert into site_tokens (domain, token, notes)
values ('your-new-site.com', '<paste-your-generated-key>', 'Your site');
```

That's it — no `lib/auth.js` edit, no per-site environment variable, no
redeploy. Registering the domain here also adds it to the API's **CORS origin
allowlist**. To disable a site later, set `active = false` on its row.

---

## Step 3 — Configure Environment Variables

Create a `.env.local` file in the root of this project (never commit this file):

```bash
# ── Cookie Consent Logging ─────────────────────────────────────────────────
# The shared consent API endpoint (same URL for all sites)
NEXT_PUBLIC_CONSENT_API=https://your-consent-app.vercel.app/api/consent

# The site-specific token you generated in Step 2
NEXT_PUBLIC_SITE_CONSENT_TOKEN=paste-your-generated-token-here

# ── Analytics ──────────────────────────────────────────────────────────────
# Google Analytics 4 measurement ID for this site
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Cloudflare Analytics beacon token (if using Cloudflare)
NEXT_PUBLIC_CF_ANALYTICS_TOKEN=your-cf-token
```

Then add the same variables to your Vercel project under **Settings → Environment Variables**
for the `Production` and `Preview` environments.

---

## Step 4 — Customise `lib/site-config.ts`

Open `lib/site-config.ts` and update the placeholder values:

- **`SITE.name`** — your site's display name (shown in the cookie banner)
- **`SITE.legalName`** — your legal entity name (shown in the cookie policy)
- **`SITE.contactEmail`** — privacy contact email
- **`SITE.foundedYear`** — year for the copyright notice
- **`COOKIE_CONFIG.policyUrl`** — where the banner and preferences modal link to (defaults to `/cookie-policy`; change to `/privacy` if your policy lives there)
- **`COOKIE_CONFIG.cookieProfile`** — declare which cookie categories this site actually uses (see Step 4b below)
- **`PRIVACY_CONFIG.lastUpdated`** / **`effectiveDate`** — set to today's date
- **`PRIVACY_CONFIG.sections`** — review and customise the policy text to match your site's actual data practices

---

## Step 4b — Set the Cookie Profile

`COOKIE_CONFIG.cookieProfile` declares which cookie categories this site uses.
It is the single source of truth: the banner, preferences modal, consent
logging, and cookie-policy page all read from it. Set each category to `true`
only if you are actively using tools in it.

```ts
// lib/site-config.ts
cookieProfile: {
  essential: true as const, // always required — do not change
  analytics: false,         // ← set true when you add GA4
  marketing: false,         // ← set true when you add ad pixels
},
```

This produces one of four modes automatically:

| `analytics` | `marketing` | Banner? | Modal                 | Manage button | Policy page                                            |
| ----------- | ----------- | ------- | --------------------- | ------------- | ------------------------------------------------------ |
| `false`     | `false`     | No      | —                     | Hidden        | Essential-only notice, no Analytics/Marketing sections |
| `true`      | `false`     | Yes     | Analytics toggle only | Shown         | + Analytics section                                    |
| `false`     | `true`      | Yes     | Marketing toggle only | Shown         | + Marketing section                                    |
| `true`      | `true`      | Yes     | Both toggles          | Shown         | + both sections                                        |

When you later add a tool, flip its category `false → true` and redeploy —
**no component edits required**. "Accept all" only ever enables the categories
the profile declares, so it can't silently turn on a category you don't use.

> **Backward compatibility:** omitting `cookieProfile` entirely defaults to all
> categories active (the pre-profile behaviour), so existing sites are
> unaffected until you set one.

---

## Step 5 — Wire Up the Provider in `layout.tsx`

Open `app/layout.tsx` and wrap your app with the cookie consent components:

```tsx
import { CookieConsentWrapper } from "@/components/cookies/CookieConsentWrapper";
import { CookieBanner } from "@/components/cookies/CookieBanner";
import { CookiePreferencesModal } from "@/components/cookies/CookiePreferencesModal";
import { PageTracking } from "@/components/cookies/PageTracking";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CookieConsentWrapper>
          <PageTracking />
          {children}
          <CookieBanner />
          <CookiePreferencesModal />
        </CookieConsentWrapper>
      </body>
    </html>
  );
}
```

---

## Step 6 — Add the Cookie Policy Page

The template includes a ready-to-use cookie policy page at `app/cookie-policy/page.tsx`.
It reads all content from `lib/site-config.ts`, so updating the config is all you need.

Verify the page is linked in your footer — most jurisdictions require a clearly
visible, persistent link to your cookie policy.

---

## Step 7 — Verify the Integration

**Local check**

1. Start the dev server: `npm run dev`
2. Open the site in a private/incognito window
3. The cookie consent banner should appear on first load
4. Accept or configure preferences — the banner should disappear
5. Check the browser console: you should see no `[ConsentAPI]` warnings if your
   env vars are set correctly

**Production check**

After deploying, open the browser DevTools **Network** tab and filter for `consent`.
When you accept or decline cookies you should see a `POST` to your consent API
returning `200` with an `eventId` in the response body.

**Neon check**

Open your Neon project → Tables → `consent_logs`. A new row should appear
within a few seconds of accepting consent on the live site.

---

## Setup Checklist

Use this as a final sign-off before launching a new site:

- [ ] Package installed (`@devezindigital/cookie-consent`)
- [ ] `lucide-react` installed
- [ ] Domain key generated and registered via `insert into site_tokens (...)` in Neon
- [ ] `.env.local` created with all required variables
- [ ] All env vars added to this project on Vercel (Production + Preview)
- [ ] `lib/site-config.ts` customised with your site's name, legal entity, policy text, and **`lastUpdated` / `effectiveDate`** (the page shows a red warning until these are set)
- [ ] **`COOKIE_CONFIG.cookieProfile`** set to the categories this site actually uses (banner only appears when `analytics` or `marketing` is `true`)
- [ ] `CookieConsentWrapper` mounted in `app/layout.tsx`
- [ ] `AnalyticsService` configured with correct GA/CF env var references
- [ ] Cookie policy page live at `/cookie-policy`
- [ ] Footer contains a visible link to `/cookie-policy`
- [ ] Consent banner appears and dismisses correctly in incognito window
- [ ] `POST /api/consent` returning `200` in Network tab on live site
- [ ] Consent record visible in Neon `consent_logs` table
- [ ] `.env.local` is listed in `.gitignore` (never committed)

---

## Environment Variable Reference

| Variable                         | Scope           | Required     | Description                             |
| -------------------------------- | --------------- | ------------ | --------------------------------------- |
| `NEXT_PUBLIC_CONSENT_API`        | Client + Server | Yes          | Full URL to shared consent endpoint     |
| `NEXT_PUBLIC_SITE_CONSENT_TOKEN` | Client + Server | Yes          | Per-site auth token for the consent API |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`  | Client          | If using GA4 | Google Analytics measurement ID         |
| `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` | Client          | If using CF  | Cloudflare Analytics beacon token       |
