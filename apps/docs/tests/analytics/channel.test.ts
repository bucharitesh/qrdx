// The channel an account came from (lib/analytics/channel.ts): every rule,
// and the order they're tried in (first match wins).
import { describe, expect, it } from "vitest";
import { acquisitionChannel } from "@/lib/analytics/channel";
import type { SignUpLanding } from "@/lib/analytics/landing";

const channel = (landing: SignUpLanding | null, affiliate = false) =>
  acquisitionChannel(landing, { affiliate });

describe("sign-up channels", () => {
  it("affiliate: an affiliate was credited, whatever else the visit carried", () => {
    expect(channel(null, true)).toBe("affiliate");
    expect(
      channel(
        { ref: "chrome-extension", referrer_host: "www.google.com" },
        true,
      ),
    ).toBe("affiliate");
  });

  it("plugin: a plugin's ref tag", () => {
    for (const ref of [
      "chrome-extension",
      "figma-plugin",
      "canva-app",
      "raycast-extension",
    ]) {
      expect(channel({ ref }), ref).toBe("plugin");
    }
    // Before a search referrer.
    expect(
      channel({ ref: "figma-plugin", referrer_host: "www.google.com" }),
    ).toBe("plugin");
  });

  it("mcp: a link the MCP server returned", () => {
    expect(channel({ ref: "mcp" })).toBe("mcp");
    expect(channel({ ref: "mcp", utm_source: "chatgpt.com" })).toBe("mcp");
  });

  it("bot: a chat bot's reply", () => {
    for (const ref of ["slack-bot", "telegram-bot", "discord-bot"]) {
      expect(channel({ ref }), ref).toBe("bot");
    }
  });

  it("developer: the CLI, the n8n node, npm or GitHub", () => {
    expect(channel({ ref: "cli" })).toBe("developer");
    expect(channel({ ref: "n8n" })).toBe("developer");
    expect(channel({ referrer_host: "www.npmjs.com" })).toBe("developer");
    expect(channel({ referrer_host: "github.com" })).toBe("developer");
    expect(channel({ referrer_host: "gist.github.com" })).toBe("developer");
    // Not a look-alike.
    expect(channel({ referrer_host: "notgithub.com" })).toBe("referral");
  });

  it("ai_assistant: an assistant as referrer or utm_source", () => {
    for (const host of [
      "chatgpt.com",
      "chat.openai.com",
      "www.perplexity.ai",
      "claude.ai",
      "gemini.google.com",
      "copilot.microsoft.com",
    ]) {
      expect(channel({ referrer_host: host }), host).toBe("ai_assistant");
    }
    expect(channel({ utm_source: "chatgpt.com" })).toBe("ai_assistant");
    expect(channel({ utm_source: "perplexity" })).toBe("ai_assistant");
    // Before a search engine's referrer.
    expect(
      channel({ utm_source: "chatgpt.com", referrer_host: "www.bing.com" }),
    ).toBe("ai_assistant");
  });

  it("search: a search engine's referrer", () => {
    for (const host of [
      "www.google.com",
      "google.co.uk",
      "www.google.de",
      "www.bing.com",
      "duckduckgo.com",
      "search.yahoo.com",
      "yahoo.co.jp",
      "yandex.ru",
      "www.ecosia.org",
      "search.brave.com",
      "www.baidu.com",
      "com.google.android.googlequicksearchbox",
    ]) {
      expect(channel({ referrer_host: host }), host).toBe("search");
    }
    // Google's other sites aren't search.
    expect(channel({ referrer_host: "mail.google.com" })).toBe("referral");
    // A search referrer wins over campaign tags.
    expect(
      channel({ referrer_host: "www.google.com", utm_medium: "cpc" }),
    ).toBe("search");
  });

  it("social: social networks and community sites", () => {
    for (const host of [
      "x.com",
      "t.co",
      "twitter.com",
      "www.threads.net",
      "www.threads.com",
      "www.linkedin.com",
      "lnkd.in",
      "old.reddit.com",
      "news.ycombinator.com",
      "www.producthunt.com",
      "bsky.app",
      "l.facebook.com",
      "www.instagram.com",
      "www.youtube.com",
    ]) {
      expect(channel({ referrer_host: host }), host).toBe("social");
    }
  });

  it("campaign: any other campaign tag", () => {
    expect(channel({ utm_medium: "email" })).toBe("campaign");
    expect(channel({ utm_source: "newsletter" })).toBe("campaign");
    expect(channel({ utm_campaign: "launch" })).toBe("campaign");
    // Before an unknown referrer.
    expect(
      channel({ utm_medium: "email", referrer_host: "mail.example.com" }),
    ).toBe("campaign");
  });

  it("referral: any other referring site", () => {
    expect(channel({ referrer_host: "blog.example.com" })).toBe("referral");
    // A ref tag that isn't one of QRdx's own says nothing by itself.
    expect(
      channel({ ref: "not-found", referrer_host: "blog.example.com" }),
    ).toBe("referral");
  });

  it("direct: nothing at all", () => {
    expect(channel({})).toBe("direct");
    expect(channel({ landing_path: "/", signup_path: "/playground" })).toBe(
      "direct",
    );
    expect(channel({ ref: "made-with-qrdx" })).toBe("direct");
    expect(channel(null)).toBe("direct");
  });
});
