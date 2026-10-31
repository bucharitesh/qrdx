import type { IntegrationDefinition } from "../../registry/types";

/** Box: OAuth 2 (Box doesn't support PKCE; `state` guards the flow). */
export const boxIntegration: IntegrationDefinition = {
  slug: "box",
  name: "Box",
  description: "Pick a Box file or folder and encode its shared link",
  logos: {
    light: "/integrations/box.svg",
    dark: "/integrations/box.svg",
  },
  category: ["storage", "assets"],
  type: "oauth",
  oauth: {
    authUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    // Creating a shared link is a write on the file
    scopes: ["root_readwrite"],
    pkce: false,
    responseType: "code",
  },
  capabilities: [
    {
      kind: "asset-picker",
      id: "box-file-picker",
      label: "Pick from Box",
      description:
        "Browse or search Box, then use the item's shared link as the QR code's URL or a page's file.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      assetTypes: ["file", "image"],
    },
  ],
  features: [
    "Browse folders and search your Box",
    "Turns on a “People with the link” shared link",
    "Falls back to a company link when your admin requires it",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.box.com",
};
