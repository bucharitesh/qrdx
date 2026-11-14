// Without all three TELEGRAM_* variables the Telegram bot doesn't exist on a
// deployment: its routes answer 404 (the secret isn't even looked at) and
// nothing calls Telegram. vitest.config.ts strips TELEGRAM_* from the
// environment, and this file sets only two of them.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:fake-token-for-tests";
  process.env.TELEGRAM_WEBHOOK_SECRET = "fake_webhook_secret-1";
});

import { GET as open } from "@/app/api/integrations/telegram/open/route";
import { GET as photo } from "@/app/api/integrations/telegram/photo/route";
import { POST } from "@/app/api/integrations/telegram/webhook/route";
import { isFeatureAvailable } from "@/lib/feature-availability";

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Telegram bot without TELEGRAM_BOT_USERNAME", () => {
  it("is unavailable", () => {
    expect(isFeatureAvailable("telegramBot")).toBe(false);
  });

  it("answers 404 on every route and calls nobody", async () => {
    const webhook = await POST(
      new Request("http://localhost:3000/api/integrations/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "fake_webhook_secret-1",
        },
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            chat: { id: 1, type: "private" },
            from: { id: 1, is_bot: false },
            text: "https://qrdx.dev",
          },
        }),
      }),
    );
    expect(webhook.status).toBe(404);

    const image = await photo(
      new NextRequest(
        "http://localhost:3000/api/integrations/telegram/photo?data=hello",
      ),
    );
    expect(image.status).toBe(404);
    expect(open().status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
