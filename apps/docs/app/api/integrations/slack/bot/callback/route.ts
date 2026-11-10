import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/connected-accounts/server";
import {
  botRedirectUri,
  SETTINGS_PATH,
  slackAppCredentials,
} from "@/lib/slack-bot/config";
import { consumeBotInstallState } from "@/lib/slack-bot/oauth";
import { exchangeBotCode } from "@/lib/slack-bot/slack-api";
import {
  SlackBotStoreUnavailableError,
  saveInstallation,
} from "@/lib/slack-bot/store";

const back = (request: Request, query: string) =>
  NextResponse.redirect(new URL(`${SETTINGS_PATH}?${query}`, request.url));

/**
 * GET /api/integrations/slack/bot/callback: Slack sends the browser back
 * here after "Add the bot to Slack". Checks the state cookie (it must be the
 * flow this browser started), exchanges the code for the bot token, stores
 * it encrypted with the Slack workspace (updating it on a reinstall) and
 * who added it, and returns to Settings → Integrations → Slack.
 */
export async function GET(request: Request) {
  const credentials = slackAppCredentials();
  if (!credentials) return new Response("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  // Before anything else, so a cancelled or forged flow can't be finished.
  const stateOk = await consumeBotInstallState(params.get("state"));
  const error = params.get("error");
  if (error) {
    return back(
      request,
      `error=${error === "access_denied" ? "slack_bot_cancelled" : "slack_bot_failed"}`,
    );
  }
  if (!stateOk) return back(request, "error=missing_verifier");
  const code = params.get("code");
  if (!code || code.length > 500) return back(request, "error=no_code");

  const userId = await getSessionUserId();
  if (!userId) return back(request, "error=unauthorized");

  try {
    const result = await exchangeBotCode({
      code,
      redirectUri: botRedirectUri(),
      ...credentials,
    });
    if (!("install" in result)) {
      console.error(
        JSON.stringify({
          event: "slack-bot.install_failed",
          error: result.ok ? "unknown" : result.error,
        }),
      );
      return back(
        request,
        `error=${!result.ok && result.error === "enterprise_install" ? "slack_bot_enterprise" : "slack_bot_failed"}`,
      );
    }
    await saveInstallation({
      ...result.install,
      installedByUserId: userId,
    });
    return back(request, "success=slack_bot_installed");
  } catch (caught) {
    if (caught instanceof SlackBotStoreUnavailableError) {
      return back(request, "error=slack_bot_unavailable");
    }
    console.error(
      JSON.stringify({
        event: "slack-bot.install_failed",
        error:
          caught instanceof Error ? caught.message.slice(0, 200) : "unknown",
      }),
    );
    return back(request, "error=slack_bot_failed");
  }
}
