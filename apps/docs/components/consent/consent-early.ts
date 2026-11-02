import type { HeadlessConsentSurfaceAction } from "@c15t/nextjs/headless";

/** Set on <html> by ConsentEarlyScript when no choice is stored yet. */
export const CONSENT_EARLY_ATTRIBUTE = "data-consent-prompt";

/** Marks the banner buttons whose taps ConsentEarlyScript holds until c15t starts. */
export const CONSENT_EARLY_TAP_ATTRIBUTE = "data-consent-action";

/**
 * The banner's buttons before c15t has resolved the policy (server HTML and
 * hydration). Must match `banner.orderedActions` for the opt-in rule in
 * config.ts, or the buttons reorder when c15t starts.
 */
export const EARLY_BANNER_ACTIONS: readonly HeadlessConsentSurfaceAction[] = [
  "reject",
  "accept",
  "customize",
];

const EARLY_ACTIONS = new Set<string>(EARLY_BANNER_ACTIONS);

declare global {
  interface Window {
    /** True once the banner is driven by c15t (taps go straight to it). */
    __qrdxConsentLive?: boolean;
    /** A banner tap made before that, for CookieBanner to replay. */
    __qrdxConsentTap?: string;
  }
}

/** Takes (and clears) a tap held by ConsentEarlyScript, and stops holding new ones. */
export function takeEarlyConsentTap(): HeadlessConsentSurfaceAction | null {
  window.__qrdxConsentLive = true;
  const tap = window.__qrdxConsentTap;
  window.__qrdxConsentTap = undefined;
  return tap && EARLY_ACTIONS.has(tap)
    ? (tap as HeadlessConsentSurfaceAction)
    : null;
}
