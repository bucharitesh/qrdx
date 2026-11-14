import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { isAvatarKey } from "@/lib/account/avatar";
import { getClientIp } from "@/lib/request-guards";
import {
  isStorageConfigured,
  presignDownload,
  publicUrl,
} from "@/lib/storage/r2";

// Profile pictures uploaded in Settings → Account, when the bucket has no
// public URL (R2_PUBLIC_BASE_URL): a redirect to a short-lived signed URL.
// Keys are unguessable per upload, so a replaced picture's old link dies
// with its object.

const ipLimiter = createRateLimiter({ limiter: slidingWindow(300, "60 s") });

const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; file: string }> },
) {
  const { userId, file } = await params;
  const key = `avatars/${userId}/${file}`;
  if (!(isStorageConfigured && isAvatarKey(key))) {
    return new Response("Not found", { status: 404 });
  }
  const { success } = await ipLimiter.limit(`avatar:${getClientIp(request)}`);
  if (!success) return new Response("Too many requests", { status: 429 });

  const location =
    publicUrl(key) ??
    (await presignDownload(key, { expiresIn: SIGNED_URL_SECONDS }));
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Shorter than the signed URL, so a cached redirect never points at an expired one.
      "Cache-Control": "public, max-age=1800",
      "Referrer-Policy": "no-referrer",
    },
  });
}
