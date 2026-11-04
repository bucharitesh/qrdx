import "server-only";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { COMMUNITY_API_TTL } from "@/lib/community/api";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";

// Shared by the public, read-only /v1/community routes: open CORS, a per-IP
// limit, and caching a little shorter than the server's own cache so a
// takedown reaches readers within minutes.

const ipLimiter = createRateLimiter({ limiter: slidingWindow(120, "60 s") });

export const COMMUNITY_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

/** Browsers and CDNs: a minute fresh, then served stale while refetched. */
export const COMMUNITY_CACHE = {
  "Cache-Control": `public, max-age=60, stale-while-revalidate=${COMMUNITY_API_TTL}`,
  "CDN-Cache-Control": `public, max-age=${COMMUNITY_API_TTL}, stale-while-revalidate=3600`,
};

export function limitCommunityReads(req: Request): Promise<void> {
  return enforceRateLimits([
    { limiter: ipLimiter, key: `api:community:ip:${getClientIp(req)}` },
  ]);
}

/** Errors keep CORS (so browsers can read them) and are never cached. */
export function withCommunityCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(COMMUNITY_CORS)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
