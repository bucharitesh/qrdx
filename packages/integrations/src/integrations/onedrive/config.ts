import type { IntegrationDefinition } from "../../registry/types";

/**
 * OneDrive and OneDrive for Business (SharePoint) through the Microsoft
 * identity platform: OAuth 2 with PKCE, any Microsoft account (`common`).
 */
export const oneDriveIntegration: IntegrationDefinition = {
  slug: "onedrive",
  name: "OneDrive",
  description:
    "Pick a OneDrive or SharePoint file and encode a view-only sharing link",
  logos: {
    light: "/integrations/onedrive.svg",
    dark: "/integrations/onedrive.svg",
  },
  category: ["storage", "assets"],
  type: "oauth",
  oauth: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // Graph's createLink needs Files.ReadWrite; Files.Read can't make links
    scopes: ["offline_access", "Files.ReadWrite"],
    pkce: true,
    responseType: "code",
    extraParams: { response_mode: "query", prompt: "select_account" },
  },
  capabilities: [
    {
      kind: "asset-picker",
      id: "onedrive-file-picker",
      label: "Pick from OneDrive",
      description:
        "Browse or search OneDrive, then use a view-only sharing link as the QR code's URL.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      assetTypes: ["file"],
    },
  ],
  features: [
    "Personal OneDrive and OneDrive for Business",
    "Creates a view-only “Anyone with the link” link",
    "Falls back to an organization link when your admin requires it",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.microsoft.com/microsoft-365/onedrive",
};
