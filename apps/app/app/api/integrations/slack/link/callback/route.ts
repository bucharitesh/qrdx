import { NextResponse } from "next/server";
import { currentSession } from "@/lib/account/confirmation-server";
import { linkTokenSecret, slackAppCredentials } from "@/lib/slack-bot/config";
import type { SlackSignInError } from "@/lib/slack-bot/link-proof";
import {
  confirmSlackIdentity,
  grantLinkProof,
  linkPageUrl,
  takeSlackSignIn,
} from "@/lib/slack-bot/link-sign-in";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";

/** Why it was refused, for the logs: codes only, never a value. */
function logRefusal(reason: SlackSignInError, detail: string) {
  console.error(
    JSON.stringify({
      event: "slack-bot.link_sign_in_refused",
      reason,
      detail: /^[a-z0-9_.]{1,60}$/i.test(detail) ? detail : "other",
    }),
  );
}

const back = (token: string | null, error?: SlackSignInError) => {
  const response = NextResponse.redirect(linkPageUrl(token, error));
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
};

/**
 * GET /api/integrations/slack/link/callback: Slack sends the browser back
 * here after "Sign in with Slack" on the confirm page. The flow cookie must
 * be this browser's and match `state`, and the QRdx session must be the one
 * that started it. Then the code is exchanged and the identity Slack
 * reports (the id_token and userInfo) must be exactly the link token's Slack
 * user and workspace. Only then does this session get the proof that
 * Confirm needs, for this link token. Every refusal goes back to the confirm
 * page with the reason; nothing is linked here.
 */
export async function GET(request: Request) {
  const credentials = slackAppCredentials();
  const secret = linkTokenSecret();
  if (!(credentials && secret)) {
    return new Response("Not found", { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  // Before anything else, so a cancelled or forged flow can't be finished.
  const taken = await takeSlackSignIn(params.get("state"), secret);
  const token = taken.flow?.token ?? null;

  const slackError = params.get("error");
  if (slackError && taken.flow) {
    const reason = slackError === "access_denied" ? "cancelled" : "failed";
    if (reason === "failed") logRefusal(reason, slackError);
    return back(token, reason);
  }
  if (!taken.ok) {
    logRefusal("state", taken.flow ? "state_mismatch" : "no_flow");
    return back(token, "state");
  }
  const { flow } = taken;
  const session = await currentSession();
  if (
    !session ||
    session.userId !== flow.userId ||
    session.sessionId !== flow.sessionId
  ) {
    logRefusal("state", "other_session");
    return back(token, "state");
  }
  const claims = verifyLinkToken(flow.token, secret);
  // The page says the link expired.
  if (!claims) return back(token);
  const code = params.get("code");
  if (!code || code.length > 500) {
    logRefusal("failed", "no_code");
    return back(token, "failed");
  }

  const identity = await confirmSlackIdentity({
    code,
    nonce: flow.nonce,
    claims,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  });
  if (!identity.ok) {
    logRefusal(identity.reason, identity.detail);
    return back(token, identity.reason);
  }
  await grantLinkProof(
    {
      userId: session.userId,
      sessionId: session.sessionId,
      token: flow.token,
      claims,
    },
    secret,
  );
  return back(token);
}
