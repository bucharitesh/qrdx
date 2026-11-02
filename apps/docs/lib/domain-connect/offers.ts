import "server-only";

import { Resolver } from "node:dns/promises";
import { isDnsHostname } from "@/app/dashboard/domains/_lib/hostname";
import type { DnsRecord } from "@/lib/custom-domains";
import { env } from "@/lib/env";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { baseUrl } from "@/lib/metadata";
import { logError } from "@/lib/shared";
import { buildApplyUrl } from "./apply-url";
import {
  DiscoveryUnavailableError,
  type DnsLookups,
  type DnsProvider,
  discoverDnsProvider,
  type GetJson,
  isTemplateSupported,
} from "./discovery";
import { getJson } from "./http";
import { connectRedirectUri } from "./return";
import {
  parseSigningKey,
  publicKeyFromTxt,
  type SigningKey,
  signQuery,
} from "./signing";
import { SIGNING_KEY_ID, templateApplyFor } from "./template";

/**
 * One-click DNS setup (Domain Connect, synchronous flow) for domains waiting
 * for DNS. A domain gets an offer only when every step worked: our signing
 * key matches the one published in DNS, its DNS provider supports Domain
 * Connect and has our template enabled, and the template can write exactly
 * the records lib/custom-domains.ts asks for. Anything else means no button.
 */

export interface DomainConnectOffer {
  /** For "Set up with …"; null when the provider sent no usable name */
  providerName: string | null;
  /** Signed apply URL: the provider's consent page */
  url: string;
}

/** Offers by custom domain id */
export type DomainConnectOffers = Record<string, DomainConnectOffer>;

export interface OfferCandidate {
  id: string;
  hostname: string;
  records: DnsRecord[];
}

export interface DomainConnectConfig {
  /** Our template's providerId; its public key lives at _dck1.<providerId> */
  providerId: string;
  serviceId: string;
  key: SigningKey;
}

export interface OfferDeps {
  dns: DnsLookups;
  getJson: GetJson;
  /** Origin the DNS provider sends the browser back to */
  appUrl: URL;
  now?: () => number;
  log?: (error: Error, context: Record<string, unknown>) => void;
  /** Longest wait for one domain before it simply gets no button */
  budgetMs?: number;
}

const MINUTE = 60_000;
const TTL = {
  provider: 10 * MINUTE,
  unavailable: MINUTE,
  template: 30 * MINUTE,
  keyOk: 15 * MINUTE,
  keyBad: 2 * MINUTE,
};
const MAX_CACHED = 500;
const LOG_CONTEXT = { feature: "domainConnect" };

class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires > this.now()) return entry.value;
    this.entries.delete(key);
    return undefined;
  }

  set(key: string, value: V, ttlMs: number) {
    if (this.entries.size >= MAX_CACHED) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: this.now() + ttlMs });
  }
}

