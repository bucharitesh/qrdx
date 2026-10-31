/** Notion API shapes QRdx reads (https://developers.notion.com/reference). */

export interface NotionRichText {
  plain_text?: string;
}

export interface NotionPage {
  object: "page";
  id: string;
  url: string;
  /** Set when the page is published to the web. */
  public_url?: string | null;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  icon?: { type: "emoji"; emoji: string } | { type: string } | null;
  properties?: Record<string, { type: string; title?: NotionRichText[] }>;
}

export interface NotionSearchResult {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionBotUser {
  id: string;
  name?: string;
  bot?: {
    workspace_name?: string;
    owner?: {
      type?: string;
      user?: { name?: string; person?: { email?: string } };
    };
  };
}
