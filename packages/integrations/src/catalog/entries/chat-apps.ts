import type { IntegrationCatalogEntry } from "../types";

// QRdx bots in chat apps: QR codes made in a chat, no QRdx account needed.
// Each one is offered only where its bot is set up (the `discordBot` and
// `telegramBot` features in apps/docs/lib/feature-availability-rules.ts).
// The Slack bot lives on the Slack entry (notifications.ts), which joins
// this category through its `configured` overlay where the bot is set up.

export const chatApps: IntegrationCatalogEntry[] = [
  {
    // A sibling of the webhook entry rather than part of it: the bot needs
    // no account (the alerts need Business), is added in Discord rather than
    // in Settings, and is listed only where the deployment has set it up
    // (feature-availability-rules.ts `discordBot`). The button goes through
    // /api/integrations/discord/install, which builds Discord's link from
    // the app id.
    slug: "discord-bot",
    name: "Discord bot",
    tagline:
      "Make QR codes in Discord with /qr, or from any message, in servers and DMs.",
    description: [
      "Type /qr with a link or some text and the bot replies with the QR code, plus buttons to download it as a PNG or SVG or open it in the QRdx editor. Set private to True and only you see it.",
      "To make a code from a message someone posted, open the message's menu and choose Apps → Make QR code. The code holds the first web address in the message, or its text when there's no link.",
      "Add the bot to a server, or to your own account to use it in DMs, group DMs and other servers too. It needs no QRdx account, and nothing you make is saved: the content travels in the image link, and QRdx draws the image when Discord asks for it.",
    ],
    kind: "guide",
    surface: "integrations",
    categories: ["chat"],
    logo: { type: "image", src: "/integrations/discord.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://discord.com",
    docs: "/docs/discord-bot",
    primaryAction: {
      type: "link",
      label: "Add to Discord",
      href: "https://qrdx.dev/api/integrations/discord/install",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/discord-bot",
    },
    steps: [
      {
        title: "Click Add to Discord",
        body: "Discord asks whether to add QRdx to your account or to a server. On your account, you can use it in DMs, group DMs and servers. On a server, everyone there can use it; adding it there needs the Manage Server permission.",
      },
      {
        title: "Make a code with /qr",
        body: "Type /qr, then the link or text. The reply shows the code with Download PNG, Download SVG and Open in editor.",
        snippet: {
          label: "In any Discord chat",
          language: "text",
          code: "/qr content:https://qrdx.dev",
        },
      },
      {
        title: "Or make one from a message",
        body: "Right-click a message (long-press on mobile), then Apps → Make QR code.",
      },
    ],
    capabilities: [
      {
        title: "/qr",
        description:
          "A QR code for any link or text, with PNG and SVG downloads.",
      },
      {
        title: "Make QR code",
        description:
          "Turns a message into a code: its first web address, or its text.",
      },
      {
        title: "Servers and DMs",
        description:
          "Add it to a server, or to your own account for DMs and group DMs.",
      },
      {
        title: "Nothing stored",
        description:
          "No QRdx account, no database, and replies never ping anyone.",
      },
    ],
    keywords: ["bot", "slash command", "chat", "server", "dm", "app"],
    related: ["discord", "slack", "webhooks"],
  },
  {
    slug: "telegram",
    name: "Telegram",
    tagline:
      "Make QR codes in any Telegram chat: message the QRdx bot, call it inline, or use /qr in a group.",
    description: [
      "Send the QRdx bot a link or some text and it replies with the QR code, with buttons to download it as PNG or SVG or open it in the editor.",
      "In any other chat, type the bot's username followed by a link, then tap the code to send it there. In a group, add the bot and send /qr with a link or text. No QRdx account needed.",
      "QRdx doesn't save the codes you make. The content goes into the image link, and like any link it can end up in logs and caches, so don't make codes of passwords or other secrets.",
    ],
    kind: "guide",
    surface: "integrations",
    categories: ["chat"],
    logo: { type: "image", src: "/integrations/telegram.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://telegram.org",
    docs: "/docs/telegram-bot",
    primaryAction: {
      type: "link",
      label: "Open in Telegram",
      href: "https://qrdx.dev/api/integrations/telegram/open",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/telegram-bot",
    },
    steps: [
      {
        title: "Open the bot",
        body: "Click Open in Telegram and tap Start. The bot's chat opens in the Telegram app or on the web.",
      },
      {
        title: "Send a link or text",
        body: "The bot answers with the QR code and buttons to download a PNG or SVG, or to open it in the editor for colors, logos and frames.",
      },
      {
        title: "Use it in other chats",
        body: "In any chat, type @ and the bot's username, a space and a link, then tap the code to send it. In a group, add the bot and send /qr followed by a link or text.",
      },
    ],
    capabilities: [
      {
        title: "Private chat",
        description:
          "Send a link or text and get the QR code back, ready to download.",
      },
      {
        title: "Inline in any chat",
        description:
          "Type the bot's username and a link, then send the code without leaving the conversation.",
      },
      {
        title: "Groups",
        description:
          "/qr with a link or text. With privacy mode on, the bot only sees commands meant for it.",
      },
      {
        title: "No account",
        description:
          "Nothing to sign up for. QRdx doesn't save your codes, and each image comes from a link that carries its content.",
      },
    ],
    keywords: ["telegram", "bot", "chat", "inline", "messenger", "group"],
    related: ["slack", "discord", "zapier"],
  },
];
