// The chat bots' landing pages (/slack, /telegram, /discord) where every bot
// is set up: each renders on the server with its H1, the add button, the
// conversation mockup with a real QR code, links to its docs and the other
// two bots, and FAQPage JSON-LD. Their copy stays inside what the bots do
// today, and the Telegram username comes from the environment. Every value
// below is a fake; vitest.config.ts drops the real ones.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    SLACK_CLIENT_ID: "fake-slack-client",
    SLACK_CLIENT_SECRET: "fake-slack-secret",
    SLACK_SIGNING_SECRET: "fake-slack-signing-secret",
    DISCORD_APPLICATION_ID: "100000000000000000",
    DISCORD_PUBLIC_KEY: "0".repeat(64),
    TELEGRAM_BOT_TOKEN: "123456:fake-token-for-tests",
    TELEGRAM_WEBHOOK_SECRET: "fake_webhook_secret-1",
    TELEGRAM_BOT_USERNAME: "@QRdxPagesTestBot",
  });
});

import DiscordPage, {
  metadata as discordMetadata,
} from "@/app/(app)/(home)/discord/page";
import IntegrationDetailPage from "@/app/(app)/(home)/integrations/[slug]/page";
import PluginsPage from "@/app/(app)/(home)/plugins/page";
import SlackPage, {
  metadata as slackMetadata,
} from "@/app/(app)/(home)/slack/page";
import TelegramPage, {
  metadata as telegramMetadata,
} from "@/app/(app)/(home)/telegram/page";
import { CHAT_BOTS } from "@/components/sections/chat-bots/bots";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/seo-overrides";

const APP = join(import.meta.dirname, "../..");
const USERNAME = "QRdxPagesTestBot";

const PAGES = [
  {
    id: "slack",
    render: SlackPage,
    metadata: slackMetadata,
    h1: "Make QR codes in Slack",
    add: "/settings/integrations/slack",
  },
  {
    id: "telegram",
    render: TelegramPage,
    metadata: telegramMetadata,
    h1: "Make QR codes in any Telegram chat",
    add: "/api/integrations/telegram/open",
  },
  {
    id: "discord",
    render: DiscordPage,
    metadata: discordMetadata,
    h1: "Make QR codes in Discord",
    add: "/api/integrations/discord/install",
  },
] as const;

const html = (page: () => ReactElement) => renderToStaticMarkup(page());

/** Every <a href> in `markup`, decoded (React escapes & as &amp;). */
const hrefs = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );

/** The JSON-LD blocks in `markup`, parsed. */
const jsonLd = (markup: string): { "@type": string }[] =>
  [
    ...markup.matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((match) => JSON.parse(match[1] ?? "null"));

/** What a reader sees: the markup without tags, scripts and the mockups' SVG. */
const visibleText = (markup: string) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");

describe("with every bot set up", () => {
  it("offers every page", () => {
    for (const bot of CHAT_BOTS) {
      expect(isFeatureAvailable(bot.feature), bot.id).toBe(true);
      expect(isPathAvailable(bot.path), bot.path).toBe(true);
    }
  });

  it.each(PAGES)("$id renders its H1, add button and docs link", (page) => {
    const markup = html(page.render);
    const bot = CHAT_BOTS.find((item) => item.id === page.id);
    expect(markup).toMatch(
      new RegExp(`<h1[^>]*>${page.h1.replaceAll(" ", "\\s")}</h1>`),
    );
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    const links = hrefs(markup);
    expect(links).toContain(page.add);
    expect(links).toContain(bot?.docs);
    expect(links).toContain("/integrations");
  });

  it.each(PAGES)("$id links the other two bots", (page) => {
    const links = hrefs(html(page.render));
    for (const other of CHAT_BOTS) {
      if (other.id === page.id) continue;
      expect(links, other.path).toContain(other.path);
    }
  });

  it.each(PAGES)("$id emits breadcrumb and FAQ JSON-LD", (page) => {
    const markup = html(page.render);
    const types = jsonLd(markup).map((block) => block["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("FAQPage");
    const faq = jsonLd(markup).find((block) => block["@type"] === "FAQPage") as
      | { mainEntity: { name: string }[] }
      | undefined;
    // Every question on the page is in the schema.
    const questions = [...markup.matchAll(/<summary[^>]*>([^<]+)</g)].map(
      (match) => (match[1] ?? "").replaceAll("&#x27;", "'"),
    );
    expect(faq?.mainEntity.map((item) => item.name)).toEqual(questions);
  });

  it.each(PAGES)("$id draws a real QR code in its mockup", (page) => {
    const markup = html(page.render);
    expect(markup).toContain("<figcaption");
    expect(markup).toMatch(/<svg[^>]*viewBox/);
  });

  it.each(PAGES)(
    "$id has a canonical, a short title and description",
    (page) => {
      const metadata = page.metadata as Metadata;
      expect(metadata.alternates?.canonical).toBe(
        `http://localhost:3000/${page.id}`,
      );
      // The root layout's template adds " | QRdx".
      expect(`${String(metadata.title)} | QRdx`.length).toBeLessThanOrEqual(
        MAX_TITLE,
      );
      expect(String(metadata.description).length).toBeLessThanOrEqual(
        MAX_DESCRIPTION,
      );
    },
  );

  it.each(PAGES)("$id says only what the bot does today", (page) => {
    const text = visibleText(html(page.render));
    // Privacy: codes travel in a link that can be logged, so never this.
    expect(text).not.toMatch(/nothing (is )?(kept|stored|saved)/i);
    // Styles are built now: each page says what they are, and that every
    // styled code is scan-checked.
    expect(text).toMatch(/look, colou?r, frame (and|or) logo/i);
    expect(text).toMatch(/scan check|scan score/i);
    // No invented numbers about the bots.
    expect(text).not.toMatch(
      /\b(installs?|users|servers|workspaces) (use|trust)/i,
    );
  });

  it("names the Telegram bot from TELEGRAM_BOT_USERNAME", () => {
    const text = visibleText(html(TelegramPage));
    expect(text).toContain(`@${USERNAME}`);
    expect(text).toContain(`/qr@${USERNAME}`);
    for (const file of [
      "app/(app)/(home)/telegram/page.tsx",
      "components/sections/chat-bots/chat-mockups.tsx",
    ]) {
      expect(readFileSync(join(APP, file), "utf8")).not.toMatch(/@QRdxbot/i);
    }
  });

  it("links each bot's integration page to its landing page", async () => {
    for (const bot of CHAT_BOTS) {
      const markup = renderToStaticMarkup(
        await IntegrationDetailPage({
          params: Promise.resolve({ slug: bot.catalogSlug }),
        }),
      );
      expect(hrefs(markup), bot.catalogSlug).toContain(bot.path);
    }
  });

  it("lists the bots on /plugins", () => {
    const links = hrefs(renderToStaticMarkup(PluginsPage()));
    for (const bot of CHAT_BOTS) expect(links).toContain(bot.path);
  });
});
