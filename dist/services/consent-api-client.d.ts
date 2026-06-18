/**
 * HTTP client that POSTs consent events to the serverless compliance endpoint.
 *
 * Logging is best-effort: localStorage is already the source of truth by the
 * time this runs, so the client never throws and never blocks the UI. Failed
 * deliveries get one retry, then are buffered in localStorage and re-sent on
 * the next provider mount (flushConsentQueue).
 */
import { CookiePreferences, ConsentEvent } from "../types/cookie-constants";
/**
 * Configuration passed from CookieProvider into the API client. Taken as a
 * parameter rather than read from process.env so the package stays framework-
 * agnostic — the calling site owns its env vars and passes the values in.
 */
export interface ConsentApiConfig {
    /** Full URL to your /api/consent serverless function */
    apiUrl: string;
    /** Per-site authentication token (x-consent-token header) */
    siteToken: string;
}
/**
 * Log a consent action to your shared serverless endpoint.
 *
 * Call this from CookieProvider.updatePreferences() — after localStorage
 * has already been written, so this is purely a best-effort audit log.
 *
 * @param preferences  The full preferences object after the user's choice
 * @param action       What the user did
 * @param method       How they did it (which UI surface)
 * @param config       API URL and site token from the consuming project
 */
export declare function logConsentEvent(preferences: CookiePreferences, action: ConsentEvent["consent"]["action"], method: ConsentEvent["consent"]["method"], config: ConsentApiConfig): Promise<void>;
/**
 * Re-send any events that previously failed to POST. Call this on provider
 * mount so a buffered event (saved while offline / during a 5xx) is flushed on
 * the user's next visit, closing holes in the compliance audit trail.
 *
 * Like logConsentEvent, this never throws.
 */
export declare function flushConsentQueue(config: ConsentApiConfig): Promise<void>;
