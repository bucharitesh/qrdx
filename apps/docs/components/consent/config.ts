import { defineConsentConfig, offline } from "@c15t/nextjs";

/** Optional categories QRdx actually uses (plus `necessary`, always on). */
export const CONSENT_CATEGORIES = [
  "necessary",
  "functionality",
  "measurement",
] as const;

/**
 * c15t in offline mode: the choice lives in this browser only (a first-party
 * `c15t` cookie + localStorage), with no consent backend and no network
 * calls. One opt-in rule for every visitor: nothing optional runs until they
 * choose.
 */
export const consentConfig = defineConsentConfig({
  mode: offline({
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
  // PostHog cookies and storage keys (ph_<token>_posthog, …).
  clearOnRevocation: {
    measurement: {
      cookies: ["ph_*"],
      localStorage: ["ph_*"],
      sessionStorage: ["ph_*"],
    },
  },
  options: {
    consentCategories: [...CONSENT_CATEGORIES],
  },
});
