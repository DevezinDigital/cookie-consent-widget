// api/consent.js

import crypto from "crypto";
import { authenticateRequest } from "../lib/auth.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { applyCors } from "../lib/cors.js";
import { db } from "../lib/db.js";
import { getClientIp } from "../lib/clientIp.js";
import { fail } from "../lib/respond.js";
import { hashWithSalt } from "../lib/hash.js";

const AXIOM_TOKEN = process.env.AXIOM_TOKEN;
const AXIOM_DATASET = process.env.AXIOM_DATASET;

// ─── Request validation bounds ────────────────────────────────────────────────
// Validate shape + size at the edge so malformed or oversized payloads are
// rejected with a clean 400/413 before they ever reach Neon (no wasted DB
// round trip, no storage amplification on the jsonb column).
const VALID_ACTIONS = new Set(["granted", "updated", "withdrawn"]);
const KNOWN_CATEGORIES = ["essential", "analytics", "marketing"];
const MAX_BODY_BYTES = 8 * 1024; // consent events are tiny
const MAX_DOMAIN_LEN = 253; // max DNS name length
const MAX_URL_LEN = 2048;
const MAX_UA_LEN = 512;

function isWithinLen(value, max) {
  return value == null || (typeof value === "string" && value.length <= max);
}

function isValidCategories(categories) {
  if (
    typeof categories !== "object" ||
    categories === null ||
    Array.isArray(categories)
  ) {
    return false;
  }
  const keys = Object.keys(categories);
  if (keys.length === 0 || keys.length > KNOWN_CATEGORIES.length) return false;
  return keys.every(
    (k) => KNOWN_CATEGORIES.includes(k) && typeof categories[k] === "boolean",
  );
}

// IP hashing uses the shared keyed-HMAC helper (see lib/hash.js).

// EU/EEA member states plus the UK (UK GDPR is equivalent for our purposes)
const GDPR_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO", // EEA
  "GB",
]);

function detectJurisdiction(req) {
  // Vercel sets these geo headers on every request
  const country = req.headers["x-vercel-ip-country"];
  const region = req.headers["x-vercel-ip-country-region"];
  if (country && GDPR_COUNTRIES.has(country)) return "EU";
  if (country === "US" && region === "CA") return "US-CA";
  return "UNKNOWN";
}

