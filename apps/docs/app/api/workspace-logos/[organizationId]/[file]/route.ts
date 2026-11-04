import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/request-guards";
import {
  isStorageConfigured,
  presignDownload,
  publicUrl,
} from "@/lib/storage/r2";
import { isWorkspaceLogoKey } from "@/lib/workspace-logo";

// Workspace logos uploaded in Settings → General, when the bucket has no
// public URL (R2_PUBLIC_BASE_URL): a redirect to a short-lived signed URL,
// like profile pictures (/api/avatars). Keys are unguessable per upload, so
// a replaced logo's old link dies with its object.

const ipLimiter = createRateLimiter({ limiter: slidingWindow(300, "60 s") });

const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string; file: string }> },
) {
  const { organizationId, file } = await params;
  const key = `workspace-logos/${organizationId}/${file}`;
  if (!(isStorageConfigured && isWorkspaceLogoKey(key))) {
    return new Response("Not found", { status: 404 });
  }
  const { success } = await ipLimiter.limit(
    `workspace-logo:${getClientIp(request)}`,
  );
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
