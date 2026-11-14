// plugins/telegram/scripts/setup.mjs (the owner's and self-hosters' bot
// setup) against the app it configures: the webhook URL is the app's route,
// the updates it asks for are the ones the webhook answers, and the texts fit
// the Bot API's limits. Bot API calls go to a fake fetch; nothing reaches
// Telegram, and the token and secret never appear in what it prints.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPDATES,
  COMMANDS,
  DESCRIPTION,
  INLINE_PLACEHOLDER,
  readSettings,
  run,
  SETUP_METHODS,
  SHORT_DESCRIPTION,
  setupCalls,
  WEBHOOK_PATH,
} from "../../../../plugins/telegram/scripts/setup.mjs";

const ENV = {
  TELEGRAM_BOT_TOKEN: "123456:fake-token-for-tests",
  TELEGRAM_WEBHOOK_SECRET: "fake_webhook_secret-1",
  TELEGRAM_BOT_USERNAME: "@QRdxTestBot",
};

interface Call {
  url: string;
  method: string;
  params: Record<string, unknown>;
}

function fakeTelegram(me: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const method = url.split("/").at(-1) ?? "";
    calls.push({ url, method, params: JSON.parse(String(init.body)) });
    const result =
      method === "getMe"
        ? {
            id: 1,
            is_bot: true,
            username: "QRdxTestBot",
            supports_inline_queries: false,
            can_read_all_group_messages: false,
            ...me,
          }
        : method === "getWebhookInfo"
          ? { url: "https://qrdx.example/api/integrations/telegram/webhook" }
          : true;
    return Response.json({ ok: true, result });
  };
  return { calls, fetch };
}

describe("setup.mjs", () => {
  it("points the webhook at the app's route with the secret and the updates it answers", async () => {
    const telegram = fakeTelegram();
    const lines: string[] = [];
    await run({
      env: ENV,
      argv: ["--app-url", "https://qrdx.example/some/page"],
      fetch: telegram.fetch,
      log: (line: string) => lines.push(line),
    });

    expect(telegram.calls.map((call) => call.method)).toEqual([
      "getMe",
      "setWebhook",
      "setMyCommands",
      "setMyDescription",
      "setMyShortDescription",
      "getWebhookInfo",
    ]);
    expect(telegram.calls[0]!.url).toBe(
      `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getMe`,
    );
    expect(telegram.calls[1]!.params).toEqual({
      url: "https://qrdx.example/api/integrations/telegram/webhook",
      secret_token: ENV.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "inline_query", "callback_query"],
      drop_pending_updates: true,
    });

    const printed = lines.join("\n");
    expect(printed).not.toContain(ENV.TELEGRAM_BOT_TOKEN);
    expect(printed).not.toContain(ENV.TELEGRAM_WEBHOOK_SECRET);
    // What BotFather still needs, since getMe says inline mode is off.
    expect(printed).toContain("/setinline");
    expect(printed).toContain(INLINE_PLACEHOLDER);
    expect(printed).toContain("/setinlinefeedback");
    expect(printed).toContain("https://t.me/QRdxTestBot");
  });

  it("matches the webhook route and the commands the bot reads", () => {
    expect(WEBHOOK_PATH).toBe("/api/integrations/telegram/webhook");
    expect(ALLOWED_UPDATES).toEqual([
      "message",
      "inline_query",
      "callback_query",
    ]);
    expect(
      COMMANDS.map((command: { command: string }) => command.command),
    ).toEqual(["qr", "help", "start"]);
  });

  it("lists its progress names in the same order as the calls", () => {
    const calls = setupCalls({
      secret: "s3cret_value",
      appUrl: "https://qrdx.example",
    });
    expect(calls.map((call) => call.method)).toEqual(SETUP_METHODS);
  });

  it("keeps every text within the Bot API's limits", () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
    for (const { command, description } of COMMANDS) {
      expect(command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(256);
    }
    const [webhook] = setupCalls({
      secret: "s",
      appUrl: "https://qrdx.example",
    });
    expect(webhook.method).toBe("setWebhook");
  });

  it("refuses a token that belongs to another bot", async () => {
    const telegram = fakeTelegram({ username: "SomeOtherBot" });
    await expect(
      run({
        env: ENV,
        argv: ["--app-url", "https://qrdx.example"],
        fetch: telegram.fetch,
        log: () => {},
      }),
    ).rejects.toThrow(/belongs to @SomeOtherBot/);
    expect(telegram.calls.map((call) => call.method)).toEqual(["getMe"]);
  });

  it("names every missing or malformed setting, never its value", () => {
    expect(() => readSettings({}, [])).toThrow(
      /TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET[\s\S]*TELEGRAM_BOT_USERNAME[\s\S]*--app-url/,
    );
    const bad = {
      ...ENV,
      TELEGRAM_WEBHOOK_SECRET: "has spaces!",
      TELEGRAM_BOT_USERNAME: "QRdxTest",
    };
    let message = "";
    try {
      readSettings(bad, ["--app-url", "http://qrdx.example"]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("TELEGRAM_WEBHOOK_SECRET may only use");
    expect(message).toContain('ending in "bot"');
    expect(message).toContain("HTTPS");
    expect(message).not.toContain("has spaces!");
  });

  it("falls back to NEXT_PUBLIC_APP_URL, and --remove needs no address", async () => {
    expect(
      readSettings({ ...ENV, NEXT_PUBLIC_APP_URL: "https://qrdx.example" }, [])
        .appUrl,
    ).toBe("https://qrdx.example");

    const telegram = fakeTelegram();
    await run({
      env: ENV,
      argv: ["--remove"],
      fetch: telegram.fetch,
      log: () => {},
    });
    expect(telegram.calls.map((call) => [call.method, call.params])).toEqual([
      ["getMe", {}],
      ["deleteWebhook", { drop_pending_updates: true }],
    ]);
  });
});
