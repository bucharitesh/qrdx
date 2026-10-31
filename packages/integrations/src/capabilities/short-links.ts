/**
 * Common shape every short-link provider client (Bitly, Rebrandly, Short.io)
 * implements, so routes, the editor and the migration importer can treat
 * them the same way. Client-safe types only.
 */

export interface ShortLinkDomain {
  /** Provider id used when creating links (Bitly: the hostname itself). */
  id: string;
  hostname: string;
  /** The provider's own default domain, e.g. bit.ly or rebrand.ly. */
  isDefault?: boolean;
  /** A domain the account owns (branded), not the provider's shared one. */
  branded?: boolean;
}

export interface ShortLinkGroup {
  id: string;
  name: string;
}

export interface ShortLink {
  /** Provider id, used to update the link later. */
  id: string;
  shortUrl: string;
  longUrl: string;
  title?: string;
  domain: string;
  tags?: string[];
  /** Only when the list endpoint returns clicks; never fetched per link. */
  clicks?: number;
  createdAt?: string;
}

export interface ShortLinkPage {
  links: ShortLink[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
}

export interface ListShortLinksOptions {
  cursor?: string;
  /** Free-text search; providers without server search filter this page. */
  search?: string;
  /** Required by Short.io, optional elsewhere. */
  domainId?: string;
  limit?: number;
}

export interface CreateShortLinkInput {
  longUrl: string;
  domain?: Pick<ShortLinkDomain, "id" | "hostname">;
  /** Custom back-half (Rebrandly slashtag, Short.io path). Bitly ignores it. */
  slug?: string;
  title?: string;
}

export interface ShortLinkAccount {
  id?: string;
  name?: string;
  email?: string;
}

export interface ShortLinkClient {
  getAccount(): Promise<ShortLinkAccount>;
  listDomains(): Promise<ShortLinkDomain[]>;
  listLinks(options?: ListShortLinksOptions): Promise<ShortLinkPage>;
  createLink(input: CreateShortLinkInput): Promise<ShortLink>;
  /**
   * Points an existing link at a new destination. Throws an
   * IntegrationApiError (code "upgrade_required" or "forbidden") when the
   * account's plan doesn't allow editing destinations.
   */
  updateLinkDestination(linkId: string, longUrl: string): Promise<ShortLink>;
}

/** Filters a page client-side for providers without a search parameter. */
export function filterLinks(links: ShortLink[], search?: string): ShortLink[] {
  const q = search?.trim().toLowerCase();
  if (!q) return links;
  return links.filter((link) =>
    [link.shortUrl, link.longUrl, link.title ?? ""].some((value) =>
      value.toLowerCase().includes(q)
    )
  );
}

export function clampLimit(limit: number | undefined, max: number): number {
  if (!(limit && Number.isFinite(limit))) return Math.min(50, max);
  return Math.max(1, Math.min(Math.floor(limit), max));
}
