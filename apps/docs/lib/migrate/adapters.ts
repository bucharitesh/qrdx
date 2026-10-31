// Adapters from the integration clients in packages/integrations (Dub's
// DubClient, the shared ShortLinkClient of Bitly, Rebrandly and Short.io) to
// the importer's MigrationSource, plus plain-words provider errors.
// No database or env access, so tests can pass fake clients.

import type {
  DubClient,
  ShortLink,
  ShortLinkClient,
  ShortLinkDomain,
} from "@repo/integrations";
// The module, not the package index, so tests don't load the database client.
import { isIntegrationApiError } from "@repo/integrations/src/core/http-client";
import { absoluteShortLink, splitShortLink } from "./normalize";
import { API_PROVIDERS, type ApiProviderId } from "./providers";
import type {
  LinkFilters,
  LinkPage,
  MigrationSource,
  SourceLink,
} from "./types";

export const LIST_PAGE_SIZE = 50;

/** Filters a page for providers without that filter (search, domain, tag). */
export function filterPage(
  links: SourceLink[],
  filters: LinkFilters,
  native: { search?: boolean; domain?: boolean },
): SourceLink[] {
  const q = native.search ? "" : (filters.search?.trim().toLowerCase() ?? "");
  const domain = native.domain ? "" : (filters.domain ?? "");
  const tag = filters.tag?.trim().toLowerCase() ?? "";
  return links.filter(
    (link) =>
      (!q ||
        [link.shortLink ?? "", link.destinationUrl, link.title ?? ""].some(
          (value) => value.toLowerCase().includes(q),
        )) &&
      (!domain || link.domain === domain) &&
      (!tag || link.tags.some((name) => name.toLowerCase() === tag)),
  );
}

export function fromShortLink(link: ShortLink): SourceLink {
  const shortLink = absoluteShortLink(link.shortUrl);
  const parts = splitShortLink(shortLink);
  return {
    id: link.id,
    shortLink,
    domain: (link.domain || parts.domain)?.toLowerCase() ?? null,
    backHalf: parts.backHalf,
    destinationUrl: link.longUrl,
    title: link.title?.trim() || null,
    tags: link.tags ?? [],
    clicks: typeof link.clicks === "number" ? link.clicks : null,
    createdAt: link.createdAt ?? null,
    archived: false,
  };
}

/** Bitly, Rebrandly and Short.io through their shared ShortLinkClient. */
export function shortLinkSource(
  provider: Exclude<ApiProviderId, "dub">,
  client: ShortLinkClient,
): MigrationSource {
  let domains: Promise<ShortLinkDomain[]> | null = null;
  const loadDomains = () => {
    domains ??= client.listDomains();
    return domains;
  };
  // Bitly lists every domain at once; Rebrandly and Short.io take a domain
  // id (Short.io lists one domain at a time).
  const nativeDomain = provider !== "bitly";

  return {
    provider,
    async listDomains() {
      return (await loadDomains()).map((domain) =>
        domain.hostname.toLowerCase(),
      );
    },
    async listLinks(cursor, filters): Promise<LinkPage> {
      let domainId: string | undefined;
      if (filters.domain && nativeDomain) {
        domainId = (await loadDomains()).find(
          (domain) => domain.hostname.toLowerCase() === filters.domain,
        )?.id;
        if (!domainId) return { links: [], nextCursor: null, total: 0 };
      }
      const page = await client.listLinks({
        cursor: cursor ?? undefined,
        search: filters.search?.trim() || undefined,
        domainId,
        limit: LIST_PAGE_SIZE,
      });
      return {
        links: filterPage(page.links.map(fromShortLink), filters, {
          // The clients already filter by search (server-side or per page).
          search: true,
          domain: nativeDomain,
        }),
        nextCursor: page.nextCursor ?? null,
        total: null,
      };
    },
    async updateDestination(id, url) {
      await client.updateLinkDestination(id, url);
    },
  };
}

/** Fields of a Dub link the import reads (the API returns more than DubLink types). */
interface DubLinkFields {
  id: string;
  domain?: string;
  key?: string;
  url: string;
  shortLink?: string;
  title?: string | null;
  tags?: { name?: string }[] | null;
  clicks?: number;
  createdAt?: string;
  archived?: boolean;
}

