import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Webhook signatures, Stripe-style:
//   X-QRdx-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// Receivers recompute the HMAC over the raw body and reject old timestamps.

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function signatureHeader(
  secret: string,
  body: string,
  now: Date = new Date(),
): { header: string; timestamp: number } {
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    header: `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`,
    timestamp,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Receiver-side check (documented in /docs/webhooks; used by the tests). */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  {
    now = new Date(),
    toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
  }: { now?: Date; toleranceSeconds?: number } = {},
): boolean {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }
  const expected = signPayload(secret, timestamp, body);
  return signatures.some((signature) => safeEqualHex(signature, expected));
}

/** Shows only the start of a secret ("whsec_AbC…"). */
export function maskSecret(secret: string): string {
  return `${secret.slice(0, 10)}…`;
}
