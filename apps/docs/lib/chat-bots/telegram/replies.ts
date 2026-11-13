import "server-only";

import { createHash } from "node:crypto";
import { CANONICAL_ORIGIN } from "@repo/config";
import { z } from "zod";
import { isOfficialOrigin } from "@/lib/agents/hosts";
import {
  CHAT_QR_PNG_SIZE,
  type ChatQrLinks,
  chatQrCaption,
  withBotRef,
} from "@/lib/chat-bots/qr-reply";
import {
  CHAT_FLAGS,
  CHAT_LOOKS,
  type ChatDesign,
  type ChatQrAsk,
  chatDesignLinks,
  currentOptions,
  designValues,
  PICKER_LABELS,
  PICKERS,
  type Picker,
  pickerOptions,
  readChatQrAsk,
} from "@/lib/chat-bots/styles";
import { signPhotoLink } from "@/lib/chat-bots/telegram/photo-link";
import { baseUrl } from "@/lib/metadata";
import { playgroundHref, withHandoffRef } from "@/lib/playground-links";

// What the QRdx Telegram bot reads from an update and what it sends back, as
// Bot API method payloads (https://core.telegram.org/bots/api). Pure: the
// webhook route parses the update, lib/chat-bots/telegram/bot.ts rate limits
// and sends. Every text is plain (no parse_mode), so nothing a person types
// turns into formatting or links the bot didn't mean.
//
// In chats the image is the image API's PNG (chatDesignLinks). Inline
// results are InlineQueryResultPhoto, whose photo_url the Bot API documents
// as JPEG only, so they point at the bot's own JPEG of the same code
// (app/api/integrations/telegram/photo), through links signed with the
// webhook secret (lib/chat-bots/telegram/photo-link.ts).
//
// Styles (lib/chat-bots/styles.ts): options typed after the content, and
// in chats a Style button that opens the Look, Color, Frame and Logo
// buttons. A pick edits the photo (editMessageMedia). There's no state on
// QRdx's side: the content and design come back from the message's
// Download PNG button, and who asked from the buttons' callback_data.

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
const OFFICIAL_SITE = CANONICAL_ORIGIN;

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

const keyboardButtonSchema = z.object({
  text: z.string(),
  url: z.string().optional(),
  callback_data: z.string().optional(),
});

