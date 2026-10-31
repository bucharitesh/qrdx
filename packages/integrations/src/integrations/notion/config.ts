import type { IntegrationDefinition } from "../../registry/types";

/**
 * Notion public integration (OAuth). The user picks which pages QRdx can
 * see on Notion's consent screen. Notion has no scopes or PKCE; the token
 * request uses HTTP Basic auth and a JSON body.
 */
export const notionIntegration: IntegrationDefinition = {
  slug: "notion",
  name: "Notion",
  description:
    "Pick a Notion page you shared with QRdx and encode its public link",
  logos: {
    light: "/integrations/notion.svg",
    dark: "/integrations/notion.svg",
  },
  category: ["storage", "assets"],
  type: "oauth",
  oauth: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    pkce: false,
    responseType: "code",
    extraParams: { owner: "user" },
    tokenAuth: "basic",
    tokenFormat: "json",
  },
  capabilities: [
    {
      kind: "asset-picker",
      id: "notion-page-picker",
      label: "Pick a Notion page",
      description:
        "Search the pages you shared with QRdx and use the page's public link as the QR code's URL.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      assetTypes: ["file"],
    },
  ],
  features: [
    "Search pages you shared with QRdx",
    "Uses the page's “Publish to web” link",
    "Tells you when a page isn't published yet",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.notion.com",
};
