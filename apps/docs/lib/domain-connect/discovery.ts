import { z } from "zod";
import { fetchBlockReason } from "@/app/api/scan/check/_lib/ssrf";
import { isDnsHostname } from "@/app/(app)/dashboard/domains/_lib/hostname";

// DNS provider discovery (spec "DNS Provider Discovery"):
// 1. find the zone that holds the hostname (discovery works on zones only),
// 2. read the `_domainconnect.<zone>` TXT record: the provider's API host,
// 3. GET https://<that>/v2/<zone>/settings for the provider's URLs,
// 4. GET {urlAPI}/v2/domainTemplates/providers/{id}/services/{id}: 2xx when
//    the provider has our template enabled.
// The TXT record and the settings are controlled by whoever runs the
// domain's DNS, so every URL taken from them is checked before it's fetched.

export interface DnsLookups {
  resolveTxt: (name: string) => Promise<string[][]>;
  resolveSoa: (name: string) => Promise<unknown>;
  resolveCname: (name: string) => Promise<string[]>;
}

export interface HttpResult {
  status: number;
  /** Parsed JSON, or null when the body was empty or not JSON */
  body: unknown;
}

export type GetJson = (url: URL) => Promise<HttpResult>;

/** A lookup that failed in a way worth retrying soon (timeout, SERVFAIL, 5xx). */
export class DiscoveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryUnavailableError";
  }
}

const NO_ANSWER = new Set(["ENODATA", "ENOTFOUND"]);
const MAX_ZONE_CANDIDATES = 10;

type Probe = "yes" | "no" | { failed: string };

async function probe(lookup: () => Promise<unknown>): Promise<Probe> {
  try {
    const answer = await lookup();
    return Array.isArray(answer) && answer.length === 0 ? "no" : "yes";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code ?? "";
    return NO_ANSWER.has(code) ? "no" : { failed: code || "unknown" };
  }
}

const failure = (probe: Probe) =>
  new DiscoveryUnavailableError(
    `DNS lookup failed (${typeof probe === "object" ? probe.failed : probe})`,
  );

/**
 * The DNS zone that holds `hostname`: the most specific of its parent names
 * (itself included) that has an SOA record. A name with a CNAME is never a
 * zone apex, and resolvers answer an SOA query on it with the target's SOA,
 * so such names are skipped. Null when no zone was found.
 */
export async function findZone(
  hostname: string,
  dns: DnsLookups,
): Promise<string | null> {
  const labels = hostname.split(".");
  // Never a bare TLD; at most MAX_ZONE_CANDIDATES levels.
  const candidates = labels
    .slice(0, -1)
    .map((_, index) => labels.slice(index).join("."))
    .slice(-MAX_ZONE_CANDIDATES);
  const probes = await Promise.all(
    candidates.map(async (name) => {
      const [cname, soa] = await Promise.all([
        probe(() => dns.resolveCname(name)),
        probe(() => dns.resolveSoa(name)),
      ]);
      return { name, cname, soa };
    }),
  );
  // Most specific first. An SOA error at a name with a CNAME doesn't matter
  // (resolvers fail those oddly); anywhere else it means "don't know".
  for (const { name, cname, soa } of probes) {
    if (cname === "yes") continue;
    if (cname !== "no") throw failure(cname);
    if (soa === "yes") return name;
    if (soa !== "no") throw failure(soa);
  }
  return null;
}

/** The host part of `hostname` inside `zone`: "go" for go.brand.com; "" at the apex. */
export function hostInZone(hostname: string, zone: string): string | null {
  if (hostname === zone) return "";
  return hostname.endsWith(`.${zone}`)
    ? hostname.slice(0, -(zone.length + 1))
    : null;
}

/**
 * An https URL prefix that is safe to call from the server: a public DNS
 * name on the default port, no credentials, query or fragment. Returned
 * without a trailing slash; null when unusable.
 */
export function safeUrlPrefix(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.search || url.hash) return null;
  if (fetchBlockReason(url) || !isDnsHostname(url.hostname)) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/**
 * The `_domainconnect` TXT value as a URL prefix ("api.cloudflare.com/client/v4/dns/domainconnect"
 * → https://api.cloudflare.com/client/v4/dns/domainconnect). The spec's value has no
 * scheme; an https:// one is tolerated, any other scheme is refused.
 */
