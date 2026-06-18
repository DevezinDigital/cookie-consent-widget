// lib/db.js
//
// Single Neon HTTP client, created once per warm serverless instance and reused
// across invocations. Memoizing at module scope keeps a single request — which
// may both authenticate and write — from opening multiple clients and burning
// through the pooled connection limit.

import { neon } from "@neondatabase/serverless";

let _sql;

/** Lazily construct and memoize the Neon client for this warm instance. */
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      // Backstop — handlers already return 503 on a missing URL before they
      // reach a query, but throwing here keeps misuse from failing silently.
      throw new Error("DATABASE_URL is not configured");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
