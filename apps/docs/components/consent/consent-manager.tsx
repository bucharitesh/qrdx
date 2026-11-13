"use client";

import "@/lib/analytics/privacy";
import { ConsentManager as Consent } from "@repo/analytics/consent/consent-manager";
import { getAnalyticsPlan } from "@/actions/analytics";
import { LocaleLink } from "@/components/i18n/locale-link";

/**
 * The cookie banner, preferences and consent-gated tools
 * (packages/analytics/consent), with this app's pieces: links that keep the
 * visitor's language, and the server action that reads the signed-in user's
 * plan for PostHog. @/lib/analytics/privacy registers the app's untracked
 * pages before anything is tracked.
 */
export function ConsentManager() {
  return <Consent link={LocaleLink} getPlan={getAnalyticsPlan} />;
}
