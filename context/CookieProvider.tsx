"use client";

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

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  CookiePreferences,
  ConsentRecord,
  ConsentEvent,
  EventParams,
  SiteCookieProfile,
  DEFAULT_PREFERENCES,
  CONSENT_VERSION,
  CONSENT_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  profileRequiresBanner,
} from "../types/cookie-constants";
import {
  logConsentEvent,
  flushConsentQueue,
  ConsentApiConfig,
} from "../services/consent-api-client";

// ─── Analytics service interface ──────────────────────────────────────────────

/**
 * Analytics contract the provider expects but doesn't implement. Each site
 * supplies its own object — GA4, Plausible, or a no-op — and the provider
 * calls it without knowing which. Exported so sites can type-check their
 * implementation against it.
 */
export interface AnalyticsServiceInterface {
  initialize: (prefs: CookiePreferences) => void;
  trackEvent: (name: string, params?: EventParams) => void;
  trackPageView?: (path: string) => void; // Optional — not all sites need this
}

// ─── Provider config ──────────────────────────────────────────────────────────

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

/** Backward-compatible default: every category active when no profile is given. */
const ALL_CATEGORIES_PROFILE: SiteCookieProfile = {
  essential: true,
  analytics: true,
  marketing: true,
};

// ─── Context types ────────────────────────────────────────────────────────────

