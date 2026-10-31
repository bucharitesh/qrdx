import type { IntegrationDefinition } from "../../registry/types";

/**
 * Dub integration definition
 */
export const dubIntegration: IntegrationDefinition = {
  slug: "dub",
  name: "Dub",
  description: "Create or pick Dub short links and track their clicks",
  logos: {
    light: "/integrations/dub-icon.svg",
    dark: "/integrations/dub-icon-dark.svg",
  },
  category: ["analytics"],
  type: "oauth",
  oauth: {
    authUrl: "https://app.dub.co/oauth/authorize",
    tokenUrl: "https://api.dub.co/oauth/token",
    scopes: [
      "workspaces.read",
      "workspaces.write",
      "links.read",
      "links.write",
    ],
    pkce: true,
    responseType: "code",
  },
  capabilities: [
    {
      kind: "short-link-provider",
      id: "dub-short-links",
      label: "Create or select short links",
      description:
        "Create new Dub links or select existing links for QR codes.",
      surfaces: [
        "editor-content-modal",
        "editor-content-form",
        "settings-detail",
      ],
      requiresConnection: true,
      contentType: "dubsh",
      actions: ["create", "select", "manual"],
    },
    {
      kind: "manual-url-parser",
      id: "dub-manual-url",
      label: "Manual Dub URL",
      description: "Accept a Dub short link without connecting an account.",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      patterns: [
        {
          id: "dub-short-url",
          label: "Dub short URL",
          pattern: "^https://[A-Za-z0-9.-]+/[A-Za-z0-9._~-]+$",
          example: "https://dub.sh/example",
          contentType: "dubsh",
          targetField: "shortUrl",
        },
      ],
    },
  ],
  features: [
    "Create short links",
    "Track link analytics",
    "Custom domains",
    "QR code generation",
    "Link expiration",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://dub.co",
};