export function fromDubLink(raw: unknown): SourceLink | null {
  const link = raw as DubLinkFields;
  if (!(link && typeof link.id === "string" && typeof link.url === "string")) {
    return null;
  }
  const shortLink = absoluteShortLink(
    link.shortLink ??
      (link.domain && link.key ? `${link.domain}/${link.key}` : null),
  );
  const parts = splitShortLink(shortLink);
  return {
    id: link.id,
    shortLink,
    domain: (link.domain ?? parts.domain)?.toLowerCase() ?? null,
    backHalf: link.key ?? parts.backHalf,
    destinationUrl: link.url,
    title: link.title?.trim() || null,
    tags: (link.tags ?? []).flatMap((tag) =>
      typeof tag?.name === "string" ? [tag.name] : [],
    ),
    clicks: typeof link.clicks === "number" ? link.clicks : null,
    createdAt: link.createdAt ?? null,
    archived: Boolean(link.archived),
  };
}

const DUB_PAGE_SIZE = 100;

export function dubSource(client: DubClient): MigrationSource {
  return {
    provider: "dub",
    async listLinks(cursor, filters) {
      const page = Math.max(1, Number.parseInt(cursor ?? "1", 10) || 1);
      const raw = await client.getLinks({
        page,
        pageSize: DUB_PAGE_SIZE,
        search: filters.search?.trim() || undefined,
        domain: filters.domain || undefined,
        showArchived: false,
      });
      const links = raw.flatMap((item) => fromDubLink(item) ?? []);
      return {
        links: filterPage(links, filters, { search: true, domain: true }),
        nextCursor: raw.length === DUB_PAGE_SIZE ? String(page + 1) : null,
        total: null,
      };
    },
    async getLink(id) {
      return fromDubLink(await client.getLink(id));
    },
    async updateDestination(id, url) {
      await client.updateLink(id, { url });
    },
  };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ProviderErrorKind =
  | "plan"
  | "quota"
  | "auth"
  | "rate"
  | "not-found"
  | "other";

export interface ExplainedError {
  kind: ProviderErrorKind;
  message: string;
  /** Stop the run: every following link would fail the same way */
  stop: boolean;
}

function statusOf(error: unknown): number | null {
  if (isIntegrationApiError(error)) return error.status;
  // DubClient: "Dub API error: 403 - message"
  const match = /API error: (\d{3})/.exec(String((error as Error)?.message));
  return match ? Number(match[1]) : null;
}

const PLAN_MESSAGES: Record<ApiProviderId, string> = {
  dub: "Dub refused to change this link for your plan or role.",
  bitly:
    "Your Bitly plan doesn't allow more destination changes (Bitly calls them link redirects: none on Free, 5 a month on Core, 20 on Growth, 110 on Premium). Upgrade in Bitly or wait for next month's allowance; the remaining links were left unchanged.",
  rebrandly:
    "Your Rebrandly plan has no destination edits left (none on Free, 10 a month on Essentials, 50 on Professional, 150 on Growth). The remaining links were left unchanged.",
  "short-io": "Short.io refused to change this link for your plan or role.",
};

/** A provider failure in plain words, without tokens or URLs. */
export function explainProviderError(
  provider: ApiProviderId,
  error: unknown,
): ExplainedError {
  const name = API_PROVIDERS[provider].name;
  const status = statusOf(error);
  const code = isIntegrationApiError(error) ? error.code : null;
  const body = isIntegrationApiError(error)
    ? JSON.stringify(error.body ?? "")
    : "";

  if (status === 401 || code === "unauthorized") {
    return {
      kind: "auth",
      message: `${name} rejected the saved connection. Reconnect ${name} and try again.`,
      stop: true,
    };
  }
  if (
    status === 402 ||
    code === "upgrade_required" ||
    /UPGRADE_REQUIRED/.test(body)
  ) {
    return { kind: "plan", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 429 && /MONTHLY_LIMIT|LIMIT_EXCEEDED|quota/i.test(body)) {
    return { kind: "quota", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 429 || code === "rate_limited") {
    return {
      kind: "rate",
      message: `${name} is limiting requests. Wait a minute, then continue.`,
      stop: true,
    };
  }
  if (status === 403 || code === "forbidden") {
    return { kind: "plan", message: PLAN_MESSAGES[provider], stop: true };
  }
  if (status === 404 || code === "not_found") {
    return {
      kind: "not-found",
      message: `${name} no longer has this link.`,
      stop: false,
    };
  }
  return {
    kind: "other",
    message: `${name} couldn't update this link. Try again later.`,
    stop: false,
  };
}
