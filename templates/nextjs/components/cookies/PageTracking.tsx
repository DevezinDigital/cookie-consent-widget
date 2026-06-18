"use client";

/**
 * components/cookies/PageTracking.tsx
 *
 * Null-render component that fires analytics page views whenever the
 * Next.js App Router pathname changes — but only if the user has given
 * analytics consent.
 *
 * useSearchParams() requires a Suspense boundary in Next.js 14+ — without
 * one, it forces every route to opt out of static rendering at build time.
 * The fix is to split into two components: PageTracking (exported) wraps
 * PageTrackingInner in <Suspense>, and only the inner component calls
 * useSearchParams(). The boundary itself renders nothing (fallback={null}).
 *
 * Place this inside <CookieProvider> in your root layout:
 *
 *   <CookieProvider>
 *     <PageTracking />
 *     {children}
 *     <CookieBanner />
 *     <CookiePreferencesModal />
 *   </CookieProvider>
 */

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCookieConsent } from "@devezindigital/cookie-consent";
import { AnalyticsService } from "@/lib/analytics-service";

// ─── Inner component ──────────────────────────────────────────────────────────
// Isolated here so the Suspense boundary only wraps the useSearchParams call.

function PageTrackingInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasConsent, preferences } = useCookieConsent();

  // Skip the initial mount — GA fires its own page_view on initialization,
  // so we only want to track subsequent navigation changes.
  const isFirstRender = useRef(true);

  // Mirror the current query string in a ref so we can include it in the
  // logged path WITHOUT subscribing the effect to it. Without this, a
  // query-only change (e.g. a modal that sets ?x=1) would fire a redundant
  // page_view. We deliberately track at the path level.
  const searchRef = useRef(searchParams);
  searchRef.current = searchParams;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!hasConsent || !preferences.analytics) return;

    try {
      const query = searchRef.current?.toString();
      const fullPath = query ? `${pathname}?${query}` : pathname;
      AnalyticsService.trackPageView(fullPath);
    } catch (err) {
      console.error("[PageTracking] Failed to track page view", err);
    }
    // Intentionally depends on pathname (not searchParams) — see searchRef above.
  }, [pathname, hasConsent, preferences.analytics]);

  return null;
}

// ─── Exported component ───────────────────────────────────────────────────────
// Wraps the inner component in a Suspense boundary so Next.js can still
// statically render all routes at build time.

export function PageTracking() {
  return (
    <Suspense fallback={null}>
      <PageTrackingInner />
    </Suspense>
  );
}
