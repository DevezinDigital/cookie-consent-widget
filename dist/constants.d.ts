/**
 * Server-safe entry point: @devezindigital/cookie-consent/constants
 *
 * The main entry is built with a "use client" banner for the React provider,
 * which makes everything it re-exports client-only. This entry mirrors the
 * constants/types surface without that banner, so Server Components can import
 * the pure data directly:
 *
 *   import { CONSENT_VERSION } from "@devezindigital/cookie-consent/constants";
 */
export type { CookiePreferences, ConsentRecord, ConsentEvent, EventParams, CookieCategory, SiteCookieProfile, } from "./types/cookie-constants";
export { CONSENT_VERSION, CONSENT_STORAGE_KEY, PREFERENCES_STORAGE_KEY, DEFAULT_PREFERENCES, COOKIE_CATEGORIES, acceptAllPreferences, essentialOnlyPreferences, profileRequiresBanner, } from "./types/cookie-constants";
