/**
 * Common shape every file/page picker client (Dropbox, OneDrive, Box,
 * Notion) implements: browse or search, then turn the picked item into a
 * link people can open. Client-safe types only.
 */

export type PickerItemKind = "file" | "folder" | "page";

export interface PickerItem {
  id: string;
  name: string;
  kind: PickerItemKind;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  /** Folder path or parent name, for context in search results. */
  path?: string;
  /** Emoji icon (Notion pages). */
  emoji?: string;
}

export interface PickerPage {
  items: PickerItem[];
  nextCursor?: string;
}

export interface ListPickerItemsOptions {
  /** Folder to list; the root when absent. Ignored while searching. */
  folderId?: string;
  search?: string;
  cursor?: string;
}

/** Who can open the link QRdx encodes. */
export type ShareAccess = "public" | "organization" | "restricted";

export interface SharedLinkResult {
  /** Link to encode in the QR code (opens the provider's viewer). */
  url: string;
  /** A direct file link for players and viewers, when the provider has one. */
  directUrl?: string;
  access: ShareAccess;
  /** Shown to the person picking, e.g. "Only people in your company can open it." */
  warning?: string;
  name?: string;
}

export interface PickerAccount {
  id?: string;
  name?: string;
  email?: string;
}

export interface FilePickerClient {
  getAccount(): Promise<PickerAccount>;
  list(options?: ListPickerItemsOptions): Promise<PickerPage>;
  createShareLink(
    item: Pick<PickerItem, "id" | "kind">
  ): Promise<SharedLinkResult>;
}
