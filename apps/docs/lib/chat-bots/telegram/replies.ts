import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { isOfficialOrigin } from "@/lib/agents/hosts";
import {
  CHAT_QR_PNG_SIZE,
  type ChatQrInput,
  type ChatQrLinks,
  chatQrCaption,
  chatQrLinks,
  readChatQrInput,
} from "@/lib/chat-bots/qr-reply";
import { signPhotoLink } from "@/lib/chat-bots/telegram/photo-link";
import { baseUrl } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";

// What the QRdx Telegram bot reads from an update and what it sends back, as
// Bot API method payloads (https://core.telegram.org/bots/api). Pure: the
// webhook route parses the update, lib/chat-bots/telegram/bot.ts rate limits
// and sends. Every text is plain (no parse_mode), so nothing a person types
// turns into formatting or links the bot didn't mean.
//
// In chats the image is the image API's PNG (chatQrLinks). Inline results
// are InlineQueryResultPhoto, whose photo_url the Bot API documents as JPEG
// only, so they point at the bot's own JPEG of the same code
// (app/api/integrations/telegram/photo), through links signed with the
// webhook secret (lib/chat-bots/telegram/photo-link.ts).

/** Where the bot's JPEGs are served (app/api/integrations/telegram/photo). */
const TELEGRAM_PHOTO_PATH = "/api/integrations/telegram/photo";

/** Inline result thumbnail width, in pixels. */
const TELEGRAM_THUMB_SIZE = 256;

/** The JPEG sizes the photo route renders: the thumbnail and the photo. */
export const TELEGRAM_PHOTO_SIZES: readonly number[] = [
  TELEGRAM_THUMB_SIZE,
  CHAT_QR_PNG_SIZE,
];

/** The hosted site, which stands in for local dev and previews (lib/agents/hosts.ts). */
const OFFICIAL_SITE = "https://qrdx.dev";

// ── Updates ─────────────────────────────────────────────────────────────────
// Only the fields the bot reads; everything else Telegram sends is dropped.

const userSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
});

const messageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: userSchema.optional(),
  text: z.string().optional(),
  via_bot: userSchema.optional(),
});

