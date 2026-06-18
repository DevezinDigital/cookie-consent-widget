/**
 * lib/analytics-service.ts
 *
 * Manages analytics initialization and tracking for three providers:
 *
 *   Google Analytics 4    — cookie-based, requires user consent
 *   Cloudflare Analytics  — cookieless, no consent required
 *   Vercel Analytics      — cookieless, no consent required (loaded via
 *                           <AnalyticsScripts> component in layout)
 *
 * This is a static class so it can be used outside of React components.
 * The CookieProvider calls initialize() when consent changes; components
 * should use the useAnalytics() hook for event tracking.
 *
 * Environment variables (set in .env.local):
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID   — e.g. G-XXXXXXXXXX
 *   NEXT_PUBLIC_CF_ANALYTICS_TOKEN  — Cloudflare beacon token
 */

import type {
  CookiePreferences,
  EventParams,
} from "@devezindigital/cookie-consent";

// ─── Constants ────────────────────────────────────────────────────────────────

const GA_ID =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "")
    : "";

const CF_TOKEN =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? "")
    : "";

const isDev =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

// ─── Type extensions ─────────────────────────────────────────────────────────

type GtagArgs = [string, string | Date, ...Record<string, unknown>[]];

declare global {
  interface Window {
    dataLayer: GtagArgs[];
    gtag: (...args: GtagArgs) => void;
    va?: (
      event: "event" | "beforeSend" | "pageview",
      properties?: unknown,
    ) => void;
    [key: `ga-disable-${string}`]: boolean;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AnalyticsService {
  // gtag script injected once per page load (NOT torn down on toggle).
  private static gaLoaded = false;
  // Current analytics consent state, mirrored to GA Consent Mode.
  private static gaConsented = false;
  private static cfInitialized = false;

  // ── Logging ────────────────────────────────────────────────────────────────

  private static log(msg: string) {
    if (isDev) console.log(`[Analytics] ${msg}`);
  }

  private static error(msg: string, err?: unknown) {
    // Gated to dev — internal analytics hiccups shouldn't surface in end
    // users' production consoles. Route to an observability sink if you want
    // production visibility.
    if (isDev) console.error(`[Analytics Error] ${msg}`, err ?? "");
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  /**
   * Call this whenever consent changes.
   * Cookieless providers (Cloudflare) always load.
   *
   * GA4 uses Consent Mode v2: the gtag script loads ONCE with
   * analytics_storage defaulted to 'denied', then we flip consent
   * granted/denied on toggle — rather than ripping the script out of the DOM
   * and re-downloading it every time the user re-enables analytics.
   */
  static initialize(preferences: Pick<CookiePreferences, "analytics">): void {
    if (typeof window === "undefined") return;

    try {
      // Cookieless — always initialize
      this.initCloudflare();

      // Cookie-based — load once, then gate behavior via Consent Mode
      if (GA_ID) {
        this.ensureGaLoaded();
        this.setAnalyticsConsent(preferences.analytics);
      }
    } catch (err) {
      this.error("Failed to initialize analytics", err);
    }
  }

  // ── Google Analytics 4 (Consent Mode v2) ───────────────────────────────────

  /** Load gtag exactly once, with all storage denied by default. */
  private static ensureGaLoaded(): void {
    if (this.gaLoaded || !GA_ID) return;

    try {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function (...args: GtagArgs) {
        window.dataLayer.push(args);
      };

      // Consent Mode v2 — deny everything BEFORE the script loads/configures,
      // so no analytics storage happens until the user actively consents.
      window.gtag("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });

      const script = document.createElement("script");
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      script.async = true;
      document.head.appendChild(script);

      window.gtag("js", new Date());
      window.gtag("config", GA_ID, {
        anonymize_ip: true,
        // First-party analytics — Lax is the right default. None would send the
        // GA cookie on cross-site requests, the most permissive (and for a
        // privacy product, least appropriate) setting.
        cookie_flags: "SameSite=Lax;Secure",
        cookie_domain: window.location.hostname,
        cookie_expires: 60 * 60 * 24 * 30, // 30 days
      });

      this.gaLoaded = true;
      this.log("Google Analytics loaded (consent denied by default)");
    } catch (err) {
      this.error("Failed to load Google Analytics", err);
    }
  }

  /** Flip GA Consent Mode without reloading the script. */
  private static setAnalyticsConsent(granted: boolean): void {
    if (!GA_ID || typeof window.gtag !== "function") return;

    try {
      window.gtag("consent", "update", {
        analytics_storage: granted ? "granted" : "denied",
      });
      this.gaConsented = granted;

      if (!granted) {
        // Consent withdrawn — clear any GA cookies already set. The script
        // stays loaded (Consent Mode will simply not store going forward).
        const gaCookies = ["_ga", "_gid", `_ga_${GA_ID.replace("G-", "")}`];
        gaCookies.forEach((name) => {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
        });
      }

      this.log(`Google Analytics consent ${granted ? "granted" : "denied"}`);
    } catch (err) {
      this.error("Failed to update Google Analytics consent", err);
    }
  }

  // ── Cloudflare Analytics ───────────────────────────────────────────────────

  private static initCloudflare(): void {
    if (this.cfInitialized || !CF_TOKEN) return;

    try {
      const script = document.createElement("script");
      script.defer = true;
      script.src = "https://static.cloudflareinsights.com/beacon.min.js";
      script.setAttribute(
        "data-cf-beacon",
        JSON.stringify({ token: CF_TOKEN }),
      );
      document.head.appendChild(script);

      this.cfInitialized = true;
      this.log("Cloudflare Analytics initialized");
    } catch (err) {
      this.error("Failed to initialize Cloudflare Analytics", err);
    }
  }

  // ── Tracking ───────────────────────────────────────────────────────────────

  /** Track a page view. Called by PageTracking on route changes. */
  static trackPageView(path: string): void {
    if (typeof window === "undefined") return;

    if (this.gaConsented && window.gtag) {
      try {
        window.gtag("event", "page_view", { page_path: path });
      } catch (err) {
        this.error("GA page view failed", err);
      }
    }

    // Vercel Analytics (cookieless) auto-tracks page views via its script,
    // but we can also push a manual event if needed
    if (window.va) {
      try {
        window.va("pageview", { path });
      } catch (err) {
        this.error("Vercel Analytics page view failed", err);
      }
    }

    // Cloudflare auto-tracks — no manual call needed
  }

  /** Track a custom event. Only fires if analytics consent was given. */
  static trackEvent(eventName: string, params: EventParams = {}): void {
    if (typeof window === "undefined") return;

    if (this.gaConsented && window.gtag) {
      try {
        window.gtag("event", eventName, params);
      } catch (err) {
        this.error(`GA event "${eventName}" failed`, err);
      }
    }

    if (window.va) {
      try {
        window.va("event", { name: eventName, ...params });
      } catch (err) {
        this.error(`Vercel Analytics event "${eventName}" failed`, err);
      }
    }
  }

  /** Check whether GA currently has analytics consent */
  static get isGAActive(): boolean {
    return this.gaConsented;
  }
}
