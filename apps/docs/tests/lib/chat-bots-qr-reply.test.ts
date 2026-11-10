import { describe, expect, it } from "vitest";
import {
  CHAT_QR_PNG_SIZE,
  chatQrCaption,
  chatQrLinks,
  firstWebAddress,
  readChatQrInput,
} from "@/lib/chat-bots/qr-reply";
import { QR_DATA_MAX_LENGTH } from "@/lib/qr-render";

describe("readChatQrInput", () => {
  it("trims and keeps a web address as typed", () => {
    expect(readChatQrInput("  https://qrdx.dev/pricing \n")).toEqual({
      ok: true,
      data: "https://qrdx.dev/pricing",
      url: "https://qrdx.dev/pricing",
    });
  });

  it("treats anything that isn't one http(s) address as text", () => {
    expect(readChatQrInput("Table 4\nWi-Fi in the lobby")).toEqual({
      ok: true,
      data: "Table 4\nWi-Fi in the lobby",
      url: null,
    });
    expect(readChatQrInput("mailto:hi@example.com")).toMatchObject({
      ok: true,
      url: null,
    });
    expect(readChatQrInput("https://user:pw@example.com")).toMatchObject({
      ok: true,
      url: null,
    });
    expect(readChatQrInput("see https://qrdx.dev")).toMatchObject({
      ok: true,
      url: null,
    });
  });

  it("refuses empty content", () => {
    expect(readChatQrInput("   \n ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses content over the API's length limit", () => {
    expect(readChatQrInput("a".repeat(QR_DATA_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("refuses content that is within the limit but can't fit a QR code", () => {
    // Bytes that need UTF-8 multi-byte encoding overflow the largest code
    // long before the character limit.
    expect(readChatQrInput("é".repeat(1500))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("chatQrLinks", () => {
  it("points a web address at the image API and the editor", () => {
    const links = chatQrLinks(
      "https://qrdx.dev/a?b=1&c=2",
      "http://localhost:3000",
    );
    const png = new URL(links.png);
    // Local dev and previews stand in for qrdx.dev (lib/agents/hosts.ts).
    expect(png.origin).toBe("https://api.qrdx.dev");
    expect(png.pathname).toBe("/v1/qr");
    expect(png.searchParams.get("data")).toBe("https://qrdx.dev/a?b=1&c=2");
    expect(png.searchParams.get("format")).toBe("png");
    expect(png.searchParams.get("size")).toBe(String(CHAT_QR_PNG_SIZE));

    const svg = new URL(links.svg);
    expect(svg.searchParams.get("data")).toBe("https://qrdx.dev/a?b=1&c=2");
    expect(svg.searchParams.get("format")).toBeNull();

    const editor = new URL(links.editor);
    expect(editor.origin).toBe("http://localhost:3000");
    expect(editor.pathname).toBe("/playground");
    expect(editor.hash).toContain("url=");
  });

  it("uses the hosted API host on qrdx.dev", () => {
    const links = chatQrLinks("https://example.com", "https://qrdx.dev");
    expect(links.png.startsWith("https://api.qrdx.dev/v1/qr?")).toBe(true);
    expect(links.editor.startsWith("https://qrdx.dev/playground")).toBe(true);
  });

  it("never puts text content in the editor link", () => {
    const links = chatQrLinks("door code 4471", "https://qrdx.dev");
    expect(links.editor).toBe("https://qrdx.dev/playground");
    expect(links.editor).not.toContain("4471");
  });
});

describe("chatQrCaption", () => {
  it("flattens whitespace and shortens long content", () => {
    expect(chatQrCaption("a\n\nb   c")).toBe("a b c");
    const caption = chatQrCaption("x".repeat(500), 20);
    expect(caption).toHaveLength(20);
    expect(caption.endsWith("…")).toBe(true);
  });

  it("never cuts an emoji in half", () => {
    const caption = chatQrCaption("🎉".repeat(30), 10);
    expect(caption).toBe(`${"🎉".repeat(9)}…`);
    expect(caption).not.toContain("\uFFFD");
  });
});

describe("firstWebAddress", () => {
  it("finds the first http(s) address and drops trailing punctuation", () => {
    expect(
      firstWebAddress("Menu is at https://example.com/menu. Also ftp://x"),
    ).toBe("https://example.com/menu");
    expect(firstWebAddress("(see https://qrdx.dev/docs)")).toBe(
      "https://qrdx.dev/docs",
    );
  });

  it("returns null when there's no web address", () => {
    expect(firstWebAddress("no links here, mailto:a@b.c")).toBeNull();
  });
});