const inlineQuerySchema = z.object({
  id: z.string().min(1),
  from: userSchema,
  query: z.string(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  inline_query: inlineQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
type TelegramMessage = z.infer<typeof messageSchema>;

// ── Reading a message ───────────────────────────────────────────────────────

/** `/name`, `/name@bot`, then a space, a line break or the end. */
const COMMAND = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{1,32}))?(?=\s|$)/;

export type TelegramCommand =
  | { name: string; args: string }
  /** `/name@other_bot`: a command for another bot in the same chat. */
  | "other-bot"
  | null;

/**
 * A command at the start of `text` (lowercased name, the rest as `args`), or
 * null for plain text. `/qr@<this bot>` and `/qr` are both this bot's.
 */
export function readCommand(
  text: string,
  botUsername: string,
): TelegramCommand {
  const match = COMMAND.exec(text);
  if (!match) return null;
  const [whole, name = "", mention] = match;
  if (mention && mention.toLowerCase() !== botUsername.toLowerCase()) {
    return "other-bot";
  }
  return { name: name.toLowerCase(), args: text.slice(whole.length) };
}

/** Content to turn into a code, or why there's none (help, too long). */
export type ReplyInput = ChatQrInput | { ok: false; reason: "help" };

/** What a message asks the bot for. */
export type MessagePlan =
  | { kind: "ignore" }
  | {
      kind: "reply";
      chatId: number;
      messageId: number;
      userId: number;
      input: ReplyInput;
    };

const IGNORE = { kind: "ignore" } as const;

/**
 * Private chats: any text is content, /qr takes the rest, /start and /help
 * (and anything that isn't text, like a sticker) get help. Groups: only
 * /qr, /start and /help; with privacy mode on, Telegram sends a group bot
 * little else. Bots, messages sent through inline mode and other chat
 * types are ignored.
 */
export function planMessage(
  message: TelegramMessage,
  botUsername: string,
): MessagePlan {
  const { from, chat, text } = message;
  if (!from || from.is_bot || message.via_bot) return IGNORE;
  const isPrivate = chat.type === "private";
  if (!(isPrivate || chat.type === "group" || chat.type === "supergroup")) {
    return IGNORE;
  }
  const reply = (input: ReplyInput): MessagePlan => ({
    kind: "reply",
    chatId: chat.id,
    messageId: message.message_id,
    userId: from.id,
    input,
  });
  const help: ReplyInput = { ok: false, reason: "help" };

  const command = text === undefined ? null : readCommand(text, botUsername);
  if (command === "other-bot") return IGNORE;
  if (!command) {
    if (!isPrivate) return IGNORE;
    return reply(text === undefined ? help : contentOrHelp(text));
  }
  if (command.name === "qr") return reply(contentOrHelp(command.args));
  if (command.name === "start" || command.name === "help") return reply(help);
  return isPrivate ? reply(help) : IGNORE;
}

function contentOrHelp(raw: string): ReplyInput {
  const input = readChatQrInput(raw);
  return !input.ok && input.reason === "empty"
    ? { ok: false, reason: "help" }
    : input;
}

// ── Messages ────────────────────────────────────────────────────────────────

/** One Bot API call: the method name and its JSON parameters. */
export interface TelegramCall {
  method: string;
  payload: Record<string, unknown>;
}

const replyTo = (messageId: number) => ({
  message_id: messageId,
  allow_sending_without_reply: true,
});

/** The URL buttons under a code: download it, or open the editor. */
function qrKeyboard(links: ChatQrLinks) {
  return {
    inline_keyboard: [
      [
        { text: "Download PNG", url: links.png },
        { text: "Download SVG", url: links.svg },
      ],
      [{ text: "Open in editor", url: links.editor }],
    ],
  };
}

/** How to use the bot, for /start, /help and empty commands. */
export function helpText(
  botUsername: string,
  origin: string | URL = baseUrl,
): string {
  return [
    "Send me a link or some text and I'll reply with its QR code.",
    "",
    `In any chat, type @${botUsername} and a link or text, then tap the code to send it.`,
    `In a group, add me and send /qr@${botUsername} followed by a link or text.`,
    "",
    "QRdx doesn't save the codes you make. What you send goes into the image link, and like any link it can end up in logs and caches, so don't make codes of passwords or other secrets.",
    "",
    "For colors, logos and frames, open the editor:",
    new URL(playgroundHref({}), origin).toString(),
  ].join("\n");
}

export const TOO_LONG_TEXT =
  "That's too long for one QR code. Try something shorter, like a link to a page with the rest.";

export const RATE_LIMITED_TEXT =
  "That's a lot of codes in a short time. Try again in a minute.";

/** When everyone together has used up the bot's minute (lib/chat-bots/telegram/bot.ts). */
export const BUSY_TEXT = "QRdx is busy right now. Try again in a minute.";

const IMAGE_FAILED_TEXT =
  "Telegram couldn't load the image just now. The buttons below still work.";

export function textReply(
  chatId: number,
  messageId: number,
  text: string,
): TelegramCall {
  return {
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text,
      reply_parameters: replyTo(messageId),
      link_preview_options: { is_disabled: true },
    },
  };
}

/** The code as a photo replying to the message, with its buttons. */
export function qrPhotoReply(
  chatId: number,
  messageId: number,
  data: string,
  origin: string | URL = baseUrl,
): TelegramCall {
  const links = chatQrLinks(data, origin);
  return {
    method: "sendPhoto",
    payload: {
      chat_id: chatId,
      photo: links.png,
      caption: chatQrCaption(data),
      reply_parameters: replyTo(messageId),
      reply_markup: qrKeyboard(links),
    },
  };
}

