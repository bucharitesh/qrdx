import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { baseUrl } from "@/lib/metadata";
import { isNotificationEvent, type NotificationEvent } from "./types";

// Signed, non-expiring unsubscribe links for alert and digest emails. A token
// names one notification_setting row and one event ("all" = every email).

export type UnsubscribeScope = NotificationEvent | "all";

export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  cachedKey ??= createHash("sha256")
    .update(
      `qrdx:unsubscribe:${process.env.BETTER_AUTH_SECRET ?? "development"}`,
    )
    .digest();
  return cachedKey;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest()
    .subarray(0, 18)
    .toString("base64url");
}

export function createUnsubscribeToken(
  settingId: string,
  event: UnsubscribeScope,
): string {
  const payload = Buffer.from(`${settingId}:${event}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { settingId: string; event: UnsubscribeScope } | null {
  if (token.length > 300) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf(":");
  const settingId = decoded.slice(0, separator);
  const event = decoded.slice(separator + 1);
  if (!settingId || !(event === "all" || isNotificationEvent(event))) {
    return null;
  }
  return { settingId, event };
}

export function unsubscribeUrl(
  settingId: string,
  event: UnsubscribeScope,
): string {
  const url = new URL(UNSUBSCRIBE_PATH, baseUrl.origin);
  url.searchParams.set("token", createUnsubscribeToken(settingId, event));
  return url.toString();
}
