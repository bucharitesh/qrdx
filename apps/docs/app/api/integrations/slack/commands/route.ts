import { after } from "next/server";
import {
  answer,
  type BotAsk,
  readSlashCommand,
  runTrack,
  styledReply,
} from "@/lib/slack-bot/bot";
import {
  BUSY_TEXT,
  readSlackRequest,
  SLOW_DOWN_TEXT,
  slackLimitFor,
  withinTrackCap,
} from "@/lib/slack-bot/config";
import { noteMessage, type SlackMessage } from "@/lib/slack-bot/messages";
import { postToResponseUrl } from "@/lib/slack-bot/slack-api";
import { readSlackText } from "@/lib/slack-bot/text";

// Styled and tracked codes finish after the reply, through response_url.
export const maxDuration = 30;

/**
 * POST /api/integrations/slack/commands: /qr. Slack wants an answer within
 * 3 seconds, so it goes in this response: a QR code for the channel
 * (in_channel), or help, errors and the link button for the person who
 * typed it (ephemeral). A styled code (/qr qrdx.dev --look modern) needs
 * its scan check first, so the response is empty and the code follows
 * through response_url. /qr track is acknowledged here and finished through
 * response_url after the response: the code for the channel, then its
 * dashboard link for the person alone.
 */
export async function POST(request: Request) {
  const read = await readSlackRequest(request);
  if (!read.ok) return read.response;
  const command = readSlashCommand(read.body);
  if (!command) return new Response("Bad request", { status: 400 });

  const limit = await slackLimitFor(command.team.teamId, command.userId);
  if (limit !== "ok") {
    return Response.json(
      noteMessage(limit === "busy" ? BUSY_TEXT : SLOW_DOWN_TEXT),
    );
  }

  const ask: BotAsk = {
    team: command.team,
    teamName: command.teamName,
    slackUserId: command.userId,
    userName: command.userName,
    text: readSlackText(command.text),
  };
  const result = await answer(ask);
  if (result.kind === "message") return Response.json(result.message);

  const post = async (message: SlackMessage) => {
    const posted = await postToResponseUrl(command.responseUrl, message);
    if (!posted.ok) {
      console.error(
        JSON.stringify({
          event: "slack-bot.post_failed",
          where: "command",
          error: posted.error,
        }),
      );
    }
    return posted.ok;
  };
  if (result.kind === "styled") {
    after(async () => {
      const styled = await styledReply(
        result.data,
        result.design,
        result.maker,
      );
      await post({
        ...styled.message,
        response_type: styled.private ? "ephemeral" : "in_channel",
      });
    });
    return new Response(null, { status: 200 });
  }
  if (!(await withinTrackCap())) return Response.json(noteMessage(BUSY_TEXT));

  after(async () => {
    const done = await runTrack(ask, result.url);
    if ((await post(done.message)) && done.followUp) {
      await post({ ...done.followUp, response_type: "ephemeral" });
    }
  });
  return Response.json(noteMessage("Making your tracked code…"));
}
