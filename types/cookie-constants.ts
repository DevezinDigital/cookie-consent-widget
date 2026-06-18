/**
 * Canonical types and constants shared across the provider, API client, banner
 * UI, and serverless function — the contract they all agree on for preference
 * shapes, storage keys, and the current consent version.
 */

// ─── Core preference types ────────────────────────────────────────────────────

export interface CookiePreferences {
  essential: boolean; // Always true — cannot be disabled
  analytics: boolean; // GA, Mixpanel, etc.
  marketing: boolean; // Ad networks, retargeting
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
export function profileRequiresBanner(profile: SiteCookieProfile): boolean {
  return profile.analytics || profile.marketing;
}

/**
 * The shape of what gets written to localStorage under CONSENT_STORAGE_KEY.
 * Separate from preferences so we can store metadata (when, which version)
 * alongside the yes/no choices.
 */
export interface ConsentRecord {
  given: boolean;
  timestamp: string; // ISO 8601 — used for compliance audit trails
  version: string; // Must match CONSENT_VERSION or banner re-shows
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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Bump when data collection practices change. GDPR requires re-consent when the
 * purpose of processing changes, and a new version re-shows the banner to every
 * user. Semantic versioning ("1.0", "1.1", "2.0") signals the scale of change.
 */
export const CONSENT_VERSION = "1.0";

// localStorage keys, defined once so a rename touches a single place.
export const CONSENT_STORAGE_KEY = "cookie_consent";
export const PREFERENCES_STORAGE_KEY = "cookie_preferences";
export const SESSION_ID_KEY = "cookie_session_id";

/** What preferences look like before the user has made any choice */
export const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
};

/**
 * Category definitions that drive the preferences modal UI. The named examples
 * are deliberate: GDPR transparency (Article 13) requires telling users what
 * data is collected for, which vague phrasing like "improve your experience"
 * doesn't satisfy. Sites should edit these to match the tools they actually use.
 */
export const COOKIE_CATEGORIES: Record<
  keyof CookiePreferences,
  CookieCategory
> = {
  essential: {
    label: "Essential",
    description:
      "These cookies are required for the website to function and cannot be switched off. They are usually set in response to actions you take, such as setting your privacy preferences or filling in forms.",
    examples: [
      "Session management",
      "Cookie consent preferences",
      "Security tokens",
      "Load balancing",
    ],
    required: true,
  },
  analytics: {
    label: "Analytics",
    description:
      "These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. This helps us improve the site experience over time.",
    examples: [
      "Google Analytics (page views, sessions)",
      "Scroll depth tracking",
      "Click-through rates",
      "Error reporting",
    ],
    required: false,
  },
  marketing: {
    label: "Marketing",
    description:
      "These cookies track your visit across websites so we can show you relevant advertising. They are set by us and trusted third-party partners.",
    examples: [
      "Retargeting pixels",
      "Conversion tracking",
      "Social media attribution",
      "A/B test segmentation",
    ],
    required: false,
  },
};

// ─── Preference presets ────────────────────────────────────────────────────────
//
// The meaning of "Accept all" and "Essential only" is derived from
// COOKIE_CATEGORIES so it lives in ONE place and scales automatically when a
// category is added — instead of being re-typed as object literals in every
// banner/modal call site.

/**
 * The "Accept all" choice. Without a profile, every category is enabled
 * (back-compat). With a profile, only the categories the site actually uses
 * are enabled — so "Accept all" on an analytics-only site never silently
 * turns on marketing. Essential is always true.
 */
export function acceptAllPreferences(
  profile?: SiteCookieProfile,
): CookiePreferences {
  return Object.fromEntries(
    Object.keys(COOKIE_CATEGORIES).map((key) => [
      key,
      key === "essential"
        ? true
        : profile
          ? profile[key as keyof SiteCookieProfile] === true
          : true,
    ]),
  ) as unknown as CookiePreferences;
}

/** Only required categories enabled — the "Essential only" choice. */
export function essentialOnlyPreferences(): CookiePreferences {
  return Object.fromEntries(
    Object.entries(COOKIE_CATEGORIES).map(([key, info]) => [
      key,
      info.required,
    ]),
  ) as unknown as CookiePreferences;
}
