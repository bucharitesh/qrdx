/** Box API 2.0 shapes QRdx reads (https://developer.box.com/reference). */

export interface BoxItem {
  type: "file" | "folder" | "web_link";
  id: string;
  name: string;
  size?: number;
  modified_at?: string;
  path_collection?: { entries?: Array<{ id: string; name: string }> };
}

export interface BoxItemCollection {
  entries: BoxItem[];
  total_count?: number;
  offset?: number;
  limit?: number;
}

export interface BoxSharedLink {
  url: string;
  download_url?: string | null;
  access?: "open" | "company" | "collaborators";
  effective_access?: "open" | "company" | "collaborators";
}

export interface BoxUser {
  id: string;
  name?: string;
  login?: string;
}
