/**
 * The "Accept all" / "Essential only" presets must be derived from
 * COOKIE_CATEGORIES so adding a category can't silently desync them.
 */
import { describe, it, expect } from "vitest";
import {
  acceptAllPreferences,
  essentialOnlyPreferences,
  profileRequiresBanner,
  COOKIE_CATEGORIES,
} from "../types/cookie-constants";
import type { SiteCookieProfile } from "../types/cookie-constants";

describe("preference presets", () => {
  it("acceptAllPreferences enables every category", () => {
    const prefs = acceptAllPreferences();
    for (const key of Object.keys(COOKIE_CATEGORIES)) {
      expect(prefs[key as keyof typeof prefs]).toBe(true);
    }
  });

  it("essentialOnlyPreferences enables only required categories", () => {
    const prefs = essentialOnlyPreferences();
    for (const [key, info] of Object.entries(COOKIE_CATEGORIES)) {
      expect(prefs[key as keyof typeof prefs]).toBe(info.required);
    }
    expect(prefs.essential).toBe(true);
    expect(prefs.analytics).toBe(false);
    expect(prefs.marketing).toBe(false);
  });

  it("acceptAllPreferences honours a profile — only active categories enabled", () => {
    const analyticsOnly: SiteCookieProfile = {
      essential: true,
      analytics: true,
      marketing: false,
    };
    const prefs = acceptAllPreferences(analyticsOnly);
    expect(prefs.essential).toBe(true);
    expect(prefs.analytics).toBe(true);
    expect(prefs.marketing).toBe(false); // not used by this site → stays off
  });
});

describe("profileRequiresBanner", () => {
  it("is false for an essential-only site", () => {
    expect(
      profileRequiresBanner({
        essential: true,
        analytics: false,
        marketing: false,
      }),
    ).toBe(false);
  });

  it("is true when any non-essential category is active", () => {
    expect(
      profileRequiresBanner({
        essential: true,
        analytics: true,
        marketing: false,
      }),
    ).toBe(true);
    expect(
      profileRequiresBanner({
        essential: true,
        analytics: false,
        marketing: true,
      }),
    ).toBe(true);
  });
});
