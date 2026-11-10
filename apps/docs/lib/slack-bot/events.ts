import "server-only";

import { firstWebAddress } from "@/lib/chat-bots/qr-reply";
import { logError } from "@/lib/shared";
import { answer, type BotAsk, contentAnswer, runTrack } from "./bot";
import { withinSlackLimits } from "./config";
import { noteMessage, type SlackMessage } from "./messages";
import {
  isSlackResponseUrl,
  postEphemeral,
  postMessage,
  postToResponseUrl,
  type SlackResult,
} from "./slack-api";
import {
  findBotToken,
  forgetTeam,
  SlackBotStoreUnavailableError,
  type SlackTeamRef,
} from "./store";
import { readSlackText } from "./text";

// The Events API (POST /api/integrations/slack/events) and the message
// shortcut (POST /api/integrations/slack/interactions), after the route has
// checked the signature and answered Slack. Runs in after(), so a slow reply
// never makes Slack retry; retries are ignored by the route.

const SLOW_DOWN = "You're going a little fast. Wait a minute and try again.";

/** The payload fields the bot reads; everything else is ignored. */
export interface SlackEventPayload {
  type?: string;
  team_id?: string;
  enterprise_id?: string | null;
  authorizations?: { team_id?: string; enterprise_id?: string | null }[];
  event?: SlackEvent;
}

export interface SlackEvent {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  edited?: unknown;
  tokens?: { bot?: string[]; oauth?: string[] };
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9]{2,32}$/.test(value);

/** The Slack workspace the bot is installed in that this event is for. */
function eventTeam(payload: SlackEventPayload): SlackTeamRef | null {
  const authorization = payload.authorizations?.[0];
  const teamId = authorization?.team_id ?? payload.team_id;
  if (!isId(teamId)) return null;
  const enterpriseId = authorization?.enterprise_id ?? payload.enterprise_id;
  return { teamId, enterpriseId: isId(enterpriseId) ? enterpriseId : null };
}

/**
 * Messages the bot never answers: from bots (itself included), edits,
 * joins and every other subtype, and anything without a person or channel.
 */
function isIgnoredMessage(event: SlackEvent, botUserId: string): boolean {
  return Boolean(
    event.bot_id ||
      event.subtype ||
      event.edited ||
      !isId(event.user) ||
      event.user === botUserId ||
      !isId(event.channel),
  );
}

function logPostFailure(result: SlackResult, where: string) {
  if (!result.ok) {
    // The Slack error code only: never the message or a token.
    console.error(
      JSON.stringify({
        event: "slack-bot.post_failed",
        where,
        error: result.error,
      }),
    );
  }
}

/** Mentions reply in the thread; direct messages reply in the DM. */
async function replyTo(
  team: SlackTeamRef,
  event: SlackEvent,
  where: "mention" | "dm",
): Promise<void> {
  const bot = await findBotToken(team);
  if (!bot || isIgnoredMessage(event, bot.botUserId)) return;
  const user = event.user as string;
  const channel = event.channel as string;
  const threadTs =
    where === "mention" ? (event.thread_ts ?? event.ts) : undefined;

  const send = async (message: SlackMessage, isPrivate: boolean) => {
    // In a DM only they see it anyway; in a channel, private answers are
    // ephemeral (the link button is bound to this person).
    const result =
      isPrivate && where === "mention"
        ? await postEphemeral(bot.token, { channel, user, threadTs }, message)
        : await postMessage(bot.token, { channel, threadTs }, message);
    logPostFailure(result, where);
  };

  if (!(await withinSlackLimits(team.teamId, user))) {
    await send(noteMessage(SLOW_DOWN), true);
    return;
  }
  const ask: BotAsk = {
    team,
    teamName: "",
    slackUserId: user,
    // Events carry no names; the link page shows the Slack user id.
    userName: "",
    text: readSlackText(event.text, bot.botUserId),
  };
  const result = await answer(ask);
  if (result.kind === "message") {
    await send(result.message, result.private);
    return;
  }
  const done = await runTrack(ask, result.url);
  await send(done.message, done.private);
}

export async function handleEvent(payload: SlackEventPayload): Promise<void> {
  const event = payload.event;
  const team = eventTeam(payload);
  if (!(event && team)) return;
  try {
    switch (event.type) {
      case "app_uninstalled":
        await forgetTeam(team);
        return;
      case "tokens_revoked":
        // The bot token is the only one QRdx keeps.
        if (event.tokens?.bot?.length) await forgetTeam(team);
        return;
      case "app_mention":
        await replyTo(team, event, "mention");
        return;
      case "message":
        if (event.channel_type === "im") await replyTo(team, event, "dm");
        return;
      default:
        return;
    }
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) return;
    logError(error as Error, {
      action: "slack-bot.event",
      type: String(event.type).slice(0, 40),
    });
  }
}

// ─── The message shortcut ────────────────────────────────────────────────────

export const MAKE_QR_CALLBACK_ID = "qrdx_make_qr";

/** The shortcut payload fields the bot reads. */
export interface SlackShortcutPayload {
  type?: string;
  callback_id?: string;
  team?: { id?: string; enterprise_id?: string | null };
  enterprise?: { id?: string } | null;
  user?: { id?: string };
  channel?: { id?: string };
  message?: { text?: string; ts?: string; thread_ts?: string };
  response_url?: string;
}

/**
 * "Make a QR code" on a message: a code of its first web address, else of
 * its text, as a reply in the message's thread. Where the bot can't post
 * (it isn't in that channel), only the person who asked sees the code.
 */
export async function handleShortcut(
  payload: SlackShortcutPayload,
): Promise<void> {
  const teamId = payload.team?.id;
  const user = payload.user?.id;
  const channel = payload.channel?.id;
  const responseUrl = payload.response_url;
  if (!(isId(teamId) && isId(user) && isSlackResponseUrl(responseUrl))) return;
  const enterpriseId = payload.enterprise?.id ?? payload.team?.enterprise_id;
  const team: SlackTeamRef = {
    teamId,
    enterpriseId: isId(enterpriseId) ? enterpriseId : null,
  };
  const privately = async (message: SlackMessage) =>
    logPostFailure(
      await postToResponseUrl(responseUrl, {
        ...message,
        response_type: "ephemeral",
      }),
      "shortcut",
    );

  try {
    if (!(await withinSlackLimits(team.teamId, user))) {
      await privately(noteMessage(SLOW_DOWN));
      return;
    }
    const bot = await findBotToken(team).catch((error) => {
      if (error instanceof SlackBotStoreUnavailableError) return null;
      throw error;
    });
    const text = readSlackText(payload.message?.text, bot?.botUserId);
    if (!text) {
      await privately(
        noteMessage("That message has no text to make a QR code from."),
      );
      return;
    }
    const result = contentAnswer(firstWebAddress(text) ?? text);
    if (result.kind !== "message") return;
    if (result.private) {
      await privately(result.message);
      return;
    }
    const threadTs = payload.message?.thread_ts ?? payload.message?.ts;
    if (bot && isId(channel)) {
      const posted = await postMessage(
        bot.token,
        { channel, threadTs },
        result.message,
      );
      if (posted.ok) return;
      logPostFailure(posted, "shortcut");
    }
    await privately({
      ...result.message,
      blocks: [
        ...(result.message.blocks ?? []),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Only you can see this. Add the QRdx app to this channel to reply in threads.",
            },
          ],
        },
      ],
    });
  } catch (error) {
    logError(error as Error, { action: "slack-bot.shortcut" });
  }
}
