// QRdx's own surfaces tag their links into the site with a `ref`
// (lib/analytics/handoff-tags.ts), so a visit, and a sign-up in it, counts
// for the surface that sent it: the MCP server's playground links, each chat
// bot's "Open in editor", the CLI's docs links and the n8n node's docs link.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { playgroundLink } from "@/app/api/mcp/design";
import { defaultThemeState } from "@/config/qr";
import { acquisitionChannel } from "@/lib/analytics/channel";
import { readLanding } from "@/lib/analytics/landing";
import { chatQrLinks, withBotRef } from "@/lib/chat-bots/qr-reply";
import { helpText } from "@/lib/chat-bots/telegram/replies";
import { handoffSource } from "@/lib/playground-links";
import { qrMessage } from "@/lib/slack-bot/messages";

const repo = join(import.meta.dirname, "../../../..");
const ORIGIN = "https://qrdx.dev";

/** The channel a sign-up would get after following `link`. */
const channelOf = (link: string) =>
  acquisitionChannel(readLanding({ href: link, referrer: "" }), {
    affiliate: false,
  });

describe("ref tags on QRdx's own links", () => {
  it("MCP: design_qr's playground_url says mcp", () => {
    const { url } = playgroundLink(defaultThemeState.styles);
    if (!url) throw new Error("expected a link");
    const link = new URL(url);
    expect(link.pathname).toBe("/playground");
    expect(link.searchParams.get("ref")).toBe("mcp");
    expect(link.searchParams.get("style")).toBeTruthy();
    expect(handoffSource("", link.origin, link.searchParams.get("ref"))).toBe(
      "mcp",
    );
    expect(channelOf(url)).toBe("mcp");
  });

  it("chat bots: Open in editor says which bot, before the # and its address", () => {
    const links = withBotRef(
      chatQrLinks("https://example.com/menu", ORIGIN),
      "telegram-bot",
    );
    const editor = new URL(links.editor);
    expect(editor.searchParams.get("ref")).toBe("telegram-bot");
    expect(editor.hash).toContain("example.com");
    // The image links are untouched.
    expect(links.png).toBe(chatQrLinks("https://example.com/menu", ORIGIN).png);
    expect(channelOf(links.editor)).toBe("bot");
  });

  it("Slack: the code's editor button says slack-bot", () => {
    const message = qrMessage("https://example.com", ORIGIN);
    const editorButton = JSON.stringify(message).match(
      /"url":"([^"]*\/playground[^"]*)"/,
    )?.[1];
    expect(editorButton).toBeDefined();
    expect(new URL(editorButton ?? "").searchParams.get("ref")).toBe(
      "slack-bot",
    );
  });

  it("Telegram: the help text's editor link says telegram-bot", () => {
    expect(helpText("qrdx_bot", ORIGIN)).toContain(
      `${ORIGIN}/playground?ref=telegram-bot`,
    );
  });

  it("the CLI's docs links say cli, and the n8n node's says n8n", () => {
    const cli = readFileSync(join(repo, "packages/cli/src/index.ts"), "utf8");
    const docsLinks = cli.match(/https:\/\/qrdx\.dev\/docs\/[^\s$]*/g) ?? [];
    expect(docsLinks.length).toBeGreaterThan(0);
    for (const link of docsLinks) {
      expect(new URL(link).searchParams.get("ref")).toBe("cli");
      expect(channelOf(link)).toBe("developer");
    }
    const n8n = readFileSync(
      join(repo, "plugins/n8n/credentials/QrdxApi.credentials.ts"),
      "utf8",
    );
    const docs = n8n.match(/documentationUrl = "([^"]+)"/)?.[1] ?? "";
    expect(new URL(docs).searchParams.get("ref")).toBe("n8n");
    expect(channelOf(docs)).toBe("developer");
  });
});
