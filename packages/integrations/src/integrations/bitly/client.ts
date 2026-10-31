import type {
  CreateShortLinkInput,
  ListShortLinksOptions,
  ShortLink,
  ShortLinkAccount,
  ShortLinkClient,
  ShortLinkDomain,
  ShortLinkGroup,
  ShortLinkPage,
} from "../../capabilities/short-links";
import { clampLimit } from "../../capabilities/short-links";
import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
  readErrorMessage,
} from "../../core/http-client";
import type {
  BitlyBitlink,
  BitlyBitlinkList,
  BitlyGroup,
  BitlyUser,
} from "./types";

const BASE_URL = "https://api-ssl.bitly.com/v4";
const PROVIDER = { slug: "bitly", name: "Bitly" };
const DEFAULT_DOMAIN = "bit.ly";
// `domain/hash`; the domain needs real labels so "../x" can't climb the path
const BITLINK_ID =
  /^[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,10}\/[A-Za-z0-9_-]{1,200}$/;

/** Bitly words its errors as codes ("FORBIDDEN"); prefer the description. */
function describeBitlyError(body: unknown): string | undefined {
  if (body && typeof body === "object" && "description" in body) {
    const description = (body as { description?: unknown }).description;
    if (typeof description === "string" && description.trim()) {
      return description.trim().slice(0, 200);
    }
  }
  return readErrorMessage(body);
}

function toShortLink(link: BitlyBitlink): ShortLink {
  return {
    id: link.id,
    shortUrl: link.link,
    longUrl: link.long_url,
    title: link.title ?? undefined,
    domain: link.id.split("/")[0] ?? DEFAULT_DOMAIN,
    tags: link.tags,
    createdAt: link.created_at,
  };
}

/**
 * Bitly API v4 client. Works with an OAuth token or a generic access token;
 * both are sent as a Bearer token.
 */
export class BitlyClient implements ShortLinkClient {
  private readonly accessToken: string;
  private groupGuid?: string;

  constructor(accessToken: string, options: { groupGuid?: string } = {}) {
    this.accessToken = accessToken;
    this.groupGuid = options.groupGuid;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      describeError: (body, status) =>
        status === 400 || status === 403 || status === 402
          ? describeBitlyError(body)
          : undefined,
    });
  }

  getUser(): Promise<BitlyUser> {
    return this.request<BitlyUser>("/user");
  }

  async getAccount(): Promise<ShortLinkAccount> {
    const user = await this.getUser();
    const email =
      user.emails?.find((item) => item.is_primary)?.email ??
      user.emails?.[0]?.email;
    return { id: user.login, name: user.name || user.login, email };
  }

  private async resolveGroupGuid(): Promise<string> {
    if (this.groupGuid) return this.groupGuid;
    const user = await this.getUser();
    if (!user.default_group_guid) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 404,
        code: "not_found",
        message: "Bitly account has no group to create links in.",
      });
    }
    this.groupGuid = user.default_group_guid;
    return this.groupGuid;
  }

  async listGroups(): Promise<ShortLinkGroup[]> {
    const data = await this.request<{ groups: BitlyGroup[] }>("/groups");
    return (data.groups ?? [])
      .filter((group) => group.is_active !== false)
      .map((group) => ({ id: group.guid, name: group.name }));
  }

  /** bit.ly plus the account's branded short domains (BSDs). */
  async listDomains(): Promise<ShortLinkDomain[]> {
    const data = await this.request<{ bsds?: string[] }>("/bsds");
    const branded = (data.bsds ?? []).filter(
      (hostname) => hostname && hostname !== DEFAULT_DOMAIN
    );
    return [
      ...branded.map((hostname) => ({ id: hostname, hostname, branded: true })),
      { id: DEFAULT_DOMAIN, hostname: DEFAULT_DOMAIN, isDefault: true },
    ];
  }

  async listLinks(options: ListShortLinksOptions = {}): Promise<ShortLinkPage> {
    const groupGuid = await this.resolveGroupGuid();
    const params = new URLSearchParams({
      size: String(clampLimit(options.limit, 100)),
    });
    if (options.cursor) params.set("search_after", options.cursor);
    if (options.search?.trim()) params.set("query", options.search.trim());

    const data = await this.request<BitlyBitlinkList>(
      `/groups/${encodeURIComponent(groupGuid)}/bitlinks?${params}`
    );
    const next = data.pagination?.search_after;
    return {
      links: (data.links ?? []).map(toShortLink),
      nextCursor: next && data.links?.length ? next : undefined,
    };
  }

  /** Bitly picks the back-half; custom back-halves are a paid Bitly feature. */
  async createLink(input: CreateShortLinkInput): Promise<ShortLink> {
    const groupGuid = await this.resolveGroupGuid();
    const link = await this.request<BitlyBitlink>("/bitlinks", {
      method: "POST",
      body: JSON.stringify({
        long_url: input.longUrl,
        domain: input.domain?.hostname ?? DEFAULT_DOMAIN,
        group_guid: groupGuid,
        ...(input.title ? { title: input.title } : {}),
      }),
    });
    return toShortLink(link);
  }

  async updateLinkDestination(
    linkId: string,
    longUrl: string
  ): Promise<ShortLink> {
    if (!BITLINK_ID.test(linkId)) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Bitly link id must look like bit.ly/abc123.",
      });
    }
    const [domain, hash] = linkId.split("/") as [string, string];
    try {
      const link = await this.request<BitlyBitlink>(
        `/bitlinks/${encodeURIComponent(domain)}/${encodeURIComponent(hash)}`,
        { method: "PATCH", body: JSON.stringify({ long_url: longUrl }) }
      );
      return toShortLink(link);
    } catch (error) {
      if (
        isIntegrationApiError(error) &&
        (error.status === 402 ||
          (error.status === 403 &&
            JSON.stringify(error.body ?? "").includes("UPGRADE")))
      ) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: error.status,
          code: "upgrade_required",
          message:
            "Bitly only lets paid plans change where a link points. Upgrade in Bitly, or create a new link.",
          body: error.body,
        });
      }
      throw error;
    }
  }
}

export function createBitlyClient(
  accessToken: string,
  options?: { groupGuid?: string }
): BitlyClient {
  return new BitlyClient(accessToken, options);
}
