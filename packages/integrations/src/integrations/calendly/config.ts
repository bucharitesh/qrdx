import type { IntegrationDefinition } from "../../registry/types";

/** Calendly event types over OAuth (PKCE, read-only scopes). */
export const calendlyIntegration: IntegrationDefinition = {
  slug: "calendly",
  name: "Calendly",
  description: "Pick a Calendly event type and make a scheduling QR code",
  logos: {
    light: "/integrations/calendly.svg",
    dark: "/integrations/calendly.svg",
  },
  category: ["marketing"],
  type: "oauth",
  oauth: {
    authUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    scopes: ["users:read", "event_types:read"],
    pkce: true,
    responseType: "code",
    tokenAuth: "basic",
  },
  capabilities: [
    {
      kind: "qr-content-source",
      id: "calendly-event-types",
      label: "Pick an event type",
      description:
        "List your active event types and encode the scheduling link, so a scan opens your booking page.",
      surfaces: ["editor-content-form", "settings-detail"],
      requiresConnection: true,
      contentType: "url",
      sourceTypes: ["event-type"],
    },
  ],
  features: [
    "Active event types with their length",
    "Scheduling URLs, ready to encode",
    "Read-only access (users:read, event_types:read)",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://calendly.com",
};
