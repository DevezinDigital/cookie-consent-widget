/**
 * app/cookie-policy/page.tsx
 *
 * Cookie Policy page. All text content comes from PRIVACY_CONFIG in site-config.ts.
 *
 * Includes a "Manage Cookie Preferences" button that opens the CookiePreferencesModal.
 * The button is in a client sub-component so the page itself can stay a Server Component.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Shield, ArrowLeft, ExternalLink } from "lucide-react";
import { profileRequiresBanner } from "@devezindigital/cookie-consent";
import {
  SITE,
  PRIVACY_CONFIG,
  COOKIE_CONFIG,
  getActivePrivacySections,
} from "../../lib/site-config";
import { ManageCookiesButton } from "../../components/cookies/ManageCookiesButton";

export const metadata: Metadata = {
  title: `Cookie Policy | ${SITE.name}`,
  description: `${SITE.name}'s cookie policy — how we collect, use, and protect your information.`,
  robots: { index: true, follow: true },
  // Self-referencing canonical so the policy page isn't treated as duplicate
  // content when reachable via trailing slash / query params / www variants.
  // Resolved against the site's `metadataBase` (set in the root layout).
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  // Minimal WebPage structured data. dateModified is bound to the configured
  // last-updated date when set, helping crawlers categorise/age the page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Cookie Policy | ${SITE.name}`,
    description: `${SITE.name}'s cookie policy.`,
    ...(PRIVACY_CONFIG.lastUpdated
      ? { dateModified: PRIVACY_CONFIG.lastUpdated }
      : {}),
  };

  // Only the sections that apply to this site's cookie profile (e.g. no
  // Analytics section when the site sets no analytics cookies).
  const sections = getActivePrivacySections();

  // Essential-only sites have no optional cookies to manage — show a plain
  // statement instead of a "manage preferences" control that opens an empty modal.
  const hasManageableCookies = profileRequiresBanner(
    COOKIE_CONFIG.cookieProfile,
  );

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>

        {/* Header */}
        <header className="mb-10">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Cookie Policy
          </h1>
          <p className="mt-3 text-muted-foreground">
            Last updated:{" "}
            <PolicyDate
              value={PRIVACY_CONFIG.lastUpdated}
              field="lastUpdated"
            />
            {" · "}Effective:{" "}
            <PolicyDate
              value={PRIVACY_CONFIG.effectiveDate}
              field="effectiveDate"
            />
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            This policy describes how {SITE.legalName} collects, uses, and
            shares information about you when you use {SITE.name}. Please read
            it carefully.
          </p>
        </header>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((section, i) => (
            <section
              key={i}
              id={`section-${i + 1}`}
              className="scroll-mt-16"
              aria-labelledby={`heading-${i + 1}`}
            >
              <h2
                id={`heading-${i + 1}`}
                className="mb-3 text-lg font-semibold text-foreground"
              >
                {i + 1}. {section.title}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </section>
          ))}
        </div>

        {/* Cookie preferences CTA — only sites with optional cookies can
            manage preferences. Essential-only sites show a plain statement. */}
        <div className="mt-10 rounded-xl border border-border bg-muted/40 p-6">
          {hasManageableCookies ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {/* Not an <h2>: this is a UI control label, not a content
                    section, so keep it out of the numbered policy heading outline. */}
                <p className="text-sm font-semibold text-foreground">
                  Manage Cookie Preferences
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can review and update your cookie settings at any time.
                </p>
              </div>
              <ManageCookiesButton />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This site only uses essential cookies required for basic
              functionality. No optional tracking is used, so there is nothing
              to manage and no consent is required.
            </p>
          )}
        </div>

        {/* Footer links */}
        <footer className="mt-12 border-t border-border pt-8">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {/* Config-driven so the template never ships links to routes a
                consuming site hasn't created (avoids 404s). See COOKIE_CONFIG. */}
            {COOKIE_CONFIG.footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {link.label}
              </Link>
            ))}
            <a
              href={`mailto:${SITE.contactEmail}`}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Contact us
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            © {SITE.foundedYear} {SITE.legalName}. All rights reserved.
          </p>
        </footer>
      </div>
    </main>
  );
}

/**
 * Renders a policy date, or a glaring warning if it hasn't been set in
 * site-config.ts — so the placeholder can't ship to production unnoticed.
 */
function PolicyDate({ value, field }: { value: string; field: string }) {
  if (!value) {
    return (
      <span className="font-medium text-destructive">
        [set {field} in site-config.ts]
      </span>
    );
  }
  return <time dateTime={value}>{value}</time>;
}
