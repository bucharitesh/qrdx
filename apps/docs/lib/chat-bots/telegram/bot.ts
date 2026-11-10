import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { readChatQrInput } from "@/lib/chat-bots/qr-reply";
import {
  helpText,
  inlineNoResultAnswer,
  inlineQrAnswer,
  planMessage,
  qrLinksReply,
  qrPhotoReply,
  RATE_LIMITED_TEXT,
  type TelegramCall,
  type TelegramUpdate,
  TOO_LONG_TEXT,
  textReply,
} from "@/lib/chat-bots/telegram/replies";
import { env } from "@/lib/env";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";

// The QRdx Telegram bot's server side: its settings, the webhook secret
// check and the Bot API calls. Nothing is stored, and neither the token nor
// anything people send is ever logged.

export interface TelegramBotConfig {
  token: string;
  /** The webhook's secret_token, sent back in X-Telegram-Bot-Api-Secret-Token. */
  secret: string;
  /** The bot's username, without the @. */
  username: string;
}

/** The bot's settings, or null where the feature is off (lib/feature-availability-rules.ts). */
export function telegramBotConfig(): TelegramBotConfig | null {
  if (!isFeatureAvailable("telegramBot")) return null;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!(token && secret && username)) return null;
  return { token, secret, username };
}

/** The header Telegram puts the webhook's secret_token in. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * True when the webhook request carries our secret. Both sides are hashed
 * first, so the comparison is constant-time whatever their lengths.
 */
export function hasWebhookSecret(
  received: string | null,
  expected: string,
): boolean {
  if (!(received && expected)) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

const API_ORIGIN = "https://api.telegram.org";

/** A failed Bot API call: the method and Telegram's error code, never the token. */
class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string,
  ) {
    super(`Telegram ${method} failed: ${description.slice(0, 200)}`);
    this.name = "TelegramApiError";
  }
}

/** Calls one Bot API method and returns its result. */
async function callTelegram(
  token: string,
  { method, payload }: TelegramCall,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The error would name the request URL, which holds the token.
    throw new TelegramApiError(method, undefined, "request failed");
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: unknown;
    error_code?: number;
    description?: string;
  } | null;
  if (!body?.ok) {
    throw new TelegramApiError(
      method,
      body?.error_code ?? response.status,
      body?.description ?? `HTTP ${response.status}`,
    );
  }
  return body.result;
}

// Per Telegram user. Inline queries arrive as people type, so they get more.
const messageLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});
const inlineLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});
// At most one "slow down" reply a minute, however fast someone sends.
const noticeLimiter = createRateLimiter({ limiter: slidingWindow(1, "60 s") });

async function allowed(
  limiter: typeof messageLimiter,
  key: string,
): Promise<boolean> {
  return (await limiter.limit(key)).success;
}

/**
 * Answers one update: a message gets the code (or help, or why not), an
 * inline query gets the code as a result. Failures are logged by method and
 * error code only; a user who blocked the bot (403) isn't an error.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  config: TelegramBotConfig,
): Promise<void> {
  const send = (call: TelegramCall) => callTelegram(config.token, call);
  try {
    if (update.inline_query) {
      const query = update.inline_query;
      const input = readChatQrInput(query.query);
      if (
        !(await allowed(inlineLimiter, `telegram-bot:inline:${query.from.id}`))
      ) {
        await send(inlineNoResultAnswer(query.id, "rate_limited"));
      } else if (input.ok) {
        await send(inlineQrAnswer(query.id, input.data));
      } else {
        await send(inlineNoResultAnswer(query.id, input.reason));
      }
      return;
    }
    if (!update.message) return;

    const plan = planMessage(update.message, config.username);
    if (plan.kind === "ignore") return;
    const { chatId, messageId, userId, input } = plan;
    if (!(await allowed(messageLimiter, `telegram-bot:message:${userId}`))) {
      if (await allowed(noticeLimiter, `telegram-bot:notice:${userId}`)) {
        await send(textReply(chatId, messageId, RATE_LIMITED_TEXT));
      }
      return;
    }
    if (!input.ok) {
      await send(
        textReply(
          chatId,
          messageId,
          input.reason === "too_long"
            ? TOO_LONG_TEXT
            : helpText(config.username),
        ),
      );
      return;
    }
    try {
      await send(qrPhotoReply(chatId, messageId, input.data));
    } catch (error) {
      // Telegram couldn't fetch or use the image: send the links instead.
      if (!(error instanceof TelegramApiError && error.errorCode === 400)) {
        throw error;
      }
      await send(qrLinksReply(chatId, messageId, input.data));
    }
  } catch (error) {
    if (error instanceof TelegramApiError && error.errorCode === 403) return;
    logError(error as Error, {
      route: "/api/integrations/telegram/webhook",
      ...(error instanceof TelegramApiError
        ? { method: error.method, errorCode: error.errorCode }
        : {}),
    });
  }
}