export default async function handler(req, res) {
  // CORS is set per-request against the site_tokens allowlist (lib/cors.js).
  // An unrecognised origin gets no Access-Control-Allow-Origin header, so the
  // browser blocks the preflight and the request never reaches our logic.
  await applyCors(req, res);

  // CORS preflight — browsers require a 2xx here before they will send
  // the actual POST. Headers (when allowed) were set by applyCors above.
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "Method not allowed");
  }

  if (!process.env.DATABASE_URL || !process.env.IP_SALT) {
    console.error("DATABASE_URL or IP_SALT is not configured");
    return fail(res, 503, "service_unavailable", "Service not configured");
  }

  // 1. Rate limit by IP (Vercel-validated — see lib/clientIp.js).
  //    Runs before auth so unauthenticated spam is absorbed by the limiter
  //    instead of triggering database token lookups. Best-effort endpoint:
  //    degrades to the in-memory limiter on a Redis outage, never fully open.
  const ip = getClientIp(req);
  const { allowed, remaining } = await checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", remaining);
  if (!allowed) {
    return fail(res, 429, "rate_limited", "Too many requests");
  }

  // 2. Authenticate the request against the site_tokens table.
  //    Return a single generic 401 so a prober can't distinguish "wrong token"
  //    from "unknown domain"; the detailed reason stays in server logs only.
  const auth = await authenticateRequest(req);
  if (!auth.valid) {
    console.warn("[AUTH_FAILED]", auth.reason);
    return fail(res, 401, "unauthorized", "Unauthorized");
  }

  // 3. Validate shape + bounds — reject early so bad payloads never hit the DB.
  // Reject oversized bodies before doing any further work.
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return fail(res, 413, "payload_too_large", "Payload too large");
  }

  const body = req.body ?? {};
  if (
    !body.site?.domain ||
    !body.consent?.action ||
    !body.consent?.categories
  ) {
    return fail(res, 400, "invalid_request", "Missing required fields");
  }
  if (!VALID_ACTIONS.has(body.consent.action)) {
    return fail(res, 400, "invalid_request", "Invalid consent action");
  }
  if (!isValidCategories(body.consent.categories)) {
    return fail(res, 400, "invalid_request", "Invalid categories");
  }
  if (
    !isWithinLen(body.site.domain, MAX_DOMAIN_LEN) ||
    !isWithinLen(body.site.url, MAX_URL_LEN) ||
    !isWithinLen(req.headers["user-agent"], MAX_UA_LEN)
  ) {
    return fail(res, 400, "invalid_request", "Field too long");
  }

  const jurisdiction = detectJurisdiction(req);

  // Use the client-provided idempotency key when present (lets a buffered
  // re-send dedupe against the event_id unique constraint); else generate one.
  const clientEventId =
    typeof body.eventId === "string" && body.eventId.length <= 64
      ? body.eventId
      : null;

  // Build the canonical event — always use server-side timestamp
  const event = {
    eventId: clientEventId ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    schemaVersion: "1.0",
    site: {
      domain: body.site.domain,
      url: body.site.url ?? null,
    },
    user: {
      sessionId: body.user?.sessionId ?? null,
      userId: body.user?.userId ?? null,
      ipAddressHash: hashWithSalt(ip),
      userAgent: req.headers["user-agent"] ?? null,
    },
    consent: {
      action: body.consent.action,
      method: body.consent.method ?? null,
      version: body.consent.version ?? null,
      categories: body.consent.categories,
    },
    compliance: {
      regulation:
        jurisdiction === "EU"
          ? "GDPR"
          : jurisdiction === "US-CA"
            ? "CCPA"
            : "BOTH",
      jurisdiction,
      legalBasis: body.compliance?.legalBasis ?? "consent",
    },
  };

  // Write to Neon (compliance record)
  try {
    const sql = db();
    await sql`
      insert into consent_logs (
        event_id, schema_version, site_domain, page_url,
        session_id, user_id, ip_hash, user_agent,
        action, method, consent_version, categories,
        regulation, jurisdiction, legal_basis
      ) values (
        ${event.eventId}, ${event.schemaVersion},
        ${event.site.domain}, ${event.site.url},
        ${event.user.sessionId}, ${event.user.userId},
        ${event.user.ipAddressHash}, ${event.user.userAgent},
        ${event.consent.action}, ${event.consent.method},
        ${event.consent.version}, ${JSON.stringify(event.consent.categories)}::jsonb,
        ${event.compliance.regulation}, ${event.compliance.jurisdiction},
        ${event.compliance.legalBasis}
      )
    `;
  } catch (dbError) {
    // Duplicate event_id (Postgres unique_violation) → this exact event was
    // already recorded, e.g. a buffered client re-send. Idempotent success.
    if (
      dbError?.code === "23505" ||
      /duplicate key|unique constraint/i.test(dbError?.message ?? "")
    ) {
      return res
        .status(200)
        .json({ eventId: event.eventId, deduplicated: true });
    }
    console.error("DB write failed", dbError);
    return fail(res, 500, "server_error", "Failed to record consent");
  }

  // Write to Axiom (operational logging) — fire and forget, but BOUNDED: a
  // slow/degraded Axiom must not hang a warm instance and tie up concurrency.
  if (AXIOM_TOKEN) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    fetch(`https://api.axiom.co/v1/datasets/${AXIOM_DATASET}/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AXIOM_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([event]),
      signal: controller.signal,
    })
      .catch((err) => console.error("Axiom ingest failed", err))
      .finally(() => clearTimeout(timeout));
  }

  return res.status(200).json({ eventId: event.eventId });
}
