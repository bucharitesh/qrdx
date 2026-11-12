import { defineConsentConfig, local } from "@c15t/nextjs";

/** Optional categories QRdx actually uses (plus `necessary`, always on). */
export const CONSENT_CATEGORIES = [
  "necessary",
  "functionality",
  "measurement",
] as const;

/**
 * c15t in local mode: the choice lives in this browser only (a first-party
 * `c15t` cookie + localStorage), with no consent backend and no network
 * calls. One opt-in rule for every visitor: nothing optional runs until they
 * choose.
 *
 * Keeping no server-side record of the choice is deliberate, and the cookie
 * policy says so (content/legal/cookie-policy.mdx). `acknowledgeNoRecords`
 * hides c15t's development-only console warning about it. Production builds
 * never print it. A server-side consent log would need a c15t backend.
 */
export const consentConfig = defineConsentConfig({
  mode: local({
    acknowledgeNoRecords: true,
    policyRules: [
      {
        id: "qrdx_opt_in",
        match: { isDefault: true, fallback: true },
        model: "opt-in",
        prompt: "choice",
        categories: ["functionality", "measurement"],
        scopeMode: "strict",
        actions: ["accept", "reject", "customize"],
      },
    ],
  }),
  // PostHog cookies and storage keys (ph_<token>_posthog, …), and the
  // analytics-consent mirror for server-side events (lib/analytics).
  clearOnRevocation: {
    measurement: {
      cookies: ["ph_*", "qrdx_analytics"],
      localStorage: ["ph_*"],
      sessionStorage: ["ph_*"],
    },
  },
  options: {
    consentCategories: [...CONSENT_CATEGORIES],
  },
});
