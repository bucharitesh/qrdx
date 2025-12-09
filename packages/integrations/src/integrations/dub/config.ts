import type { IntegrationDefinition } from "../../registry/types";

/**
 * Dub integration definition
 */
export const dubIntegration: IntegrationDefinition = {
  slug: "dub",
  name: "Dub.sh",
  description: "Create and track short links with advanced analytics",
  logo: "/integrations/dub-icon.svg",
  category: ["link-management", "analytics"],
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
  features: [
    "Create short links",
    "Track link analytics",
    "Custom domains",
    "QR code generation",
    "Link expiration",
  ],
  configurable: false,
  developedBy: "Dub.sh",
  website: "https://dub.co",
};
