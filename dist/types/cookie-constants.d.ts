/**
 * Canonical types and constants shared across the provider, API client, banner
 * UI, and serverless function — the contract they all agree on for preference
 * shapes, storage keys, and the current consent version.
 */
export interface CookiePreferences {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
}
/**
 * Declares which cookie categories a site actually uses — the single source of
 * truth for what the banner, modal, consent logging, and policy page show.
 * Presenting a toggle for a category the site doesn't use is misleading and
 * undercuts GDPR's transparency requirement, so each surface reads the profile
 * and adapts. The banner appears only when a non-essential category is active
 * (see profileRequiresBanner); essential never drives it.
 */
export interface SiteCookieProfile {
    /** Always true — cannot be disabled. Listed for explicitness. */
    essential: true;
    /** True when the site uses GA4 or any cookie-based analytics. */
    analytics: boolean;
    /** True when the site uses ad pixels, retargeting, or marketing tags. */
    marketing: boolean;
}
/** True if any non-essential category is active — drives banner visibility. */
export declare function profileRequiresBanner(profile: SiteCookieProfile): boolean;
/**
 * The shape of what gets written to localStorage under CONSENT_STORAGE_KEY.
 * Separate from preferences so we can store metadata (when, which version)
 * alongside the yes/no choices.
 */
export interface ConsentRecord {
    given: boolean;
    timestamp: string;
    version: string;
}
/** A single consent event sent to the logging API; matches the server schema. */
export interface ConsentEvent {
    /**
     * Client-generated idempotency key. Lets a buffered event be safely
     * re-sent (e.g. after an offline failure) without creating a duplicate
     * compliance record — the server uses it as the unique `event_id`.
     */
    eventId?: string;
    site: {
        domain: string;
        url: string;
    };
    user: {
        sessionId: string;
        userId?: string | null;
    };
    consent: {
        action: "granted" | "updated" | "withdrawn";
        method: "banner" | "preferences-modal" | "api";
        version: string;
        categories: CookiePreferences;
    };
}
/** Generic key/value map for analytics event parameters */
export interface EventParams {
    [key: string]: string | number | boolean;
}
/**
 * Configuration for a single cookie category shown in the preferences modal.
 * Keeping this in the shared package means the modal can import it directly
 * rather than each site defining its own category list.
 */
export interface CookieCategory {
    label: string;
    description: string;
    examples: string[];
    required: boolean;
}
/**
 * Bump when data collection practices change. GDPR requires re-consent when the
 * purpose of processing changes, and a new version re-shows the banner to every
 * user. Semantic versioning ("1.0", "1.1", "2.0") signals the scale of change.
 */
export declare const CONSENT_VERSION = "1.0";
export declare const CONSENT_STORAGE_KEY = "cookie_consent";
export declare const PREFERENCES_STORAGE_KEY = "cookie_preferences";
export declare const SESSION_ID_KEY = "cookie_session_id";
/** What preferences look like before the user has made any choice */
export declare const DEFAULT_PREFERENCES: CookiePreferences;
/**
 * Category definitions that drive the preferences modal UI. The named examples
 * are deliberate: GDPR transparency (Article 13) requires telling users what
 * data is collected for, which vague phrasing like "improve your experience"
 * doesn't satisfy. Sites should edit these to match the tools they actually use.
 */
export declare const COOKIE_CATEGORIES: Record<keyof CookiePreferences, CookieCategory>;
/**
 * The "Accept all" choice. Without a profile, every category is enabled
 * (back-compat). With a profile, only the categories the site actually uses
 * are enabled — so "Accept all" on an analytics-only site never silently
 * turns on marketing. Essential is always true.
 */
export declare function acceptAllPreferences(profile?: SiteCookieProfile): CookiePreferences;
/** Only required categories enabled — the "Essential only" choice. */
export declare function essentialOnlyPreferences(): CookiePreferences;
