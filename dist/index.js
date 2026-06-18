"use client";
'use strict';

var jsxRuntime = require('react/jsx-runtime');
var react = require('react');

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
const SESSION_ID_KEY = "cookie_session_id";
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

/**
 * HTTP client that POSTs consent events to the serverless compliance endpoint.
 *
 * Logging is best-effort: localStorage is already the source of truth by the
 * time this runs, so the client never throws and never blocks the UI. Failed
 * deliveries get one retry, then are buffered in localStorage and re-sent on
 * the next provider mount (flushConsentQueue).
 */
// localStorage key for events that failed to POST and are awaiting a retry.
const CONSENT_QUEUE_KEY = "cookie_consent_queue";
// Cap the buffer so a permanently-offline browser can't grow it unbounded.
const MAX_QUEUED_EVENTS = 50;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/** Cryptographically-random id, with a fallback for very old environments. */
function generateEventId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
// ─── Session ID ───────────────────────────────────────────────────────────────
/**
 * Stable per-browser identifier for associating consent events with a session,
 * so an erasure request has something to query against. Deliberately not a user
 * ID (anonymous visitors have none) or raw IP (that's PII) — just a random UUID
 * persisted in localStorage, with a Math.random() fallback for old browsers.
 */
function getOrCreateSessionId() {
    try {
        const existing = localStorage.getItem(SESSION_ID_KEY);
        if (existing)
            return existing;
        const newId = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(SESSION_ID_KEY, newId);
        return newId;
    }
    catch {
        // localStorage blocked (e.g. private browsing with strict settings)
        return `ephemeral-${Date.now()}`;
    }
}
// ─── Main export ──────────────────────────────────────────────────────────────
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
async function logConsentEvent(preferences, action, method, config) {
    // Guard: don't attempt the call if config is incomplete.
    // This protects local dev environments where env vars may not be set.
    if (!config.apiUrl || !config.siteToken) {
        if (process.env.NODE_ENV === "development") {
            console.warn("[ConsentAPI] Skipping log — apiUrl or siteToken not configured. " +
                "Set NEXT_PUBLIC_CONSENT_API and NEXT_PUBLIC_SITE_CONSENT_TOKEN.");
        }
        return;
    }
    const event = {
        // Stable idempotency key so a buffered re-send can't duplicate the record.
        eventId: generateEventId(),
        site: {
            domain: window.location.hostname,
            url: window.location.href,
        },
        user: {
            sessionId: getOrCreateSessionId(),
            userId: null, // Extend this if your site has user accounts
        },
        consent: {
            action,
            method,
            version: CONSENT_VERSION,
            categories: preferences,
        },
    };
    // Try once, then one quick retry for transient failures, then buffer.
    if (await postEvent(event, config))
        return;
    await delay(500);
    if (await postEvent(event, config))
        return;
    enqueue(event);
}
/**
 * Re-send any events that previously failed to POST. Call this on provider
 * mount so a buffered event (saved while offline / during a 5xx) is flushed on
 * the user's next visit, closing holes in the compliance audit trail.
 *
 * Like logConsentEvent, this never throws.
 */
async function flushConsentQueue(config) {
    if (!config?.apiUrl || !config?.siteToken)
        return;
    const queued = readQueue();
    if (queued.length === 0)
        return;
    const stillFailing = [];
    for (const event of queued) {
        const ok = await postEvent(event, config);
        if (!ok)
            stillFailing.push(event);
    }
    writeQueue(stillFailing);
}
// ─── Delivery + buffer internals ───────────────────────────────────────────────
/**
 * POST a single event. Returns true when it's been handled (delivered, or a
 * permanent client error we shouldn't retry) and false for transient failures
 * (network, 5xx, 429) that warrant a retry/buffer. Never throws.
 */
async function postEvent(event, config) {
    try {
        const response = await fetch(config.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-consent-token": config.siteToken,
            },
            body: JSON.stringify(event),
        });
        if (response.ok)
            return true;
        // 4xx (except 429) is a permanent client error — retrying won't help, so
        // don't buffer it forever. Surface it in dev for debugging.
        if (response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429) {
            if (process.env.NODE_ENV === "development") {
                console.warn(`[ConsentAPI] Server responded with ${response.status} — ` +
                    "not retrying. Check your siteToken and that the endpoint is deployed.");
            }
            return true;
        }
        // 5xx / 429 — transient, worth a retry.
        return false;
    }
    catch (err) {
        // Network failure, CORS issue, endpoint down — transient.
        if (process.env.NODE_ENV === "development") {
            console.error("[ConsentAPI] Failed to log consent event:", err);
        }
        return false;
    }
}
function readQueue() {
    try {
        const raw = localStorage.getItem(CONSENT_QUEUE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function writeQueue(events) {
    try {
        // Keep only the most recent events if we somehow exceed the cap.
        localStorage.setItem(CONSENT_QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUED_EVENTS)));
    }
    catch {
        // localStorage blocked/full — nothing more we can do; drop silently.
    }
}
function enqueue(event) {
    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);
}

