// api/consent-deletion.js

import { authenticateAdmin } from "../lib/auth.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { db } from "../lib/db.js";
import { getClientIp } from "../lib/clientIp.js";
import { fail } from "../lib/respond.js";
import { hashWithSalt } from "../lib/hash.js";

// This endpoint is SERVER-ONLY (out-of-band GDPR erasure). It is never called
// from a browser, so it intentionally emits no CORS headers — there is no
// allowed origin. It is gated on a server-only admin secret instead.
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "Method not allowed");
  }

  if (!process.env.DATABASE_URL || !process.env.IP_SALT) {
    console.error("DATABASE_URL or IP_SALT is not configured");
    return fail(res, 503, "service_unavailable", "Service not configured");
  }

  // Rate limit deletion requests aggressively. Runs before auth so
  // unauthenticated spam is absorbed by the limiter, not database lookups.
  // failClosed: this endpoint is destructive, so a Redis outage must make it
  // DENY rather than become unlimited (see lib/rateLimit.js).
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`deletion:${ip}`, {
    failClosed: true,
  });
  if (!allowed) return fail(res, 429, "rate_limited", "Too many requests");

  // Erasure is destructive and server-only — require a server-side admin
  // secret (CONSENT_ADMIN_TOKEN via x-admin-token), NOT the browser-public
  // per-site token. A copied NEXT_PUBLIC site token therefore cannot drive
  // erasure (closes the IDOR).
  const auth = authenticateAdmin(req);
  if (!auth.valid) {
    console.warn("[ADMIN_AUTH_FAILED]", auth.reason);
    return fail(res, 401, "unauthorized", "Unauthorized");
  }

  const { userId, sessionId } = req.body ?? {};

  // Who/what authorized this erasure — recorded in the audit trail. Pass an
  // operator name or ticket id via x-requested-by; defaults to "admin".
  const requestedBy = req.headers["x-requested-by"] ?? "admin";

  // Must provide at least one identifier
  if (!userId && !sessionId) {
    return fail(res, 400, "invalid_request", "userId or sessionId required");
  }

  const sql = db();

  // Soft delete — null out PII, keep the record shell.
  // A single UPDATE ... RETURNING avoids a separate lookup query.
  let erased;
  try {
    erased = userId
      ? await sql`
          update consent_logs set
            user_id = null, session_id = null, ip_hash = null,
            user_agent = null, page_url = null,
            deleted_at = now(), deletion_reason = 'gdpr-erasure-request'
          where user_id = ${userId} and deleted_at is null
          returning id
        `
      : await sql`
          update consent_logs set
            user_id = null, session_id = null, ip_hash = null,
            user_agent = null, page_url = null,
            deleted_at = now(), deletion_reason = 'gdpr-erasure-request'
          where session_id = ${sessionId} and deleted_at is null
          returning id
        `;
  } catch (err) {
    console.error("Erasure failed", err);
    return fail(res, 500, "server_error", "Deletion failed");
  }

  // Log the deletion request itself — this row is the compliance proof.
  try {
    await sql`
      insert into deletion_requests (
        user_id, session_id, requesting_ip, status, completed_at,
        records_deleted, requested_by
      ) values (
        ${userId ?? null}, ${sessionId ?? null},
        ${hashWithSalt(ip)},
        'completed', now(), ${erased.length}, ${requestedBy}
      )
    `;
  } catch (err) {
    // The erasure itself succeeded; don't fail the request over the audit row.
    // But this row IS the compliance proof, so a silent loss is a GDPR gap.
    // Make it loud + alertable (greppable tag) for manual reconciliation. Log a
    // hash of the subject — not the raw id, which we just erased — for
    // correlation if the subject re-requests.
    const subjectHash = hashWithSalt(String(userId ?? sessionId));
    console.error(
      "[DELETION_AUDIT_WRITE_FAILED] erasure succeeded but proof row not written",
      {
        subjectHash,
        recordsDeleted: erased.length,
        requestedBy,
        error: err?.message,
      },
    );
  }

  return res.status(200).json({
    message: "Data erased successfully",
    recordsDeleted: erased.length,
  });
}
