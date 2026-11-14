import "server-only";

import { randomBytes } from "node:crypto";
import { ENGLISH_SCAN_PAGES, type ScanPagesIntl } from "@/lib/i18n/scan-pages";
import { baseUrl } from "@/lib/metadata";
import { escapeHtml, reportAbuseUrl } from "@/lib/redirect/pages";
import { LOCATION_DECIMALS, LOCATION_ENDPOINT } from "./geo";

/**
 * The "Share your location?" step a redirect code shows before its
 * destination when the owner turned on precise location (./server.ts). It
 * never traps anyone: Skip is a plain link to the destination, and a denial,
 * an error, a slow answer (WAIT_MS after Allow) or a failed request all
 * continue there too. Without JavaScript it continues at once. A browser
 * that already answered for this site goes straight on (denied) or shares
 * without a second click (granted).
 */

/** From the Allow click (the browser's prompt) to continuing anyway. */
export const WAIT_MS = 8000;
/** How long the location request may take before continuing anyway. */
export const SEND_TIMEOUT_MS = 4000;

const STYLES = `:root{color-scheme:light dark;--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--card:#fff;--border:#e5e5e5}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--card:#171717;--border:#262626}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:var(--bg);color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:400px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:36px 28px 28px}
h1{font-size:20px;line-height:1.3;margin:0 0 8px}
p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
.actions{display:flex;flex-direction:column;gap:8px;margin-top:24px}
.actions button,.actions a{display:block;width:100%;font:inherit;font-size:16px;font-weight:600;line-height:1.25;border-radius:10px;padding:12px;text-decoration:none;cursor:pointer}
#allow{color:var(--card);background:var(--fg);border:1px solid var(--fg)}
#allow:disabled{opacity:.6;cursor:default}
#skip{color:var(--fg);background:transparent;border:1px solid var(--border)}
.actions button:focus-visible,.actions a:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.status{margin-top:16px;font-size:14px}
.status:empty{display:none}
.next{margin-top:16px;font-size:13px;overflow-wrap:anywhere}
.next strong{color:var(--fg);font-weight:600}
footer{display:flex;gap:12px}
footer a{color:var(--muted);font-size:12px}`;

/** JSON safe to embed in an inline <script>. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

// ES5, no dependencies. `d` = { token, next, endpoint, wait, send, digits,
// text: { allow, waiting, opening, locating } } (the scanner's language).
const SCRIPT = `(function(){var d=window.__qrdxLocation,done=false,timer=0;var allow=document.getElementById("allow"),status=document.getElementById("status");function go(url){if(done)return;done=true;clearTimeout(timer);location.replace(url||d.next)}function say(text){if(status)status.textContent=text}function round(v){var f=Math.pow(10,d.digits);return Math.round(v*f)/f}function send(pos){var c=pos.coords;say(d.text.opening);var ctl=window.AbortController?new AbortController():null;timer=setTimeout(function(){if(ctl)ctl.abort();go()},d.send);try{fetch(d.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"omit",cache:"no-store",signal:ctl?ctl.signal:undefined,body:JSON.stringify({token:d.token,latitude:round(c.latitude),longitude:round(c.longitude),accuracy:Math.round(c.accuracy)})}).then(function(r){return r.ok?r.json():null}).then(function(j){go(j&&typeof j.url==="string"?j.url:null)},function(){go()})}catch(e){go()}}function ask(){if(done)return;if(allow){allow.disabled=true;allow.textContent=d.text.waiting}clearTimeout(timer);timer=setTimeout(function(){go()},d.wait);try{navigator.geolocation.getCurrentPosition(function(p){clearTimeout(timer);send(p)},function(){go()},{enableHighAccuracy:false,maximumAge:300000,timeout:d.wait})}catch(e){go()}}if(!("geolocation" in navigator)){go();return}if(allow)allow.addEventListener("click",ask);window.addEventListener("pageshow",function(e){if(e.persisted){done=false;if(allow){allow.disabled=false;allow.textContent=d.text.allow}say("")}});try{navigator.permissions.query({name:"geolocation"}).then(function(s){if(s.state==="granted"){say(d.text.locating);ask()}else if(s.state==="denied"){go()}},function(){})}catch(e){}})();`;

/** Only absolute http(s) URLs are ever followed or linked. */
function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * The step for one scan. `next` is where Skip (and every failure) goes: the
 * destination routed with the network location. The endpoint may answer
 * with another URL once it has the precise one (geofence rules).
 */
export function locationStepPage({
  token,
  next,
  slug,
  intl = ENGLISH_SCAN_PAGES,
}: {
  token: string;
  next: string;
  slug: string;
  /** The scanner's language (lib/i18n/scan-pages.ts). */
  intl?: ScanPagesIntl;
}): Response {
  const { t, locale } = intl;
  const text = (
    key:
      | "location.title"
      | "location.body"
      | "location.allow"
      | "location.skip"
      | "privacy"
      | "reportAbuse",
  ) => escapeHtml(t(key));
  const destination = safeUrl(next);
  if (!destination) {
    throw new Error("The location step needs an http(s) destination");
  }
  const host = new URL(destination).hostname;
  const nonce = randomBytes(16).toString("base64");
  const data = {
    token,
    next: destination,
    endpoint: LOCATION_ENDPOINT,
    wait: WAIT_MS,
    send: SEND_TIMEOUT_MS,
    digits: LOCATION_DECIMALS,
    text: {
      allow: t("location.allow"),
      waiting: t("location.waiting"),
      opening: t("location.opening"),
      locating: t("location.locating"),
    },
  };
  const privacyUrl = new URL("/legal/privacy-policy#precise-location", baseUrl)
    .href;
  const href = escapeHtml(destination);

  // The host is set in bold inside the translated sentence.
  const HOST = "\u0000host\u0000";
  const continueTo = escapeHtml(
    t("location.continueTo", { host: HOST }),
  ).replace(HOST, `<strong>${escapeHtml(host)}</strong>`);

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${text("location.title")}</title>
<noscript><meta http-equiv="refresh" content="0;url=${href}"></noscript>
<style>
${STYLES}
</style>
</head>
<body>
<main>
<h1>${text("location.title")}</h1>
<p>${text("location.body")}</p>
<div class="actions">
<button id="allow" type="button">${text("location.allow")}</button>
<a id="skip" href="${href}" rel="noreferrer">${text("location.skip")}</a>
</div>
<p class="status" id="status" role="status" aria-live="polite"></p>
<p class="next">${continueTo}</p>
</main>
<footer><a href="${escapeHtml(privacyUrl)}" rel="nofollow">${text("privacy")}</a><a href="${escapeHtml(reportAbuseUrl(slug))}" rel="nofollow">${text("reportAbuse")}</a></footer>
<script nonce="${nonce}">window.__qrdxLocation=${scriptJson(data)};${SCRIPT}</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The language follows Accept-Language (never cached anyway).
      "Content-Language": locale,
      Vary: "Accept-Language",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  });
}
