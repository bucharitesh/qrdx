// The bot's Block Kit messages (lib/slack-bot/messages.ts): image URL, alt
// text, buttons, escaping, and editor links that never carry text content.
import { describe, expect, it } from "vitest";
import { CHAT_QR_PNG_SIZE } from "@/lib/chat-bots/qr-reply";
import {
  helpMessage,
  qrMessage,
  SLACK_URL_MAX,
  type SlackMessage,
  trackedMessage,
} from "@/lib/slack-bot/messages";

const ORIGIN = "https://qrdx.dev";

type Block = Record<string, any>;
const blocks = (message: SlackMessage | null) =>
  (message?.blocks ?? []) as Block[];
const buttons = (message: SlackMessage | null) =>
  blocks(message).find((block) => block.type === "actions")?.elements as
    | Block[]
    | undefined;

describe("qrMessage", () => {
  it("shows the PNG from the image API with alt text, caption and three link buttons", () => {
    const message = qrMessage("https://qrdx.dev/pricing", ORIGIN);
    expect(message?.response_type).toBe("in_channel");
    const [image, context] = blocks(message);
    expect(image?.type).toBe("image");
    const png = new URL(image?.image_url);
    expect(png.origin).toBe("https://api.qrdx.dev");
    expect(png.pathname).toBe("/v1/qr");
    expect(png.searchParams.get("data")).toBe("https://qrdx.dev/pricing");
    expect(png.searchParams.get("format")).toBe("png");
    expect(png.searchParams.get("size")).toBe(String(CHAT_QR_PNG_SIZE));
    expect(image?.alt_text).toBe("QR code for https://qrdx.dev/pricing");
    expect(context?.elements[0].text).toBe("https://qrdx.dev/pricing");

    const [pngButton, svgButton, editorButton] = buttons(message) ?? [];
    expect(buttons(message)?.map((button) => button.text.text)).toEqual([
      "Download PNG",
      "Download SVG",
      "Open in editor",
    ]);
    expect(pngButton?.url).toBe(image?.image_url);
    expect(new URL(svgButton?.url).searchParams.get("format")).toBeNull();
    expect(editorButton?.url).toContain("#");
    expect(decodeURIComponent(editorButton?.url)).toContain(
      "https://qrdx.dev/pricing",
    );
    expect(message?.text).toBe("QR code for https://qrdx.dev/pricing");
  });

  it("never puts text content in the editor link", () => {
    const secret = "Wi-Fi password: hunter2";
    const message = qrMessage(secret, ORIGIN);
    const editor = buttons(message)?.find(
      (button) => button.action_id === "qrdx_editor",
    );
    expect(editor?.url).toBeDefined();
    expect(decodeURIComponent(editor?.url)).not.toContain("hunter2");
    expect(editor?.url).not.toContain("hunter2");
  });

  it("escapes content so it can't ping, link or format", () => {
    const message = qrMessage(
      "<!channel> & <https://evil.example|click>",
      ORIGIN,
    );
    const caption = blocks(message)[1]?.elements[0];
    expect(caption?.text).toBe(
      "&lt;!channel&gt; &amp; &lt;https://evil.example|click&gt;",
    );
    expect(caption?.verbatim).toBe(true);
    expect(message?.text).not.toContain("<!channel>");
  });

  it("refuses content whose links Slack wouldn't accept", () => {
    // Within the QR limits (1,200 bytes), but each emoji percent-encodes to
    // 12 characters, so the links pass Slack's 3,000.
    const long = "👍".repeat(300);
    expect(qrMessage(long, ORIGIN)).toBeNull();
    const fits = qrMessage("x".repeat(500), ORIGIN);
    for (const button of buttons(fits) ?? []) {
      expect(button.url.length).toBeLessThanOrEqual(SLACK_URL_MAX);
    }
  });
});

describe("trackedMessage", () => {
  it("encodes the short link, shows it, and links to the code in QRdx", () => {
    const message = trackedMessage(
      {
        shortLink: "https://qrdx.dev/q/abc1234",
        destinationUrl: "https://shop.example/menu",
        dashboardUrl: "https://qrdx.dev/dashboard/acme/codes/c_1",
      },
      ORIGIN,
    );
    const [image, context] = blocks(message);
    expect(new URL(image?.image_url).searchParams.get("data")).toBe(
      "https://qrdx.dev/q/abc1234",
    );
    expect(context?.elements[0].text).toContain("https://qrdx.dev/q/abc1234");
    expect(buttons(message)?.map((button) => button.text.text)).toEqual([
      "Open in QRdx",
      "Download PNG",
      "Download SVG",
      "Open in editor",
    ]);
    expect(buttons(message)?.[0]?.url).toBe(
      "https://qrdx.dev/dashboard/acme/codes/c_1",
    );
    expect(message?.response_type).toBe("in_channel");
  });
});

describe("helpMessage", () => {
  it("is only for the person who asked and lists every command", () => {
    const message = helpMessage();
    expect(message.response_type).toBe("ephemeral");
    const text = blocks(message)[0]?.text.text as string;
    for (const command of [
      "/qr link",
      "/qr track",
      "/qr unlink",
      "Make a QR code",
    ]) {
      expect(text).toContain(command);
    }
  });
});
