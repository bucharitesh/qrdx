import { InlineScript } from "@/components/csp-nonce";
import {
  CONSENT_EARLY_ATTRIBUTE,
  CONSENT_EARLY_TAP_ATTRIBUTE,
} from "./consent-early";

/**
 * Runs in <head>, before the body paints. A visitor with no stored choice
 * (c15t's `c15t` cookie / localStorage key) gets the attribute that reveals
 * the server-rendered cookie banner, so it paints with the page instead of
 * after hydration (where it used to become a late LCP element).
 *
 * A tap on the banner before it is live is held on `window` and recorded by
 * CookieBanner once c15t starts; Accept/Reject hide the banner at once.
 */
const script = `(function(){var r=document.documentElement;try{if(/(?:^|;\\s*)c15t=/.test(document.cookie))return;try{if(localStorage.getItem("c15t"))return}catch(e){}}catch(e){return}r.setAttribute("${CONSENT_EARLY_ATTRIBUTE}","");document.addEventListener("click",function(e){var t=e.target,b=t&&t.closest&&t.closest("[${CONSENT_EARLY_TAP_ATTRIBUTE}]");if(!b||window.__qrdxConsentLive)return;var a=b.getAttribute("${CONSENT_EARLY_TAP_ATTRIBUTE}");window.__qrdxConsentTap=a;if(a!=="customize")r.removeAttribute("${CONSENT_EARLY_ATTRIBUTE}")},true)})()`;

/** Carries the request's CSP nonce on nonce routes (lib/security/csp.ts). */
export function ConsentEarlyScript() {
  return <InlineScript html={script} />;
}
