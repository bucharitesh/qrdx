import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import {
  createRateLimiter,
  fixedWindow,
  type RateLimiter,
} from "@repo/rate-limit";
import { HttpError } from "./error-response";
import { getPlanLimits, PLANS, type Plan } from "./plans";
import { PLAN_NAMES } from "./pricing";

/**
 * The daily REST API quota (PlanLimits.apiRequestsPerDay): how many /api/v1
 * requests a workspace may make in one UTC day. The count belongs to the
 * scope (a workspace, see lib/scope) and the cap comes
 * from the plan that governs it. app/api/v1/codes/_lib/api.ts decides which
 * requests count; its per-minute limits apply on top.
 *
 * Upstash outages fall back to in-memory limits per instance, like every
 * other limiter (packages/rate-limit). Without Upstash configured (self-hosted
 * without Redis) rate limiting is off, so there is no quota and no headers.
 */

/** Its own Redis prefix, apart from the "qrdx:" per-minute limiter keys. */
const API_QUOTA_PREFIX = "qrdx:api-quota";

/** Fixed window, 00:00 to 24:00 UTC. */
const API_QUOTA_WINDOW = "1 d";

// One limiter per plan over the same keys: a plan change during the day
// moves the cap, and the requests already made still count.
const limiters = Object.fromEntries(
  PLANS.map((plan) => [
    plan,
    createRateLimiter({
      prefix: API_QUOTA_PREFIX,
      limiter: fixedWindow(
        getPlanLimits(plan).apiRequestsPerDay,
        API_QUOTA_WINDOW,
      ),
    }),
  ]),
) as Record<Plan, RateLimiter>;

export interface QuotaScope {
  userId: string;
  /** null = a row from before workspaces (counted as the user's own) */
  organizationId: string | null;
}

interface ApiQuotaUsage {
  plan: Plan;
  limit: number;
  remaining: number;
  /** When the count starts over (ms since the epoch) */
  reset: number;
}

/**
 * One count per workspace. A person's own workspace keeps the per-person key
 * its usage had before workspaces, so nobody's count started over.
 */
function apiQuotaKey(scope: QuotaScope): string {
  return scope.organizationId &&
    !isOwnWorkspaceOf(scope.organizationId, scope.userId)
    ? `org:${scope.organizationId}`
    : `user:${scope.userId}`;
}

function apiQuotaHeaders(usage: ApiQuotaUsage): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(usage.limit),
    "X-RateLimit-Remaining": String(usage.remaining),
    // Unix time in seconds, like GitHub's
    "X-RateLimit-Reset": String(Math.ceil(usage.reset / 1000)),
  };
}

function apiQuotaExceeded(usage: ApiQuotaUsage): HttpError {
  const retryAfter = Math.max(1, Math.ceil((usage.reset - Date.now()) / 1000));
  const upgrade =
    usage.plan === "business" ? "" : " Upgrade your plan for a higher limit.";
  return new HttpError(
    429,
    "RATE_LIMITED",
    `Daily API limit reached: the ${PLAN_NAMES[usage.plan]} plan allows ${usage.limit.toLocaleString("en-US")} requests a day. It resets at 00:00 UTC.${upgrade}`,
    { "Retry-After": String(retryAfter), ...apiQuotaHeaders(usage) },
  );
}

/** What each counted request used, for withApiQuotaHeaders. */
const usageByRequest = new WeakMap<Request, ApiQuotaUsage>();

/**
 * Counts `req` against the scope's daily quota (`plan` is the scope's plan,
 * from getPlanForScope). Throws the 429 once the quota is used up.
 */
export async function consumeApiQuota(
  req: Request,
  scope: QuotaScope,
  plan: Plan,
): Promise<void> {
  const result = await limiters[plan].limit(apiQuotaKey(scope));
  if (!Number.isFinite(result.limit)) return;
  const usage: ApiQuotaUsage = {
    plan,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
  usageByRequest.set(req, usage);
  if (!result.success) throw apiQuotaExceeded(usage);
}

function withHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    // Immutable headers (a fetched or redirect response): copy it.
    const copy = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) {
      copy.headers.set(name, value);
    }
    return copy;
  }
}

/**
 * Wraps a /api/v1 route handler so every response to a counted request,
 * success or error, carries the X-RateLimit-* headers of the daily quota.
 */
export function withApiQuotaHeaders<R extends Request, A extends unknown[]>(
  handler: (req: R, ...rest: A) => Promise<Response>,
): (req: R, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    const response = await handler(req, ...rest);
    const usage = usageByRequest.get(req);
    return usage ? withHeaders(response, apiQuotaHeaders(usage)) : response;
  };
}
