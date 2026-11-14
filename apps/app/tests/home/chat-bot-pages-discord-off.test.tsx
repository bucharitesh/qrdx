// qrdx.dev today: the Slack and Telegram bots are set up, the Discord bot is
// shipped but switched off (no DISCORD_APPLICATION_ID or DISCORD_PUBLIC_KEY).
// /discord is a 404 and the other pages don't link to it; the Telegram
// integration page links to /telegram. Every value below is a fake.
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

import DiscordImage from "@/app/(app)/(home)/discord/opengraph-image";
import DiscordPage from "@/app/(app)/(home)/discord/page";
import SlackPage from "@/app/(app)/(home)/slack/page";
import TelegramPage from "@/app/(app)/(home)/telegram/page";
import IntegrationDetailPage from "@/app/[lang]/(home)/integrations/[slug]/page";
import PluginsPage from "@/app/[lang]/(home)/plugins/page";
import { isPathAvailable } from "@/lib/feature-availability";

const hrefs = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );

const integrationPage = async (slug: string) =>
  renderIntl(
    await IntegrationDetailPage({ params: Promise.resolve({ slug }) }),
  );

describe("with the Discord bot off and the others on", () => {
  it("404s /discord and its image", () => {
    expect(isPathAvailable("/discord")).toBe(false);
    expect(() => DiscordPage()).toThrow("NEXT_NOT_FOUND");
    expect(() => DiscordImage()).toThrow("NEXT_NOT_FOUND");
  });

  it("links only the bots that are set up", async () => {
    const slack = hrefs(renderIntl(SlackPage()));
    expect(slack).toContain("/telegram");
    expect(slack).not.toContain("/discord");
    const telegram = hrefs(renderIntl(TelegramPage()));
    expect(telegram).toContain("/slack");
    expect(telegram).not.toContain("/discord");
    const plugins = hrefs(renderIntl(await PluginsPage()));
    expect(plugins).toEqual(expect.arrayContaining(["/slack", "/telegram"]));
    expect(plugins).not.toContain("/discord");
  });

  it("links the bots' integration pages to their landing pages", async () => {
    expect(hrefs(await integrationPage("slack"))).toContain("/slack");
    expect(hrefs(await integrationPage("telegram"))).toContain("/telegram");
  });
});
