/**
 * Failed consent logs must be buffered and re-sent on a later flush, so the
 * compliance audit trail isn't lossy — without ever throwing or blocking UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logConsentEvent,
  flushConsentQueue,
} from "../services/consent-api-client";
import type { CookiePreferences } from "../types/cookie-constants";

const PREFS: CookiePreferences = {
  essential: true,
  analytics: true,
  marketing: false,
};
const CONFIG = {
  apiUrl: "https://consent.example.com/api/consent",
  siteToken: "tok",
};
const QUEUE_KEY = "cookie_consent_queue";

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeLocalStorageStub());
  vi.stubGlobal("window", {
    location: { hostname: "example.com", href: "https://example.com/p" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consent log buffering", () => {
  it("buffers after retries fail, then flushes when back online", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await logConsentEvent(PREFS, "granted", "banner", CONFIG);

    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY) as string);
    expect(queued).toHaveLength(1);
    expect(queued[0].eventId).toBeTruthy();

    // Back online — flush should clear the queue.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await flushConsentQueue(CONFIG);
    expect(localStorage.getItem(QUEUE_KEY)).toBe("[]");
  });

  it("does not buffer a permanent 4xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );
    await logConsentEvent(PREFS, "granted", "banner", CONFIG);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });
});
