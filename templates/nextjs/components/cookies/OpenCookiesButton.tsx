"use client";

// Mirror the typed global the package declares on CookieProvider, so we can
// reach the module-level modal opener without casting `window` to `any`.
declare global {
  interface Window {
    openCookieManager?: () => void;
  }
}

export function OpenCookiesButton() {
  return (
    <button
      onClick={() => {
        if (
          typeof window !== "undefined" &&
          typeof window.openCookieManager === "function"
        ) {
          window.openCookieManager();
        }
      }}
      className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Open cookie preferences
    </button>
  );
}
