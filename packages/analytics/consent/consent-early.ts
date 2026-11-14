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

/**
 * Runs in <head>, before the body paints; the app renders it inline with
 * the request's CSP nonce (apps/app/components/consent/
 * consent-early-script.tsx). A visitor with no stored choice (c15t's `c15t`
 * cookie / localStorage key) gets the attribute that reveals the
 * server-rendered cookie banner, so it paints with the page instead of
 * after hydration (where it used to become a late LCP element).
 *
 * A tap on the banner before it is live is held on `window` and recorded by
 * CookieBanner once c15t starts; Accept/Reject hide the banner at once.
 */
export const CONSENT_EARLY_SCRIPT = `(function(){var r=document.documentElement;try{if(/(?:^|;\\s*)c15t=/.test(document.cookie))return;try{if(localStorage.getItem("c15t"))return}catch(e){}}catch(e){return}r.setAttribute("${CONSENT_EARLY_ATTRIBUTE}","");document.addEventListener("click",function(e){var t=e.target,b=t&&t.closest&&t.closest("[${CONSENT_EARLY_TAP_ATTRIBUTE}]");if(!b||window.__qrdxConsentLive)return;var a=b.getAttribute("${CONSENT_EARLY_TAP_ATTRIBUTE}");window.__qrdxConsentTap=a;if(a!=="customize")r.removeAttribute("${CONSENT_EARLY_ATTRIBUTE}")},true)})()`;

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
