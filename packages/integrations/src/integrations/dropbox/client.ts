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
  DropboxAccount,
  DropboxEntry,
  DropboxListFolderResult,
  DropboxSearchResult,
  DropboxSharedLink,
} from "./types";

const API_URL = "https://api.dropboxapi.com/2";
const PROVIDER = { slug: "dropbox", name: "Dropbox" };
const ITEM_ID = /^id:[A-Za-z0-9_-]{1,128}$/;
const CURSOR = /^[ls]:[A-Za-z0-9_\-=+/]{1,4096}$/;

const DROPBOX_ERRORS: [string, string][] = [
  ["email_not_verified", "verify your Dropbox email address before sharing."],
  [
    "settings_error/not_authorized",
    "your team doesn't allow public links for this file.",
  ],
  ["shared_link_access_denied", "you can't share this file."],
  ["path/not_found", "the file is no longer there."],
];

function describeDropboxError(body: unknown): string | undefined {
  const summary =
    body && typeof body === "object" && "error_summary" in body
      ? String((body as { error_summary?: unknown }).error_summary ?? "")
      : "";
  for (const [needle, message] of DROPBOX_ERRORS) {
    if (summary.includes(needle)) return message;
  }
  return summary ? summary.replace(/\/\.*$/, "").slice(0, 200) : undefined;
}

function toItem(entry: DropboxEntry): PickerItem {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry[".tag"] === "folder" ? "folder" : "file",
    size: entry.size,
    modifiedAt: entry.server_modified,
    path: entry.path_display,
  };
}

/** `?dl=0` opens Dropbox's preview; `?raw=1` serves the file itself. */
export function toDropboxDirectUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("dl");
  parsed.searchParams.set("raw", "1");
  return parsed.toString();
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
 * Dropbox client (scopes: account_info.read, files.metadata.read,
 * sharing.read, sharing.write).
 */
export class DropboxClient implements FilePickerClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private rpc<T>(endpoint: string, args: unknown): Promise<T> {
    return providerRequest<T>(PROVIDER, `${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args ?? null),
      describeError: (body, status) =>
        status === 409 || status === 400 || status === 403
          ? describeDropboxError(body)
          : undefined,
    });
  }

  async getAccount(): Promise<PickerAccount> {
    const account = await this.rpc<DropboxAccount>(
      "/users/get_current_account",
      null
    );
    return {
      id: account.account_id,
      name: account.name?.display_name,
      email: account.email,
    };
  }

  /** Folder listing, or search across the whole Dropbox. */
  async list(options: ListPickerItemsOptions = {}): Promise<PickerPage> {
    if (options.cursor) {
      if (!CURSOR.test(options.cursor)) throw invalid("Invalid page cursor.");
      const kind = options.cursor[0];
      const cursor = options.cursor.slice(2);
      return kind === "s"
        ? this.searchPage(
            await this.rpc<DropboxSearchResult>("/files/search/continue_v2", {
              cursor,
            })
          )
        : this.folderPage(
            await this.rpc<DropboxListFolderResult>(
              "/files/list_folder/continue",
              { cursor }
            )
          );
    }

    const query = options.search?.trim();
    if (query) {
      return this.searchPage(
        await this.rpc<DropboxSearchResult>("/files/search_v2", {
          query: query.slice(0, 200),
          options: { max_results: 50, file_status: "active" },
        })
      );
    }

    if (options.folderId && !ITEM_ID.test(options.folderId)) {
      throw invalid("Invalid Dropbox folder.");
    }
    return this.folderPage(
      await this.rpc<DropboxListFolderResult>("/files/list_folder", {
        path: options.folderId ?? "",
        limit: 100,
      })
    );
  }

  private folderPage(result: DropboxListFolderResult): PickerPage {
    const items = result.entries
      .filter((entry) => entry[".tag"] !== "deleted")
      .map(toItem)
      .sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name)
          : a.kind === "folder"
            ? -1
            : 1
      );
    return {
      items,
      nextCursor: result.has_more ? `l:${result.cursor}` : undefined,
    };
  }

  private searchPage(result: DropboxSearchResult): PickerPage {
    return {
      items: result.matches
        .map((match) => match.metadata?.metadata)
        .filter((entry): entry is DropboxEntry => Boolean(entry?.id))
        .map(toItem),
      nextCursor:
        result.has_more && result.cursor ? `s:${result.cursor}` : undefined,
    };
  }

  /**
   * Creates a shared link, or returns the one the file already has
   * (create_shared_link_with_settings answers 409 shared_link_already_exists).
   */
  async createShareLink(
    item: Pick<PickerItem, "id" | "kind">
  ): Promise<SharedLinkResult> {
    if (!ITEM_ID.test(item.id)) throw invalid("Invalid Dropbox file.");

    let link: DropboxSharedLink | undefined;
    try {
      link = await this.rpc<DropboxSharedLink>(
        "/sharing/create_shared_link_with_settings",
        { path: item.id }
      );
    } catch (error) {
      if (
        !(
          isIntegrationApiError(error) &&
          error.status === 409 &&
          JSON.stringify(error.body ?? "").includes(
            "shared_link_already_exists"
          )
        )
      ) {
        throw error;
      }
      link = await this.existingLink(item.id, error.body);
    }

    const visibility =
      link.link_permissions?.resolved_visibility?.[".tag"] ??
      link.link_permissions?.effective_audience?.[".tag"] ??
      "public";
    const access =
      visibility === "public"
        ? "public"
        : visibility === "team_only" || visibility === "team"
          ? "organization"
          : "restricted";

    return {
      url: link.url,
      directUrl:
        item.kind === "file" ? toDropboxDirectUrl(link.url) : undefined,
      access,
      name: link.name,
      warning:
        access === "organization"
          ? "Only members of your Dropbox team can open this link. Change it to “Anyone with the link” in Dropbox for a public QR code."
          : access === "restricted"
            ? "This link needs a password or an invite. Change its settings in Dropbox for a public QR code."
            : undefined,
    };
  }

  private async existingLink(
    id: string,
    errorBody: unknown
  ): Promise<DropboxSharedLink> {
    const metadata = (
      errorBody as {
        error?: {
          shared_link_already_exists?: { metadata?: DropboxSharedLink };
        };
      }
    )?.error?.shared_link_already_exists?.metadata;
    if (metadata?.url) return metadata;

    const { links } = await this.rpc<{ links: DropboxSharedLink[] }>(
      "/sharing/list_shared_links",
      { path: id, direct_only: true }
    );
    const [first] = links;
    if (!first) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 404,
        code: "not_found",
        message: "Dropbox: couldn't find the file's existing shared link.",
      });
    }
    return first;
  }
}

export function createDropboxClient(accessToken: string): DropboxClient {
  return new DropboxClient(accessToken);
}

/** Revokes the token so Dropbox drops QRdx's access. */
export async function revokeDropboxToken(accessToken: string): Promise<void> {
  await providerRequest<void>(PROVIDER, `${API_URL}/auth/token/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });
}
