// lib/respond.js
//
// Consistent JSON error envelope across the API handlers, so a caller can
// always parse `{ error: { code, message } }` regardless of which failure it
// hit. Client-facing messages are kept generic (detailed reasons stay in
// server logs) to avoid leaking reconnaissance signal.

/** Send a structured error response: `{ error: { code, message } }`. */
export function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
