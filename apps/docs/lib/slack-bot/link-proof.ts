import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { SlackLinkClaims } from "./link-token";

// Proving the Slack identity before a link is made (/qr link's confirm page).
// The person signs in with Slack (OpenID Connect, scope openid) and Slack
// tells QRdx which Slack user and workspace they are. Only when both equal
// the link token's can Confirm link them, so a link that leaked, or one an
// attacker made for their own Slack account and sent on, is useless to
// anyone else.
//
// Two short-lived httpOnly cookies carry the state, each signed with a key
// derived from BETTER_AUTH_SECRET (HKDF, an info string of its own, like the
// link token):
//
// - the sign-in flow: the OAuth state and nonce, the QRdx user and session
//   that started it and the link token, read and cleared by the callback;
// - the proof: this QRdx user and session signed in with Slack as the
//   token's Slack user in the token's workspace, for this one link token.
//
// Pure: no cookies, no network (lib/slack-bot/link-sign-in.ts does those).

export const SIGN_IN_MINUTES = 10;
export const PROOF_MINUTES = 10;

const FLOW_INFO = "qrdx:slack-bot:link-sign-in:v1";
const PROOF_INFO = "qrdx:slack-bot:link-proof:v1";
const MAX_VALUE = 3800;

const key = (secret: string, info: string) =>
  Buffer.from(hkdfSync("sha256", secret, "", info, 32));

const mac = (secret: string, info: string, payload: string) =>
  createHmac("sha256", key(secret, info)).update(payload).digest("base64url");

