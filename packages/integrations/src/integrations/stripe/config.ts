import type { IntegrationDefinition } from "../../registry/types";

/** Stripe Payment Links, connected with a read-only restricted key. */
export const stripeIntegration: IntegrationDefinition = {
  slug: "stripe",
  name: "Stripe",
  description: "Turn your Stripe Payment Links into QR codes in one click",
  logos: {
    light: "/integrations/stripe.svg",
    dark: "/integrations/stripe.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "Restricted API key",
    placeholder: "rk_live_…",
    helpUrl: "https://dashboard.stripe.com/apikeys/create",
    helpText:
      "Create a restricted key with Payment Links set to Read and every other permission set to None.",
  },
  capabilities: [
    {
      kind: "qr-content-source",
      id: "stripe-payment-links",
      label: "Pick a payment link",
      description:
        "List your active Payment Links with their price and make a QR code that opens checkout.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      sourceTypes: ["link"],
    },
  ],
  features: [
    "Active Payment Links with name, amount and currency",
    "Read-only restricted key (Payment Links: Read)",
    "Test-mode keys are labeled",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://stripe.com/payments/payment-links",
};
