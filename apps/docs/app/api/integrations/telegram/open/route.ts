import { telegramBotConfig } from "@/lib/chat-bots/telegram/bot";

/**
 * GET /api/integrations/telegram/open — "Open in Telegram": a redirect to
 * https://t.me/<bot username>. The username comes from TELEGRAM_BOT_USERNAME
 * (the owner picks it in BotFather), so the catalog links here instead of
 * naming it. 404 where the bot isn't set up.
 */
export function GET() {
  const config = telegramBotConfig();
  if (!config) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(null, {
    status: 307,
    headers: {
      Location: `https://t.me/${encodeURIComponent(config.username)}`,
      "Cache-Control": "no-store",
    },
  });
}
