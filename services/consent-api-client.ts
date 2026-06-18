/**
 * HTTP client that POSTs consent events to the serverless compliance endpoint.
 *
 * Logging is best-effort: localStorage is already the source of truth by the
 * time this runs, so the client never throws and never blocks the UI. Failed
 * deliveries get one retry, then are buffered in localStorage and re-sent on
 * the next provider mount (flushConsentQueue).
 */

import {
  CookiePreferences,
  ConsentEvent,
  SESSION_ID_KEY,
  CONSENT_VERSION,
} from "../types/cookie-constants";

// localStorage key for events that failed to POST and are awaiting a retry.
const CONSENT_QUEUE_KEY = "cookie_consent_queue";
// Cap the buffer so a permanently-offline browser can't grow it unbounded.
const MAX_QUEUED_EVENTS = 50;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cryptographically-random id, with a fallback for very old environments. */
function generateEventId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── Session ID ───────────────────────────────────────────────────────────────

/**
 * Stable per-browser identifier for associating consent events with a session,
 * so an erasure request has something to query against. Deliberately not a user
 * ID (anonymous visitors have none) or raw IP (that's PII) — just a random UUID
 * persisted in localStorage, with a Math.random() fallback for old browsers.
 */
function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;

    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(SESSION_ID_KEY, newId);
    return newId;
  } catch {
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
export async function logConsentEvent(
  preferences: CookiePreferences,
  action: ConsentEvent["consent"]["action"],
  method: ConsentEvent["consent"]["method"],
  config: ConsentApiConfig,
): Promise<void> {
  // Guard: don't attempt the call if config is incomplete.
  // This protects local dev environments where env vars may not be set.
  if (!config.apiUrl || !config.siteToken) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ConsentAPI] Skipping log — apiUrl or siteToken not configured. " +
          "Set NEXT_PUBLIC_CONSENT_API and NEXT_PUBLIC_SITE_CONSENT_TOKEN.",
      );
    }
    return;
  }

  const event: ConsentEvent = {
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
  if (await postEvent(event, config)) return;
  await delay(500);
  if (await postEvent(event, config)) return;
  enqueue(event);
}

/**
 * Re-send any events that previously failed to POST. Call this on provider
 * mount so a buffered event (saved while offline / during a 5xx) is flushed on
 * the user's next visit, closing holes in the compliance audit trail.
 *
 * Like logConsentEvent, this never throws.
 */
export async function flushConsentQueue(
  config: ConsentApiConfig,
): Promise<void> {
  if (!config?.apiUrl || !config?.siteToken) return;

  const queued = readQueue();
  if (queued.length === 0) return;

  const stillFailing: ConsentEvent[] = [];
  for (const event of queued) {
    const ok = await postEvent(event, config);
    if (!ok) stillFailing.push(event);
  }
  writeQueue(stillFailing);
}

// ─── Delivery + buffer internals ───────────────────────────────────────────────

/**
 * POST a single event. Returns true when it's been handled (delivered, or a
 * permanent client error we shouldn't retry) and false for transient failures
 * (network, 5xx, 429) that warrant a retry/buffer. Never throws.
 */
async function postEvent(
  event: ConsentEvent,
  config: ConsentApiConfig,
): Promise<boolean> {
  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-consent-token": config.siteToken,
      },
      body: JSON.stringify(event),
    });

    if (response.ok) return true;

    // 4xx (except 429) is a permanent client error — retrying won't help, so
    // don't buffer it forever. Surface it in dev for debugging.
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[ConsentAPI] Server responded with ${response.status} — ` +
            "not retrying. Check your siteToken and that the endpoint is deployed.",
        );
      }
      return true;
    }

    // 5xx / 429 — transient, worth a retry.
    return false;
  } catch (err) {
    // Network failure, CORS issue, endpoint down — transient.
    if (process.env.NODE_ENV === "development") {
      console.error("[ConsentAPI] Failed to log consent event:", err);
    }
    return false;
  }
}

function readQueue(): ConsentEvent[] {
  try {
    const raw = localStorage.getItem(CONSENT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(events: ConsentEvent[]): void {
  try {
    // Keep only the most recent events if we somehow exceed the cap.
    localStorage.setItem(
      CONSENT_QUEUE_KEY,
      JSON.stringify(events.slice(-MAX_QUEUED_EVENTS)),
    );
  } catch {
    // localStorage blocked/full — nothing more we can do; drop silently.
  }
}

function enqueue(event: ConsentEvent): void {
  const queue = readQueue();
  queue.push(event);
  writeQueue(queue);
}
