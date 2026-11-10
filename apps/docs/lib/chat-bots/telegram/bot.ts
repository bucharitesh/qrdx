import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import {
  applyChoice,
  chatDesignLinks,
  checkForReply,
  pickerChoice,
  readChatQrAsk,
  readChatQrLink,
  STYLE_NOTES,
} from "@/lib/chat-bots/styles";
import {
  answerCallback,
  BUSY_TEXT,
  CANT_RESTYLE_TEXT,
  editKeyboard,
  editPhoto,
  helpText,
  inlineNoResultAnswer,
  inlineQrAnswer,
  type KeyboardView,
  NOT_YOURS_TEXT,
  planMessage,
  pngLinkOf,
  qrLinksReply,
  qrPhotoReply,
  RATE_LIMITED_TEXT,
  RESTYLE_FAILED_TEXT,
  readStyleCallback,
  type TelegramCall,
  type TelegramCallbackQuery,
  type TelegramUpdate,
  TOO_LONG_TEXT,
  textReply,
} from "@/lib/chat-bots/telegram/replies";
import { env } from "@/lib/env";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";

// The QRdx Telegram bot's server side: its settings, the webhook secret
// check and the Bot API calls. Nothing is saved, and this code never logs
// the token or anything people send. (The inline photo links carry the
// content, so request logs and caches in front of the app can hold it.)

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
// At most one "slow down" or "busy" reply a minute, however fast someone sends.
const noticeLimiter = createRateLimiter({ limiter: slidingWindow(1, "60 s") });
// Opening and closing the style buttons (no new image): per Telegram user.
// A restyle draws a new code, so it counts as a message instead.
const styleMenuLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

/**
 * Messages and inline queries the bot answers in a minute, from everyone
 * together. A ceiling for the bot as a whole: past it, people are told it's
 * busy instead of getting codes (and the inline photos the JPEG route would
 * draw). Each person's own limit is checked first, so one sender can't use
 * more of this than their own allowance.
 */
export const TELEGRAM_GLOBAL_PER_MINUTE = 300;
const globalLimiter = createRateLimiter({
  limiter: slidingWindow(TELEGRAM_GLOBAL_PER_MINUTE, "60 s"),
});
const GLOBAL_KEY = "telegram-bot:global";

async function allowed(
  limiter: typeof messageLimiter,
  key: string,
): Promise<boolean> {
  return (await limiter.limit(key)).success;
}

/** A style option's note for the caption. */
const noteOf = (note: keyof typeof STYLE_NOTES | null) =>
  note ? STYLE_NOTES[note] : null;

/**
 * A style button under a code. Only the person who asked can use it (their
 * id is in the button); the content and design come back from the code's
 * Download PNG button. Opening a picker changes the buttons; an option
 * draws the code again, after the scan check, and counts like a message.
 * answerCallbackQuery is always sent, so the button stops spinning.
 */
