"use client";

import "@/lib/analytics/privacy";
import { ConsentManager as Consent } from "@repo/analytics/consent/consent-manager";
import type { ComponentProps } from "react";

/**
 * A plain <a> for the banner's and preferences' privacy policy links: the
 * policy is a main-app page, so a full page load (components/zone-link.tsx).
 */
function PolicyLink({
  prefetch: _prefetch,
  ...props
}: ComponentProps<"a"> & {
  href: string;
  prefetch?: boolean;
}) {
  return <a {...props} />;
}

/**
 * The cookie banner, preferences and consent-gated tools
 * (packages/analytics/consent), as on the main app's pages, minus the plan
 * lookup: the docs site has no server actions, and the main app's pages
 * set that PostHog person property. @/lib/analytics/privacy registers the
 * docs site's untracked pages before anything is tracked.
 */
export function ConsentManager() {
  return <Consent link={PolicyLink} />;
}
