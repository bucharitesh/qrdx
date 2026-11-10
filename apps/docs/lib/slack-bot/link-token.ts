import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// The token in /qr link's button (<app>/integrations/slack/link?t=…): who
// asked, in which Slack workspace, and the names to show on the confirm
// screen, signed so nobody can change them, valid for 10 minutes. It only
// travels in an ephemeral message or a direct message, which only that
// Slack person sees. The key is derived from BETTER_AUTH_SECRET with HKDF
// and an info string of its own, so it's never the secret itself and no
// other token QRdx signs can pass for one of these.

export const LINK_TOKEN_MINUTES = 10;
const INFO = "qrdx:slack-bot:link-token:v1";
const NAME_MAX = 80;
const ID = /^[A-Z0-9]{2,32}$/;

export interface SlackLinkClaims {
  /** Slack workspace id (T…) */
  teamId: string;
  /** Slack user id (U… or W…) */
  slackUserId: string;
  /** As Slack sent them, for the confirm screen only */
  teamName: string;
  userName: string;
  /** Expiry, in seconds since the epoch */
  exp: number;
}

/** The signing key for `secret` (BETTER_AUTH_SECRET). */
export function linkTokenKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

const sign = (key: Buffer, payload: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");

const clip = (value: string) => value.trim().slice(0, NAME_MAX);

export function signLinkToken(
  claims: Omit<SlackLinkClaims, "exp">,
  secret: string,
  now: number = Date.now(),
): string {
  const body: SlackLinkClaims = {
    teamId: claims.teamId,
    slackUserId: claims.slackUserId,
    teamName: clip(claims.teamName),
    userName: clip(claims.userName),
    exp: Math.floor(now / 1000) + LINK_TOKEN_MINUTES * 60,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(linkTokenKey(secret), payload)}`;
}

/** The claims of a valid, unexpired token, else null. */
export function verifyLinkToken(
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): SlackLinkClaims | null {
  if (!(token && secret) || token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!(payload && signature) || extra !== undefined) return null;
  const expected = Buffer.from(sign(linkTokenKey(secret), payload));
  const received = Buffer.from(signature);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }
  let claims: Partial<SlackLinkClaims>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !(
      typeof claims.teamId === "string" &&
      ID.test(claims.teamId) &&
      typeof claims.slackUserId === "string" &&
      ID.test(claims.slackUserId) &&
      typeof claims.teamName === "string" &&
      typeof claims.userName === "string" &&
      typeof claims.exp === "number"
    )
  ) {
    return null;
  }
  if (claims.exp * 1000 <= now) return null;
  return claims as SlackLinkClaims;
}
