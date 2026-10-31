import type { IntegrationDefinition } from "../../registry/types";

/** Cal.com event types, connected with an API key (v2). */
export const calcomIntegration: IntegrationDefinition = {
  slug: "calcom",
  name: "Cal.com",
  description: "Pick a Cal.com event type and make a booking QR code",
  logos: {
    light: "/integrations/calcom.svg",
    dark: "/integrations/calcom.svg",
  },
  category: ["marketing"],
  type: "api_key",
  apiKey: {
    label: "API key",
    placeholder: "cal_live_…",
    helpUrl: "https://app.cal.com/settings/developer/api-keys",
    helpText:
      "In Cal.com, open Settings → Developer → API keys, create a key and copy it (it is shown once).",
  },
  capabilities: [
    {
      kind: "qr-content-source",
      id: "calcom-event-types",
      label: "Pick an event type",
      description:
        "List your event types and encode the booking page, so a scan opens your calendar.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "calcom",
      sourceTypes: ["event-type"],
    },
  ],
  features: [
    "Event types with their length",
    "Booking page URLs, ready to encode",
    "Hidden event types are skipped",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://cal.com",
};
