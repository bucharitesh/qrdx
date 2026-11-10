// qrdx.dev today: the Slack and Telegram bots are set up, the Discord bot is
// shipped but switched off (no DISCORD_APPLICATION_ID or DISCORD_PUBLIC_KEY).
// /discord is a 404 and the other pages don't link to it; the Telegram
// integration page links to /telegram. Every value below is a fake.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    SLACK_CLIENT_ID: "fake-slack-client",
    SLACK_CLIENT_SECRET: "fake-slack-secret",
    SLACK_SIGNING_SECRET: "fake-slack-signing-secret",
    TELEGRAM_BOT_TOKEN: "123456:fake-token-for-tests",
    TELEGRAM_WEBHOOK_SECRET: "fake_webhook_secret-1",
    TELEGRAM_BOT_USERNAME: "QRdxPagesTestBot",
  });
});

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

import DiscordImage from "@/app/(home)/discord/opengraph-image";
import DiscordPage from "@/app/(home)/discord/page";
import IntegrationDetailPage from "@/app/(home)/integrations/[slug]/page";
import PluginsPage from "@/app/(home)/plugins/page";
import SlackPage from "@/app/(home)/slack/page";
import TelegramPage from "@/app/(home)/telegram/page";
import { isPathAvailable } from "@/lib/feature-availability";

const hrefs = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );

const integrationPage = async (slug: string) =>
  renderToStaticMarkup(
    await IntegrationDetailPage({ params: Promise.resolve({ slug }) }),
  );

describe("with the Discord bot off and the others on", () => {
  it("404s /discord and its image", () => {
    expect(isPathAvailable("/discord")).toBe(false);
    expect(() => DiscordPage()).toThrow("NEXT_NOT_FOUND");
    expect(() => DiscordImage()).toThrow("NEXT_NOT_FOUND");
  });

  it("links only the bots that are set up", () => {
    const slack = hrefs(renderToStaticMarkup(SlackPage()));
    expect(slack).toContain("/telegram");
    expect(slack).not.toContain("/discord");
    const telegram = hrefs(renderToStaticMarkup(TelegramPage()));
    expect(telegram).toContain("/slack");
    expect(telegram).not.toContain("/discord");
    const plugins = hrefs(renderToStaticMarkup(PluginsPage()));
    expect(plugins).toEqual(expect.arrayContaining(["/slack", "/telegram"]));
    expect(plugins).not.toContain("/discord");
  });

  it("links the bots' integration pages to their landing pages", async () => {
    expect(hrefs(await integrationPage("slack"))).toContain("/slack");
    expect(hrefs(await integrationPage("telegram"))).toContain("/telegram");
  });
});
