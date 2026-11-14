// The QRdx chat bots' landing pages (/slack, /telegram, /discord). Each page
// exists only where its bot is set up: the paths are in that feature's
// `paths` in packages/availability/rules.ts, so links to them hide, and
// the page itself 404s. Pure data, safe for client components.

import type { FeatureId } from "@repo/availability";

export type ChatBotId = "slack" | "telegram" | "discord";

export interface ChatBotInfo {
  id: ChatBotId;
  /** The landing page. */
  path: string;
  name: string;
  /** The feature that has to be set up (packages/availability/rules.ts). */
  feature: FeatureId;
  /** Its entry in @repo/integrations' catalog (logo, /integrations page). */
  catalogSlug: string;
  docs: string;
  /** One line for cards linking to the page. */
  summary: string;
}

export const CHAT_BOTS: readonly ChatBotInfo[] = [
  {
    id: "slack",
    path: "/slack",
    name: "Slack bot",
    feature: "slackBot",
    catalogSlug: "slack",
    docs: "/docs/slack-bot",
    summary:
      "/qr, mentions, direct messages and a message shortcut, plus tracked codes.",
  },
  {
    id: "telegram",
    path: "/telegram",
    name: "Telegram bot",
    feature: "telegramBot",
    catalogSlug: "telegram",
    docs: "/docs/telegram-bot",
    summary:
      "Message the bot, call it inline in any chat, or use /qr in a group.",
  },
  {
    id: "discord",
    path: "/discord",
    name: "Discord bot",
    feature: "discordBot",
    catalogSlug: "discord-bot",
    docs: "/docs/discord-bot",
    summary: "/qr and Make QR code, in servers, DMs and group DMs.",
  },
];

export function chatBot(id: ChatBotId): ChatBotInfo {
  const bot = CHAT_BOTS.find((item) => item.id === id);
  if (!bot) throw new Error(`Unknown chat bot ${id}`);
  return bot;
}
