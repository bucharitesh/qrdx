import type {
  CreateShortLinkInput,
  ListShortLinksOptions,
  ShortLink,
  ShortLinkAccount,
  ShortLinkClient,
  ShortLinkDomain,
  ShortLinkPage,
} from "../../capabilities/short-links";
import { clampLimit, filterLinks } from "../../capabilities/short-links";
import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type { ShortIoDomain, ShortIoLink, ShortIoLinkList } from "./types";

const BASE_URL = "https://api.short.io";
const PROVIDER = { slug: "short-io", name: "Short.io" };
const LINK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DOMAIN_ID = /^\d{1,12}$/;

function toShortLink(link: ShortIoLink, fallbackDomain?: string): ShortLink {
  const shortUrl = link.secureShortURL || link.shortURL;
  let domain = fallbackDomain ?? "";
  try {
    domain = new URL(shortUrl).hostname;
  } catch {
    // keep the fallback
  }
  return {
    id: link.idString,
    shortUrl,
    longUrl: link.originalURL,
    title: link.title || undefined,
    domain,
    tags: link.tags,
    createdAt: link.createdAt,
  };
}

function invalid(message: string): IntegrationApiError {
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 400,
    code: "bad_request",
    message,
  });
}

/**
 * Short.io client, authenticated with the user's secret API key (sent as
 * the raw Authorization header, as Short.io expects).
 */
export class ShortIoClient implements ShortLinkClient {
  private readonly apiKey: string;
  private readonly defaultDomain?: { id: string; hostname: string };

  constructor(
    apiKey: string,
    options: { defaultDomain?: { id: string; hostname: string } } = {}
  ) {
    this.apiKey = apiKey;
    this.defaultDomain = options.defaultDomain;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: this.apiKey,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  /** Short.io has no account endpoint for API keys; the domains stand in. */
  async getAccount(): Promise<ShortLinkAccount> {
    const domains = await this.listDomains();
    return { name: domains[0]?.hostname };
  }

  async listDomains(): Promise<ShortLinkDomain[]> {
    const domains = await this.request<ShortIoDomain[]>("/api/domains");
    return domains.map((domain) => ({
      id: String(domain.id),
      hostname: domain.hostname,
      branded: true,
    }));
  }

  private async resolveDomain(
    domainId?: string
  ): Promise<{ id: string; hostname: string }> {
    if (domainId) {
      if (!DOMAIN_ID.test(domainId))
        throw invalid("Short.io domain id is invalid.");
      if (this.defaultDomain?.id === domainId) return this.defaultDomain;
      const match = (await this.listDomains()).find((d) => d.id === domainId);
      if (!match) throw invalid("That domain isn't in your Short.io account.");
      return match;
    }
    if (this.defaultDomain) return this.defaultDomain;
    const [first] = await this.listDomains();
    if (!first) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 404,
        code: "not_found",
        message: "Short.io: add a domain in Short.io before creating links.",
      });
    }
    return first;
  }

  /** Short.io lists one domain at a time (the picked default when omitted). */
  async listLinks(options: ListShortLinksOptions = {}): Promise<ShortLinkPage> {
    const domain = await this.resolveDomain(options.domainId);
    const params = new URLSearchParams({
      domain_id: domain.id,
      limit: String(clampLimit(options.limit, 150)),
      dateSortOrder: "desc",
    });
    if (options.cursor) params.set("pageToken", options.cursor);

    const data = await this.request<ShortIoLinkList>(`/api/links?${params}`);
    return {
      links: filterLinks(
        (data.links ?? []).map((link) => toShortLink(link, domain.hostname)),
        options.search
      ),
      nextCursor: data.nextPageToken || undefined,
    };
  }

  async createLink(input: CreateShortLinkInput): Promise<ShortLink> {
    const domain = input.domain?.hostname
      ? input.domain
      : await this.resolveDomain();
    const link = await this.request<ShortIoLink>("/links", {
      method: "POST",
      body: JSON.stringify({
        domain: domain.hostname,
        originalURL: input.longUrl,
        ...(input.slug ? { path: input.slug } : {}),
        ...(input.title ? { title: input.title } : {}),
      }),
    });
    return toShortLink(link, domain.hostname);
  }

  async updateLinkDestination(
    linkId: string,
    longUrl: string
  ): Promise<ShortLink> {
    if (!LINK_ID.test(linkId)) throw invalid("Short.io link id is invalid.");
    try {
      const link = await this.request<ShortIoLink>(
        `/links/${encodeURIComponent(linkId)}`,
        { method: "POST", body: JSON.stringify({ originalURL: longUrl }) }
      );
      return toShortLink(link);
    } catch (error) {
      if (
        isIntegrationApiError(error) &&
        (error.status === 402 || error.status === 403)
      ) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: error.status,
          code: "upgrade_required",
          message:
            "Short.io didn't allow changing this link's destination on your plan.",
          body: error.body,
        });
      }
      throw error;
    }
  }
}

export function createShortIoClient(
  apiKey: string,
  options?: { defaultDomain?: { id: string; hostname: string } }
): ShortIoClient {
  return new ShortIoClient(apiKey, options);
}
