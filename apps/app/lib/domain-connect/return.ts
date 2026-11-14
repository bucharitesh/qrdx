// After the DNS provider applies the template (or the user cancels) it sends
// the browser to redirect_uri, adding `error=` on failure. Cloudflare ignores
// `state`, so the domain id travels in redirect_uri itself. Nothing here is
// trusted: the page only re-checks DNS for that domain, which is harmless.

import { dashboardEntry } from "@/lib/workspace-paths";

export const CONNECT_RETURN_PARAM = "connected";

const DOMAIN_ID = /^[a-z0-9]{1,64}$/i;

/**
 * Where the provider sends the browser back to, for one domain: the Domains
 * page of the person's default workspace (/dashboard?to=…, so a workspace
 * renamed in between still works), which re-checks that domain.
 */
export function connectRedirectUri(appUrl: URL, domainId: string): string {
  return new URL(
    dashboardEntry("settings/domains", { [CONNECT_RETURN_PARAM]: domainId }),
    appUrl,
  ).toString();
}

export interface ConnectReturn {
  domainId: string;
  /** False when the provider reported an error or the user cancelled */
  applied: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * Reads the return from the domains page's search params. Some providers add
 * `?error=…` to a redirect_uri that already has a query; that tail is read
 * too.
 */
export function parseConnectReturn(params: SearchParams): ConnectReturn | null {
  const raw = first(params[CONNECT_RETURN_PARAM]);
  if (!raw) return null;
  const [id = "", tail = ""] = raw.split("?", 2);
  if (!DOMAIN_ID.test(id)) return null;
  const error = first(params.error) ?? new URLSearchParams(tail).get("error");
  return { domainId: id, applied: !error };
}
