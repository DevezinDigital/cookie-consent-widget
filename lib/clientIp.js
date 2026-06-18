// lib/clientIp.js
//
// Resolve the client IP used for rate-limiting and IP hashing.
//
// On Vercel, `x-real-ip` and `x-forwarded-for` are set BY THE PLATFORM and
// external values are not forwarded — Vercel overwrites them specifically to
// prevent IP spoofing. We prefer `x-real-ip` (a single platform-validated
// value) and fall back to the first hop of `x-forwarded-for`.
//
// SECURITY — this trust assumption holds ONLY behind a proxy that overwrites
// these headers (Vercel does). If this code is ever deployed somewhere that
// passes a client-supplied `x-forwarded-for` through untouched, an attacker
// can prepend a fake IP to get a fresh rate-limit bucket per request and to
// poison the stored IP hash. Re-validate this function before porting off
// Vercel or putting another proxy in front of it.

export function getClientIp(req) {
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).split(",")[0].trim();

  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();

  return "unknown";
}
