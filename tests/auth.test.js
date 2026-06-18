/**
 * authenticateAdmin gates the destructive deletion endpoint on a server-only
 * secret. It must fail closed (deny) when misconfigured or on a wrong token.
 */
import { describe, it, expect, afterEach } from "vitest";
import { authenticateAdmin } from "../lib/auth.js";

const ORIGINAL = process.env.CONSENT_ADMIN_TOKEN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CONSENT_ADMIN_TOKEN;
  else process.env.CONSENT_ADMIN_TOKEN = ORIGINAL;
});

describe("authenticateAdmin", () => {
  it("fails closed when CONSENT_ADMIN_TOKEN is not configured", () => {
    delete process.env.CONSENT_ADMIN_TOKEN;
    expect(authenticateAdmin({ headers: {} }).valid).toBe(false);
  });

  it("rejects a missing or wrong token", () => {
    process.env.CONSENT_ADMIN_TOKEN = "secret-admin-token";
    expect(authenticateAdmin({ headers: {} }).valid).toBe(false);
    expect(
      authenticateAdmin({ headers: { "x-admin-token": "wrong" } }).valid,
    ).toBe(false);
  });

  it("accepts the exact configured token", () => {
    process.env.CONSENT_ADMIN_TOKEN = "secret-admin-token";
    expect(
      authenticateAdmin({ headers: { "x-admin-token": "secret-admin-token" } })
        .valid,
    ).toBe(true);
  });
});
