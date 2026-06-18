"use client";

import { CookieProvider } from "@devezindigital/cookie-consent";
import { AnalyticsService } from "@/lib/analytics-service";
import { COOKIE_CONFIG } from "@/lib/site-config";

const consentConfig = {
  consentApi: {
    apiUrl: process.env.NEXT_PUBLIC_CONSENT_API ?? "",
    siteToken: process.env.NEXT_PUBLIC_SITE_CONSENT_TOKEN ?? "",
  },
  analyticsService: AnalyticsService,
  // Tells the provider which categories this site uses. The banner, modal, and
  // policy page all read from the same COOKIE_CONFIG.cookieProfile.
  cookieProfile: COOKIE_CONFIG.cookieProfile,
};

export function CookieConsentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CookieProvider config={consentConfig}>{children}</CookieProvider>;
}