/** True when both strings are equal, compared in constant time. */
export function sameSecret(
  received: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!(received && expected)) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function seal(data: object, secret: string, info: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${mac(secret, info, payload)}`;
}

function open(
  value: string | null | undefined,
  secret: string,
  info: string,
): Record<string, unknown> | null {
  if (!(value && secret) || value.length > MAX_VALUE) return null;
  const [payload, signature, extra] = value.split(".");
  if (!(payload && signature) || extra !== undefined) return null;
  if (!sameSecret(signature, mac(secret, info, payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isText = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/** A link token's fingerprint: the proof holds this, never the token. */
export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

// ─── The sign-in flow ────────────────────────────────────────────────────────

export interface SlackSignInFlow {
  /** The OAuth state sent to Slack */
  state: string;
  /** The OpenID nonce sent to Slack, which the id_token must carry */
  nonce: string;
  /** The QRdx user and session that started it */
  userId: string;
  sessionId: string;
  /** The link token it's for (to check the identity and to go back) */
  token: string;
  /** Expiry, in seconds since the epoch */
  exp: number;
}

export function sealSignInFlow(
  flow: Omit<SlackSignInFlow, "exp">,
  secret: string,
  now: number = Date.now(),
): string {
  return seal(
    { ...flow, exp: Math.floor(now / 1000) + SIGN_IN_MINUTES * 60 },
    secret,
    FLOW_INFO,
  );
}

export function openSignInFlow(
  value: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): SlackSignInFlow | null {
  const data = open(value, secret, FLOW_INFO);
  if (
    !(
      data &&
      isText(data.state) &&
      isText(data.nonce) &&
      isText(data.userId) &&
      isText(data.sessionId) &&
      isText(data.token, 2048) &&
      typeof data.exp === "number"
    )
  ) {
    return null;
  }
  if (data.exp * 1000 <= now) return null;
  return data as unknown as SlackSignInFlow;
}

// ─── The proof ───────────────────────────────────────────────────────────────

/** Who signed in with Slack, as whom, for which link token. */
export interface SlackLinkProofFor {
  userId: string;
  sessionId: string;
  token: string;
  claims: Pick<SlackLinkClaims, "teamId" | "slackUserId">;
}

export function sealLinkProof(
  proof: SlackLinkProofFor,
  secret: string,
  now: number = Date.now(),
): string {
  return seal(
    {
      userId: proof.userId,
      sessionId: proof.sessionId,
      teamId: proof.claims.teamId,
      slackUserId: proof.claims.slackUserId,
      token: tokenDigest(proof.token),
      exp: Math.floor(now / 1000) + PROOF_MINUTES * 60,
    },
    secret,
    PROOF_INFO,
  );
}

/**
 * True when the cookie proves that this QRdx user, in this session, signed
 * in with Slack as the token's Slack user in its workspace, for this very
 * token, less than PROOF_MINUTES ago.
 */
export function proofMatches(
  value: string | null | undefined,
  secret: string,
  expected: SlackLinkProofFor,
  now: number = Date.now(),
): boolean {
  const data = open(value, secret, PROOF_INFO);
  if (!data || typeof data.exp !== "number" || data.exp * 1000 <= now) {
    return false;
  }
  return (
    data.userId === expected.userId &&
    data.sessionId === expected.sessionId &&
    data.teamId === expected.claims.teamId &&
    data.slackUserId === expected.claims.slackUserId &&
    sameSecret(
      typeof data.token === "string" ? data.token : null,
      tokenDigest(expected.token),
    )
  );
}

// ─── What Slack says ─────────────────────────────────────────────────────────

export const SLACK_ISSUER = "https://slack.com";
const TEAM_CLAIM = "https://slack.com/team_id";
const USER_CLAIM = "https://slack.com/user_id";

/** The Slack workspace and user in an id_token's or userInfo's claims. */
export function slackIdentityOf(
  claims: Record<string, unknown> | null | undefined,
): { teamId: string; slackUserId: string } | null {
  const teamId = claims?.[TEAM_CLAIM];
  const slackUserId = claims?.[USER_CLAIM];
  return isText(teamId, 64) && isText(slackUserId, 64)
    ? { teamId, slackUserId }
    : null;
}

export type IdTokenProblem =
  /** Not a JWT, or a claim is missing */
  | "invalid"
  | "issuer"
  | "audience"
  | "expired"
  /** Not issued for this sign-in */
  | "nonce"
  /** Another Slack user or workspace than the link token's */
  | "different_person";

/**
 * Checks the id_token from openid.connect.token. It comes straight from
 * Slack's token endpoint over TLS, so (as OpenID Connect Core 3.1.3.7 allows)
 * TLS stands in for checking its signature; its claims are checked here:
 * Slack issued it, to this app, it hasn't expired, it carries this sign-in's
 * nonce, and it names exactly the link token's Slack user and workspace.
 */
export function checkSlackIdToken(
  idToken: unknown,
  expected: {
    clientId: string;
    nonce: string;
    teamId: string;
    slackUserId: string;
  },
  now: number = Date.now(),
): { ok: true } | { ok: false; problem: IdTokenProblem } {
  const fail = (problem: IdTokenProblem) => ({ ok: false as const, problem });
  if (typeof idToken !== "string" || idToken.length > 8192) {
    return fail("invalid");
  }
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) return fail("invalid");
  let claims: Record<string, unknown>;
  try {
    const parsed = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("invalid");
    }
    claims = parsed as Record<string, unknown>;
  } catch {
    return fail("invalid");
  }
  if (claims.iss !== SLACK_ISSUER) return fail("issuer");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audience.length !== 1 || audience[0] !== expected.clientId) {
    return fail("audience");
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) {
    return fail("expired");
  }
  if (!sameSecret(isText(claims.nonce) ? claims.nonce : null, expected.nonce)) {
    return fail("nonce");
  }
  const identity = slackIdentityOf(claims);
  if (!identity) return fail("invalid");
  if (
    identity.teamId !== expected.teamId ||
    identity.slackUserId !== expected.slackUserId
  ) {
    return fail("different_person");
  }
  return { ok: true };
}

// ─── What the confirm page says ──────────────────────────────────────────────

/** Why a Slack sign-in didn't prove the identity (?slack= on the page). */
export type SlackSignInError = "cancelled" | "state" | "mismatch" | "failed";

export const SLACK_SIGN_IN_ERRORS: Record<SlackSignInError, string> = {
  cancelled:
    "You didn't finish signing in with Slack, so nothing was linked. Sign in with Slack to continue.",
  state:
    "That Slack sign-in didn't start on this page, or it took too long. Sign in with Slack again.",
  mismatch:
    "You signed in to Slack as a different person than the one who asked to link.",
  failed:
    "Slack couldn't confirm which account you signed in with. Try signing in with Slack again.",
};

export function isSlackSignInError(value: unknown): value is SlackSignInError {
  return (
    typeof value === "string" && Object.hasOwn(SLACK_SIGN_IN_ERRORS, value)
  );
}
