import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/account/confirmation-server";
import { enforceRateLimits } from "@/lib/request-guards";
import { signInPath } from "@/lib/safe-redirect";
import {
  LINK_PAGE_PATH,
  linkTokenSecret,
  slackAppCredentials,
} from "@/lib/slack-bot/config";
import { linkPageUrl, startSlackSignIn } from "@/lib/slack-bot/link-sign-in";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";

const startLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:link-sign-in",
  limiter: slidingWindow(20, "10 m"),
});

/** A redirect that never tells the next site where the browser came from. */
const go = (url: string) => {
  const response = NextResponse.redirect(url);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
};

/**
 * GET /api/integrations/slack/link/start?t=<link token>: the confirm page's
 * "Sign in with Slack". Signed in to QRdx, with a valid link token, it sends
 * the browser to Slack's OpenID Connect sign-in (scope openid), bound to this
 * QRdx session and this token. The callback checks who Slack says it is.
 */
export async function GET(request: Request) {
  const credentials = slackAppCredentials();
  const secret = linkTokenSecret();
  if (!(credentials && secret)) {
    return new Response("Not found", { status: 404 });
  }
  const t = new URL(request.url).searchParams.get("t") ?? "";
  const token = t.slice(0, 2048);

  const session = await currentSession();
  if (!session) {
    return go(
      new URL(
        signInPath(`${LINK_PAGE_PATH}?t=${encodeURIComponent(token)}`),
        request.url,
      ).toString(),
    );
  }
  const claims = verifyLinkToken(token, secret);
  // The page says the link expired.
  if (!claims) return go(linkPageUrl(token || null));
  try {
    await enforceRateLimits([{ limiter: startLimiter, key: session.userId }]);
  } catch {
    return new Response("Too many requests. Wait a few minutes.", {
      status: 429,
    });
  }
  return go(
    await startSlackSignIn({
      clientId: credentials.clientId,
      secret,
      token,
      claims,
      session,
    }),
  );
}
