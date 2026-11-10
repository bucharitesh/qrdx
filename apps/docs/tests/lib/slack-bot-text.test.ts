// Reading what someone typed in Slack (lib/slack-bot/text.ts) into the plain
// text a QR code encodes, and escaping it on the way back out.
import { describe, expect, it } from "vitest";
import { readChatQrInput } from "@/lib/chat-bots/qr-reply";
import { QR_DATA_MAX_LENGTH } from "@/lib/qr-render";
import { escapeSlack, readSlackText, splitCommand } from "@/lib/slack-bot/text";

describe("readSlackText", () => {
  it("unescapes &amp; &lt; &gt;", () => {
    expect(readSlackText("Fish &amp; chips &lt;3 &gt; 2")).toBe(
      "Fish & chips <3 > 2",
    );
    // &amp;lt; is a typed "&lt;", not a "<".
    expect(readSlackText("&amp;lt;")).toBe("&lt;");
  });

  it("turns Slack links into their address", () => {
    expect(readSlackText("<https://qrdx.dev/pricing|qrdx.dev/pricing>")).toBe(
      "https://qrdx.dev/pricing",
    );
    expect(readSlackText("<https://qrdx.dev>")).toBe("https://qrdx.dev");
    expect(readSlackText("<http://qrdx.dev|qrdx.dev>")).toBe("http://qrdx.dev");
    expect(readSlackText("<https://qrdx.dev/?a=1&amp;b=2>")).toBe(
      "https://qrdx.dev/?a=1&b=2",
    );
    expect(readSlackText("<mailto:hi@qrdx.dev|hi@qrdx.dev>")).toBe(
      "mailto:hi@qrdx.dev",
    );
  });

  it("strips the bot's own mention and keeps other people", () => {
    expect(readSlackText("<@U0BOT> https://qrdx.dev", "U0BOT")).toBe(
      "https://qrdx.dev",
    );
    expect(
      readSlackText("<@U0BOT|qrdx> track <https://qrdx.dev>", "U0BOT"),
    ).toBe("track https://qrdx.dev");
    expect(readSlackText("ask <@U0ANA>", "U0BOT")).toBe("ask <@U0ANA>");
    expect(readSlackText("ask <@U0ANA|ana>", "U0BOT")).toBe("ask @ana");
  });

  it("reads channels, groups and special mentions as plain words", () => {
    expect(readSlackText("<#C0123|general>")).toBe("#general");
    expect(readSlackText("<!here> look")).toBe("@here look");
    expect(readSlackText("<!subteam^S0123|@design>")).toBe("@design");
    expect(readSlackText("<!date^1700000000^{date}|Nov 14>")).toBe("Nov 14");
  });

  it("keeps line breaks and trims", () => {
    expect(readSlackText("  Table 4\nWi-Fi: lobby \n")).toBe(
      "Table 4\nWi-Fi: lobby",
    );
    expect(readSlackText(undefined)).toBe("");
    expect(readSlackText("<@U0BOT>", "U0BOT")).toBe("");
  });

  it("hands empty and too-long content to readChatQrInput as such", () => {
    expect(readChatQrInput(readSlackText("<@U0BOT>  ", "U0BOT"))).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(
      readChatQrInput(readSlackText("a".repeat(QR_DATA_MAX_LENGTH + 1))),
    ).toEqual({ ok: false, reason: "too_long" });
    expect(readChatQrInput(readSlackText("<https://qrdx.dev>"))).toEqual({
      ok: true,
      data: "https://qrdx.dev",
      url: "https://qrdx.dev",
    });
  });
});

describe("escapeSlack", () => {
  it("escapes what Slack would read as markup", () => {
    expect(escapeSlack("<!channel> & <https://x>")).toBe(
      "&lt;!channel&gt; &amp; &lt;https://x&gt;",
    );
    expect(readSlackText(escapeSlack("a < b & c"))).toBe("a < b & c");
  });
});

describe("splitCommand", () => {
  it("lowercases the first word and keeps the rest as typed", () => {
    expect(splitCommand("  TRACK  https://qrdx.dev/A ")).toEqual({
      word: "track",
      rest: "https://qrdx.dev/A",
    });
    expect(splitCommand("help")).toEqual({ word: "help", rest: "" });
    expect(splitCommand("")).toEqual({ word: "", rest: "" });
    expect(splitCommand("Table 4\nlobby")).toEqual({
      word: "table",
      rest: "4\nlobby",
    });
  });
});
