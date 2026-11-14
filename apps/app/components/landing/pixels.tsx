import "server-only";

import { database as db, qrCode } from "@repo/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  hasPixels,
  type PixelConfig,
  type PixelProvider,
  parsePixelConfig,
  pixelsForOrigin,
} from "@/lib/redirect/routing";
import { scanGeo } from "@/lib/scans";

/**
 * Hosted pages (/p/<slug>) only: a first-party, cookieless view/click beacon
 * (→ /api/events → landing_event) and, when the code's owner configured them,
 * their GA4 / GTM / Meta / TikTok / LinkedIn pixels. Pixels wait for consent
 * in the EEA, UK, Switzerland and wherever the visitor's country is unknown
 * (or everywhere, if the owner chose so) and respect Global Privacy Control
 * elsewhere. Nothing third-party ever loads unless the owner set it up.
 * Google Tag Manager only loads on the owner's custom domains (see
 * pixelsForOrigin).
 *
 * Plain inline scripts (no client bundle) keep scanner pages fast.
 */

// EU + EEA, UK and Switzerland.
const CONSENT_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
]);

const PROVIDER_NAMES: Record<PixelProvider, string> = {
  ga4: "Google Analytics",
  gtm: "Google Tag Manager",
  meta: "Meta Pixel",
  tiktok: "TikTok Pixel",
  linkedin: "LinkedIn Insight Tag",
};

/** JSON safe to embed in an inline <script>. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

function trackerScript(data: {
  endpoint: string;
  pageId: string;
  qrCodeId: string;
}): string {
  return `(function(){var d=${scriptJson(data)};function s(t,g){var b=JSON.stringify({pageId:d.pageId,qrCodeId:d.qrCodeId,type:t,target:g||undefined});try{if(navigator.sendBeacon&&navigator.sendBeacon(d.endpoint,b))return}catch(e){}try{fetch(d.endpoint,{method:"POST",body:b,keepalive:true,mode:"no-cors"})}catch(e){}}s("view");document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest("a[href],[data-qrdx-event]"):null;if(!a)return;var k=a.closest("[data-block-id]");var g=a.getAttribute("data-qrdx-target")||a.getAttribute("href")||(k&&k.getAttribute("data-block-id"))||"";s(a.getAttribute("data-qrdx-event")||"click",g.slice(0,200))},{capture:true,passive:true})})();`;
}

/** Defines window.__qrdxPixels(): loads each configured pixel once. */
function loaderScript(config: PixelConfig): string {
  const ids = {
    ga4: config.ga4 ?? null,
    gtm: config.gtm ?? null,
    meta: config.meta ?? null,
    tiktok: config.tiktok ?? null,
    linkedin: config.linkedin ?? null,
  };
  return `window.__qrdxPixels=function(){if(window.__qrdxPixelsLoaded)return;window.__qrdxPixelsLoaded=true;var p=${scriptJson(ids)},w=window,d=document;function l(u){var s=d.createElement("script");s.async=true;s.src=u;d.head.appendChild(s)}
if(p.ga4||p.gtm){w.dataLayer=w.dataLayer||[]}
if(p.ga4){l("https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(p.ga4));w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w.gtag("js",new Date());w.gtag("config",p.ga4)}
if(p.gtm){w.dataLayer.push({"gtm.start":new Date().getTime(),event:"gtm.js"});l("https://www.googletagmanager.com/gtm.js?id="+encodeURIComponent(p.gtm))}
if(p.meta){if(!w.fbq){var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!w._fbq)w._fbq=n;n.push=n;n.loaded=true;n.version="2.0";n.queue=[];l("https://connect.facebook.net/en_US/fbevents.js")}w.fbq("init",p.meta);w.fbq("track","PageView")}
if(p.tiktok){w.TiktokAnalyticsObject="ttq";var q=w.ttq=w.ttq||[];q.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];q.setAndDefer=function(o,m){o[m]=function(){o.push([m].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<q.methods.length;i++)q.setAndDefer(q,q.methods[i]);q.instance=function(t){for(var e=q._i[t]||[],k=0;k<q.methods.length;k++)q.setAndDefer(e,q.methods[k]);return e};q.load=function(e,o){var r="https://analytics.tiktok.com/i18n/pixel/events.js";q._i=q._i||{};q._i[e]=[];q._i[e]._u=r;q._t=q._t||{};q._t[e]=+new Date();q._o=q._o||{};q._o[e]=o||{};l(r+"?sdkid="+encodeURIComponent(e)+"&lib=ttq")};q.load(p.tiktok);q.page()}
if(p.linkedin){w._linkedin_data_partner_ids=w._linkedin_data_partner_ids||[];w._linkedin_data_partner_ids.push(p.linkedin);if(!w.lintrk){w.lintrk=function(a,b){w.lintrk.q.push([a,b])};w.lintrk.q=[]}l("https://snap.licdn.com/li.lms-analytics/insight.min.js")}};`;
}

