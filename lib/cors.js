// lib/cors.js
//
// Per-request CORS for the consent + deletion endpoints.
//
// These endpoints write PII and erase records, so they must NOT advertise a
// wildcard origin. Instead of emitting `Access-Control-Allow-Origin: *` from
// vercel.json (which let any site on the internet drive them from a visitor's
// browser), we echo the request's Origin header back ONLY when it maps to a
// domain that is registered and active in the site_tokens table. An origin we
// don't recognise gets no ACAO header, so the browser blocks the response.
//
// The allowlist is the same source of truth as auth (site_tokens), so
// registering a site to accept consent automatically allows its origin — no
// second list to maintain. Lookups reuse auth.js's 60s token cache.

import { getSiteToken } from "./auth.js";

// Kept colocated with the origin echo so the advertised methods/headers can't
// drift from what the handlers actually enforce.
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, x-consent-token";

/** Parse an Origin header into a normalized hostname (lowercase, no www.). */
function originToDomain(origin) {
  try {
    return new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Set CORS response headers, echoing the request Origin only if it belongs to
 * a registered, active site. Returns true when the origin is allowed.
 *
 * Server-to-server callers send no Origin header and simply get `false`
 * (no headers set) — CORS is a browser concern, so that's correct and doesn't
 * block non-browser clients; the token + handler logic still gates them.
 */
export async function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return false;

  const domain = originToDomain(origin);
  if (!domain) return false;

  let token;
  try {
    token = await getSiteToken(domain);
  } catch {
    return false; // lookup failed — fail closed for CORS
  }
  if (!token) return false; // unknown or inactive domain

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  return true;
}
