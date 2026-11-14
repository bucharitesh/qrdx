import { NextResponse } from "next/server";
import { connectLimiter } from "@/lib/connected-accounts/server";
import { requireUser } from "@/lib/data-connections/http";
import { SETTINGS_PATH, slackAppCredentials } from "@/lib/slack-bot/config";
import { startBotInstall } from "@/lib/slack-bot/oauth";

/**
 * GET /api/integrations/slack/bot/install: "Add the bot to Slack". Any
 * signed-in QRdx user, on any plan and without picking a workspace: the bot
 * only makes images for everyone in the Slack workspace, and tracked codes
 * need each person's own link (/qr link). Sends the person to Slack with the
 * bot scopes only; the callback stores the install.
 */
export async function GET(request: Request) {
  const credentials = slackAppCredentials();
  if (!credentials) return new Response("Not found", { status: 404 });

  const user = await requireUser(
    connectLimiter,
    "integrations:slack-bot-install",
  );
  if ("response" in user) {
    return NextResponse.redirect(
      new URL(
        user.response.status === 401
          ? SETTINGS_PATH
          : `${SETTINGS_PATH}?error=rate_limited`,
        request.url,
      ),
    );
  }
  return NextResponse.redirect(await startBotInstall(credentials.clientId));
}