export function parseDiscoveryRecord(
  answers: readonly string[][],
): string | null {
  const value = answers
    .map((chunks) => chunks.join("").trim().replace(/^"|"$/g, ""))
    .find(Boolean);
  if (!value) return null;
  const withoutScheme = value.replace(/^https:\/\//i, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutScheme)) return null;
  if (!/^[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~/-]*)?$/.test(withoutScheme)) {
    return null;
  }
  // URL lowercases the host name; the path keeps its case.
  return safeUrlPrefix(`https://${withoutScheme}`);
}

const settingsSchema = z.object({
  providerId: z.string().trim().min(1).max(253),
  providerName: z.string().trim().min(1).max(200),
  providerDisplayName: z.string().trim().max(200).optional(),
  urlSyncUX: z.string().trim().max(2000).optional(),
  urlAPI: z.string().trim().min(1).max(2000),
});

const MAX_DISPLAY_NAME = 40;

/** A provider name fit for a button label, or null. */
function displayName(...names: (string | undefined)[]): string | null {
  for (const name of names) {
    const clean = name?.replace(/\p{C}/gu, "").replace(/\s+/g, " ").trim();
    if (clean && clean.length <= MAX_DISPLAY_NAME) return clean;
  }
  return null;
}

export interface DnsProvider {
  /** The zone the settings are for (the `domain` parameter) */
  zone: string;
  /** The hostname within the zone (the `host` parameter); "" at the apex */
  host: string;
  /** The DNS provider's own id, e.g. cloudflare.com */
  providerId: string;
  /** For "Set up with …"; null when the provider sent no usable name */
  providerName: string | null;
  /** Prefix of the synchronous flow's apply URL */
  urlSyncUX: string;
  /** Prefix of the provider's API */
  urlAPI: string;
}

/**
 * Parses the settings JSON. Null when it's malformed or the provider offers
 * no synchronous flow for this zone (no `urlSyncUX`).
 */
export function parseSettings(
  body: unknown,
  zone: string,
  host: string,
): DnsProvider | null {
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return null;
  const settings = parsed.data;
  const urlAPI = safeUrlPrefix(settings.urlAPI);
  const urlSyncUX = settings.urlSyncUX
    ? safeUrlPrefix(settings.urlSyncUX)
    : null;
  if (!(urlAPI && urlSyncUX)) return null;
  return {
    zone,
    host,
    providerId: settings.providerId,
    providerName: displayName(
      settings.providerDisplayName,
      settings.providerName,
    ),
    urlSyncUX,
    urlAPI,
  };
}

/**
 * The DNS provider of `hostname`'s zone and its synchronous-flow URLs, or
 * null when there is none (no zone, no `_domainconnect` record, the provider
 * doesn't host the zone or has no synchronous flow). Throws
 * DiscoveryUnavailableError when a lookup failed and a later try may work.
 */
export async function discoverDnsProvider(
  hostname: string,
  { dns, getJson }: { dns: DnsLookups; getJson: GetJson },
): Promise<DnsProvider | null> {
  const zone = await findZone(hostname, dns);
  if (!zone) return null;
  const host = hostInZone(hostname, zone);
  if (host === null) return null;

  let answers: string[][];
  try {
    answers = await dns.resolveTxt(`_domainconnect.${zone}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code ?? "";
    if (NO_ANSWER.has(code)) return null;
    throw new DiscoveryUnavailableError(`DNS lookup failed (${code})`);
  }
  const prefix = parseDiscoveryRecord(answers);
  if (!prefix) return null;

  let response: HttpResult;
  try {
    response = await getJson(new URL(`${prefix}/v2/${zone}/settings`));
  } catch {
    throw new DiscoveryUnavailableError("settings request failed");
  }
  if (response.status >= 500) {
    throw new DiscoveryUnavailableError(`settings: HTTP ${response.status}`);
  }
  // 404: the zone isn't at this provider (a stale or wrong TXT record).
  if (response.status !== 200) return null;
  return parseSettings(response.body, zone, host);
}

/**
 * Whether the provider at `urlAPI` has the template enabled: 2xx yes, 404 no.
 * Throws DiscoveryUnavailableError on anything else.
 */
export async function isTemplateSupported(
  urlAPI: string,
  template: { providerId: string; serviceId: string },
  getJson: GetJson,
): Promise<boolean> {
  const url = new URL(
    `${urlAPI}/v2/domainTemplates/providers/${encodeURIComponent(template.providerId)}/services/${encodeURIComponent(template.serviceId)}`,
  );
  let response: HttpResult;
  try {
    response = await getJson(url);
  } catch {
    throw new DiscoveryUnavailableError("template request failed");
  }
  if (response.status >= 200 && response.status < 300) return true;
  if (response.status === 404) return false;
  throw new DiscoveryUnavailableError(`template: HTTP ${response.status}`);
}
