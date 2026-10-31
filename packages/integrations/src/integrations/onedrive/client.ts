import type {
  FilePickerClient,
  ListPickerItemsOptions,
  PickerAccount,
  PickerItem,
  PickerPage,
  SharedLinkResult,
} from "../../capabilities/file-picker";
import {
  IntegrationApiError,
  isIntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type {
  GraphDrive,
  GraphDriveItem,
  GraphDriveItemList,
  GraphPermission,
} from "./types";

const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const PROVIDER = { slug: "onedrive", name: "OneDrive" };
// Needs a letter or digit, so "." and ".." can't climb the Graph path
const ITEM_ID = /^(?=.*[A-Za-z0-9])[A-Za-z0-9!._-]{1,256}$/;
const SELECT =
  "id,name,size,lastModifiedDateTime,webUrl,folder,file,package,parentReference";

function invalid(message: string): IntegrationApiError {
  return new IntegrationApiError({
    provider: PROVIDER.slug,
    status: 400,
    code: "bad_request",
    message,
  });
}

function toItem(item: GraphDriveItem): PickerItem {
  const path = item.parentReference?.path?.replace(/^\/drive\/root:?/, "");
  return {
    id: item.id,
    name: item.name,
    kind: item.folder ? "folder" : "file",
    mimeType: item.file?.mimeType,
    size: item.size,
    modifiedAt: item.lastModifiedDateTime,
    path: path ? decodeURIComponent(path) : undefined,
  };
}

/**
 * Next-page links come from Graph; only follow ones that stay on the user's
 * drive in Graph, so a forged cursor can't send the token anywhere else.
 */
export function isSafeGraphNextLink(link: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.origin === "https://graph.microsoft.com" &&
      url.pathname.startsWith("/v1.0/me/drive/")
    );
  } catch {
    return false;
  }
}

/**
 * OneDrive (personal) and OneDrive for Business / SharePoint client over
 * Microsoft Graph (scopes: Files.ReadWrite offline_access).
 */
export class OneDriveClient implements FilePickerClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private request<T>(url: string, init: RequestInit = {}): Promise<T> {
    return providerRequest<T>(PROVIDER, url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  getDrive(): Promise<GraphDrive> {
    return this.request<GraphDrive>(
      `${GRAPH_URL}/me/drive?$select=id,driveType,owner`
    );
  }

  async getAccount(): Promise<PickerAccount> {
    const drive = await this.getDrive();
    return {
      id: drive.id,
      name: drive.owner?.user?.displayName,
      email: drive.owner?.user?.email,
    };
  }

  async list(options: ListPickerItemsOptions = {}): Promise<PickerPage> {
    let url: string;
    if (options.cursor) {
      if (!isSafeGraphNextLink(options.cursor)) {
        throw invalid("Invalid page cursor.");
      }
      url = options.cursor;
    } else if (options.search?.trim()) {
      // OData string literal: single quotes are doubled
      const q = options.search.trim().slice(0, 200).replace(/'/g, "''");
      url = `${GRAPH_URL}/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=50&$select=${SELECT}`;
    } else if (options.folderId) {
      if (!ITEM_ID.test(options.folderId)) throw invalid("Invalid folder.");
      url = `${GRAPH_URL}/me/drive/items/${encodeURIComponent(options.folderId)}/children?$top=100&$select=${SELECT}`;
    } else {
      url = `${GRAPH_URL}/me/drive/root/children?$top=100&$select=${SELECT}`;
    }

    const data = await this.request<GraphDriveItemList>(url);
    const items = data.value
      .filter((item) => !item.package)
      .map(toItem)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1));
    const next = data["@odata.nextLink"];
    return {
      items,
      nextCursor: next && isSafeGraphNextLink(next) ? next : undefined,
    };
  }

  /**
   * View-only "anyone with the link" link; falls back to an
   * organization-only link where the tenant turned anonymous links off.
   */
  async createShareLink(
    item: Pick<PickerItem, "id" | "kind">
  ): Promise<SharedLinkResult> {
    if (!ITEM_ID.test(item.id)) throw invalid("Invalid file.");
    const url = `${GRAPH_URL}/me/drive/items/${encodeURIComponent(item.id)}/createLink`;

    try {
      const permission = await this.request<GraphPermission>(url, {
        method: "POST",
        body: JSON.stringify({ type: "view", scope: "anonymous" }),
      });
      return this.toResult(permission, "public");
    } catch (error) {
      if (
        !(
          isIntegrationApiError(error) &&
          (error.status === 400 || error.status === 403)
        )
      ) {
        throw error;
      }
      const permission = await this.request<GraphPermission>(url, {
        method: "POST",
        body: JSON.stringify({ type: "view", scope: "organization" }),
      });
      return this.toResult(permission, "organization");
    }
  }

  private toResult(
    permission: GraphPermission,
    access: "public" | "organization"
  ): SharedLinkResult {
    const webUrl = permission.link?.webUrl;
    if (!webUrl) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 502,
        code: "server",
        message: "OneDrive didn't return a sharing link.",
      });
    }
    return {
      url: webUrl,
      access,
      warning:
        access === "organization"
          ? "Your organization doesn't allow “Anyone” links, so only people signed in to your organization can open this one."
          : undefined,
    };
  }
}

export function createOneDriveClient(accessToken: string): OneDriveClient {
  return new OneDriveClient(accessToken);
}
