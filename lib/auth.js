// lib/auth.js

import crypto from "crypto";
import { db } from "./db.js";

/**
 * Per-site tokens live in the site_tokens table (see db/schema.sql).
 * To register a site, generate a token (`openssl rand -hex 24`) and run:
 *
 *   insert into site_tokens (domain, token) values ('example.com', '<token>');
 *
 * in the Neon SQL Editor, then set the same value as
 * NEXT_PUBLIC_SITE_CONSENT_TOKEN in the consuming site. Set active = false
 * to cut a site off without deleting its row.
 *
 * Lookups are cached in module scope for 60s, so repeat events from the
 * same warm serverless instance skip the database round trip. Callers must
 * rate-limit BEFORE authenticating so unauthenticated spam hits Redis
 * (which fails open and is cheap) rather than the database.
 */
const CACHE_TTL_MS = 60_000;
const tokenCache = new Map(); // normalized domain -> { token, expires }

/** Normalize a hostname: lowercase, strip a leading "www." */
function normalizeDomain(domain) {
  return String(domain)
    .toLowerCase()
    .replace(/^www\./, "");
}

/** Constant-time comparison to avoid leaking token contents via timing */
function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Authenticate a privileged (admin) request — currently only the GDPR erasure
 * endpoint. Verifies the `x-admin-token` header against CONSENT_ADMIN_TOKEN, a
 * SERVER-ONLY secret that is never exposed to browsers.
 *
 * This is deliberately separate from authenticateRequest: the per-site token
 * ships to browsers via NEXT_PUBLIC_* and can only coarsely attribute a
 * request to a domain — it must NOT be able to authorize destructive
 * operations. Erasure is called out-of-band from a trusted server context, so
 * it gates on this admin secret instead.
 */
export function authenticateAdmin(req) {
  const provided = req.headers["x-admin-token"];
  const expected = process.env.CONSENT_ADMIN_TOKEN;

  if (!expected) {
    // Misconfiguration — refuse rather than allow an unauthenticated erasure.
    return { valid: false, reason: "Admin auth not configured" };
  }
  if (!provided || !tokensMatch(provided, expected)) {
    return { valid: false, reason: "Unauthorized" };
  }
  return { valid: true };
}

export async function getSiteToken(domain) {
  const cached = tokenCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.token;

  const sql = db();
  const rows = await sql`
    select token from site_tokens where domain = ${domain} and active
  `;
  const token = rows[0]?.token ?? null;

  // Cache misses too, so unknown domains can't bypass the cache
  tokenCache.set(domain, { token, expires: Date.now() + CACHE_TTL_MS });
  return token;
}

export async function authenticateRequest(req) {
  const token = req.headers["x-consent-token"];
  const domain = req.body?.site?.domain;

  if (!token || !domain) {
    return { valid: false, reason: "Missing token or domain" };
  }

  let expected;
  try {
    expected = await getSiteToken(normalizeDomain(domain));
  } catch (err) {
    console.error("Site token lookup failed", err);
    return { valid: false, reason: "Authentication unavailable" };
  }

  if (!expected || !tokensMatch(token, expected)) {
    return { valid: false, reason: "Invalid token for domain" };
  }

  return { valid: true };
}
