/**
 * lib/cookie-constants.ts
 *
 * @deprecated This module is now a thin re-export of the single canonical
 * contract in `types/cookie-constants.ts`. It previously defined its own copy
 * of the types and constants, which drifted from the canonical source — most
 * dangerously `CONSENT_VERSION` ("1.0.0" here vs "1.0" canonical), which
 * controls when every user is re-prompted for consent.
 *
 * Kept only so any site that copied this path keeps compiling. New code should
 * import from `types/cookie-constants.ts` or from the package entry
 * (`@devezindigital/cookie-consent`). Do NOT add definitions here.
 */

export * from "../types/cookie-constants";

// Back-compat alias: this module historically named the category-info interface
// `CookieCategoryInfo`; the canonical name is `CookieCategory`.
export type { CookieCategory as CookieCategoryInfo } from "../types/cookie-constants";
