import "server-only";

import { recordUsage } from "@/lib/analytics/usage";
import {
  applyChoice,
  PICKERS,
  type Picker,
  pickerChoice,
  readChatQrLink,
} from "@/lib/chat-bots/styles";
import { baseUrl } from "@/lib/metadata";
import { logError } from "@/lib/shared";
import { styledReply } from "./bot";
import { BUSY_TEXT, SLOW_DOWN_TEXT, slackLimitFor } from "./config";
import {
  noteMessage,
  qrMessage,
  type SlackMessage,
  STYLE_BLOCK_PREFIX,
  styleActionId,
  tooLongForSlack,
} from "./messages";
import { isSlackResponseUrl, postToResponseUrl } from "./slack-api";

// The style menus under a code (Look, Color, Frame, Logo): a pick arrives
// as a block_actions interaction, after the route has checked Slack's
// signature and answered. There's no state on QRdx's side: the content and
// current design come back from the message's own Download PNG link, and
// the person who made the code from the menus' block_id. The new code
// replaces the message through the interaction's response_url. Runs in
// after().

/** The block_actions fields a style pick needs; everything else is ignored. */
export interface SlackBlockActionsPayload {
  type?: string;
  team?: { id?: string } | null;
  user?: { id?: string };
  response_url?: string;
  message?: { blocks?: unknown[] };
  actions?: {
    action_id?: string;
    block_id?: string;
    selected_option?: { value?: string } | null;
  }[];
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9]{2,32}$/.test(value);

/** Someone else's code: the menus are only for the person who made it. */
export const NOT_YOURS_TEXT =
  "Only the person who made this code can restyle it. Make your own with /qr.";

const CANT_RESTYLE_TEXT =
  "This code can't be restyled. Make a new one with /qr.";

/** The style menu a pick came from, or null when it's another action. */
export function styleActionOf(
  payload: SlackBlockActionsPayload,
): { picker: Picker; value: string; maker: string | null } | null {
  if (payload.type !== "block_actions") return null;
  const action = payload.actions?.[0];
  const picker = PICKERS.find(
    (name) => styleActionId(name) === action?.action_id,
  );
  const value = action?.selected_option?.value;
  if (!(picker && typeof value === "string")) return null;
  const blockId = action?.block_id ?? "";
  const maker = blockId.startsWith(STYLE_BLOCK_PREFIX)
    ? blockId.slice(STYLE_BLOCK_PREFIX.length)
    : null;
  return { picker, value, maker: isId(maker) ? maker : null };
}

/** The Download PNG link of one of the bot's codes, from its blocks. */
function pngLinkOf(blocks: unknown[] | undefined): string | null {
  for (const block of blocks ?? []) {
    const { type, elements } = (block ?? {}) as {
      type?: unknown;
      elements?: unknown;
    };
    if (type !== "actions" || !Array.isArray(elements)) continue;
    for (const element of elements) {
      const { action_id: actionId, url } = (element ?? {}) as {
        action_id?: unknown;
        url?: unknown;
      };
      if (actionId === "qrdx_png" && typeof url === "string") return url;
    }
  }
  return null;
}

/**
 * Restyles a code from a pick in its menus: for the person who made it, the
 * message is replaced by the new code (scan-checked); anyone else gets a
 * note only they can see. Picks count toward the same limits as /qr.
 */
export async function handleStyleAction(
  payload: SlackBlockActionsPayload,
): Promise<void> {
  const action = styleActionOf(payload);
  const teamId = payload.team?.id;
  const user = payload.user?.id;
  const responseUrl = payload.response_url;
  if (!(action && isId(teamId) && isId(user))) return;
  if (!isSlackResponseUrl(responseUrl)) return;
  recordUsage("slack", "command", "restyle");

  const reply = async (message: SlackMessage, replace = false) => {
    const posted = await postToResponseUrl(responseUrl, {
      ...message,
      ...(replace
        ? { replace_original: true }
        : { response_type: "ephemeral", replace_original: false }),
    });
    if (!posted.ok) {
      // Slack's error code only: never the message or a token.
      console.error(
        JSON.stringify({
          event: "slack-bot.post_failed",
          where: "restyle",
          error: posted.error,
        }),
      );
    }
  };

  try {
    const limit = await slackLimitFor(teamId, user);
    if (limit !== "ok") {
      await reply(noteMessage(limit === "busy" ? BUSY_TEXT : SLOW_DOWN_TEXT));
      return;
    }
    if (action.maker !== user) {
      await reply(noteMessage(NOT_YOURS_TEXT));
      return;
    }
    const current = readChatQrLink(pngLinkOf(payload.message?.blocks));
    const choice = pickerChoice(action.picker, action.value);
    if (!(current && choice)) {
      await reply(noteMessage(CANT_RESTYLE_TEXT));
      return;
    }
    const next = applyChoice(current.design, choice);
    if (next) {
      const styled = await styledReply(current.data, next, user);
      await reply(styled.message, !styled.private);
      return;
    }
    // Back to the plain code, which needs no check.
    const plain = qrMessage(current.data, baseUrl, { maker: user });
    await reply(plain ?? tooLongForSlack(), Boolean(plain));
  } catch (error) {
    logError(error as Error, { action: "slack-bot.restyle" });
    recordUsage("slack", "error", "restyle");
  }
}
