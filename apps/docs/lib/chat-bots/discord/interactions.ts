import "server-only";

import { z } from "zod";
import {
  chatQrCaption,
  firstWebAddress,
  readChatQrInput,
} from "@/lib/chat-bots/qr-reply";
import {
  applyChoice,
  type ChatDesign,
  type ChatStyleChoice,
  chatDesignLinks,
  checkForReply,
  PICKER_LABELS,
  PICKERS,
  type Picker,
  pickerChoice,
  pickerOptions,
  readChatQrLink,
  STYLE_NOTES,
} from "@/lib/chat-bots/styles";
import { COMMAND_TYPE, MESSAGE_COMMAND, QR_COMMAND } from "./commands";

// What the Discord app answers. A plain code goes back as the response to
// Discord's request (type 4, within its 3 second window). A styled code
// needs the scan check first (lib/chat-bots/styles.ts), which can take
// longer, so the response says "thinking" (type 5, or type 6 for a pick in
// a code's style menus) and the code follows through the interaction's own
// webhook (followup.ts). Neither needs a bot token. The QR code is an embed
// whose image is the keyless image API link: Discord fetches the PNG itself.
//
// The style menus under a code carry the Discord id of the person who made
// it, and a pick reads the content and design back from the embed's image
// link: no state on QRdx's side. Nothing here logs or keeps what people send.

export const INTERACTION_TYPE = {
  ping: 1,
  applicationCommand: 2,
  messageComponent: 3,
} as const;

const RESPONSE_TYPE = {
  pong: 1,
  channelMessage: 4,
  deferredChannelMessage: 5,
  deferredUpdateMessage: 6,
} as const;
const COMPONENT_TYPE = { actionRow: 1, button: 2, stringSelect: 3 } as const;
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

const optionSchema = z.object({
  name: z.string(),
  type: z.number().int(),
  value: z.unknown().optional(),
});

