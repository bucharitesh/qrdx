import type { IntegrationDefinition } from "../../registry/types";

/** Short.io: connects with a secret API key, then a domain is picked. */
export const shortIoIntegration: IntegrationDefinition = {
  slug: "short-io",
  name: "Short.io",
  description: "Shorten links with your Short.io account on your own domain",
  logos: {
    light: "/integrations/short-io.svg",
    dark: "/integrations/short-io.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "Secret API key",
    placeholder: "Paste your Short.io secret key",
    helpUrl: "https://app.short.io/settings/integrations/api-key",
    helpText:
      "In Short.io, open Integrations & API → API, click Create API key, keep it a secret (private) key and copy it.",
  },
  capabilities: [
    {
      kind: "short-link-provider",
      id: "short-io-short-links",
      label: "Shorten with Short.io",
      description:
        "Create a Short.io link on your domain for a QR code's URL, or reuse one you already have.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      actions: ["create", "select"],
    },
  ],
  features: [
    "Create Short.io links from the QR editor",
    "Pick an existing Short.io link",
    "Choose which of your domains new links use",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://short.io",
};
