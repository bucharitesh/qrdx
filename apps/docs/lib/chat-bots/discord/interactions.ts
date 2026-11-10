import "server-only";

import { z } from "zod";
import {
  chatQrCaption,
  chatQrLinks,
  firstWebAddress,
  readChatQrInput,
} from "@/lib/chat-bots/qr-reply";
import { COMMAND_TYPE, MESSAGE_COMMAND, QR_COMMAND } from "./commands";

// What the Discord app answers. Every reply goes back as the response to
// Discord's request (type 4, within its 3 second window), so the app never
// calls Discord's API and needs no bot token. The QR code is an embed whose
// image is the keyless image API link: Discord fetches the PNG itself.
//
// Nothing here logs or keeps what people send.

export const INTERACTION_TYPE = { ping: 1, applicationCommand: 2 } as const;

const RESPONSE_TYPE = { pong: 1, channelMessage: 4 } as const;
const COMPONENT_TYPE = { actionRow: 1, button: 2 } as const;
const LINK_BUTTON_STYLE = 5;
/** Message flag: only the person who ran the command sees the reply. */
export const EPHEMERAL = 1 << 6;

/** Discord refuses link buttons with longer URLs. */
export const LINK_BUTTON_URL_MAX = 512;
/**
 * Embed image URLs are kept within 2,048 characters, the length Discord's
 * API accepts for URLs (its docs give no number for embeds). Longer content
 * gets a note pointing at the editor instead of a broken reply.
 */
export const EMBED_URL_MAX = 2048;

const interactionSchema = z.object({
  type: z.number().int(),
  data: z
    .object({
      name: z.string(),
      type: z.number().int().optional(),
      options: z
        .array(
          z.object({
            name: z.string(),
            type: z.number().int(),
            value: z.unknown().optional(),
          }),
        )
        .optional(),
      target_id: z.string().optional(),
      resolved: z
        .object({
          messages: z
            .record(z.string(), z.object({ content: z.string().optional() }))
            .optional(),
        })
        .optional(),
    })
    .optional(),
  // In a server, the person is `member.user`; in DMs, `user`.
  member: z
    .object({ user: z.object({ id: z.string() }).optional() })
    .optional(),
  user: z.object({ id: z.string() }).optional(),
});

export type DiscordInteraction = z.infer<typeof interactionSchema>;

/** The parts of an interaction the app reads, or null when it isn't one. */
export function parseInteraction(value: unknown): DiscordInteraction | null {
  const parsed = interactionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The Discord user who ran the command. */
export function interactionUserId(
  interaction: DiscordInteraction,
): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null;
}

interface LinkButton {
  type: typeof COMPONENT_TYPE.button;
  style: typeof LINK_BUTTON_STYLE;
  label: string;
  url: string;
}

interface MessageData {
  content?: string;
  embeds?: { title: string; image: { url: string } }[];
  components?: {
    type: typeof COMPONENT_TYPE.actionRow;
    components: LinkButton[];
  }[];
  /** Always empty: nothing in a reply can ping anyone. */
  allowed_mentions: { parse: [] };
  flags?: number;
}

export type DiscordResponse =
  | { type: typeof RESPONSE_TYPE.pong }
  | { type: typeof RESPONSE_TYPE.channelMessage; data: MessageData };

export const PONG: DiscordResponse = { type: RESPONSE_TYPE.pong };

export const NOTICES = {
  help: `Use /${QR_COMMAND.name} with a link or some text. To make a code from a message, open its menu (right-click, or long-press on mobile) and choose Apps → ${MESSAGE_COMMAND.name}.`,
  empty: `Add a link or some text after /${QR_COMMAND.name} to make a QR code.`,
  emptyMessage: "That message has no text or link to make a QR code from.",
  tooLong: "That's too long for a QR code. Try a shorter link or less text.",
  tooLongToShow:
    "That's too long to show as an image in Discord. Make the QR code in the QRdx editor instead.",
  rateLimited: "You're making QR codes quickly. Try again in a minute.",
  busy: "QRdx is busy right now. Try again in a minute.",
  failed: "Something went wrong making that QR code. Try again in a moment.",
} as const;

/** Discord wraps a link in <…> when its preview is turned off. */
function unwrapDiscordLinks(text: string): string {
  return text.replace(/<(https?:\/\/[^\s<>]+)>/gi, "$1");
}

function linkButton(label: string, url: string): LinkButton | null {
  return url.length <= LINK_BUTTON_URL_MAX
    ? { type: COMPONENT_TYPE.button, style: LINK_BUTTON_STYLE, label, url }
    : null;
}

function message(
  data: Omit<MessageData, "allowed_mentions" | "components">,
  buttons: (LinkButton | null)[] = [],
): DiscordResponse {
  const row = buttons.filter((button): button is LinkButton => !!button);
  return {
    type: RESPONSE_TYPE.channelMessage,
    data: {
      ...data,
      ...(row.length > 0
        ? { components: [{ type: COMPONENT_TYPE.actionRow, components: row }] }
        : {}),
      allowed_mentions: { parse: [] },
    },
  };
}

/** A reply only the person who ran the command sees. */
export function notice(
  content: string,
  buttons: (LinkButton | null)[] = [],
): DiscordResponse {
  return message({ content, flags: EPHEMERAL }, buttons);
}

/**
 * The reply for `raw` content: the QR code with Download PNG, Download SVG
 * and Open in editor, or a private note saying why there's none.
 */
function qrReply(
  raw: string,
  options: { private: boolean; fromMessage?: boolean; origin?: string | URL },
): DiscordResponse {
  const input = readChatQrInput(raw);
  if (!input.ok) {
    if (input.reason === "too_long") return notice(NOTICES.tooLong);
    return notice(options.fromMessage ? NOTICES.emptyMessage : NOTICES.empty);
  }

  const links = chatQrLinks(input.data, options.origin);
  const editor = linkButton("Open in editor", links.editor);
  if (links.png.length > EMBED_URL_MAX) {
    return notice(NOTICES.tooLongToShow, [editor]);
  }
  return message(
    {
      embeds: [{ title: chatQrCaption(input.data), image: { url: links.png } }],
      ...(options.private ? { flags: EPHEMERAL } : {}),
    },
    [
      linkButton("Download PNG", links.png),
      linkButton("Download SVG", links.svg),
      editor,
    ],
  );
}

function optionValue(
  interaction: DiscordInteraction,
  name: string,
): unknown | undefined {
  return interaction.data?.options?.find((option) => option.name === name)
    ?.value;
}

/** The answer to an application command (/qr, Make QR code, or help). */
export function commandReply(
  interaction: DiscordInteraction,
  origin?: string | URL,
): DiscordResponse {
  const data = interaction.data;
  if (data?.type === COMMAND_TYPE.chatInput && data.name === QR_COMMAND.name) {
    const content = optionValue(interaction, QR_COMMAND.content);
    return qrReply(
      unwrapDiscordLinks(typeof content === "string" ? content : ""),
      {
        private: optionValue(interaction, QR_COMMAND.private) === true,
        origin,
      },
    );
  }

  if (
    data?.type === COMMAND_TYPE.message &&
    data.name === MESSAGE_COMMAND.name
  ) {
    const target = data.target_id
      ? data.resolved?.messages?.[data.target_id]
      : undefined;
    const text = unwrapDiscordLinks(target?.content ?? "");
    return qrReply(firstWebAddress(text) ?? text, {
      private: false,
      fromMessage: true,
      origin,
    });
  }

  return notice(NOTICES.help);
}
