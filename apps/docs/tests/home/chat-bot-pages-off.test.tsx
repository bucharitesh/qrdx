import { describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

// /plugins and /integrations/<slug> are translated pages (lib/i18n).
vi.mock(
  "next-intl/server",
  async () => (await import("../support/intl")).intlServer,
);
vi.mock(
  "@/lib/i18n/server",
  async () => (await import("../support/intl")).i18nServer,
);

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

import DiscordImage from "@/app/(app)/(home)/discord/opengraph-image";
import DiscordPage from "@/app/(app)/(home)/discord/page";
import SlackImage from "@/app/(app)/(home)/slack/opengraph-image";
import SlackPage from "@/app/(app)/(home)/slack/page";
import TelegramImage from "@/app/(app)/(home)/telegram/opengraph-image";
import TelegramPage from "@/app/(app)/(home)/telegram/page";
import IntegrationDetailPage from "@/app/[lang]/(home)/integrations/[slug]/page";
import PluginsPage from "@/app/[lang]/(home)/plugins/page";
import { CHAT_BOTS } from "@/components/sections/chat-bots/bots";
import { siteConfig } from "@/config/site";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";

const hrefs = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );

const BOT_PATHS = CHAT_BOTS.map((bot) => bot.path);

describe("with no chat bot set up", () => {
  it("has every bot off and hides their pages", () => {
    for (const bot of CHAT_BOTS) {
      expect(isFeatureAvailable(bot.feature), bot.id).toBe(false);
      expect(isPathAvailable(bot.path), bot.path).toBe(false);
    }
  });

  it("404s every page and its Open Graph image", () => {
    for (const render of [SlackPage, TelegramPage, DiscordPage]) {
      expect(() => render()).toThrow("NEXT_NOT_FOUND");
    }
    for (const image of [SlackImage, TelegramImage, DiscordImage]) {
      expect(() => image()).toThrow("NEXT_NOT_FOUND");
    }
  });

  it("leaves them out of /plugins", async () => {
    const links = hrefs(renderIntl(await PluginsPage()));
    expect(links).toContain("/mcp");
    for (const path of BOT_PATHS) expect(links).not.toContain(path);
  });

  it("keeps the Slack alerts page, without a link to /slack", async () => {
    const markup = renderIntl(
      await IntegrationDetailPage({
        params: Promise.resolve({ slug: "slack" }),
      }),
    );
    expect(markup).toContain("<h1");
    expect(hrefs(markup)).not.toContain("/slack");
  });

  it("puts them in the footer only behind their feature", () => {
    // The footer drops links whose path is hidden (useAvailability), so
    // every bot link must be one of the gated paths.
    const footer = siteConfig.footerLinks.flatMap((column) =>
      column.links.flatMap((link) => ("url" in link ? [link.url] : [])),
    );
    for (const path of BOT_PATHS) {
      expect(footer).toContain(path);
      expect(isPathAvailable(path)).toBe(false);
    }
  });
});
