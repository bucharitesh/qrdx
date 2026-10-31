import "server-only";

import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (same as apps/api). */
export function isAuthorizedCronRequest(request: Request): boolean {
  if (!env.CRON_SECRET) {
    // Fail closed in production so jobs can't be triggered publicly.
    return process.env.NODE_ENV !== "production";
  }
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export const unauthorized = () =>
  new Response("Unauthorized", {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
