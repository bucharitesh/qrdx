"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { analyticsHostname } from "./config";
import { setPostHogConsent } from "./posthog";
import { trackPageview } from "./track";
import { flushUmami, getUmamiConfig, isUmamiEnabled } from "./umami";

/**
 * QRdx's analytics, mounted by the consent manager (so never on customer
 * pages or the scanner). On the docs site there is no session sync: the
 * main app's pages identify a signed-in visitor (and reset on sign-out), and
 * PostHog keeps that identity in its qrdx.dev cookie, which the docs pages
 * share. `measurement` is the visitor's Analytics choice, or null while it
 * is still unknown: PostHog waits for it, Umami doesn't need it.
 */
export function Analytics({ measurement }: { measurement: boolean | null }) {
  useEffect(() => {
    if (measurement !== null) setPostHogConsent(measurement);
  }, [measurement]);

  return (
    <>
      <UmamiScript />
      <PageviewTracker />
    </>
  );
}

function UmamiScript() {
  // Client only (the consent manager never server-renders).
  const [config] = useState(() => (isUmamiEnabled() ? getUmamiConfig() : null));
  if (!config) return null;
  return (
    <Script
      // Not "umami": an element id becomes a window global, so window.umami
      // would be this <script> and Umami's tracker would skip installing
      // its API (nothing was ever sent).
      id="umami-loader"
      src={config.scriptUrl}
      // Right after hydration, not when the browser is idle: a visitor who
      // leaves quickly still counts (the script is under 3 KB).
      strategy="afterInteractive"
      data-website-id={config.websiteId}
      data-domains={analyticsHostname()}
      data-auto-track="false"
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      onReady={flushUmami}
    />
  );
}

/** App Router navigations don't reload the page: one pageview per path. */
function PageviewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    trackPageview();
  }, [pathname]);
  return null;
}
