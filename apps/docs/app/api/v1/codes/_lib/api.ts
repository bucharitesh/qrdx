import "server-only";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { validateAccessToken } from "@/lib/oauth";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";

export type ApiAccess = "read" | "write";

/** OAuth scopes that grant each access level (write implies read). */
const SCOPES_FOR: Record<ApiAccess, string[]> = {
  read: ["codes:read", "codes:write"],
  write: ["codes:write"],
};

const readLimiter = createRateLimiter({ limiter: slidingWindow(120, "60 s") });
const writeLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });
const ipLimiter = createRateLimiter({ limiter: slidingWindow(300, "60 s") });

/** Cookie-authenticated writes must come from our own pages (CSRF). */
function assertSameOrigin(req: NextRequest) {
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

/**
 * Resolves who is calling: an OAuth bearer token (acts on the user's personal
 * workspace) or the browser session (acts on the active team or personal
 * workspace). Applies per-user and per-IP rate limits.
 */
export async function resolveApiScope(
  req: NextRequest,
  access: ApiAccess,
): Promise<ActiveScope> {
  const authorization = req.headers.get("authorization");
  let scope: ActiveScope;

  if (authorization?.startsWith("Bearer ")) {
    const token = await validateAccessToken(authorization.slice(7).trim());
    if (!token) {
      throw new HttpError(401, "INVALID_TOKEN", "Invalid or expired token.");
    }
    if (!SCOPES_FOR[access].some((s) => token.scopes.includes(s))) {
      throw new HttpError(
        403,
        "INSUFFICIENT_SCOPE",
        `This token needs the 'codes:${access}' scope.`,
      );
    }
    scope = { userId: token.userId, organizationId: null, role: "owner" };
  } else {
    if (access === "write") assertSameOrigin(req);
    scope = await getActiveScope(req.headers);
  }

  await enforceRateLimits([
    {
      limiter: access === "write" ? writeLimiter : readLimiter,
      key: `api:codes:${access}:user:${scope.userId}`,
    },
    { limiter: ipLimiter, key: `api:codes:ip:${getClientIp(req)}` },
  ]);
  return scope;
}

/** Mutations take JSON only (also keeps simple cross-site form posts out). */
export function assertJson(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a JSON body with Content-Type: application/json.",
    );
  }
}

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Public JSON shape of a dynamic code. */
export function serializeCode(code: QrCodeView) {
  return {
    id: code.id,
    slug: code.slug,
    shortLink: code.shortLink,
    defaultShortLink: code.defaultShortLink,
    domain: code.domain
      ? {
          id: code.domain.id,
          hostname: code.domain.hostname,
          verified: code.domain.verified,
        }
      : null,
    destinationUrl: code.destinationUrl,
    title: code.title,
    contentType: code.contentType,
    status: code.status,
    style: code.style,
    scanCount: code.scanCount,
    lastScannedAt: code.lastScannedAt?.toISOString() ?? null,
    archivedAt: code.archivedAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
    updatedAt: code.updatedAt.toISOString(),
    organizationId: code.organizationId,
  };
}

export const NO_STORE = { "Cache-Control": "no-store" };
