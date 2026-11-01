import type { CatalogCapability, IntegrationCatalogEntry } from "../types";

const CHAT_CAPABILITIES: CatalogCapability[] = [
  {
    title: "Scan milestones",
    description:
      "A code's first scan, with when, where and on which device, then 10, 100, 1,000 scans and beyond.",
  },
  {
    title: "Form submissions",
    description:
      "The answers from a form on one of your hosted pages, with a link to all responses.",
  },
  {
    title: "New codes and changes",
    description:
      "Who created a code, or changed its destination, title, design or domain.",
  },
  {
    title: "No floods, no pings",
    description:
      "At most 30 alerts of one kind per hour, and never @everyone, @here or role mentions.",
  },
];

export const notifications: IntegrationCatalogEntry[] = [
  {
    slug: "slack",
    name: "Slack",
    tagline:
      "Add QRdx to a Slack channel for scan milestones, form submissions and code changes.",
    description: [
      "Click Add to Slack, pick a channel, and QRdx posts the alerts you choose there: a code's first scan and milestones, new form responses and code changes. Each alert is a short message with a link back to the code or the responses.",
      "Targets are per person and per workspace, so every teammate can send their own alerts to their own channels. Already pasted an incoming webhook URL? It keeps working, and you can still paste one instead of connecting.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["notifications"],
    logo: { type: "image", src: "/integrations/slack.svg" },
    plan: "business",
    builtBy: "QRdx",
    website: "https://slack.com",
    docs: "/docs/notifications#slack-and-discord",
    primaryAction: {
      type: "link",
      label: "Add to Slack",
      href: "/settings/integrations/slack",
    },
    secondaryAction: {
      type: "link",
      label: "Paste a webhook instead",
      href: "/settings/notifications",
    },
    steps: [
      {
        title: "Click Add to Slack",
        body: "In Settings → Integrations → Slack (or Settings → Notifications), pick the workspace in QRdx, then the Slack channel. QRdx asks only for permission to post to that channel (incoming-webhook).",
      },
      {
        title: "Choose the alerts",
        body: "The channel appears under Settings → Notifications with milestones and form responses on. Change the events there, or send a test.",
      },
      {
        title: "Or paste a webhook URL",
        body: "Prefer your own Slack app? Click + Slack in Settings → Notifications and paste its incoming webhook URL.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "https://hooks.slack.com/services/T0000/B0000/XXXXXXXX",
        },
      },
    ],
    capabilities: CHAT_CAPABILITIES,
    keywords: ["alerts", "chat", "channel", "webhook", "messages", "oauth"],
    related: ["discord", "email-alerts", "webhooks"],
  },
  {
    slug: "discord",
    name: "Discord",
    tagline:
      "Post scan milestones, form submissions and code changes to a Discord channel.",
    description: [
      "Paste a Discord channel webhook into QRdx and choose the events. Alerts arrive as short messages with a link back to QRdx.",
      "Messages never mention @everyone, @here or roles, whatever visitors type into a form.",
    ],
    kind: "native",
    surface: "integrations",
    categories: ["notifications"],
    logo: { type: "image", src: "/integrations/discord.svg" },
    plan: "business",
    builtBy: "QRdx",
    website: "https://discord.com",
    docs: "/docs/notifications#slack-and-discord",
    primaryAction: {
      type: "link",
      label: "Add Discord in Settings",
      href: "/settings/notifications",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/notifications#slack-and-discord",
    },
    steps: [
      {
        title: "Create a channel webhook in Discord",
        body: "Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "https://discord.com/api/webhooks/123456789/XXXXXXXX",
        },
      },
      {
        title: "Add it to QRdx",
        body: "In Settings → Notifications, click + Discord in the workspace, paste the URL and choose the events.",
      },
      {
        title: "Send a test",
        body: "Use the send button next to the target to post a test message.",
      },
    ],
    capabilities: CHAT_CAPABILITIES,
    keywords: ["alerts", "chat", "channel", "webhook", "messages", "server"],
    related: ["slack", "email-alerts", "webhooks"],
  },
  {
    slug: "email-alerts",
    name: "Email alerts and digest",
    tagline:
      "A Monday digest of last week's scans, plus emails for milestones, form responses and code changes.",
    description: [
      "Turn on the weekly digest to get last week's scans compared with the week before, unique visitors, your top 5 codes, top countries, new codes and form responses, every Monday.",
      "Alert emails cover scan milestones, form submissions, new codes and code changes. Every email has a one-click unsubscribe link.",
    ],
    kind: "native",
    surface: "feature",
    canonicalPath: "/docs/notifications",
    categories: ["notifications"],
    logo: { type: "feature", icon: "Sms" },
    plan: "pro",
    builtBy: "QRdx",
    docs: "/docs/notifications",
    primaryAction: {
      type: "link",
      label: "Choose emails in Settings",
      href: "/settings/notifications",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/notifications",
    },
    steps: [
      {
        title: "Open Settings → Notifications",
        body: "Your personal workspace and every team you belong to have their own switches.",
      },
      {
        title: "Turn on the emails you want",
        body: "Weekly digest, scan milestones, form submissions, new codes or code changes. Everything is off until you turn it on.",
      },
    ],
    capabilities: [
      {
        title: "Weekly digest",
        description:
          "Scans vs the week before, unique visitors, top codes and countries, every Monday.",
      },
      {
        title: "Instant alerts",
        description:
          "Milestones, form responses, new codes and changes, sent to your account email.",
      },
      {
        title: "One-click unsubscribe",
        description:
          "Every email can turn off its own kind without signing in.",
      },
    ],
    keywords: ["email", "digest", "weekly", "report", "alerts", "inbox"],
    related: ["slack", "discord", "webhooks"],
  },
];
