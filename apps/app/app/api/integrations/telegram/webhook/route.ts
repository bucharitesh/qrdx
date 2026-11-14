import { after } from "next/server";
import {
  handleTelegramUpdate,
  hasWebhookSecret,
  TELEGRAM_SECRET_HEADER,
  telegramBotConfig,
} from "@/lib/chat-bots/telegram/bot";
import { telegramUpdateSchema } from "@/lib/chat-bots/telegram/replies";
import { readJsonBody } from "@/lib/request-guards";

/**
 * POST /api/integrations/telegram/webhook — updates for the QRdx Telegram bot
 * (setWebhook in plugins/telegram/scripts/setup.mjs). Telegram sends the
 * secret_token we set in X-Telegram-Bot-Api-Secret-Token; it's checked before
 * the body is read. The answer is an immediate empty 200, and the replies go
 * out through the Bot API after it (lib/chat-bots/telegram/bot.ts). An update
 * the bot can't read is acknowledged too, or Telegram would keep resending it.
 *
 * 404 where the bot isn't set up (TELEGRAM_* variables), 401 without the
 * secret.
 */

export const runtime = "nodejs";

/** Text messages are at most 4,096 characters; updates stay far below this. */
const MAX_BODY_BYTES = 64 * 1024;

const done = () =>
  new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const config = telegramBotConfig();
  if (!config) return new Response("Not found", { status: 404 });
  if (
    !hasWebhookSecret(
      request.headers.get(TELEGRAM_SECRET_HEADER),
      config.secret,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch {
    return done();
  }
  const update = telegramUpdateSchema.safeParse(body);
  if (update.success) {
    after(() => handleTelegramUpdate(update.data, config));
  }
  return done();
}
