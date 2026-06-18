// lib/hash.js
import crypto from "crypto";

/**
 * Keyed hash of a low-entropy identifier (an IP, or a session/user id) for
 * PII-minimized storage. Uses HMAC-SHA256 with IP_SALT as the key rather than
 * sha256(value + salt) concatenation — HMAC is the correct construction for
 * keyed hashing and is more resistant to brute-forcing a small input space
 * (e.g. the IPv4 range) if the value is ever known.
 *
 * Throws if IP_SALT is unset so we never emit an unsalted/unkeyed hash
 * (the handlers guard on IP_SALT before reaching here).
 */
export function hashWithSalt(value) {
  const salt = process.env.IP_SALT;
  if (!salt) throw new Error("IP_SALT is not configured");
  return crypto.createHmac("sha256", salt).update(String(value)).digest("hex");
}
