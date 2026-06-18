"use client";

/**
 * components/cookies/CookieBanner.tsx
 *
 * Bottom-of-page consent banner. Shown when:
 *   - User has never consented, OR
 *   - CONSENT_VERSION has been bumped since their last consent
 *
 * Three actions:
 *   "Accept all"     — enables all categories
 *   "Essential only" — enables essential only
 *   "Preferences"    — opens CookiePreferencesModal
 *
 * Place this inside <CookieProvider> in your root layout, alongside
 * <CookiePreferencesModal />.
 */

import { useEffect, useState } from "react";
import { Cookie, Settings } from "lucide-react";
import {
  useCookieConsent,
  acceptAllPreferences,
  essentialOnlyPreferences,
  profileRequiresBanner,
} from "@devezindigital/cookie-consent";
import { SITE, COOKIE_CONFIG } from "../../lib/site-config";

// Whether this site has any non-essential cookies. An essential-only site
// (analytics:false, marketing:false) never shows the banner.
const bannerEnabled =
  COOKIE_CONFIG.enabled && profileRequiresBanner(COOKIE_CONFIG.cookieProfile);

export function CookieBanner() {
  const { hasConsent, updatePreferences, openPreferences } = useCookieConsent();

  // Only show after client-side hydration to prevent SSR mismatch
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show as soon as we know consent is absent. The provider returns null
    // until it has hydrated/initialized, so there's no pre-hydration flash to
    // hide — the old 600ms timer just delayed the banner with no benefit.
    setVisible(bannerEnabled && !hasConsent);
  }, [hasConsent]);

  if (!visible) return null;

  const handleAcceptAll = () => {
    // Only enables categories this site actually uses (see cookieProfile).
    updatePreferences(acceptAllPreferences(COOKIE_CONFIG.cookieProfile));
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    updatePreferences(essentialOnlyPreferences());
    setVisible(false);
  };

  const handlePreferences = () => {
    openPreferences();
    // Don't hide the banner yet — user hasn't made a final choice
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      aria-describedby="cookie-banner-desc"
      className="fixed inset-x-0 bottom-0 z-[9997] border-t border-border bg-background/95 shadow-lg backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          {/* Message */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Cookie
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p id="cookie-banner-desc" className="text-sm text-foreground">
                <span className="font-medium">{SITE.name}</span> uses cookies to
                enhance your experience and analyse site traffic. You can choose
                which cookies you allow.{" "}
                <a
                  href={COOKIE_CONFIG.policyUrl}
                  className="text-primary underline underline-offset-2 hover:no-underline whitespace-nowrap"
                >
                  Cookie Policy
                </a>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Vercel Analytics and Cloudflare Web Analytics are cookieless and
                always active.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 md:flex-shrink-0">
            <button
              onClick={handlePreferences}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Preferences
            </button>
            <button
              onClick={handleEssentialOnly}
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Essential only
            </button>
            <button
              onClick={handleAcceptAll}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
