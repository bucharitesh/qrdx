import "server-only";

import { readChatQrInput } from "@/lib/chat-bots/qr-reply";
import { parseLinkUrl } from "@/lib/playground-links";
import { logError } from "@/lib/shared";
import {
  absoluteUrl,
  LINK_PAGE_PATH,
  linkTokenSecret,
  SETTINGS_PATH,
} from "./config";
import { signLinkToken } from "./link-token";
import {
  helpMessage,
  noteMessage,
  noteWithButton,
  qrMessage,
  type SlackMessage,
  TOO_LONG_TEXT,
  tooLongForSlack,
  trackedMessage,
} from "./messages";
import { isSlackResponseUrl } from "./slack-api";
import {
  deleteUserLink,
  findInstallation,
  findUserLink,
  SlackBotStoreUnavailableError,
  type SlackTeamRef,
} from "./store";
import { splitCommand } from "./text";
import { createTrackedCode } from "./track";

// What the bot answers, wherever it was asked (/qr, a mention, a direct
// message): help, link, unlink, track, or a QR code of the text. The routes
// decide how the answer is delivered; `private` answers (help, errors, the
// link button) are only ever shown to the person who asked.

export interface BotAsk {
  team: SlackTeamRef;
  /** For the link page's "in <team>" (as Slack sent it) */
  teamName: string;
  slackUserId: string;
  /** For the link page's "Slack user <name>" (as Slack sent it) */
  userName: string;
  /** What they typed, already plain text (readSlackText) */
  text: string;
}

export type BotAnswer =
  | { kind: "message"; message: SlackMessage; private: boolean }
  /** Make a tracked code: slow, so it's done after the reply (runTrack). */
  | { kind: "track"; url: string };

const ID = /^[A-Z0-9]{2,32}$/;

/** The slash command fields the bot reads (application/x-www-form-urlencoded). */
export function readSlashCommand(body: string) {
  const form = new URLSearchParams(body);
  const teamId = form.get("team_id") ?? "";
  const userId = form.get("user_id") ?? "";
  const responseUrl = form.get("response_url") ?? "";
  if (
    !(ID.test(teamId) && ID.test(userId) && isSlackResponseUrl(responseUrl))
  ) {
    return null;
  }
  const enterpriseId = form.get("enterprise_id");
  return {
    team: {
      teamId,
      enterpriseId: enterpriseId && ID.test(enterpriseId) ? enterpriseId : null,
    },
    teamName: form.get("team_domain") ?? "",
    userId,
    userName: form.get("user_name") ?? "",
    text: form.get("text") ?? "",
    responseUrl,
  };
}

const privately = (message: SlackMessage): BotAnswer => ({
  kind: "message",
  message: { ...message, response_type: "ephemeral" },
  private: true,
});

const UNAVAILABLE =
  "Linking QRdx accounts isn't available yet. QR codes with /qr work in the meantime.";

/** The "Link your QRdx account" button, bound to this Slack person. */
async function linkPrompt(ask: BotAsk, lead: string): Promise<SlackMessage> {
  const installation = await findInstallation(ask.team);
  if (!installation) {
    return noteWithButton(
      "The QRdx bot hasn't been added to this Slack workspace yet. Someone with a QRdx account can add it in Settings → Integrations → Slack; then try again.",
      {
        label: "Open QRdx settings",
        url: absoluteUrl(SETTINGS_PATH),
        actionId: "qrdx_settings",
      },
    );
  }
  const secret = linkTokenSecret();
  if (!secret) return noteMessage(UNAVAILABLE);
  const token = signLinkToken(
    {
      teamId: ask.team.teamId,
      slackUserId: ask.slackUserId,
      teamName: installation.teamName ?? ask.teamName,
      userName: ask.userName,
    },
    secret,
  );
  return noteWithButton(
    `${lead} The button works for 10 minutes and only links your Slack account.`,
    {
      label: "Link QRdx account",
      url: absoluteUrl(`${LINK_PAGE_PATH}?t=${encodeURIComponent(token)}`),
      actionId: "qrdx_link",
    },
  );
}

/** The QR code for typed content, or why there isn't one. */
export function contentAnswer(text: string): BotAnswer {
  const input = readChatQrInput(text);
  if (!input.ok) {
    return input.reason === "empty"
      ? privately(helpMessage())
      : privately(noteMessage(TOO_LONG_TEXT));
  }
  const message = qrMessage(input.data);
  return message
    ? { kind: "message", message, private: false }
    : privately(tooLongForSlack());
}

export async function answer(ask: BotAsk): Promise<BotAnswer> {
  const { word, rest } = splitCommand(ask.text);
  try {
    switch (word) {
      case "":
      case "help":
        return privately(helpMessage());
      case "link":
        return privately(
          await linkPrompt(
            ask,
            "Link your QRdx account to make tracked codes with /qr track. You'll pick the QRdx workspace they go to.",
          ),
        );
      case "unlink":
        return privately(
          noteMessage(
            (await deleteUserLink(ask.team.teamId, ask.slackUserId))
              ? "Unlinked. /qr track won't make codes in QRdx until you link again."
              : "There's no QRdx account linked to you in this Slack workspace.",
          ),
        );
      case "track": {
        const url = parseLinkUrl(rest);
        if (!url) {
          return privately(
            noteMessage(
              "Add one web address after track, starting with https:// or http://, like /qr track https://qrdx.dev",
            ),
          );
        }
        if (!(await findUserLink(ask.team.teamId, ask.slackUserId))) {
          return privately(
            await linkPrompt(
              ask,
              "Link your QRdx account first: tracked codes are made in your QRdx workspace.",
            ),
          );
        }
        return { kind: "track", url };
      }
      default:
        return contentAnswer(ask.text);
    }
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return privately(noteMessage(UNAVAILABLE));
    }
    logError(error as Error, { action: "slack-bot.answer" });
    return privately(noteMessage("Something went wrong. Try again."));
  }
}

/**
 * Makes the tracked code and returns the message to post: the code for the
 * channel, or a private note saying what stopped it.
 */
export async function runTrack(
  ask: BotAsk,
  url: string,
): Promise<{ message: SlackMessage; private: boolean }> {
  const result = await createTrackedCode({
    teamId: ask.team.teamId,
    slackUserId: ask.slackUserId,
    url,
  });
  if (result.ok) {
    const message = trackedMessage(result);
    return message
      ? { message, private: false }
      : { message: tooLongForSlack(), private: true };
  }
  if (result.reason === "not_linked") {
    try {
      return { message: await linkPrompt(ask, result.message), private: true };
    } catch {
      return { message: noteMessage(UNAVAILABLE), private: true };
    }
  }
  if (result.upgradeUrl) {
    return {
      message: noteWithButton(result.message, {
        label: "See plans",
        url: result.upgradeUrl,
        actionId: "qrdx_upgrade",
      }),
      private: true,
    };
  }
  return { message: noteMessage(result.message), private: true };
}
