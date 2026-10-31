import type { IntegrationDefinition } from "../../registry/types";

/** Dropbox: OAuth 2 with PKCE and offline (refreshable) tokens. */
export const dropboxIntegration: IntegrationDefinition = {
  slug: "dropbox",
  name: "Dropbox",
  description: "Pick a Dropbox file or folder and encode its shared link",
  logos: {
    light: "/integrations/dropbox.svg",
    dark: "/integrations/dropbox.svg",
  },
  category: ["storage", "assets"],
  type: "oauth",
  oauth: {
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    // sharing.read is only used to find a link the file already has
    scopes: [
      "account_info.read",
      "files.metadata.read",
      "sharing.read",
      "sharing.write",
    ],
    pkce: true,
    responseType: "code",
    extraParams: { token_access_type: "offline" },
  },
  capabilities: [
    {
      kind: "asset-picker",
      id: "dropbox-file-picker",
      label: "Pick from Dropbox",
      description:
        "Browse or search Dropbox, then use the file's shared link as the QR code's URL or a page's file.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      assetTypes: ["file", "image"],
    },
  ],
  features: [
    "Browse folders and search your Dropbox",
    "Creates a shared link, or reuses the existing one",
    "Direct file links for PDF, audio and download blocks",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.dropbox.com",
};
