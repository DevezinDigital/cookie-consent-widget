declare global {
    interface Window {
        openCookieManager?: () => void;
    }
}
/**
 * CookieProvider — manages consent state and wires up analytics.
 *
 * Reads preferences from localStorage on mount, gates analytics on stored
 * consent, and logs each consent decision to the compliance API (fire-and-
 * forget). Both the analytics implementation and the API config are injected
 * via the `config` prop, keeping the package framework- and env-agnostic.
 */
import { ReactNode } from "react";
import { CookiePreferences, ConsentEvent, EventParams, SiteCookieProfile } from "../types/cookie-constants";
import { ConsentApiConfig } from "../services/consent-api-client";
/**
 * Analytics contract the provider expects but doesn't implement. Each site
 * supplies its own object — GA4, Plausible, or a no-op — and the provider
 * calls it without knowing which. Exported so sites can type-check their
 * implementation against it.
 */
export interface AnalyticsServiceInterface {
    initialize: (prefs: CookiePreferences) => void;
    trackEvent: (name: string, params?: EventParams) => void;
    trackPageView?: (path: string) => void;
}
/**
 * Props accepted by CookieProvider.
 *
 * consentApi (compliance logging) and analyticsService (product analytics) are
 * separate concerns: the former fires on every consent decision, the latter
 * only once analytics consent is granted. consentApi is optional — when absent,
 * the client skips the network call (see consent-api-client.ts), so the package
 * still works in dev or projects without centralized logging.
 */
export interface CookieProviderConfig {
    /** Logging API config — optional, safe to omit in dev */
    consentApi?: ConsentApiConfig;
    /** Your site's analytics implementation */
    analyticsService: AnalyticsServiceInterface;
    /**
     * Declares which cookie categories this site uses. Omitting it defaults to
     * all-true, preserving the behaviour of sites not yet updated to pass a
     * profile. When set, the provider strips out categories the site doesn't
     * use and skips compliance logging for essential-only sites (no consent
     * decision is being made, so there's nothing to log).
     */
    cookieProfile?: SiteCookieProfile;
}
interface CookieContextValue {
    preferences: CookiePreferences;
    hasConsent: boolean;
    updatePreferences: (prefs: CookiePreferences, method?: ConsentEvent["consent"]["method"]) => void;
    openPreferences: () => void;
    consentVersion: string;
    trackEvent: (name: string, params?: EventParams) => void;
}
export declare function useCookieConsent(): CookieContextValue;
/** Simplified hook — preferences + hasConsent only */
export declare function useCookiePreferences(): {
    preferences: CookiePreferences;
    hasConsent: boolean;
    updatePreferences: (prefs: CookiePreferences, method?: ConsentEvent["consent"]["method"]) => void;
};
/** Simplified hook — analytics event tracking */
export declare function useAnalyticsConsent(): {
    trackEvent: (name: string, params?: EventParams) => void;
    isEnabled: boolean;
};
export declare function registerPreferencesOpener(fn: () => void): void;
export declare function CookieProvider({ children, config, }: {
    children: ReactNode;
    config: CookieProviderConfig;
}): import("react/jsx-runtime").JSX.Element | null;
export {};
