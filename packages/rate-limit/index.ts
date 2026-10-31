import { Ratelimit, type RatelimitConfig } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { keys } from "./keys";

type RateLimitResponse = Awaited<ReturnType<Ratelimit["limit"]>>;

export interface RateLimiter {
  limit: (identifier: string) => Promise<RateLimitResponse>;
}

const noopRateLimiter: RateLimiter = {
  limit: async () => ({
    success: true,
    limit: Number.POSITIVE_INFINITY,
    remaining: Number.POSITIVE_INFINITY,
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
  }),
};

// Accepts the Upstash names and the Vercel KV names (KV_REST_API_*).
function getUpstashCredentials(): { url: string; token: string } | null {
  const env = keys();
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

const credentials = getUpstashCredentials();

// One quick retry at most: a dead Upstash should fail fast (the limiter fails open).
export const redis = credentials
  ? new Redis({ ...credentials, retry: { retries: 1, backoff: () => 50 } })
  : null;

let warnedNoopInProduction = false;

// After a failed call, skip Upstash for a while so every request doesn't pay for it.
const UPSTASH_FAILURE_COOLDOWN_MS = 5 * 60_000;
let upstashUnavailableUntil = 0;

export const createRateLimiter = (
  props: Omit<RatelimitConfig, "redis">
): RateLimiter => {
  if (!redis) {
    if (process.env.NODE_ENV === "production" && !warnedNoopInProduction) {
      warnedNoopInProduction = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) not set: rate limiting is disabled."
      );
    }
    return noopRateLimiter;
  }

  const ratelimit = new Ratelimit({
    redis,
    limiter: props.limiter ?? Ratelimit.slidingWindow(10, "10 s"),
    prefix: props.prefix ?? "qrdx",
    // Upstash allows the request itself when a check takes longer than this.
    timeout: 1000,
  });

  return {
    limit: async (identifier: string) => {
      if (Date.now() < upstashUnavailableUntil) {
        return noopRateLimiter.limit(identifier);
      }
      try {
        const result = await ratelimit.limit(identifier);
        if (result.reason === "timeout") {
          // Upstash already allowed this request; back off like a failure.
          upstashUnavailableUntil = Date.now() + UPSTASH_FAILURE_COOLDOWN_MS;
          console.error(
            "[rate-limit] Upstash timed out; allowing requests without rate limiting for 5 minutes."
          );
        }
        return result;
      } catch (error) {
        // Fail open: an unreachable Upstash must never take routes (or QR
        // redirects) down. Cost-sensitive quotas are enforced in the database.
        upstashUnavailableUntil = Date.now() + UPSTASH_FAILURE_COOLDOWN_MS;
        console.error(
          "[rate-limit] Upstash unavailable; allowing requests without rate limiting for 5 minutes:",
          error instanceof Error ? error.message : error
        );
        return noopRateLimiter.limit(identifier);
      }
    },
  };
};

export const { slidingWindow } = Ratelimit;
