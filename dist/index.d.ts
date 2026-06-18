/**
 * Public API surface for @devezindigital/cookie-consent.
 *
 * Everything exported here is part of the package's stable contract; anything
 * not exported is an internal detail consumers shouldn't depend on.
 *
 * Deliberately not exported:
 *   - SESSION_ID_KEY        internal localStorage key used by the API client
 *   - getOrCreateSessionId  internal API-client utility
 *   - _openPreferencesModal backing variable for the modal-opener pattern;
 *                           use openPreferences() or registerPreferencesOpener()
 *
 * Server Components that only need the constants/types can import them from
 * the server-safe subpath instead, avoiding the "use client" boundary:
 *   import { CONSENT_VERSION } from "@devezindigital/cookie-consent/constants";
 */
export type { CookiePreferences, ConsentRecord, ConsentEvent, EventParams, CookieCategory, SiteCookieProfile, } from "./types/cookie-constants";
export { CONSENT_VERSION, CONSENT_STORAGE_KEY, PREFERENCES_STORAGE_KEY, DEFAULT_PREFERENCES, COOKIE_CATEGORIES, acceptAllPreferences, essentialOnlyPreferences, profileRequiresBanner, } from "./types/cookie-constants";
export { CookieProvider, registerPreferencesOpener, useCookieConsent, useCookiePreferences, useAnalyticsConsent, } from "./context/CookieProvider";
export type { CookieProviderConfig, AnalyticsServiceInterface, } from "./context/CookieProvider";
export { logConsentEvent, flushConsentQueue, } from "./services/consent-api-client";
export type { ConsentApiConfig } from "./services/consent-api-client";
