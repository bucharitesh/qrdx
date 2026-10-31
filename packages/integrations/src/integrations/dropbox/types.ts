/** Dropbox API v2 shapes QRdx reads (https://www.dropbox.com/developers/documentation/http/documentation). */

export interface DropboxEntry {
  ".tag": "file" | "folder" | "deleted";
  id: string;
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
}

export interface DropboxListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

export interface DropboxSearchResult {
  matches: Array<{
    metadata: { ".tag": string; metadata: DropboxEntry };
  }>;
  has_more: boolean;
  cursor?: string;
}

export interface DropboxSharedLink {
  url: string;
  name?: string;
  link_permissions?: {
    resolved_visibility?: { ".tag": string };
    effective_audience?: { ".tag": string };
  };
}

export interface DropboxAccount {
  account_id: string;
  email?: string;
  name?: { display_name?: string };
}
