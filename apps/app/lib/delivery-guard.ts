import "server-only";

import { env } from "@/env";

/**
 * Local dev, preview deployments and localhost production builds all use the
 * real (shared) database, so they must never email people or call customers'
 * webhook/Slack/Discord endpoints. Set QRDX_ALLOW_DEV_DELIVERY=1 to opt in.
 */
export function isOutboundDeliveryAllowed(): boolean {
  if (process.env.QRDX_ALLOW_DEV_DELIVERY === "1") {
    return true;
  }
  if (env.VERCEL_ENV) {
    return env.VERCEL_ENV === "production";
  }
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(
    env.NEXT_PUBLIC_APP_URL,
  );
}
