import type { IntegrationDefinition } from "../../registry/types";

/** Rebrandly: connects with an API key, no OAuth app needed. */
export const rebrandlyIntegration: IntegrationDefinition = {
  slug: "rebrandly",
  name: "Rebrandly",
  description:
    "Shorten links with your Rebrandly account on your branded domains",
  logos: {
    light: "/integrations/rebrandly.svg",
    dark: "/integrations/rebrandly.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "API key",
    placeholder: "Paste your Rebrandly API key",
    helpUrl: "https://app.rebrandly.com/account/api",
    helpText:
      "In Rebrandly, open Account → API keys, click New API key and copy it.",
  },
  capabilities: [
    {
      kind: "short-link-provider",
      id: "rebrandly-short-links",
      label: "Shorten with Rebrandly",
      description:
        "Create a branded Rebrandly link for a QR code's URL, or reuse one you already have.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      actions: ["create", "select"],
    },
  ],
  features: [
    "Create Rebrandly links from the QR editor",
    "Pick an existing Rebrandly link",
    "Branded domains and custom slashtags",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.rebrandly.com",
};