/** Backward-compatible default: every category active when no profile is given. */
const ALL_CATEGORIES_PROFILE = {
    essential: true,
    analytics: true,
    marketing: true,
};
// ─── Context ──────────────────────────────────────────────────────────────────
const CookieContext = react.createContext(null);
function useCookieConsent() {
    const ctx = react.useContext(CookieContext);
    if (!ctx)
        throw new Error("useCookieConsent must be used within CookieProvider");
    return ctx;
}
/** Simplified hook — preferences + hasConsent only */
function useCookiePreferences() {
    const { preferences, hasConsent, updatePreferences } = useCookieConsent();
    return { preferences, hasConsent, updatePreferences };
}
/** Simplified hook — analytics event tracking */
function useAnalyticsConsent() {
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
let _openPreferencesModal = null;
function registerPreferencesOpener(fn) {
    _openPreferencesModal = fn;
}
// ─── Provider ─────────────────────────────────────────────────────────────────
function CookieProvider({ children, config, }) {
    const [preferences, setPreferences] = react.useState(DEFAULT_PREFERENCES);
    const [hasConsent, setHasConsent] = react.useState(false);
    const [initialized, setInitialized] = react.useState(false);
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
    react.useEffect(() => {
        try {
            const consentRaw = localStorage.getItem(CONSENT_STORAGE_KEY);
            const prefsRaw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
            if (consentRaw && prefsRaw) {
                const consent = JSON.parse(consentRaw);
                const prefs = JSON.parse(prefsRaw);
                // Guard against a parseable-but-wrong object (hand-edited storage, or
                // an older schema) before feeding it to analyticsService. A bad shape
                // throws into the catch below, which clears storage and starts fresh.
                const validShape = !!consent &&
                    typeof consent.given === "boolean" &&
                    typeof consent.version === "string" &&
                    !!prefs &&
                    typeof prefs.essential === "boolean" &&
                    typeof prefs.analytics === "boolean" &&
                    typeof prefs.marketing === "boolean";
                if (!validShape)
                    throw new Error("Malformed consent storage");
                if (consent.given && consent.version === CONSENT_VERSION) {
                    setHasConsent(true);
                    setPreferences(prefs);
                    analyticsService.initialize(prefs);
                }
                // Version mismatch: banner re-shows, analytics stays off until
                // the user actively re-consents
            }
        }
        catch {
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
    react.useEffect(() => {
        if (typeof window === "undefined")
            return;
        window.openCookieManager = () => _openPreferencesModal?.();
        return () => {
            delete window.openCookieManager;
        };
    }, []);
    // Update preferences. hasConsent is in the dependency array because it
    // decides whether this logs a "granted" (first time) or "updated" action —
    // a stale value would mislabel the event.
    const updatePreferences = react.useCallback((prefs, method = "banner") => {
        // Strip out any category the site doesn't actually use. The UI shouldn't
        // send these, but guard anyway so a stale/forged preference can't record
        // consent for a category that isn't part of this site's profile.
        const sanitized = {
            essential: true,
            analytics: profile.analytics ? prefs.analytics : false,
            marketing: profile.marketing ? prefs.marketing : false,
        };
        const action = hasConsent ? "updated" : "granted";
        // 1. Write to localStorage first — this is the source of truth for UX.
        //    Everything else is secondary to this succeeding.
        const consent = {
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
    }, [hasConsent, analyticsService, consentApi, profile, requiresBanner]);
    // ── Open preferences modal ─────────────────────────────────────────────────
    const openPreferences = react.useCallback(() => {
        _openPreferencesModal?.();
    }, []);
    // ── Track event ────────────────────────────────────────────────────────────
    const trackEvent = react.useCallback((name, params = {}) => {
        if (hasConsent && preferences.analytics) {
            analyticsService.trackEvent(name, params);
        }
    }, [hasConsent, preferences.analytics, analyticsService]);
    // Don't render children until we've checked localStorage
    if (!initialized)
        return null;
    return (jsxRuntime.jsx(CookieContext.Provider, { value: {
            preferences,
            hasConsent,
            updatePreferences,
            openPreferences,
            consentVersion: CONSENT_VERSION,
            trackEvent,
        }, children: children }));
}

exports.CONSENT_STORAGE_KEY = CONSENT_STORAGE_KEY;
exports.CONSENT_VERSION = CONSENT_VERSION;
exports.COOKIE_CATEGORIES = COOKIE_CATEGORIES;
exports.CookieProvider = CookieProvider;
exports.DEFAULT_PREFERENCES = DEFAULT_PREFERENCES;
exports.PREFERENCES_STORAGE_KEY = PREFERENCES_STORAGE_KEY;
exports.acceptAllPreferences = acceptAllPreferences;
exports.essentialOnlyPreferences = essentialOnlyPreferences;
exports.flushConsentQueue = flushConsentQueue;
exports.logConsentEvent = logConsentEvent;
exports.profileRequiresBanner = profileRequiresBanner;
exports.registerPreferencesOpener = registerPreferencesOpener;
exports.useAnalyticsConsent = useAnalyticsConsent;
exports.useCookieConsent = useCookieConsent;
exports.useCookiePreferences = useCookiePreferences;
