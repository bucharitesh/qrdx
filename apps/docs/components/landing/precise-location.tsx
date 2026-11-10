import "server-only";

import { cookies } from "next/headers";
import { getPlanLimits, type Plan } from "@/lib/plans";
import { LOCATION_DECIMALS, LOCATION_ENDPOINT } from "@/lib/scan-location/geo";
import {
  asksPreciseLocation,
  LOCATION_COOKIE,
} from "@/lib/scan-location/server";
import { verifyLocationToken } from "@/lib/scan-location/token";

/**
 * Hosted pages (/p/<slug>) of codes that ask for precise location
 * (lib/scan-location/server.ts): once the page has loaded, the browser's own
 * prompt asks the scanner; the page never waits for it. Only right after a
 * scan (the cookie /q/<slug> set, 15 minutes), never on direct visits. A
 * shared position is rounded to ~100 m in the browser before it is sent.
 * A plain inline script (no client bundle), like the page's other beacons.
 */

const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const SCRIPT = `(function(){var d=window.__qrdxLocation;if(!d||!("geolocation" in navigator))return;function round(v){var f=Math.pow(10,d.digits);return Math.round(v*f)/f}function send(p){var c=p.coords;try{fetch(d.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",keepalive:true,body:JSON.stringify({token:d.token,latitude:round(c.latitude),longitude:round(c.longitude),accuracy:Math.round(c.accuracy)})})["catch"](function(){})}catch(e){}}function ask(){try{navigator.geolocation.getCurrentPosition(send,function(){},{enableHighAccuracy:false,maximumAge:300000,timeout:15000})}catch(e){}}function start(){setTimeout(ask,600)}if(document.readyState==="complete")start();else window.addEventListener("load",start)})();`;

export async function PreciseLocationPrompt({
  qrCodeId,
  pixels,
  plan,
}: {
  qrCodeId: string;
  /** The code's `pixels` column (the setting lives there) */
  pixels: unknown;
  /** The page's workspace plan (app/p/_lib/public-page.ts) */
  plan: Plan;
}) {
  if (!(asksPreciseLocation(pixels) && getPlanLimits(plan).preciseLocation)) {
    return null;
  }
  const token = (await cookies()).get(LOCATION_COOKIE)?.value;
  const scan = verifyLocationToken(token);
  if (!(token && scan && scan.codeId === qrCodeId)) return null;

  const data = {
    token,
    endpoint: LOCATION_ENDPOINT,
    digits: LOCATION_DECIMALS,
  };
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static script, JSON-escaped data
      dangerouslySetInnerHTML={{
        __html: `window.__qrdxLocation=${scriptJson(data)};${SCRIPT}`,
      }}
    />
  );
}
