/**
 * With no Redis configured, the limiter must degrade to the per-instance
 * in-memory limiter (cap requests) rather than failing fully open.
 */
import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../lib/rateLimit.js";

describe("checkRateLimit in-memory fallback (no Redis configured)", () => {
  it("allows up to the limit (20/60s) then denies", async () => {
    const id = `test-ip-${Math.random()}`;
    let allowedCount = 0;
    let lastAllowed = true;
    for (let i = 0; i < 25; i++) {
      const { allowed } = await checkRateLimit(id);
      if (allowed) allowedCount += 1;
      lastAllowed = allowed;
    }
    expect(allowedCount).toBe(20);
    expect(lastAllowed).toBe(false);
  });

  it("buckets independently per identifier", async () => {
    const { allowed } = await checkRateLimit(`fresh-${Math.random()}`);
    expect(allowed).toBe(true);
  });
});
