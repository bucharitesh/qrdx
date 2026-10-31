import type { IntegrationDefinition } from "../../registry/types";

/** Mailchimp audience members from form responses (OAuth; no scopes). */
export const mailchimpIntegration: IntegrationDefinition = {
  slug: "mailchimp",
  name: "Mailchimp",
  description:
    "Add or update Mailchimp audience members from form responses, with tags and consent",
  logos: {
    light: "/integrations/mailchimp.svg",
    dark: "/integrations/mailchimp.svg",
  },
  category: ["crm", "marketing"],
  type: "oauth",
  oauth: {
    authUrl: "https://login.mailchimp.com/oauth2/authorize",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    // Mailchimp has no OAuth scopes; tokens reach the whole account.
    scopes: [],
    pkce: false,
    responseType: "code",
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "mailchimp-members",
      label: "Form responses to an audience",
      description:
        "Each new response adds or updates a member of the audience you choose, with your tags. Only answered, mapped questions are sent, and a consent checkbox decides who is subscribed.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Pick the audience and tags",
    "Consent: subscribed only with a ticked checkbox, otherwise double opt-in",
    "Never re-subscribes people who unsubscribed",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://mailchimp.com",
};
