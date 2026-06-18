/**
 * Tests for the consent API client's core contract:
 *   1. No network call when config is incomplete (safe in local dev)
 *   2. Correct payload and auth header when configured
 *   3. Never throws — a failed log call must never break the UI
 *
 * Runs in the default node environment; browser globals (window,
 * localStorage, fetch) are stubbed manually to avoid a jsdom dependency.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logConsentEvent } from "../services/consent-api-client";
import { CONSENT_VERSION, CookiePreferences } from "../types/cookie-constants";

const PREFS: CookiePreferences = {
  essential: true,
  analytics: true,
  marketing: false,
};

const CONFIG = {
  apiUrl: "https://consent.example.com/api/consent",
  siteToken: "test-token",
};

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
    location: { hostname: "example.com", href: "https://example.com/page" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logConsentEvent", () => {
  it("skips the network call when config is incomplete", async () => {
    await logConsentEvent(PREFS, "granted", "banner", {
      apiUrl: "",
      siteToken: "",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POSTs the event with the site token header", async () => {
    await logConsentEvent(PREFS, "granted", "banner", CONFIG);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(CONFIG.apiUrl);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-consent-token"]).toBe(
      CONFIG.siteToken,
    );

    const body = JSON.parse(init?.body as string);
    expect(body.site.domain).toBe("example.com");
    expect(body.consent).toEqual({
      action: "granted",
      method: "banner",
      version: CONSENT_VERSION,
      categories: PREFS,
    });
    expect(body.user.sessionId).toBeTruthy();
  });

  it("reuses the same session id across calls", async () => {
    await logConsentEvent(PREFS, "granted", "banner", CONFIG);
    await logConsentEvent(PREFS, "updated", "preferences-modal", CONFIG);

    const calls = vi.mocked(fetch).mock.calls;
    const first = JSON.parse(calls[0][1]?.body as string);
    const second = JSON.parse(calls[1][1]?.body as string);
    expect(first.user.sessionId).toBe(second.user.sessionId);
  });

  it("never throws when the network call fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    await expect(
      logConsentEvent(PREFS, "granted", "banner", CONFIG),
    ).resolves.toBeUndefined();
  });

  it("never throws on a non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(
      logConsentEvent(PREFS, "granted", "banner", CONFIG),
    ).resolves.toBeUndefined();
  });
});