export function createOfferService(
  config: DomainConnectConfig,
  deps: OfferDeps,
) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? logError;
  const budgetMs = deps.budgetMs ?? 6000;
  const providers = new TtlCache<DnsProvider | null>(now);
  const templates = new TtlCache<boolean>(now);
  const keyChecks = new TtlCache<boolean>(now);

  /** Providers verify our signature against this record, so it must match. */
  async function publishedKeyMatches(): Promise<boolean> {
    const cached = keyChecks.get("key");
    if (cached !== undefined) return cached;
    const name = `${SIGNING_KEY_ID}.${config.providerId}`;
    let published: string | null = null;
    try {
      published = publicKeyFromTxt(await deps.dns.resolveTxt(name));
    } catch {
      published = null;
    }
    const ok = published === config.key.publicKey;
    if (!ok) {
      log(
        new Error(
          published
            ? `The Domain Connect public key at ${name} doesn't match DOMAIN_CONNECT_PRIVATE_KEY; no one-click DNS buttons are shown`
            : `No Domain Connect public key at ${name}; no one-click DNS buttons are shown`,
        ),
        LOG_CONTEXT,
      );
    }
    keyChecks.set("key", ok, ok ? TTL.keyOk : TTL.keyBad);
    return ok;
  }

  async function providerOf(hostname: string): Promise<DnsProvider | null> {
    const cached = providers.get(hostname);
    if (cached !== undefined) return cached;
    try {
      const found = await discoverDnsProvider(hostname, deps);
      providers.set(hostname, found, TTL.provider);
      return found;
    } catch (error) {
      if (!(error instanceof DiscoveryUnavailableError)) {
        log(error as Error, { ...LOG_CONTEXT, hostname });
      }
      providers.set(hostname, null, TTL.unavailable);
      return null;
    }
  }

  async function templateEnabled(urlAPI: string): Promise<boolean> {
    const cached = templates.get(urlAPI);
    if (cached !== undefined) return cached;
    try {
      const enabled = await isTemplateSupported(urlAPI, config, deps.getJson);
      templates.set(urlAPI, enabled, TTL.template);
      return enabled;
    } catch {
      templates.set(urlAPI, false, TTL.unavailable);
      return false;
    }
  }

  async function offerFor(
    candidate: OfferCandidate,
  ): Promise<DomainConnectOffer | null> {
    const provider = await providerOf(candidate.hostname);
    if (!provider) return null;
    const apply = templateApplyFor(
      candidate.records,
      candidate.hostname,
      provider.zone,
    );
    if (!apply) return null;
    if (!(await templateEnabled(provider.urlAPI))) return null;
    const url = buildApplyUrl(
      {
        urlSyncUX: provider.urlSyncUX,
        providerId: config.providerId,
        serviceId: config.serviceId,
        domain: provider.zone,
        host: provider.host,
        groupIds: apply.groupIds,
        variables: apply.variables,
        redirectUri: connectRedirectUri(deps.appUrl, candidate.id),
      },
      {
        keyId: SIGNING_KEY_ID,
        sign: (query) => signQuery(query, config.key.privateKey),
      },
    );
    return { providerName: provider.providerName, url };
  }

  function withinBudget<T>(work: Promise<T>): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(null), budgetMs);
      timer.unref?.();
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  return {
    async offers(
      candidates: readonly OfferCandidate[],
    ): Promise<DomainConnectOffers> {
      if (candidates.length === 0) return {};
      if (!(await publishedKeyMatches())) return {};
      const entries = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const offer = await withinBudget(offerFor(candidate));
            return offer ? ([candidate.id, offer] as const) : null;
          } catch (error) {
            log(error as Error, { ...LOG_CONTEXT, domainId: candidate.id });
            return null;
          }
        }),
      );
      return Object.fromEntries(
        entries.filter((entry) => entry !== null),
      ) as DomainConnectOffers;
    },
  };
}

// ─── This deployment ─────────────────────────────────────────────────────────

const SERVICE_ID = /^[A-Za-z0-9._-]{1,64}$/;

function resolverLookups(): DnsLookups {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  return {
    resolveTxt: (name) => resolver.resolveTxt(name),
    resolveSoa: (name) => resolver.resolveSoa(name),
    resolveCname: (name) => resolver.resolveCname(name),
  };
}

let service: ReturnType<typeof createOfferService> | null | undefined;

/** Built once from the environment; null (and logged) when it's unusable. */
function deploymentService() {
  if (service !== undefined) return service;
  service = null;
  const providerId = env.DOMAIN_CONNECT_PROVIDER_ID?.trim().toLowerCase();
  const serviceId = env.DOMAIN_CONNECT_SERVICE_ID?.trim();
  const pem = env.DOMAIN_CONNECT_PRIVATE_KEY;
  if (!(providerId && serviceId && pem)) return service;
  if (!(isDnsHostname(providerId) && SERVICE_ID.test(serviceId))) {
    logError(
      new Error(
        "DOMAIN_CONNECT_PROVIDER_ID must be a domain name and DOMAIN_CONNECT_SERVICE_ID a template id; no one-click DNS buttons are shown",
      ),
      LOG_CONTEXT,
    );
    return service;
  }
  const key = parseSigningKey(pem);
  if (!key) {
    logError(
      new Error(
        "DOMAIN_CONNECT_PRIVATE_KEY isn't an RSA private key in PEM (2048 bits or more); no one-click DNS buttons are shown",
      ),
      LOG_CONTEXT,
    );
    return service;
  }
  service = createOfferService(
    { providerId, serviceId, key },
    { dns: resolverLookups(), getJson, appUrl: baseUrl },
  );
  return service;
}

/**
 * Offers for domains waiting for DNS; empty where the feature is off. Never
 * rejects: the Domains page streams this promise, and a failure here must
 * only cost the button, never the page.
 */
export async function getDomainConnectOffers(
  candidates: readonly OfferCandidate[],
): Promise<DomainConnectOffers> {
  if (!isFeatureAvailable("domainConnect") || candidates.length === 0) {
    return {};
  }
  try {
    return (await deploymentService()?.offers(candidates)) ?? {};
  } catch (error) {
    logError(error as Error, LOG_CONTEXT);
    return {};
  }
}
