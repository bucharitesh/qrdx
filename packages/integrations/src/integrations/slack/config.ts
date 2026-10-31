import type { IntegrationDefinition } from "../../registry/types";

/**
 * "Add to Slack": OAuth with only the incoming-webhook scope. The channel
 * webhook becomes a normal Slack notification target, so alerts use the
 * same formatting as pasted webhooks (lib/events/notify).
 */
export const slackIntegration: IntegrationDefinition = {
  slug: "slack",
  name: "Slack",
  description:
    "Add QRdx to a Slack channel and get scan milestones, form responses and code changes there",
  logos: {
    light: "/integrations/slack.svg",
    dark: "/integrations/slack.svg",
  },
  category: ["communication"],
  type: "oauth",
  oauth: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["incoming-webhook"],
    // Slack PKCE turns an app into a public client; state protects the flow.
    pkce: false,
    responseType: "code",
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "slack-channel-alerts",
      label: "Alerts in a channel",
      description:
        "Pick a channel in Slack; QRdx posts the alerts you choose in Settings → Notifications.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["alerts"],
      modes: ["notify"],
    },
  ],
  features: [
    "Add to Slack instead of pasting a webhook URL",
    "Same alerts as pasted webhooks: milestones, form responses, code changes",
    "Only the incoming-webhook permission",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://slack.com",
};
