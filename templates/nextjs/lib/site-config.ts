/**
 * lib/site-config.ts
 *
 * Central configuration for your site's identity and cookie/privacy settings.
 * Update the placeholder values below to match your site before going live.
 */

// ─── Site identity ───────────────────────────────────────────────────────────

export const SITE = {
  /** Display name shown in the cookie banner and policy page */
  name: "Your Site Name",

  /** Legal entity name used in the privacy policy */
  legalName: "Your Company Ltd",

  /** Contact email shown in the cookie policy footer */
  contactEmail: "privacy@example.com",

  /** Year of incorporation — used in the copyright notice */
  foundedYear: 2024,
};

// ─── Cookie consent ──────────────────────────────────────────────────────────

export const COOKIE_CONFIG = {
  /** Set to false to hide all cookie consent UI (banner, modal, manage button) */
  enabled: true,

  /**
   * Which cookie categories this site actually uses.
   *
   * HOW TO USE:
   * - Set a category to true only if you are actively using tools in it.
   * - The banner only appears when analytics OR marketing is true. An
   *   essential-only site shows no banner and no modal.
   * - Flip a category false → true when you add that tool; the banner, modal,
   *   and cookie-policy page all update on the next deploy. You never edit
   *   CookieBanner, CookiePreferencesModal, or the policy page.
   *
   * CATEGORY GUIDE:
   *   analytics: true   → using GA4 or another cookie-based analytics tool
   *   analytics: false  → cookieless analytics only (Vercel/Cloudflare) or none
   *   marketing: true   → using ad pixels (Meta, TikTok, Google Ads, etc.)
   *   marketing: false  → no paid advertising or retargeting
   */
  cookieProfile: {
    essential: true as const, // always true — do not change
    analytics: false, // ← set true when you add GA4
    marketing: false, // ← set true when you add ad pixels
  },

  /** Where the banner and preferences modal link to (e.g. "/privacy") */
  policyUrl: "/cookie-policy",

  /**
   * Extra links shown in the cookie-policy page footer. Only add routes that
   * actually exist on your site — a link to a missing page is a 404 (a minor
   * SEO/UX negative). The defaults below are commented out for that reason;
   * uncomment the ones you've created.
   */
  footerLinks: [
    // { label: "Terms of Service", href: "/terms" },
    // { label: "Accessibility", href: "/accessibility" },
  ] as { label: string; href: string }[],
};

// ─── Privacy / Cookie policy ─────────────────────────────────────────────────

export const PRIVACY_CONFIG = {
  /**
   * REQUIRED before launch — ISO date string (e.g. "2026-06-12"), displayed in
   * the policy header. Left empty on purpose: an unset date renders a visible
   * "[set …]" warning on the page so this placeholder can't ship silently. A
   * stale "last updated" date on a legal page misleads users and crawlers.
   */
  lastUpdated: "",

  /** REQUIRED before launch — ISO date when this policy version takes effect. */
  effectiveDate: "",

  /**
   * Policy sections rendered in order on the /cookie-policy page.
   * Add, remove, or rewrite sections to match your site's data practices.
   *
   * Category-specific sections carry an `activeWhen` flag tied to
   * COOKIE_CONFIG.cookieProfile, so the policy only describes the cookies the
   * site actually sets. Render them via `getActivePrivacySections()` below —
   * sections without `activeWhen` are always shown.
   */
  sections: [
    {
      title: "Information We Collect",
      content:
        "We collect information you provide directly (such as contact form submissions) and information collected automatically through cookies and similar technologies. Automatically collected data may include your IP address, browser type, operating system, referring URLs, and information about how you interact with our site.",
    },
    {
      title: "How We Use Cookies",
      content:
        "Cookies are small text files stored on your device when you visit our site. We use essential cookies to make the site function correctly, and — where applicable — analytics and marketing cookies as described below. Essential cookies cannot be disabled as they are necessary for core functionality such as remembering your consent preferences.",
    },
    {
      title: "Analytics",
      activeWhen: COOKIE_CONFIG.cookieProfile.analytics,
      content:
        "When you consent to analytics cookies, we use Google Analytics 4 to collect anonymised usage data such as pages visited, time on site, and traffic sources. GA4 sets cookies on your device to distinguish unique users and sessions. We also use cookieless analytics providers (Cloudflare Web Analytics and Vercel Analytics) that do not store cookies or collect personal data — these are always active regardless of your consent choice.",
    },
    {
      title: "Marketing",
      activeWhen: COOKIE_CONFIG.cookieProfile.marketing,
      content:
        "When you consent to marketing cookies, we and trusted third-party partners set cookies that track your visit across sites so we can measure campaigns and show you relevant advertising. These may include advertising pixels and retargeting tags. Marketing cookies are never set without your consent.",
    },
    {
      title: "Your Choices",
      content:
        "You can manage your cookie preferences at any time using the cookie settings button on this page or in the site footer. You may also clear cookies through your browser settings. Withdrawing consent does not affect the lawfulness of processing carried out before withdrawal.",
    },
    {
      title: "Data Retention",
      content:
        "Consent records are retained for the period required by applicable law (typically 3 years under GDPR) to demonstrate that valid consent was obtained. Analytics data is retained in aggregate form and cannot be used to identify individual users after collection.",
    },
    {
      title: "Third-Party Services",
      content:
        "We may share anonymised, aggregated data with third-party analytics providers to help us understand site usage. We do not sell your personal information. Third-party services used on this site are governed by their own privacy policies.",
    },
    {
      title: "Your Rights",
      content:
        "Depending on your jurisdiction you may have the right to access, correct, delete, or port your personal data, and to object to or restrict certain processing. To exercise any of these rights, please contact us using the details at the bottom of this page.",
    },
    {
      title: "Changes to This Policy",
      content:
        "We may update this policy from time to time. Material changes will be communicated by updating the 'Last updated' date at the top of this page and, where required, re-prompting you for consent.",
    },
    {
      title: "Contact",
      content:
        "If you have questions about this cookie policy or our data practices, please contact us at the email address listed below.",
    },
  ],
};

/**
 * The policy sections that apply to this site, in order. Category-specific
 * sections (Analytics, Marketing) are dropped when their category is off in
 * COOKIE_CONFIG.cookieProfile, so the policy never describes cookies the site
 * doesn't set. Sections without an `activeWhen` flag are always included.
 */
export function getActivePrivacySections() {
  return PRIVACY_CONFIG.sections.filter(
    (s) => !("activeWhen" in s) || s.activeWhen,
  );
}