const callbackQuerySchema = z.object({
  id: z.string().min(1),
  from: userSchema,
  data: z.string().optional(),
  // Absent for a message sent through inline mode, and its fields for one
  // too old for the bot to change.
  message: z
    .object({
      message_id: z.number().int(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
      reply_markup: z
        .object({ inline_keyboard: z.array(z.array(keyboardButtonSchema)) })
        .optional(),
    })
    .optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  inline_query: inlineQuerySchema.optional(),
  callback_query: callbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
type TelegramMessage = z.infer<typeof messageSchema>;
export type TelegramCallbackQuery = z.infer<typeof callbackQuerySchema>;

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

/**
 * Content to turn into a code with its design (not yet scan-checked), or
 * why there's none (help, too long, an option that isn't right).
 */
export type ReplyInput = ChatQrAsk | { ok: false; reason: "help" };

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
  const input = readChatQrAsk(raw);
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

/** The editor link, tagged ref=telegram-bot (lib/analytics/handoff-tags.ts). */
const editorLink = (links: ChatQrLinks) =>
  withBotRef(links, "telegram-bot").editor;

/** The URL buttons under a code: download it, or open the editor. */
function qrKeyboard(links: ChatQrLinks) {
  return {
    inline_keyboard: [
      [
        { text: "Download PNG", url: links.png },
        { text: "Download SVG", url: links.svg },
      ],
      [{ text: "Open in editor", url: editorLink(links) }],
    ],
  };
}

// ── Style buttons ───────────────────────────────────────────────────────────
// callback_data is at most 64 bytes: a letter for what the button does, the
// option, and the Telegram id of the person who asked, so only they can
// restyle it ("l:modern:1001"). The longest is under 40 bytes.

const PICKER_CODES: Record<Picker, string> = {
  look: "l",
  color: "c",
  frame: "f",
  logo: "i",
};

export type StyleCallback =
  /** Show the Look, Color, Frame and Logo buttons */
  | { kind: "menu"; userId: number }
  /** Back to the download buttons */
  | { kind: "done"; userId: number }
  /** Show one picker's options */
  | { kind: "open"; picker: Picker; userId: number }
  /** Restyle the code with an option */
  | { kind: "apply"; picker: Picker; value: string; userId: number };

/** The callback_data for a style button. */
export function styleCallbackData(callback: StyleCallback): string {
  switch (callback.kind) {
    case "menu":
      return `m:${callback.userId}`;
    case "done":
      return `d:${callback.userId}`;
    case "open":
      return `k:${PICKER_CODES[callback.picker]}:${callback.userId}`;
    case "apply":
      return `${PICKER_CODES[callback.picker]}:${callback.value}:${callback.userId}`;
  }
}

const pickerOfCode = (code: string | undefined) =>
  PICKERS.find((picker) => PICKER_CODES[picker] === code);

/** A style button's callback_data, or null when it isn't one. */
export function readStyleCallback(
  data: string | undefined,
): StyleCallback | null {
  if (!data || data.length > 64) return null;
  const parts = data.split(":");
  const userId = Number(parts.at(-1));
  if (
    !(
      /^[1-9][0-9]{0,15}$/.test(parts.at(-1) ?? "") &&
      Number.isSafeInteger(userId)
    )
  ) {
    return null;
  }
  const [code, value] = parts;
  if (parts.length === 2 && code === "m") return { kind: "menu", userId };
  if (parts.length === 2 && code === "d") return { kind: "done", userId };
  if (parts.length !== 3) return null;
  if (code === "k") {
    const picker = pickerOfCode(value);
    return picker ? { kind: "open", picker, userId } : null;
  }
  const picker = pickerOfCode(code);
  if (
    !(picker && pickerOptions(picker).some((option) => option.id === value))
  ) {
    return null;
  }
  return { kind: "apply", picker, value: value as string, userId };
}

/** Which buttons a chat reply shows under the code. */
export type KeyboardView =
  | { kind: "main" }
  | { kind: "menu" }
  | { kind: "picker"; picker: Picker };

/** Options per row in a picker. */
const OPTIONS_PER_ROW = 3;

/**
 * The buttons under a code in a chat, for the person who asked (`userId`).
 * Every view keeps Download PNG: restyling reads the content back from it.
 */
export function chatKeyboard(
  links: ChatQrLinks,
  design: ChatDesign | null,
  userId: number,
  view: KeyboardView = { kind: "main" },
) {
  const png = { text: "Download PNG", url: links.png };
  const button = (text: string, callback: StyleCallback) => ({
    text,
    callback_data: styleCallbackData(callback),
  });
  if (view.kind === "main") {
    return {
      inline_keyboard: [
        [png, { text: "Download SVG", url: links.svg }],
        [
          { text: "Open in editor", url: editorLink(links) },
          button("Style", { kind: "menu", userId }),
        ],
      ],
    };
  }
  if (view.kind === "menu") {
    return {
      inline_keyboard: [
        PICKERS.map((picker) =>
          button(PICKER_LABELS[picker], { kind: "open", picker, userId }),
        ),
        [png, button("Done", { kind: "done", userId })],
      ],
    };
  }
  const { picker } = view;
  const current = currentOptions(design)[picker];
  const options = pickerOptions(picker).map((option) =>
    button(option.id === current ? `✓ ${option.label}` : option.label, {
      kind: "apply",
      picker,
      value: option.id,
      userId,
    }),
  );
  const rows = [];
  for (let i = 0; i < options.length; i += OPTIONS_PER_ROW) {
    rows.push(options.slice(i, i + OPTIONS_PER_ROW));
  }
  return {
    inline_keyboard: [...rows, [png, button("Back", { kind: "menu", userId })]],
  };
}

/** The Download PNG link in a message's buttons. */
export function pngLinkOf(
  keyboard: { inline_keyboard: { text: string; url?: string }[][] } | undefined,
): string | null {
  for (const row of keyboard?.inline_keyboard ?? []) {
    for (const button of row) {
      if (button.text === "Download PNG" && button.url) return button.url;
    }
  }
  return null;
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
    "To style a code, tap Style under it and pick a look, color, frame or logo. Or add options after the link or text:",
    'qrdx.dev --look modern --fg 0051ff --frame banner-bottom --frame-text "Scan me"',
    `Looks: ${CHAT_LOOKS.map((look) => look.id).join(", ")}.`,
    `Options: ${CHAT_FLAGS.map((flag) => `--${flag}`).join(", ")}.`,
    "Every styled code is checked to make sure phones can scan it.",
    "",
    "QRdx doesn't save the codes you make. What you send goes into the image link, and like any link it can end up in logs and caches, so don't make codes of passwords or other secrets.",
    "",
    "For everything else, open the editor:",
    new URL(
      withHandoffRef(playgroundHref({}), "telegram-bot"),
      origin,
    ).toString(),
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

/** How a chat reply looks and who can restyle it. */
export interface ChatReplyOptions {
  /** The design, scan-checked (null: the plain code) */
  design?: ChatDesign | null;
  /** A line about the scan check (STYLE_NOTES), under the content */
  note?: string | null;
  origin?: string | URL;
}

/** The caption under a code: its content, and the scan check's note. */
const captionOf = (data: string, note?: string | null) =>
  note ? `${chatQrCaption(data)}\n\n${note}` : chatQrCaption(data);

/**
 * The code as a photo replying to the message, with its buttons and the
 * Style button for `userId`, the person who asked.
 */
export function qrPhotoReply(
  chatId: number,
  messageId: number,
  data: string,
  userId: number,
  { design = null, note, origin = baseUrl }: ChatReplyOptions = {},
): TelegramCall {
  const links = chatDesignLinks(data, design, origin);
  return {
    method: "sendPhoto",
    payload: {
      chat_id: chatId,
      photo: links.png,
      caption: captionOf(data, note),
      reply_parameters: replyTo(messageId),
      reply_markup: chatKeyboard(links, design, userId),
    },
  };
}

/**
 * When Telegram can't fetch the image: the content and the download and
 * editor buttons (a text message has no photo to restyle).
 */
export function qrLinksReply(
  chatId: number,
  messageId: number,
  data: string,
  { design = null, origin = baseUrl }: ChatReplyOptions = {},
): TelegramCall {
  return {
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text: `${chatQrCaption(data)}\n\n${IMAGE_FAILED_TEXT}`,
      reply_parameters: replyTo(messageId),
      reply_markup: qrKeyboard(chatDesignLinks(data, design, origin)),
      link_preview_options: { is_disabled: true },
    },
  };
}

// ── Restyling ───────────────────────────────────────────────────────────────

/** A style button pressed by someone other than the person who asked. */
export const NOT_YOURS_TEXT =
  "Only the person who asked can restyle this code. Send me a link or text to make your own.";

/** A code the bot can't read back (an old message, or buttons it didn't make). */
export const CANT_RESTYLE_TEXT =
  "This code can't be restyled. Send the link or text again for a new one.";

export const RESTYLE_FAILED_TEXT =
  "Telegram couldn't load the new image. Try again in a moment.";

/** answerCallbackQuery: always sent, so the button stops spinning. */
export function answerCallback(queryId: string, text?: string): TelegramCall {
  return {
    method: "answerCallbackQuery",
    payload: {
      callback_query_id: queryId,
      ...(text ? { text: text.slice(0, 200) } : {}),
    },
  };
}

/** Shows another set of buttons under the code. */
export function editKeyboard(
  chatId: number,
  messageId: number,
  data: string,
  design: ChatDesign | null,
  userId: number,
  view: KeyboardView,
  origin: string | URL = baseUrl,
): TelegramCall {
  return {
    method: "editMessageReplyMarkup",
    payload: {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: chatKeyboard(
        chatDesignLinks(data, design, origin),
        design,
        userId,
        view,
      ),
    },
  };
}

/** Replaces the photo with the code in its new design, keeping the picker open. */
export function editPhoto(
  chatId: number,
  messageId: number,
  data: string,
  userId: number,
  picker: Picker,
  { design = null, note, origin = baseUrl }: ChatReplyOptions = {},
): TelegramCall {
  const links = chatDesignLinks(data, design, origin);
  return {
    method: "editMessageMedia",
    payload: {
      chat_id: chatId,
      message_id: messageId,
      media: {
        type: "photo",
        media: links.png,
        caption: captionOf(data, note),
      },
      reply_markup: chatKeyboard(links, design, userId, {
        kind: "picker",
        picker,
      }),
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
 * The bot's JPEG of `data` in `design` (null: the plain code), `size` px
 * wide (TELEGRAM_PHOTO_SIZES), as a signed link that works for one to two
 * hours (photo-link.ts). The design is signed too.
 */
export function telegramPhotoUrl(
  data: string,
  size: number,
  { secret, origin = baseUrl, now = Date.now() }: PhotoLinkOptions,
  design: ChatDesign | null = null,
): string {
  const site = isOfficialOrigin(origin)
    ? OFFICIAL_SITE
    : new URL(origin).origin;
  const url = new URL(TELEGRAM_PHOTO_PATH, site);
  const values = designValues(design);
  const { exp, sig } = signPhotoLink(data, size, secret, now, values);
  url.searchParams.set("data", data);
  url.searchParams.set("size", String(size));
  if (values.style) url.searchParams.set("style", values.style);
  if (values.logoIcon) url.searchParams.set("logoIcon", values.logoIcon);
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
  options: "Check the options after the link. Tap for help",
  rate_limited: "Too many codes. Try again in a minute",
  busy: BUSY_TEXT,
} as const;

/** How long Telegram may reuse a "slow down" or "busy" answer, in seconds. */
const NOTICE_CACHE_SECONDS = 10;

/**
 * answerInlineQuery with the code as one photo result, in `design`
 * (scan-checked; null: the plain code). There's no message to edit before
 * it's sent, so inline results take typed options only and have no Style
 * button.
 */
export function inlineQrAnswer(
  queryId: string,
  data: string,
  options: PhotoLinkOptions,
  { design = null, note }: Omit<ChatReplyOptions, "origin"> = {},
): TelegramCall {
  const { origin = baseUrl } = options;
  // One clock reading, so the photo and its thumbnail expire together.
  const photo = { ...options, now: options.now ?? Date.now() };
  const description = chatQrCaption(data);
  const values = designValues(design);
  // A frame makes the picture bigger than the code; Telegram then reads
  // the size from the image.
  const square = !design?.styles.frame;
  return {
    method: "answerInlineQuery",
    payload: {
      inline_query_id: queryId,
      cache_time: RESULT_CACHE_SECONDS,
      is_personal: false,
      results: [
        {
          type: "photo",
          // 1-64 bytes; the same text in the same design gets the same id.
          id: createHash("sha256")
            .update(
              design ? `${values.style}\n${values.logoIcon}\n${data}` : data,
            )
            .digest("hex")
            .slice(0, 32),
          photo_url: telegramPhotoUrl(data, CHAT_QR_PNG_SIZE, photo, design),
          thumbnail_url: telegramPhotoUrl(
            data,
            TELEGRAM_THUMB_SIZE,
            photo,
            design,
          ),
          ...(square
            ? { photo_width: CHAT_QR_PNG_SIZE, photo_height: CHAT_QR_PNG_SIZE }
            : {}),
          title: "QR code",
          description,
          caption: captionOf(data, note),
          reply_markup: qrKeyboard(chatDesignLinks(data, design, origin)),
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