const interactionSchema = z.object({
  type: z.number().int(),
  /** The interaction's token, for its follow-up webhook (15 minutes). */
  token: z.string().optional(),
  data: z
    .object({
      name: z.string().optional(),
      type: z.number().int().optional(),
      options: z.array(optionSchema).optional(),
      target_id: z.string().optional(),
      resolved: z
        .object({
          messages: z
            .record(z.string(), z.object({ content: z.string().optional() }))
            .optional(),
        })
        .optional(),
      // A pick in a select menu
      custom_id: z.string().optional(),
      component_type: z.number().int().optional(),
      values: z.array(z.string()).optional(),
    })
    .optional(),
  // The message a component is on
  message: z
    .object({
      embeds: z
        .array(z.object({ image: z.object({ url: z.string() }).optional() }))
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

/** The Discord user who ran the command or used the menu. */
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

interface StringSelect {
  type: typeof COMPONENT_TYPE.stringSelect;
  custom_id: string;
  placeholder: string;
  options: { label: string; value: string }[];
}

interface ActionRow {
  type: typeof COMPONENT_TYPE.actionRow;
  components: (LinkButton | StringSelect)[];
}

export interface MessageData {
  content?: string;
  embeds?: { title: string; description?: string; image: { url: string } }[];
  components?: ActionRow[];
  /** Always empty: nothing in a reply can ping anyone. */
  allowed_mentions: { parse: [] };
  flags?: number;
}

export type DiscordResponse =
  | { type: typeof RESPONSE_TYPE.pong }
  | { type: typeof RESPONSE_TYPE.channelMessage; data: MessageData }
  | {
      type: typeof RESPONSE_TYPE.deferredChannelMessage;
      data?: { flags: number };
    }
  | { type: typeof RESPONSE_TYPE.deferredUpdateMessage };

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
  notYours: `Only the person who made this code can restyle it. Make your own with /${QR_COMMAND.name}.`,
  cantRestyle: `This code can't be restyled. Make a new one with /${QR_COMMAND.name}.`,
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

const row = (components: ActionRow["components"]): ActionRow => ({
  type: COMPONENT_TYPE.actionRow,
  components,
});

/** A note only the person who ran the command sees, as message data. */
function noticeData(
  content: string,
  buttons: (LinkButton | null)[] = [],
): MessageData {
  const links = buttons.filter((button): button is LinkButton => !!button);
  return {
    content,
    flags: EPHEMERAL,
    ...(links.length > 0 ? { components: [row(links)] } : {}),
    allowed_mentions: { parse: [] },
  };
}

/** A reply only the person who ran the command sees. */
export function notice(
  content: string,
  buttons: (LinkButton | null)[] = [],
): DiscordResponse {
  return {
    type: RESPONSE_TYPE.channelMessage,
    data: noticeData(content, buttons),
  };
}

// ── Style menus ─────────────────────────────────────────────────────────────

/** Discord's ids (snowflakes). */
const SNOWFLAKE = /^\d{1,25}$/;

/** custom_id of a style menu: the picker and who made the code. */
const STYLE_MENU = /^qrdx_(look|color|frame|logo):(\d{1,25})$/;

const styleMenuId = (picker: Picker, maker: string) =>
  `qrdx_${picker}:${maker}`;

/** Look, Color, Frame and Logo menus, one per row, for `maker` to use. */
function styleMenus(maker: string): ActionRow[] {
  return PICKERS.map((picker) =>
    row([
      {
        type: COMPONENT_TYPE.stringSelect,
        custom_id: styleMenuId(picker, maker),
        placeholder: PICKER_LABELS[picker],
        options: pickerOptions(picker).map((option) => ({
          label: option.label,
          value: option.id,
        })),
      },
    ]),
  );
}

/**
 * The code for `data` in `design`: the embed, the link buttons Discord
 * accepts and, with a `maker`, the style menus. Null when the image link is
 * too long for Discord.
 */
function codeMessage(
  data: string,
  design: ChatDesign | null,
  {
    maker,
    note,
    flags,
  }: { maker?: string | null; note?: string | null; flags?: number },
): MessageData | null {
  const links = chatDesignLinks(data, design);
  if (links.png.length > EMBED_URL_MAX) return null;
  const buttons = [
    linkButton("Download PNG", links.png),
    linkButton("Download SVG", links.svg),
    linkButton("Open in editor", links.editor),
  ].filter((button): button is LinkButton => !!button);
  const components = [
    ...(buttons.length > 0 ? [row(buttons)] : []),
    ...(maker && SNOWFLAKE.test(maker) ? styleMenus(maker) : []),
  ];
  return {
    embeds: [
      {
        title: chatQrCaption(data),
        ...(note ? { description: note } : {}),
        image: { url: links.png },
      },
    ],
    ...(components.length > 0 ? { components } : {}),
    allowed_mentions: { parse: [] },
    ...(flags ? { flags } : {}),
  };
}

/** The "too long to show" note, with the editor button when it fits. */
function tooLongToShow(data: string, design: ChatDesign | null): MessageData {
  return noticeData(NOTICES.tooLongToShow, [
    linkButton("Open in editor", chatDesignLinks(data, design).editor),
  ]);
}

/**
 * What to answer: a response now, or a "thinking" response and the message
 * that follows it once the scan check is done (the route sends it through
 * the interaction's webhook).
 */
export type DiscordPlan =
  | { kind: "reply"; response: DiscordResponse }
  | {
      kind: "deferred";
      response: DiscordResponse;
      /** The message that replaces "thinking"; it never throws on bad input. */
      followUp: () => Promise<MessageData>;
    };

const reply = (response: DiscordResponse): DiscordPlan => ({
  kind: "reply",
  response,
});

/**
 * The scan-checked message for a styled code, to replace "thinking" (its
 * visibility was set by the deferred response).
 */
async function styledMessage(
  data: string,
  design: ChatDesign,
  maker: string | null,
): Promise<MessageData> {
  const checked = await checkForReply(data, design, "discord-bot");
  const note = checked.note ? STYLE_NOTES[checked.note] : null;
  return (
    codeMessage(data, checked.design, { maker, note }) ??
    tooLongToShow(data, checked.design)
  );
}

/**
 * The plan for `raw` content: the QR code with Download PNG, Download SVG,
 * Open in editor and the style menus, or a private note saying why there's
 * none. A design is scan-checked first, so it's deferred.
 */
function qrPlan(
  raw: string,
  options: {
    private: boolean;
    fromMessage?: boolean;
    maker: string | null;
    choice?: ChatStyleChoice | null;
  },
): DiscordPlan {
  const input = readChatQrInput(raw);
  if (!input.ok) {
    if (input.reason === "too_long") return reply(notice(NOTICES.tooLong));
    return reply(
      notice(options.fromMessage ? NOTICES.emptyMessage : NOTICES.empty),
    );
  }
  const flags = options.private ? EPHEMERAL : undefined;
  const design = options.choice ? applyChoice(null, options.choice) : null;
  // The design as asked is at least as long as the checked one.
  const now = codeMessage(input.data, design, { maker: options.maker, flags });
  if (!now) {
    return reply({
      type: RESPONSE_TYPE.channelMessage,
      data: tooLongToShow(input.data, design),
    });
  }
  if (!design) {
    return reply({ type: RESPONSE_TYPE.channelMessage, data: now });
  }
  return {
    kind: "deferred",
    response: {
      type: RESPONSE_TYPE.deferredChannelMessage,
      ...(flags ? { data: { flags } } : {}),
    },
    followUp: () => styledMessage(input.data, design, options.maker),
  };
}

function optionValue(
  interaction: DiscordInteraction,
  name: string,
): unknown | undefined {
  return interaction.data?.options?.find((option) => option.name === name)
    ?.value;
}

/** /qr's look, color and frame options, as one choice. */
function styleOptions(interaction: DiscordInteraction): ChatStyleChoice | null {
  const choice: ChatStyleChoice = {};
  for (const [picker, name] of [
    ["look", QR_COMMAND.look],
    ["color", QR_COMMAND.color],
    ["frame", QR_COMMAND.frame],
  ] as const) {
    const value = optionValue(interaction, name);
    if (value === undefined) continue;
    Object.assign(choice, pickerChoice(picker, value) ?? {});
  }
  return Object.keys(choice).length > 0 ? choice : null;
}

/** A pick in a code's style menus. */
function restylePlan(interaction: DiscordInteraction): DiscordPlan {
  const menu = STYLE_MENU.exec(interaction.data?.custom_id ?? "");
  const picker = menu?.[1] as Picker | undefined;
  const choice = picker
    ? pickerChoice(picker, interaction.data?.values?.[0])
    : null;
  if (!(menu && choice)) return reply(notice(NOTICES.cantRestyle));
  const maker = menu[2] as string;
  if (interactionUserId(interaction) !== maker) {
    return reply(notice(NOTICES.notYours));
  }
  const current = readChatQrLink(interaction.message?.embeds?.[0]?.image?.url);
  if (!current) return reply(notice(NOTICES.cantRestyle));
  const next = applyChoice(current.design, choice);
  return {
    kind: "deferred",
    response: { type: RESPONSE_TYPE.deferredUpdateMessage },
    followUp: async () =>
      next
        ? styledMessage(current.data, next, maker)
        : (codeMessage(current.data, null, { maker }) ??
          tooLongToShow(current.data, null)),
  };
}

/**
 * The plan for an application command (/qr, Make QR code, or help) or a
 * pick in a code's style menus.
 */
export function interactionPlan(interaction: DiscordInteraction): DiscordPlan {
  if (interaction.type === INTERACTION_TYPE.messageComponent) {
    return restylePlan(interaction);
  }
  const data = interaction.data;
  const maker = interactionUserId(interaction);
  if (data?.type === COMMAND_TYPE.chatInput && data.name === QR_COMMAND.name) {
    const content = optionValue(interaction, QR_COMMAND.content);
    return qrPlan(
      unwrapDiscordLinks(typeof content === "string" ? content : ""),
      {
        private: optionValue(interaction, QR_COMMAND.private) === true,
        maker,
        choice: styleOptions(interaction),
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
    return qrPlan(firstWebAddress(text) ?? text, {
      private: false,
      fromMessage: true,
      maker,
    });
  }

  return reply(notice(NOTICES.help));
}