async function handleStyleCallback(
  query: TelegramCallbackQuery,
  send: (call: TelegramCall) => Promise<unknown>,
): Promise<void> {
  let notice: string | undefined;
  try {
    const callback = readStyleCallback(query.data);
    const message = query.message;
    if (!(callback && message)) return;
    if (query.from.id !== callback.userId) {
      notice = NOT_YOURS_TEXT;
      return;
    }
    const current = readChatQrLink(pngLinkOf(message.reply_markup));
    if (!current) {
      notice = CANT_RESTYLE_TEXT;
      return;
    }
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const { userId } = callback;

    if (callback.kind !== "apply") {
      if (
        !(await allowed(styleMenuLimiter, `telegram-bot:style-menu:${userId}`))
      ) {
        notice = RATE_LIMITED_TEXT;
        return;
      }
      const view: KeyboardView =
        callback.kind === "open"
          ? { kind: "picker", picker: callback.picker }
          : { kind: callback.kind === "menu" ? "menu" : "main" };
      try {
        await send(
          editKeyboard(
            chatId,
            messageId,
            current.data,
            current.design,
            userId,
            view,
          ),
        );
      } catch (error) {
        // "Message is not modified": the same buttons, tapped twice.
        if (!(error instanceof TelegramApiError && error.errorCode === 400)) {
          throw error;
        }
      }
      return;
    }

    if (!(await allowed(messageLimiter, `telegram-bot:message:${userId}`))) {
      notice = RATE_LIMITED_TEXT;
      return;
    }
    if (!(await allowed(globalLimiter, GLOBAL_KEY))) {
      notice = BUSY_TEXT;
      return;
    }
    const choice = pickerChoice(callback.picker, callback.value);
    if (!choice) return;
    const checked = await checkForReply(
      current.data,
      applyChoice(current.design, choice),
      "telegram-bot",
    );
    const note = noteOf(checked.note);
    // The same image again (an option it already has): nothing to change.
    const before = chatDesignLinks(current.data, current.design).png;
    if (chatDesignLinks(current.data, checked.design).png === before) {
      notice = note ?? undefined;
      return;
    }
    try {
      await send(
        editPhoto(chatId, messageId, current.data, userId, callback.picker, {
          design: checked.design,
          note,
        }),
      );
      notice = note ?? undefined;
    } catch (error) {
      if (!(error instanceof TelegramApiError && error.errorCode === 400)) {
        throw error;
      }
      notice = RESTYLE_FAILED_TEXT;
    }
  } finally {
    await send(answerCallback(query.id, notice));
  }
}

/**
 * Answers one update: a message gets the code (or help, or why not), an
 * inline query gets the code as a result, a style button restyles a code.
 * Failures are logged by method and error code only; a user who blocked the
 * bot (403) isn't an error.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  config: TelegramBotConfig,
): Promise<void> {
  const send = (call: TelegramCall) => callTelegram(config.token, call);
  try {
    if (update.callback_query) {
      await handleStyleCallback(update.callback_query, send);
      return;
    }
    if (update.inline_query) {
      const query = update.inline_query;
      const input = readChatQrAsk(query.query);
      if (
        !(await allowed(inlineLimiter, `telegram-bot:inline:${query.from.id}`))
      ) {
        await send(inlineNoResultAnswer(query.id, "rate_limited"));
      } else if (!(await allowed(globalLimiter, GLOBAL_KEY))) {
        await send(inlineNoResultAnswer(query.id, "busy"));
      } else if (input.ok) {
        const checked = await checkForReply(
          input.data,
          input.design,
          "telegram-bot",
        );
        await send(
          inlineQrAnswer(
            query.id,
            input.data,
            { secret: config.secret },
            { design: checked.design, note: noteOf(checked.note) },
          ),
        );
      } else {
        await send(inlineNoResultAnswer(query.id, input.reason));
      }
      return;
    }
    if (!update.message) return;

    const plan = planMessage(update.message, config.username);
    if (plan.kind === "ignore") return;
    const { chatId, messageId, userId, input } = plan;
    const notify = async (text: string) => {
      if (await allowed(noticeLimiter, `telegram-bot:notice:${userId}`)) {
        await send(textReply(chatId, messageId, text));
      }
    };
    if (!(await allowed(messageLimiter, `telegram-bot:message:${userId}`))) {
      await notify(RATE_LIMITED_TEXT);
      return;
    }
    if (!(await allowed(globalLimiter, GLOBAL_KEY))) {
      await notify(BUSY_TEXT);
      return;
    }
    if (!input.ok) {
      await send(
        textReply(
          chatId,
          messageId,
          input.reason === "too_long"
            ? TOO_LONG_TEXT
            : input.reason === "options"
              ? `${input.message} Send /help to see them all.`
              : helpText(config.username),
        ),
      );
      return;
    }
    const checked = await checkForReply(
      input.data,
      input.design,
      "telegram-bot",
    );
    const reply = { design: checked.design, note: noteOf(checked.note) };
    try {
      await send(qrPhotoReply(chatId, messageId, input.data, userId, reply));
    } catch (error) {
      // Telegram couldn't fetch or use the image: send the links instead.
      if (!(error instanceof TelegramApiError && error.errorCode === 400)) {
        throw error;
      }
      await send(qrLinksReply(chatId, messageId, input.data, reply));
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
