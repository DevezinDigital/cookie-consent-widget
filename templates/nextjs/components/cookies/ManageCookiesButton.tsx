"use client";

/**
 * app/privacy/ManageCookiesButton.tsx
 *
 * Thin client component so the privacy page (a Server Component) can include
 * a button that opens the CookiePreferencesModal via the context.
 *
 * If cookie consent is not enabled in your project (COOKIE_CONFIG.enabled = false),
 * this component renders nothing.
 */

import { Settings } from "lucide-react";
import {
  useCookieConsent,
  profileRequiresBanner,
} from "@devezindigital/cookie-consent";
import { COOKIE_CONFIG } from "../../lib/site-config";

export function ManageCookiesButton() {
  const { openPreferences } = useCookieConsent();

  // Hidden when consent UI is off, or when the site has no optional cookies
  // (nothing to manage — the modal would open with only "Always on" rows).
  if (!COOKIE_CONFIG.enabled) return null;
  if (!profileRequiresBanner(COOKIE_CONFIG.cookieProfile)) return null;

  return (
    <button
      onClick={openPreferences}
      className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
      Cookie settings
    </button>
  );
}
