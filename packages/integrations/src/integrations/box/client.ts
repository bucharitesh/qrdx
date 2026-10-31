import type {
  FilePickerClient,
  ListPickerItemsOptions,
  PickerAccount,
  PickerItem,
  PickerPage,
  ShareAccess,
  SharedLinkResult,
} from "../../capabilities/file-picker";
import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type {
  BoxItem,
  BoxItemCollection,
  BoxSharedLink,
  BoxUser,
} from "./types";

const API_URL = "https://api.box.com/2.0";
const REVOKE_URL = "https://api.box.com/oauth2/revoke";
const PROVIDER = { slug: "box", name: "Box" };
const ITEM_ID = /^\d{1,20}$/;
const OFFSET = /^\d{1,6}$/;
const FIELDS = "id,type,name,size,modified_at,path_collection";
const PAGE_SIZE = 100;
const ROOT_FOLDER = "0";

function invalid(message: string): IntegrationApiError {
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 400,
    code: "bad_request",
    message,
  });
}

function toItem(item: BoxItem): PickerItem {
  const parents = item.path_collection?.entries
    ?.filter((entry) => entry.id !== ROOT_FOLDER)
    .map((entry) => entry.name);
  return {
    id: item.id,
    name: item.name,
    kind: item.type === "folder" ? "folder" : "file",
    size: item.size,
    modifiedAt: item.modified_at,
    path: parents?.length ? parents.join(" / ") : undefined,
  };
}

const ACCESS: Record<string, ShareAccess> = {
  open: "public",
  company: "organization",
  collaborators: "restricted",
};

/** Box client over OAuth 2 (app scope: Read and write all files and folders). */
export class BoxClient implements FilePickerClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, `${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  async getAccount(): Promise<PickerAccount> {
    const user = await this.request<BoxUser>("/users/me?fields=id,name,login");
    return { id: user.id, name: user.name, email: user.login };
  }

  async list(options: ListPickerItemsOptions = {}): Promise<PickerPage> {
    const offset = options.cursor ?? "0";
    if (!OFFSET.test(offset)) throw invalid("Invalid page cursor.");
    const params = new URLSearchParams({
      fields: FIELDS,
      limit: String(PAGE_SIZE),
      offset,
    });

    let path: string;
    const query = options.search?.trim();
    if (query) {
      params.set("query", query.slice(0, 200));
      path = `/search?${params}`;
    } else {
      const folderId = options.folderId ?? ROOT_FOLDER;
      if (!ITEM_ID.test(folderId)) throw invalid("Invalid Box folder.");
      path = `/folders/${folderId}/items?${params}`;
    }

    const data = await this.request<BoxItemCollection>(path);
    const items = data.entries
      .filter((item) => item.type !== "web_link")
      .map(toItem);
    const nextOffset = Number(offset) + data.entries.length;
    return {
      items,
      nextCursor:
        data.entries.length > 0 &&
        typeof data.total_count === "number" &&
        nextOffset < data.total_count
          ? String(nextOffset)
          : undefined,
    };
  }

  private setSharedLink(
    item: Pick<PickerItem, "id" | "kind">,
    access: "open" | "company"
  ): Promise<{ shared_link?: BoxSharedLink | null }> {
    const collection = item.kind === "folder" ? "folders" : "files";
    return this.request(`/${collection}/${item.id}?fields=shared_link`, {
      method: "PUT",
      body: JSON.stringify({ shared_link: { access } }),
    });
  }

  /**
   * Turns on the item's shared link for anyone ("open"). Where the
   * enterprise forbids open links, falls back to a company-only link.
   */
  async createShareLink(
    item: Pick<PickerItem, "id" | "kind">
  ): Promise<SharedLinkResult> {
    if (!ITEM_ID.test(item.id)) throw invalid("Invalid Box item.");

    let result: { shared_link?: BoxSharedLink | null };
    try {
      result = await this.setSharedLink(item, "open");
    } catch (error) {
      if (
        !(
          isIntegrationApiError(error) &&
          (error.status === 400 || error.status === 403)
        )
      ) {
        throw error;
      }
      result = await this.setSharedLink(item, "company");
    }

    const link = result.shared_link;
    if (!link?.url) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 502,
        code: "server",
        message: "Box didn't return a shared link.",
      });
    }
    const access =
      ACCESS[link.effective_access ?? link.access ?? "open"] ?? "restricted";
    return {
      url: link.url,
      directUrl:
        item.kind === "file" ? (link.download_url ?? undefined) : undefined,
      access,
      warning:
        access === "organization"
          ? "Your Box admin only allows company links, so only people signed in to your company's Box can open this one."
          : access === "restricted"
            ? "Only collaborators on this item can open the link. Change it to “People with the link” in Box for a public QR code."
            : undefined,
    };
  }
}

export function createBoxClient(accessToken: string): BoxClient {
  return new BoxClient(accessToken);
}

/** Revokes the access and refresh tokens. */
export async function revokeBoxToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await providerRequest<void>(PROVIDER, REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      token: options.token,
    }).toString(),
  });
}
