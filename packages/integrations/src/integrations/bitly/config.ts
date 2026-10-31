import type { IntegrationDefinition } from "../../registry/types";

/**
 * Bitly: OAuth when BITLY_CLIENT_ID/SECRET are set, and a generic access
 * token from Bitly settings either way.
 */
export const bitlyIntegration: IntegrationDefinition = {
  slug: "bitly",
  name: "Bitly",
  description:
    "Shorten links with your Bitly account, on bit.ly or your branded domain",
  logos: {
    light: "/integrations/bitly.svg",
    dark: "/integrations/bitly.svg",
  },
  category: ["marketing"],
  type: "oauth",
  oauth: {
    authUrl: "https://bitly.com/oauth/authorize",
    tokenUrl: "https://api-ssl.bitly.com/oauth/access_token",
    // Bitly OAuth has no scopes: a token can do what the account can
    scopes: [],
    pkce: false,
    responseType: "code",
  },
  apiKey: {
    label: "Generic access token",
    placeholder: "Paste your Bitly access token",
    helpUrl: "https://app.bitly.com/settings/api/",
    helpText:
      "In Bitly, open Settings → Developer settings → API, enter your password and copy the generated access token.",
  },
  capabilities: [
    {
      kind: "short-link-provider",
      id: "bitly-short-links",
      label: "Shorten with Bitly",
      description:
        "Create a Bitly link for a QR code's URL, or reuse one you already have.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      actions: ["create", "select"],
    },
  ],
  features: [
    "Create Bitly links from the QR editor",
    "Pick an existing Bitly link",
    "Branded short domains",
    "Groups and domains in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://bitly.com",
};
