import { env } from "@/lib/env";
import { debugLog, isAnalyticsRuntime } from "./config";
import type { CleanProps } from "./events";
import { hasPrivacySignal, safeTitle, sanitizeUrl } from "./privacy";

/**
 * Umami: cookieless, aggregate web analytics. It stores nothing in the
 * browser and keeps no profile, so it runs without the consent banner, but
 * never when the browser sends Do Not Track or Global Privacy Control.
 * Off unless NEXT_PUBLIC_UMAMI_WEBSITE_ID is set.
 *
 * The script is told not to track by itself (data-auto-track="false"):
 * pageviews and events go through here, so every URL is sanitized first.
 */
export const DEFAULT_UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js";
const MAX_WAITING = 50;

type UmamiPayload = Record<string, unknown>;
type Umami = {
  track: (payload: (props: UmamiPayload) => UmamiPayload) => unknown;
};

let waiting: ((umami: Umami) => void)[] = [];
/** The external referrer counts once, on the first pageview of a load. */
let referrerSent = false;

export function getUmamiConfig(): {
  websiteId: string;
  scriptUrl: string;
} | null {
  const websiteId = env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;
  return {
    websiteId,
    scriptUrl: env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? DEFAULT_UMAMI_SCRIPT_URL,
  };
}

/** Umami may run in this tab: configured, allowed here, no privacy signal. */
export function isUmamiEnabled(): boolean {
  return (
    getUmamiConfig() !== null && isAnalyticsRuntime() && !hasPrivacySignal()
  );
}

function getUmami(): Umami | null {
  const umami = (window as Window & { umami?: Umami }).umami;
  return umami && typeof umami.track === "function" ? umami : null;
}

function send(call: (umami: Umami) => void) {
  const umami = getUmami();
  if (umami) call(umami);
  else if (waiting.length < MAX_WAITING) waiting.push(call);
}

/** Called once the script has loaded: sends what waited. */
export function flushUmami() {
  const umami = getUmami();
  if (!umami) return;
  const calls = waiting;
  waiting = [];
  for (const call of calls) call(umami);
}

/** Page context taken now (not when the script loads), sanitized. */
function pageContext(withReferrer: boolean): UmamiPayload {
  const { href, origin, pathname } = window.location;
  const referrer = withReferrer ? document.referrer : "";
  return {
    url: sanitizeUrl(href),
    referrer:
      referrer && !referrer.startsWith(origin) ? sanitizeUrl(referrer) : "",
    title: safeTitle(pathname, document.title),
  };
}

export function sendUmamiPageview() {
  if (!isUmamiEnabled()) return;
  const context = pageContext(!referrerSent);
  referrerSent = true;
  debugLog("umami", "pageview", context);
  send((umami) => umami.track((props) => ({ ...props, ...context })));
}

export function sendUmamiEvent(name: string, data: CleanProps) {
  if (!isUmamiEnabled()) return;
  const context = pageContext(false);
  debugLog("umami", name, data);
  send((umami) =>
    umami.track((props) => ({
      ...props,
      ...context,
      name,
      ...(Object.keys(data).length > 0 ? { data } : {}),
    })),
  );
}

/** Test hook. */
export function __resetUmamiForTests() {
  waiting = [];
  referrerSent = false;
}
