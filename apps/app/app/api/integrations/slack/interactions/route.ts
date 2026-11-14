import { after } from "next/server";
import { readSlackRequest } from "@/lib/slack-bot/config";
import {
  handleShortcut,
  MAKE_QR_CALLBACK_ID,
  type SlackShortcutPayload,
} from "@/lib/slack-bot/events";
import {
  handleStyleAction,
  type SlackBlockActionsPayload,
  styleActionOf,
} from "@/lib/slack-bot/restyle";

// The shortcut's reply and a restyled code are posted after Slack has its 200.
export const maxDuration = 30;

const ok = () => new Response(null, { status: 200 });

/**
 * POST /api/integrations/slack/interactions: the "Make a QR code" message
 * shortcut, the style menus under a code (lib/slack-bot/restyle.ts) and the
 * bot's buttons. The buttons are plain links, which Slack reports here too;
 * they only need the 200.
 */
export async function POST(request: Request) {
  const read = await readSlackRequest(request);
  if (!read.ok) return read.response;

  let payload: SlackShortcutPayload & SlackBlockActionsPayload;
  try {
    payload = JSON.parse(new URLSearchParams(read.body).get("payload") ?? "");
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return new Response("Bad request", { status: 400 });
  }

  if (
    payload.type === "message_action" &&
    payload.callback_id === MAKE_QR_CALLBACK_ID
  ) {
    after(() => handleShortcut(payload));
  } else if (styleActionOf(payload)) {
    after(() => handleStyleAction(payload));
  }
  return ok();
}
