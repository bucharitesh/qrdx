import { after } from "next/server";
import { readSlackRequest } from "@/lib/slack-bot/config";
import { handleEvent, type SlackEventPayload } from "@/lib/slack-bot/events";

// Replies (and tracked codes) are posted after Slack has its 200.
export const maxDuration = 30;

const ok = () => new Response(null, { status: 200 });

/**
 * POST /api/integrations/slack/events: the Events API. Answers Slack's
 * url_verification challenge; acknowledges everything else at once and
 * handles it after the response (mentions, direct messages, the app being
 * removed). A retry (X-Slack-Retry-Num) is acknowledged and dropped, so a
 * slow first attempt never makes the bot reply twice.
 */
export async function POST(request: Request) {
  const read = await readSlackRequest(request);
  if (!read.ok) return read.response;

  let payload: SlackEventPayload & { challenge?: unknown };
  try {
    payload = JSON.parse(read.body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return new Response("Bad request", { status: 400 });
  }

  if (payload.type === "url_verification") {
    const challenge = payload.challenge;
    if (typeof challenge !== "string" || challenge.length > 256) {
      return new Response("Bad request", { status: 400 });
    }
    return Response.json({ challenge });
  }
  if (request.headers.has("x-slack-retry-num")) return ok();
  if (payload.type === "event_callback") after(() => handleEvent(payload));
  return ok();
}