function consentScript(pageId: string): string {
  return `(function(){var k=${scriptJson(`qrdx_consent:${pageId}`)},b=document.getElementById("qrdx-consent"),r=document.getElementById("qrdx-consent-reopen");if(!b||!r)return;function g(){try{return localStorage.getItem(k)}catch(e){return null}}function a(v){b.hidden=true;r.hidden=false;if(v==="granted")window.__qrdxPixels()}var c=g();if(c==="granted"||c==="denied")a(c);else b.hidden=false;b.addEventListener("click",function(e){var t=e.target.closest&&e.target.closest("[data-qrdx-consent]");if(!t)return;var v=t.getAttribute("data-qrdx-consent");try{localStorage.setItem(k,v)}catch(x){}if(v==="denied"&&window.__qrdxPixelsLoaded){location.reload();return}a(v)});r.addEventListener("click",function(){b.hidden=false;r.hidden=true})})();`;
}

/** Without a banner: load unless the browser sends Global Privacy Control. */
const NO_BANNER_SCRIPT = `if(!navigator.globalPrivacyControl)window.__qrdxPixels();`;

async function loadPixels(qrCodeId: string): Promise<unknown> {
  try {
    const [row] = await db
      .select({ pixels: qrCode.pixels })
      .from(qrCode)
      .where(eq(qrCode.id, qrCodeId))
      .limit(1);
    return row?.pixels ?? null;
  } catch (error) {
    console.error("Failed to load page pixels:", error);
    return null;
  }
}

const buttonClass =
  "inline-flex h-9 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

export async function Pixels({
  qrCodeId,
  pageId,
  pixels,
  customDomain,
}: {
  qrCodeId: string;
  pageId: string;
  /** The code's `pixels` column when already loaded (else it is fetched) */
  pixels?: unknown;
  /** Served on the owner's custom domain (isCustomDomainRequest) */
  customDomain: boolean;
}) {
  const requestHeaders = await headers();
  // Same-origin: custom domains pass /api/events through (host-routing.ts).
  const endpoint = "/api/events";
  const config = pixelsForOrigin(
    parsePixelConfig(
      pixels === undefined ? await loadPixels(qrCodeId) : pixels,
    ),
    { customDomain },
  );

  const tracker = (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static script, JSON-escaped data
      dangerouslySetInnerHTML={{
        __html: trackerScript({ endpoint, pageId, qrCodeId }),
      }}
    />
  );
  if (!(config && hasPixels(config))) return tracker;

  const { country } = scanGeo(requestHeaders);
  const askConsent =
    config.consent === "always" || !country || CONSENT_COUNTRIES.has(country);
  const names = (Object.keys(PROVIDER_NAMES) as PixelProvider[])
    .filter((provider) => config[provider])
    .map((provider) => PROVIDER_NAMES[provider]);

  return (
    <>
      {tracker}
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: ids are format-validated and JSON-escaped
        dangerouslySetInnerHTML={{ __html: loaderScript(config) }}
      />
      {askConsent ? (
        <>
          <section
            aria-labelledby="qrdx-consent-title"
            className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-neutral-200 bg-white p-4 text-left text-neutral-900 shadow-lg"
            hidden
            id="qrdx-consent"
            suppressHydrationWarning
          >
            <h2 className="text-sm font-semibold" id="qrdx-consent-title">
              Cookies on this page
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              The owner of this page uses {names.join(", ")} to measure visits
              and for advertising. These set cookies only if you accept.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className={`${buttonClass} border border-neutral-300 bg-white text-neutral-900`}
                data-qrdx-consent="denied"
                type="button"
              >
                Decline
              </button>
              <button
                className={`${buttonClass} bg-neutral-900 text-white`}
                data-qrdx-consent="granted"
                type="button"
              >
                Accept
              </button>
            </div>
          </section>
          <button
            className="fixed bottom-2 left-2 z-40 rounded-md bg-white/80 px-2 py-1 text-xs text-neutral-700 underline backdrop-blur"
            hidden
            id="qrdx-consent-reopen"
            suppressHydrationWarning
            type="button"
          >
            Cookie settings
          </button>
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: static script, JSON-escaped data
            dangerouslySetInnerHTML={{ __html: consentScript(pageId) }}
          />
        </>
      ) : (
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static script
          dangerouslySetInnerHTML={{ __html: NO_BANNER_SCRIPT }}
        />
      )}
    </>
  );
}