interface CookieContextValue {
  preferences: CookiePreferences;
  hasConsent: boolean;
  updatePreferences: (
    prefs: CookiePreferences,
    method?: ConsentEvent["consent"]["method"],
  ) => void;
  openPreferences: () => void;
  consentVersion: string;
  trackEvent: (name: string, params?: EventParams) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CookieContext = createContext<CookieContextValue | null>(null);

export function useCookieConsent(): CookieContextValue {
  const ctx = useContext(CookieContext);
  if (!ctx)
    throw new Error("useCookieConsent must be used within CookieProvider");
  return ctx;
}

/** Simplified hook — preferences + hasConsent only */
export function useCookiePreferences() {
  const { preferences, hasConsent, updatePreferences } = useCookieConsent();
  return { preferences, hasConsent, updatePreferences };
}

/** Simplified hook — analytics event tracking */
export function useAnalyticsConsent() {
  const { trackEvent, preferences, hasConsent } = useCookieConsent();
  return {
    trackEvent,
    isEnabled: hasConsent && preferences.analytics,
  };
}

// ─── Modal opener registration ────────────────────────────────────────────────

// The modal must be openable from inside the tree (the banner's "Preferences"
// button) and from outside React (window.openCookieManager). React state can't
// be reached from outside the tree, so the modal registers its open function in
// this module-level variable on mount; openPreferences() and the window helper
// both call through it.
let _openPreferencesModal: (() => void) | null = null;

export function registerPreferencesOpener(fn: () => void) {
  _openPreferencesModal = fn;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CookieProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: CookieProviderConfig;
}) {
  const [preferences, setPreferences] =
    useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [hasConsent, setHasConsent] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pull the services out of config so we can reference them in callbacks
  const { consentApi, analyticsService } = config;

  // Resolve the cookie profile — default to all-true for backward compatibility
  // with sites that haven't been updated to declare one.
  const profile = config.cookieProfile ?? ALL_CATEGORIES_PROFILE;
  const requiresBanner = profileRequiresBanner(profile);

  // Hydrate from localStorage. Runs in useEffect (not a useState initializer)
  // because localStorage is browser-only and would throw during SSR. We render
  // null until `initialized` flips true, so the banner never flashes before
  // we've checked for existing consent.
  useEffect(() => {
    try {
      const consentRaw = localStorage.getItem(CONSENT_STORAGE_KEY);
      const prefsRaw = localStorage.getItem(PREFERENCES_STORAGE_KEY);

      if (consentRaw && prefsRaw) {
        const consent: ConsentRecord = JSON.parse(consentRaw);
        const prefs: CookiePreferences = JSON.parse(prefsRaw);

        // Guard against a parseable-but-wrong object (hand-edited storage, or
        // an older schema) before feeding it to analyticsService. A bad shape
        // throws into the catch below, which clears storage and starts fresh.
        const validShape =
          !!consent &&
          typeof consent.given === "boolean" &&
          typeof consent.version === "string" &&
          !!prefs &&
          typeof prefs.essential === "boolean" &&
          typeof prefs.analytics === "boolean" &&
          typeof prefs.marketing === "boolean";
        if (!validShape) throw new Error("Malformed consent storage");

        if (consent.given && consent.version === CONSENT_VERSION) {
          setHasConsent(true);
          setPreferences(prefs);
          analyticsService.initialize(prefs);
        }
        // Version mismatch: banner re-shows, analytics stays off until
        // the user actively re-consents
      }
    } catch {
      // Corrupted storage — clear it and start fresh
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    }

    setInitialized(true);

    // Flush any consent events that failed to log on a previous visit
    // (offline / transient 5xx). Fire-and-forget — never blocks the UI.
    if (consentApi) {
      flushConsentQueue(consentApi);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ analyticsService/consentApi intentionally excluded — we only want this
  // to run once on mount, not every time the parent re-renders

  // ── Register window helper ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.openCookieManager = () => _openPreferencesModal?.();
    return () => {
      delete window.openCookieManager;
    };
  }, []);

  // Update preferences. hasConsent is in the dependency array because it
  // decides whether this logs a "granted" (first time) or "updated" action —
  // a stale value would mislabel the event.
  const updatePreferences = useCallback(
    (
      prefs: CookiePreferences,
      method: ConsentEvent["consent"]["method"] = "banner",
    ) => {
      // Strip out any category the site doesn't actually use. The UI shouldn't
      // send these, but guard anyway so a stale/forged preference can't record
      // consent for a category that isn't part of this site's profile.
      const sanitized: CookiePreferences = {
        essential: true,
        analytics: profile.analytics ? prefs.analytics : false,
        marketing: profile.marketing ? prefs.marketing : false,
      };
      const action = hasConsent ? "updated" : "granted";

      // 1. Write to localStorage first — this is the source of truth for UX.
      //    Everything else is secondary to this succeeding.
      const consent: ConsentRecord = {
        given: true,
        timestamp: new Date().toISOString(),
        version: CONSENT_VERSION,
      };
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(sanitized));

      // 2. Update React state so the banner hides and components re-render
      setPreferences(sanitized);
      setHasConsent(true);

      // 3. Initialize analytics with the new preferences
      analyticsService.initialize(sanitized);

      // 4. Fire-and-forget: log to the compliance API.
      //    This runs last and is not awaited — a failure here must never
      //    affect steps 1-3. The user's consent is already saved.
      //    Skipped for essential-only sites: with no optional category there's
      //    no consent decision to record, so logging a "granted" event would
      //    pollute the audit trail with sites that never asked permission.
      if (consentApi && requiresBanner) {
        logConsentEvent(sanitized, action, method, consentApi);
      }
    },
    [hasConsent, analyticsService, consentApi, profile, requiresBanner],
  );

  // ── Open preferences modal ─────────────────────────────────────────────────
  const openPreferences = useCallback(() => {
    _openPreferencesModal?.();
  }, []);

  // ── Track event ────────────────────────────────────────────────────────────
  const trackEvent = useCallback(
    (name: string, params: EventParams = {}) => {
      if (hasConsent && preferences.analytics) {
        analyticsService.trackEvent(name, params);
      }
    },
    [hasConsent, preferences.analytics, analyticsService],
  );

  // Don't render children until we've checked localStorage
  if (!initialized) return null;

  return (
    <CookieContext.Provider
      value={{
        preferences,
        hasConsent,
        updatePreferences,
        openPreferences,
        consentVersion: CONSENT_VERSION,
        trackEvent,
      }}
    >
      {children}
    </CookieContext.Provider>
  );
}
