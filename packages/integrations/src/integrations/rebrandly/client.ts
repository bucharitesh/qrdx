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
import type { RebrandlyAccount, RebrandlyDomain, RebrandlyLink } from "./types";

const BASE_URL = "https://api.rebrandly.com/v1";
const PROVIDER = { slug: "rebrandly", name: "Rebrandly" };
const LINK_ID = /^[A-Za-z0-9]{1,64}$/;

function withScheme(shortUrl: string): string {
  return /^https?:\/\//i.test(shortUrl) ? shortUrl : `https://${shortUrl}`;
}

function toShortLink(link: RebrandlyLink): ShortLink {
  const shortUrl = withScheme(link.shortUrl);
  return {
    id: link.id,
    shortUrl,
    longUrl: link.destination,
    title: link.title || undefined,
    domain:
      link.domain?.fullName ?? link.domainName ?? new URL(shortUrl).hostname,
    tags: link.tags
      ?.map((tag) => (typeof tag === "string" ? tag : (tag.name ?? "")))
      .filter(Boolean),
    clicks: typeof link.clicks === "number" ? link.clicks : undefined,
    createdAt: link.createdAt,
  };
}

function assertLinkId(linkId: string) {
  if (!LINK_ID.test(linkId)) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: "Rebrandly link id is invalid.",
    });
  }
}

/** Rebrandly API v1 client, authenticated with the user's API key. */
export class RebrandlyClient implements ShortLinkClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: this.apiKey,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  async getAccount(): Promise<ShortLinkAccount> {
    const account = await this.request<RebrandlyAccount>("/account");
    return {
      id: account.id,
      name: account.fullName || account.username,
      email: account.email,
    };
  }

  /** Branded domains first, then rebrand.ly. */
  async listDomains(): Promise<ShortLinkDomain[]> {
    const domains = await this.request<RebrandlyDomain[]>(
      "/domains?active=true&limit=100&orderBy=createdAt&orderDir=desc"
    );
    const mapped = domains.map((domain) => ({
      id: domain.id,
      hostname: domain.fullName,
      branded: domain.type !== "service",
      isDefault: domain.fullName === "rebrand.ly",
    }));
    return [
      ...mapped.filter((domain) => domain.branded),
      ...mapped.filter((domain) => !domain.branded),
    ];
  }

  /** Newest first. `cursor` is the id of the previous page's last link. */
  async listLinks(options: ListShortLinksOptions = {}): Promise<ShortLinkPage> {
    const limit = clampLimit(options.limit, 25);
    const params = new URLSearchParams({
      limit: String(limit),
      orderBy: "createdAt",
      orderDir: "desc",
    });
    if (options.cursor) params.set("last", options.cursor);
    if (options.domainId) params.set("domain.id", options.domainId);

    const links = await this.request<RebrandlyLink[]>(`/links?${params}`);
    const last = links.at(-1);
    return {
      links: filterLinks(links.map(toShortLink), options.search),
      nextCursor: links.length === limit && last ? last.id : undefined,
    };
  }

  async createLink(input: CreateShortLinkInput): Promise<ShortLink> {
    const link = await this.request<RebrandlyLink>("/links", {
      method: "POST",
      body: JSON.stringify({
        destination: input.longUrl,
        ...(input.slug ? { slashtag: input.slug } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.domain ? { domain: { id: input.domain.id } } : {}),
      }),
    });
    return toShortLink(link);
  }

  async updateLinkDestination(
    linkId: string,
    longUrl: string
  ): Promise<ShortLink> {
    assertLinkId(linkId);
    const path = `/links/${encodeURIComponent(linkId)}`;
    const current = await this.request<RebrandlyLink>(path);
    try {
      const link = await this.request<RebrandlyLink>(path, {
        method: "POST",
        body: JSON.stringify({
          destination: longUrl,
          title: current.title ?? "",
        }),
      });
      return toShortLink(link);
    } catch (error) {
      if (isIntegrationApiError(error) && error.status === 403) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: 403,
          code: "upgrade_required",
          message:
            "Rebrandly didn't allow changing this link's destination on your plan.",
          body: error.body,
        });
      }
      throw error;
    }
  }
}

export function createRebrandlyClient(apiKey: string): RebrandlyClient {
  return new RebrandlyClient(apiKey);
}
