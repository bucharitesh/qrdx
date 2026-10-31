"use client";

import type {
  PickerItem,
  PickerPage,
  SharedLinkResult,
  ShortLink,
  ShortLinkDomain,
  ShortLinkGroup,
  ShortLinkPage,
} from "@repo/integrations";
import { apiFetch } from "@/lib/api-fetch";
import {
  isIntegrationsMock,
  MOCK_DOMAINS,
  MOCK_LINKS,
  mockCreateLink,
  mockPickerPage,
  mockShareLink,
} from "./mock";

export interface ConnectedProvider {
  slug: string;
  name: string;
  logo: string;
  capability: "short-links" | "files";
  configured: boolean;
  connected: boolean;
  status: "active" | "disconnected" | "error" | null;
}

export class ConnectedAccountError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ConnectedAccountError";
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError")
      throw error;
    throw new ConnectedAccountError(
      "Couldn't reach QRdx. Check your connection and try again.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ConnectedAccountError(
      body?.error ?? "Something went wrong. Try again.",
      body?.code,
    );
  }
  return body as T;
}

const MOCK_PROVIDERS: ConnectedProvider[] = [
  ["bitly", "Bitly", "short-links"],
  ["rebrandly", "Rebrandly", "short-links"],
  ["short-io", "Short.io", "short-links"],
  ["dropbox", "Dropbox", "files"],
  ["onedrive", "OneDrive", "files"],
  ["box", "Box", "files"],
  ["notion", "Notion", "files"],
].map(([slug, name, capability]) => ({
  slug: slug as string,
  name: name as string,
  logo: `/integrations/${slug}.svg`,
  capability: capability as ConnectedProvider["capability"],
  configured: true,
  connected: slug !== "box",
  status: slug === "box" ? null : "active",
}));

/** Signed-out visitors get null (the editor then hides account tools). */
export async function fetchConnections(): Promise<ConnectedProvider[] | null> {
  if (isIntegrationsMock()) return MOCK_PROVIDERS;
  // Plain fetch: signed out is a normal state here, not an expired session
  const response = await fetch("/api/integrations/connections").catch(
    () => null,
  );
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    providers?: ConnectedProvider[];
  } | null;
  return body?.providers ?? null;
}

export function loadPickerPage(
  provider: string,
  options: { folderId?: string; search?: string; cursor?: string },
): Promise<PickerPage> {
  if (isIntegrationsMock()) return mockPickerPage(provider, options);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value) params.set(key, value);
  }
  return request<PickerPage>(
    `/api/integrations/files/${encodeURIComponent(provider)}?${params}`,
  );
}

export function createShareLink(
  provider: string,
  item: Pick<PickerItem, "id" | "kind">,
): Promise<SharedLinkResult> {
  if (isIntegrationsMock()) return mockShareLink(provider, item);
  return request<SharedLinkResult>(
    `/api/integrations/files/${encodeURIComponent(provider)}/share`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, kind: item.kind }),
    },
  );
}

export interface DomainsResponse {
  domains: ShortLinkDomain[];
  groups?: ShortLinkGroup[];
  defaultDomainId?: string;
}

export function loadShortLinkDomains(
  provider: string,
): Promise<DomainsResponse> {
  if (isIntegrationsMock()) {
    return Promise.resolve({
      domains: MOCK_DOMAINS,
      groups: [{ id: "g1", name: "Acme marketing" }],
      defaultDomainId: "go.acme.com",
    });
  }
  return request<DomainsResponse>(
    `/api/integrations/links/${encodeURIComponent(provider)}/domains`,
  );
}

export function listShortLinks(
  provider: string,
  options: { search?: string; cursor?: string } = {},
): Promise<ShortLinkPage> {
  if (isIntegrationsMock()) {
    const q = options.search?.toLowerCase();
    return Promise.resolve({
      links: q
        ? MOCK_LINKS.filter((link) =>
            `${link.shortUrl} ${link.longUrl} ${link.title}`
              .toLowerCase()
              .includes(q),
          )
        : MOCK_LINKS,
    });
  }
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.cursor) params.set("cursor", options.cursor);
  return request<ShortLinkPage>(
    `/api/integrations/links/${encodeURIComponent(provider)}?${params}`,
  );
}

export async function createShortLink(
  provider: string,
  input: { longUrl: string; domainId?: string; slug?: string; title?: string },
): Promise<ShortLink> {
  if (isIntegrationsMock()) {
    return mockCreateLink(input.longUrl, input.domainId ?? "go.acme.com");
  }
  const { link } = await request<{ link: ShortLink }>(
    `/api/integrations/links/${encodeURIComponent(provider)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return link;
}
