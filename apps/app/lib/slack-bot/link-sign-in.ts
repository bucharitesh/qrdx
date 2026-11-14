import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { absoluteUrl, LINK_PAGE_PATH } from "./config";
import {
  checkSlackIdToken,
  type IdTokenProblem,
  openSignInFlow,
  PROOF_MINUTES,
  proofMatches,
  SIGN_IN_MINUTES,
  type SlackLinkProofFor,
  type SlackSignInError,
  type SlackSignInFlow,
  sameSecret,
  sealLinkProof,
  sealSignInFlow,
  slackIdentityOf,
} from "./link-proof";
import type { SlackLinkClaims } from "./link-token";
import { exchangeOpenIdCode, fetchOpenIdUserInfo } from "./slack-api";

// Sign in with Slack on /qr link's confirm page (./link-proof.ts explains
// why). Its own OpenID Connect flow beside the two installs: scope openid
// only, its own callback, and the state, nonce, QRdx session and link token
// in a signed httpOnly cookie for 10 minutes, the way lib/integration-oauth.ts
// keeps an install's state. The callback reads and clears it, checks what
// Slack says, and on a match leaves a proof cookie that Confirm requires.
// Slack's access token is used once, for userInfo, and never kept or logged.

export const LINK_START_PATH = "/api/integrations/slack/link/start";
const LINK_CALLBACK_PATH = "/api/integrations/slack/link/callback";
const FLOW_COOKIE = "slack_link_sign_in";
const PROOF_COOKIE = "slack_link_proof";

const cookieOptions = (minutes: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: minutes * 60,
  path: "/",
});

/** Where Slack sends the browser back: <app url>/api/integrations/slack/link/callback. */
export function linkCallbackUri(): string {
  return absoluteUrl(LINK_CALLBACK_PATH);
}

/** The confirm page for `token`, with why a sign-in failed, if it did. */
export function linkPageUrl(
  token: string | null,
  error?: SlackSignInError,
): string {
  const query = new URLSearchParams();
  if (token) query.set("t", token);
  if (error) query.set("slack", error);
  const search = query.toString();
  return absoluteUrl(search ? `${LINK_PAGE_PATH}?${search}` : LINK_PAGE_PATH);
}

/** The "Sign in with Slack" button's link for `token`. */
export const signInHref = (token: string) =>
  `${LINK_START_PATH}?t=${encodeURIComponent(token)}`;

/**
 * Slack's authorize URL for signing in as the token's Slack user, after
 * setting the flow cookie. `team` asks Slack to open that workspace; what
 * comes back is checked anyway.
 */
export async function startSlackSignIn(input: {
  clientId: string;
  secret: string;
  token: string;
  claims: Pick<SlackLinkClaims, "teamId">;
  session: { userId: string; sessionId: string };
}): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  (await cookies()).set(
    FLOW_COOKIE,
    sealSignInFlow(
      {
        state,
        nonce,
        userId: input.session.userId,
        sessionId: input.session.sessionId,
        token: input.token,
      },
      input.secret,
    ),
    cookieOptions(SIGN_IN_MINUTES),
  );
  const url = new URL("https://slack.com/openid/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", linkCallbackUri());
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("team", input.claims.teamId);
  return url.toString();
}

/**
 * Reads and clears the flow cookie: the flow, when it's this browser's,
 * signed and unexpired, and `state` is the one it sent to Slack; else why
 * not ("missing": there's no flow at all, so no link token to go back to).
 */
export async function takeSlackSignIn(
  state: string | null,
  secret: string,
): Promise<
  | { ok: true; flow: SlackSignInFlow }
  | { ok: false; flow: SlackSignInFlow | null }
> {
  const store = await cookies();
  const flow = openSignInFlow(store.get(FLOW_COOKIE)?.value, secret);
  store.delete(FLOW_COOKIE);
  if (!flow) return { ok: false, flow: null };
  return sameSecret(state, flow.state)
    ? { ok: true, flow }
    : { ok: false, flow };
}

export type SlackIdentityResult =
  | { ok: true }
  | {
      ok: false;
      reason: SlackSignInError;
      /** For the logs: an id_token problem or Slack's error code, never a value */
      detail: IdTokenProblem | string;
    };

/**
 * Exchanges the code and checks that the person signed in to Slack as the
 * link token's Slack user in its workspace: the id_token (issuer, audience,
 * expiry, nonce, team and user), then userInfo, which must agree.
 */
export async function confirmSlackIdentity(input: {
  code: string;
  nonce: string;
  claims: Pick<SlackLinkClaims, "teamId" | "slackUserId">;
  clientId: string;
  clientSecret: string;
}): Promise<SlackIdentityResult> {
  const exchanged = await exchangeOpenIdCode({
    code: input.code,
    redirectUri: linkCallbackUri(),
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });
  if (!exchanged.ok) {
    return { ok: false, reason: "failed", detail: exchanged.error };
  }
  const checked = checkSlackIdToken(exchanged.idToken, {
    clientId: input.clientId,
    nonce: input.nonce,
    teamId: input.claims.teamId,
    slackUserId: input.claims.slackUserId,
  });
  if (!checked.ok) {
    return {
      ok: false,
      reason:
        checked.problem === "different_person"
          ? "mismatch"
          : checked.problem === "nonce"
            ? "state"
            : "failed",
      detail: checked.problem,
    };
  }
  const info = await fetchOpenIdUserInfo(exchanged.accessToken);
  if (!info.ok) return { ok: false, reason: "failed", detail: info.error };
  const identity = slackIdentityOf(info.claims);
  if (!identity) {
    return { ok: false, reason: "failed", detail: "userinfo_claims_missing" };
  }
  if (
    identity.teamId !== input.claims.teamId ||
    identity.slackUserId !== input.claims.slackUserId
  ) {
    return { ok: false, reason: "mismatch", detail: "userinfo_mismatch" };
  }
  return { ok: true };
}

/** Records the proof for this session and this link token only. */
export async function grantLinkProof(
  proof: SlackLinkProofFor,
  secret: string,
): Promise<void> {
  (await cookies()).set(
    PROOF_COOKIE,
    sealLinkProof(proof, secret),
    cookieOptions(PROOF_MINUTES),
  );
}

/** True when this session signed in with Slack as the token's Slack user. */
export async function hasLinkProof(
  proof: SlackLinkProofFor,
  secret: string,
): Promise<boolean> {
  return proofMatches(
    (await cookies()).get(PROOF_COOKIE)?.value,
    secret,
    proof,
  );
}

/** Used up: a link was made with it. */
export async function clearLinkProof(): Promise<void> {
  (await cookies()).delete(PROOF_COOKIE);
}
