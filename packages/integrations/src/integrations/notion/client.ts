import type {
  FilePickerClient,
  ListPickerItemsOptions,
  PickerAccount,
  PickerItem,
  PickerPage,
  SharedLinkResult,
} from "../../capabilities/file-picker";
import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type { NotionBotUser, NotionPage, NotionSearchResult } from "./types";

const API_URL = "https://api.notion.com/v1";
export const NOTION_VERSION = "2022-06-28";
const PROVIDER = { slug: "notion", name: "Notion" };
const PAGE_ID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const CURSOR = /^[0-9a-f-]{32,36}$/i;

export const NOTION_NOT_PUBLISHED_WARNING =
  "This page isn't published to the web, so only people in your Notion workspace can open it. In Notion, click Share → Publish → Publish to web, then pick the page again.";

function invalid(message: string): IntegrationApiError {
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 400,
    code: "bad_request",
    message,
  });
}

export function getNotionPageTitle(page: NotionPage): string {
  for (const property of Object.values(page.properties ?? {})) {
    if (property.type === "title") {
      const text = (property.title ?? [])
        .map((part) => part.plain_text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

function toItem(page: NotionPage): PickerItem {
  return {
    id: page.id,
    name: getNotionPageTitle(page),
    kind: "page",
    modifiedAt: page.last_edited_time,
    emoji:
      page.icon && page.icon.type === "emoji" && "emoji" in page.icon
        ? page.icon.emoji
        : undefined,
  };
}

/**
 * Notion client for a public integration. Search only returns pages the user
 * shared with QRdx while connecting (or later from a page's ••• menu).
 */
export class NotionClient implements FilePickerClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Notion-Version": NOTION_VERSION,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  async getAccount(): Promise<PickerAccount> {
    const me = await this.request<NotionBotUser>("/users/me");
    return {
      id: me.id,
      name: me.bot?.workspace_name ?? me.bot?.owner?.user?.name,
      email: me.bot?.owner?.user?.person?.email,
    };
  }

  /** Pages shared with QRdx, most recently edited first. */
  async list(options: ListPickerItemsOptions = {}): Promise<PickerPage> {
    if (options.cursor && !CURSOR.test(options.cursor)) {
      throw invalid("Invalid page cursor.");
    }
    const query = options.search?.trim().slice(0, 200);
    const data = await this.request<NotionSearchResult>("/search", {
      method: "POST",
      body: JSON.stringify({
        ...(query ? { query } : {}),
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 50,
        ...(options.cursor ? { start_cursor: options.cursor } : {}),
      }),
    });
    return {
      items: data.results
        .filter((page) => page.object === "page")
        .filter((page) => !(page.archived || page.in_trash))
        .map(toItem),
      nextCursor: data.has_more ? (data.next_cursor ?? undefined) : undefined,
    };
  }

  /**
   * Notion has no API to publish a page, so this uses the public URL when
   * the page is published to the web and warns when it isn't.
   */
  async createShareLink(
    item: Pick<PickerItem, "id" | "kind">
  ): Promise<SharedLinkResult> {
    if (!PAGE_ID.test(item.id)) throw invalid("Invalid Notion page.");
    const page = await this.request<NotionPage>(
      `/pages/${encodeURIComponent(item.id)}`
    );
    const name = getNotionPageTitle(page);
    if (page.public_url) {
      return { url: page.public_url, access: "public", name };
    }
    return {
      url: page.url,
      access: "restricted",
      name,
      warning: NOTION_NOT_PUBLISHED_WARNING,
    };
  }
}

export function createNotionClient(accessToken: string): NotionClient {
  return new NotionClient(accessToken);
}

/** Revokes the integration's token (POST /v1/oauth/revoke, Basic auth). */
export async function revokeNotionToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await providerRequest<unknown>(PROVIDER, `${API_URL}/oauth/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${options.clientId}:${options.clientSecret}`
      ).toString("base64")}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: options.token }),
  });
}
