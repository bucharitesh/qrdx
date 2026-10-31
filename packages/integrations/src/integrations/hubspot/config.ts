import type { IntegrationDefinition } from "../../registry/types";

/** HubSpot contacts from form responses (OAuth, contacts write only). */
export const hubspotIntegration: IntegrationDefinition = {
  slug: "hubspot",
  name: "HubSpot",
  description:
    "Create or update a HubSpot contact for every form response on your hosted pages",
  logos: {
    light: "/integrations/hubspot.svg",
    dark: "/integrations/hubspot.svg",
  },
  category: ["crm"],
  type: "oauth",
  oauth: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/2026-09/token",
    scopes: ["oauth", "crm.objects.contacts.write"],
    // HubSpot's OAuth for apps doesn't support PKCE; state still applies.
    pkce: false,
    responseType: "code",
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "hubspot-contacts",
      label: "Form responses to contacts",
      description:
        "Each new response upserts a contact by email, with the fields you map (email, name and phone are suggested).",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Upsert by email: no duplicate contacts",
    "Field mapping with suggested defaults",
    "Batched, retried with backoff, last sync shown in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://www.hubspot.com",
};
