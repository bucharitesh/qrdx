import { createHmac, timingSafeEqual } from "node:crypto";

// Every request Slack sends the bot (slash commands, events, interactions)
// is signed with the app's signing secret: X-Slack-Signature is
// "v0=" + hex HMAC-SHA256 of "v0:<X-Slack-Request-Timestamp>:<raw body>".
// It is checked on the raw bytes before anything is parsed, in constant
// time, and a timestamp more than five minutes away from now is refused so
// a captured request can't be replayed later.
// https://api.slack.com/authentication/verifying-requests-from-slack

/** How far a request's timestamp may be from now, in seconds. */
export const SLACK_MAX_SKEW_SECONDS = 5 * 60;

export type SlackSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "stale" | "invalid" };

export function verifySlackSignature({
  secret,
  rawBody,
  timestamp,
  signature,
  now = Date.now(),
}: {
  secret: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}): SlackSignatureCheck {
  if (!(secret && timestamp && signature)) {
    return { ok: false, reason: "missing" };
  }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "invalid" };
  const age = Math.abs(now / 1000 - Number(timestamp));
  if (age > SLACK_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  if (!signature.startsWith("v0=")) return { ok: false, reason: "invalid" };

  const expected = Buffer.from(signSlackRequest(secret, rawBody, timestamp));
  const received = Buffer.from(signature);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

/** Signs a body the way Slack does (tests and local tools). */
export function signSlackRequest(
  secret: string,
  rawBody: string,
  timestamp: string,
): string {
  return `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
}
