import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { recordApiRequest } from "@/lib/analytics/usage";
import { unknownEndpointError } from "@/lib/api-errors";
import { handleError } from "@/lib/error-response";
import { getClientIp } from "@/lib/request-guards";

// Any /v1 path without its own route (qrdx.dev/api/v1/... and, through the
// next.config rewrite, api.qrdx.dev/v1/...): a JSON 404 in the API's error
// shape instead of the site's HTML 404 page. Real routes are more specific,
// so they always win over this catch-all.

type Context = { params: Promise<{ missing?: string[] }> };

async function notFound(req: NextRequest, { params }: Context) {
  const { missing = [] } = await params;
  const path = `/v1${missing.length ? `/${missing.join("/")}` : ""}`;
  return handleError(unknownEndpointError(req.method, path.slice(0, 200)));
}

// Counted with the API's requests (lib/analytics/usage.ts), as "unknown", up
// to 30 a minute per IP. Past that the 404 is still sent, uncounted, so a
// client looping on a wrong path doesn't cost a write per request.
const countLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

async function withinCountLimit(req: NextRequest): Promise<boolean> {
  try {
    const { success } = await countLimiter.limit(
      `v1:unknown:ip:${getClientIp(req)}`,
    );
    return success;
  } catch {
    return true;
  }
}

async function counted(req: NextRequest, context: Context) {
  const response = await notFound(req, context);
  if (await withinCountLimit(req)) {
    recordApiRequest("unknown", req, response.status);
  }
  return response;
}

export const GET = counted;
export const POST = counted;
export const PUT = counted;
export const PATCH = counted;
export const DELETE = counted;
