import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { CHAT_QR_PNG_SIZE, readChatQrInput } from "@/lib/chat-bots/qr-reply";
import { telegramBotConfig } from "@/lib/chat-bots/telegram/bot";
import { renderQrJpeg } from "@/lib/chat-bots/telegram/jpeg";
import { TELEGRAM_PHOTO_SIZES } from "@/lib/chat-bots/telegram/replies";
import { logError } from "@/lib/log-error";
import { getClientIp } from "@/lib/request-guards";

/**
 * GET /api/integrations/telegram/photo?data=<content>&size=<256|1024> — the
 * QR code as JPEG, for the Telegram bot's inline results: the Bot API takes
 * only JPEG there (InlineQueryResultPhoto.photo_url). Same code as the image
 * API's default PNG. Telegram's servers fetch it, so the per-IP budget is
 * shared by everyone using the bot; the CDN keeps each image for good.
 *
 * 404 where the bot isn't set up.
 */

export const runtime = "nodejs";

const ipRateLimiter = createRateLimiter({
  limiter: slidingWindow(300, "60 s"),
});

// Same query → same bytes.
const IMMUTABLE = "public, max-age=31536000, immutable";

const plain = (status: number, text: string, headers?: HeadersInit) =>
  new Response(text, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function GET(request: NextRequest) {
  if (!telegramBotConfig()) return plain(404, "Not found");
  const { success } = await ipRateLimiter.limit(
    `telegram-photo:ip:${getClientIp(request)}`,
  );
  if (!success) return plain(429, "Too many requests", { "Retry-After": "60" });

  const params = request.nextUrl.searchParams;
  const input = readChatQrInput(params.get("data") ?? "");
  const size = Number(params.get("size") ?? CHAT_QR_PNG_SIZE);
  if (!(input.ok && TELEGRAM_PHOTO_SIZES.includes(size))) {
    return plain(400, "Bad request");
  }

  let jpeg: Uint8Array;
  try {
    jpeg = await renderQrJpeg(input.data, size);
  } catch (error) {
    logError(error as Error, { route: "/api/integrations/telegram/photo" });
    return plain(500, "Couldn't draw the code");
  }
  return new Response(jpeg as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": IMMUTABLE,
      "CDN-Cache-Control": IMMUTABLE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