/** When Telegram can't fetch the image: the content and the same buttons. */
export function qrLinksReply(
  chatId: number,
  messageId: number,
  data: string,
  origin: string | URL = baseUrl,
): TelegramCall {
  return {
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text: `${chatQrCaption(data)}\n\n${IMAGE_FAILED_TEXT}`,
      reply_parameters: replyTo(messageId),
      reply_markup: qrKeyboard(chatQrLinks(data, origin)),
      link_preview_options: { is_disabled: true },
    },
  };
}

// ── Inline mode ─────────────────────────────────────────────────────────────

/** How to build the bot's photo links. */
export interface PhotoLinkOptions {
  /** TELEGRAM_WEBHOOK_SECRET, which the signing key is derived from. */
  secret: string;
  origin?: string | URL;
  /** When the link is made (ms since the epoch), for its expiry. */
  now?: number;
}

/**
 * The bot's JPEG of `data`, `size` px wide (TELEGRAM_PHOTO_SIZES), as a
 * signed link that works for one to two hours (photo-link.ts).
 */
export function telegramPhotoUrl(
  data: string,
  size: number,
  { secret, origin = baseUrl, now = Date.now() }: PhotoLinkOptions,
): string {
  const site = isOfficialOrigin(origin)
    ? OFFICIAL_SITE
    : new URL(origin).origin;
  const url = new URL(TELEGRAM_PHOTO_PATH, site);
  const { exp, sig } = signPhotoLink(data, size, secret, now);
  url.searchParams.set("data", data);
  url.searchParams.set("size", String(size));
  url.searchParams.set("exp", exp);
  url.searchParams.set("sig", sig);
  return url.toString();
}

/** Results depend only on the text, so Telegram may share them between people. */
const RESULT_CACHE_SECONDS = 60;

/** The button above the results when there's no code to show. */
const NO_RESULT_BUTTONS = {
  empty: "Type a link or text to make a QR code",
  too_long: "Too long for one QR code",
  rate_limited: "Too many codes. Try again in a minute",
  busy: BUSY_TEXT,
} as const;

/** How long Telegram may reuse a "slow down" or "busy" answer, in seconds. */
const NOTICE_CACHE_SECONDS = 10;

/** answerInlineQuery with the code as one photo result. */
export function inlineQrAnswer(
  queryId: string,
  data: string,
  options: PhotoLinkOptions,
): TelegramCall {
  const { origin = baseUrl } = options;
  // One clock reading, so the photo and its thumbnail expire together.
  const photo = { ...options, now: options.now ?? Date.now() };
  const caption = chatQrCaption(data);
  return {
    method: "answerInlineQuery",
    payload: {
      inline_query_id: queryId,
      cache_time: RESULT_CACHE_SECONDS,
      is_personal: false,
      results: [
        {
          type: "photo",
          // 1-64 bytes; the same text always gets the same id.
          id: createHash("sha256").update(data).digest("hex").slice(0, 32),
          photo_url: telegramPhotoUrl(data, CHAT_QR_PNG_SIZE, photo),
          thumbnail_url: telegramPhotoUrl(data, TELEGRAM_THUMB_SIZE, photo),
          photo_width: CHAT_QR_PNG_SIZE,
          photo_height: CHAT_QR_PNG_SIZE,
          title: "QR code",
          description: caption,
          caption,
          reply_markup: qrKeyboard(chatQrLinks(data, origin)),
        },
      ],
    },
  };
}

/**
 * answerInlineQuery with no results and a button that opens the bot's chat
 * (/start help). "Slow down" and "busy" answers are cached only briefly, a
 * rate-limited one for this person only.
 */
export function inlineNoResultAnswer(
  queryId: string,
  reason: keyof typeof NO_RESULT_BUTTONS,
): TelegramCall {
  const notice = reason === "rate_limited" || reason === "busy";
  return {
    method: "answerInlineQuery",
    payload: {
      inline_query_id: queryId,
      results: [],
      cache_time: notice ? NOTICE_CACHE_SECONDS : RESULT_CACHE_SECONDS,
      is_personal: reason === "rate_limited",
      button: { text: NO_RESULT_BUTTONS[reason], start_parameter: "help" },
    },
  };
}
