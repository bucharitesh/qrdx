import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { readChatQrInput } from "@/lib/chat-bots/qr-reply";
import { telegramBotConfig } from "@/lib/chat-bots/telegram/bot";
import { renderQrJpeg } from "@/lib/chat-bots/telegram/jpeg";
import { verifyPhotoLink } from "@/lib/chat-bots/telegram/photo-link";
import { TELEGRAM_PHOTO_SIZES } from "@/lib/chat-bots/telegram/replies";
import { logError } from "@/lib/log-error";

/**
 * GET /api/integrations/telegram/photo?data=<content>&size=<256|1024>&exp=…&sig=…
 * — the QR code as JPEG, for the Telegram bot's inline results: the Bot API
 * takes only JPEG there (InlineQueryResultPhoto.photo_url). Same code as the
 * image API's default PNG.
 *
 * Only links the bot signed are drawn (lib/chat-bots/telegram/photo-link.ts):
 * a missing, changed or expired signature gets 403 before anything else
 * happens. Each signed link can then be drawn a few times a minute, so
 * Telegram's few fetch addresses share no budget, and the CDN keeps each
 * image for good.
 *
 * 404 where the bot isn't set up.
 */

export const runtime = "nodejs";

/**
 * Draws of one signed link a minute. Telegram fetches a link once or twice
 * and the CDN answers the rest, so more than this is someone getting around
 * the cache (an extra query parameter makes a new cache entry).
 */
const signatureLimiter = createRateLimiter({
  limiter: slidingWindow(10, "60 s"),
});

// Same query → same bytes.
const IMMUTABLE = "public, max-age=31536000, immutable";

const plain = (status: number, text: string, headers?: HeadersInit) =>
  new Response(text, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function GET(request: NextRequest) {
  const config = telegramBotConfig();
  if (!config) return plain(404, "Not found");
  const link = verifyPhotoLink(request.nextUrl.searchParams, config.secret);
  if (!link) return plain(403, "Forbidden");

  const { success } = await signatureLimiter.limit(
    `telegram-photo:sig:${link.sig}`,
  );
  if (!success) return plain(429, "Too many requests", { "Retry-After": "60" });

  const input = readChatQrInput(link.data);
  if (!(input.ok && TELEGRAM_PHOTO_SIZES.includes(link.size))) {
    return plain(400, "Bad request");
  }

  let jpeg: Uint8Array;
  try {
    jpeg = await renderQrJpeg(input.data, link.size);
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
