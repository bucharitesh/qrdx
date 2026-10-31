import type { IntegrationDefinition } from "../../registry/types";

/**
 * Shopify products, connected with the store domain plus either an Admin API
 * access token (legacy custom app) or a Dev Dashboard app's client ID and
 * secret (QRdx mints a 24-hour token and renews it). Scope: read_products.
 */
export const shopifyIntegration: IntegrationDefinition = {
  slug: "shopify",
  name: "Shopify",
  description: "Make QR codes for your Shopify products, one or all at once",
  logos: {
    light: "/integrations/shopify.svg",
    dark: "/integrations/shopify.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "Admin API access token",
    placeholder: "shpat_…",
    helpUrl: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    helpText:
      "Create an app with the read_products scope for your store, install it, then paste your store domain and its credentials.",
  },
  capabilities: [
    {
      kind: "qr-content-source",
      id: "shopify-products",
      label: "Pick a product",
      description:
        "Search your active products with their image and price, and encode the product's page on your store.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      sourceTypes: ["product"],
    },
  ],
  features: [
    "Active products with image and price",
    "Online Store product URLs (your primary domain)",
    "Bulk: download a CSV for the QR code importer",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.shopify.com",
};
