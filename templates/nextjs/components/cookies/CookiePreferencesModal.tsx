"use client";

/**
 * components/cookies/CookiePreferencesModal.tsx
 *
 * Accessible modal dialog for granular per-category cookie consent.
 * Registers itself with the CookieProvider via registerPreferencesOpener()
 * so it can be opened from anywhere (including window.openCookieManager).
 *
 * Drop this anywhere inside <CookieProvider> — typically in layout.tsx
 * alongside <CookieBanner>.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronDown, ChevronUp, Lock } from "lucide-react";
import {
  registerPreferencesOpener,
  useCookieConsent,
} from "@devezindigital/cookie-consent";
import {
  CookiePreferences,
  COOKIE_CATEGORIES,
  acceptAllPreferences,
} from "@devezindigital/cookie-consent";
import { COOKIE_CONFIG } from "../../lib/site-config";

export function CookiePreferencesModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<keyof CookiePreferences>>(
    new Set(),
  );
  const [draft, setDraft] = useState<CookiePreferences | null>(null);

  const { preferences, updatePreferences } = useCookieConsent();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The element focused before the modal opened, so we can restore focus to
  // it on close (WCAG 2.4.3 — return focus to the trigger).
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Register opener with the provider
  useEffect(() => {
    registerPreferencesOpener(() => setIsOpen(true));
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setExpanded(new Set());
    setDraft(null);
    // Return focus to whatever opened the modal (the trigger button)
    previouslyFocusedRef.current?.focus();
    previouslyFocusedRef.current = null;
  }, []);

  // Capture the trigger element once, when the modal opens
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current =
        document.activeElement as HTMLElement | null;
    }
  }, [isOpen]);

  // Sync draft with current preferences when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraft({ ...preferences });
      // Move focus into the dialog after open
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
  }, [isOpen, preferences]);

  // Keyboard handling while open: Escape closes; Tab/Shift+Tab is trapped
  // inside the dialog so focus can't escape to the page behind the overlay
  // (WAI-ARIA Dialog pattern; WCAG 2.4.3).
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
    // close is stable (useCallback); included for exhaustive-deps correctness
  }, [isOpen, close]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) close();
  };

  const toggleExpand = (key: keyof CookiePreferences) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (key: keyof CookiePreferences) => {
    if (!draft || COOKIE_CATEGORIES[key].required) return;
    setDraft((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  };

  const handleSaveAll = () => {
    if (draft) {
      updatePreferences(draft);
      close();
    }
  };

  const handleAcceptAll = () => {
    // Only enables categories this site actually uses (see cookieProfile).
    updatePreferences(acceptAllPreferences(COOKIE_CONFIG.cookieProfile));
    close();
  };

  if (!isOpen || !draft) return null;

  // Show essential plus only the categories this site actually uses. An
  // analytics-only site never renders a marketing toggle, etc.
  const categories = (
    Object.entries(COOKIE_CATEGORIES) as [
      keyof CookiePreferences,
      (typeof COOKIE_CATEGORIES)[keyof CookiePreferences],
    ][]
  ).filter(
    ([key]) => key === "essential" || COOKIE_CONFIG.cookieProfile[key] === true,
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-prefs-title"
        aria-describedby="cookie-prefs-desc"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2
            id="cookie-prefs-title"
            className="text-base font-semibold text-foreground"
          >
            Cookie Preferences
          </h2>
          <button
            ref={closeButtonRef}
            onClick={close}
            aria-label="Close cookie preferences"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p
            id="cookie-prefs-desc"
            className="mb-5 text-sm text-muted-foreground leading-relaxed"
          >
            We use different types of cookies to optimise your experience on our
            website. You can choose which categories you consent to below. Your
            choices will be saved and respected on every visit.
          </p>

          <div className="space-y-3">
            {categories.map(([key, info]) => {
              const isExpanded = expanded.has(key);
              const isChecked = draft[key];
              const isRequired = info.required;

              return (
                <div
                  key={key}
                  className="rounded-xl border border-border overflow-hidden"
                >
                  {/* Category row */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpand(key)}
                      aria-expanded={isExpanded}
                      aria-controls={`cookie-detail-${key}`}
                      aria-label={`${info.label} — show details`}
                      className="flex-1 flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {info.label}
                      </span>
                      {isExpanded ? (
                        <ChevronUp
                          className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronDown
                          className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>

                    {/* Toggle switch */}
                    {isRequired ? (
                      <div
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        aria-label="Always active"
                      >
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        <span>Always on</span>
                      </div>
                    ) : (
                      <CategoryToggle
                        checked={isChecked}
                        onToggle={() => toggleCategory(key)}
                        label={`Toggle ${info.label} cookies`}
                      />
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      id={`cookie-detail-${key}`}
                      className="border-t border-border bg-muted/30 px-4 pb-4 pt-3"
                    >
                      <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                        {info.description}
                      </p>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-foreground">
                          Examples:
                        </p>
                        <ul className="space-y-1" role="list">
                          {info.examples.map((ex) => (
                            <li
                              key={ex}
                              className="text-xs text-muted-foreground flex items-center gap-1.5"
                            >
                              <span
                                className="h-1 w-1 rounded-full bg-muted-foreground/50 flex-shrink-0"
                                aria-hidden="true"
                              />
                              {ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button
              onClick={handleAcceptAll}
              className="flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Accept all
            </button>
            <button
              onClick={handleSaveAll}
              className="flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Save preferences
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            You can update your preferences at any time from our{" "}
            <a
              href={COOKIE_CONFIG.policyUrl}
              className="underline underline-offset-2 hover:no-underline"
            >
              Cookie Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle sub-component ─────────────────────────────────────────────────────

function CategoryToggle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
