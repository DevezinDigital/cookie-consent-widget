/**
 * Canonical types and constants shared across the provider, API client, banner
 * UI, and serverless function — the contract they all agree on for preference
 * shapes, storage keys, and the current consent version.
 */
/** True if any non-essential category is active — drives banner visibility. */
function profileRequiresBanner(profile) {
    return profile.analytics || profile.marketing;
}
// ─── Constants ────────────────────────────────────────────────────────────────
/**
 * Bump when data collection practices change. GDPR requires re-consent when the
 * purpose of processing changes, and a new version re-shows the banner to every
 * user. Semantic versioning ("1.0", "1.1", "2.0") signals the scale of change.
 */
const CONSENT_VERSION = "1.0";
// localStorage keys, defined once so a rename touches a single place.
const CONSENT_STORAGE_KEY = "cookie_consent";
const PREFERENCES_STORAGE_KEY = "cookie_preferences";
/** What preferences look like before the user has made any choice */
const DEFAULT_PREFERENCES = {
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
const COOKIE_CATEGORIES = {
    essential: {
        label: "Essential",
        description: "These cookies are required for the website to function and cannot be switched off. They are usually set in response to actions you take, such as setting your privacy preferences or filling in forms.",
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
        description: "These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. This helps us improve the site experience over time.",
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
        description: "These cookies track your visit across websites so we can show you relevant advertising. They are set by us and trusted third-party partners.",
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
function acceptAllPreferences(profile) {
    return Object.fromEntries(Object.keys(COOKIE_CATEGORIES).map((key) => [
        key,
        key === "essential"
            ? true
            : profile
                ? profile[key] === true
                : true,
    ]));
}
/** Only required categories enabled — the "Essential only" choice. */
function essentialOnlyPreferences() {
    return Object.fromEntries(Object.entries(COOKIE_CATEGORIES).map(([key, info]) => [
        key,
        info.required,
    ]));
}

export { CONSENT_STORAGE_KEY, CONSENT_VERSION, COOKIE_CATEGORIES, DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, acceptAllPreferences, essentialOnlyPreferences, profileRequiresBanner };
