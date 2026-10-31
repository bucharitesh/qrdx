import "server-only";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";

const userLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });
const ipLimiter = createRateLimiter({ limiter: slidingWindow(120, "60 s") });

export const NO_STORE = { "Cache-Control": "no-store" };
export const MAX_BODY_BYTES = 8 * 1024;

/** Upload calls come from our own pages only (cookie auth, so no CSRF). */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    // Treated as cross-origin below.
  }
  const allowed = [
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
    baseUrl.host,
  ];
  if (!(host && allowed.includes(host))) {
    throw new HttpError(403, "FORBIDDEN", "Cross-origin request rejected.");
  }
}

function assertJson(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a JSON body with Content-Type: application/json.",
    );
  }
}

/** Session scope for a files API call, rate limited per user and IP. */
export async function resolveUploadScope(
  req: Request,
  { write = true }: { write?: boolean } = {},
): Promise<ActiveScope> {
  if (write) {
    assertSameOrigin(req);
    assertJson(req);
  }
  const scope = await getActiveScope(req.headers);
  await enforceRateLimits([
    { limiter: userLimiter, key: `files:upload:user:${scope.userId}` },
    { limiter: ipLimiter, key: `files:upload:ip:${getClientIp(req)}` },
  ]);
  return scope;
}
