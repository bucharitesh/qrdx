import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { botRedirectUri } from "./config";
import { SLACK_BOT_SCOPES } from "./slack-api";

// "Add the bot to Slack": its own OAuth flow beside the alerts' one (bot
// scopes only, its own callback), with the same protection: a random state
// in an httpOnly cookie for 10 minutes, compared in constant time and
// cleared on the way back.

const STATE_COOKIE = "slack_bot_oauth_state";
const MAX_AGE_SECONDS = 10 * 60;

/** Slack's authorize URL for the bot, after setting the state cookie. */
export async function startBotInstall(clientId: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  url.searchParams.set("redirect_uri", botRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

/** Reads and clears the state cookie; true when `state` matches it. */
export async function consumeBotInstallState(
  state: string | null,
): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!(state && expected)) return false;
  const received = Buffer.from(state);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}
