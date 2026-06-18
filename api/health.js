// api/health.js
//
// Lightweight liveness probe for uptime monitors. Static, unauthenticated,
// and deliberately free of internal details (no version, no endpoint list,
// no env hints). Emits no CORS headers — same posture as the deletion
// endpoint; this is not a browser-facing API.

export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  // Don't let monitors cache a stale "ok".
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ status: "ok" });
}
