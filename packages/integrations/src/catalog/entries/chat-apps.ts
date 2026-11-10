import type { IntegrationCatalogEntry } from "../types";

// QRdx bots in chat apps: QR codes made in a chat, no QRdx account needed.
// Each one is offered only where its bot is set up (the `telegramBot`
// feature in apps/docs/lib/feature-availability-rules.ts).

export const chatApps: IntegrationCatalogEntry[] = [
  {
    slug: "telegram",
    name: "Telegram",
    tagline:
      "Make QR codes in any Telegram chat: message the QRdx bot, call it inline, or use /qr in a group.",
    description: [
      "Send the QRdx bot a link or some text and it replies with the QR code, with buttons to download it as PNG or SVG or open it in the editor.",
      "In any other chat, type the bot's username followed by a link, then tap the code to send it there. In a group, add the bot and send /qr with a link or text. No QRdx account needed, and QRdx doesn't keep what you send.",
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
        title: "Nothing kept",
        description:
          "No account and no stored messages: each image is drawn from a link that carries its content.",
      },
    ],
    keywords: ["telegram", "bot", "chat", "inline", "messenger", "group"],
    related: ["slack", "discord", "zapier"],
  },
];
