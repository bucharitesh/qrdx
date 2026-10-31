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

export const redis = credentials ? new Redis(credentials) : null;

let warnedNoopInProduction = false;

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
  });

  return {
    limit: async (identifier: string) => {
      try {
        return await ratelimit.limit(identifier);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[rate-limit] Upstash unavailable, allowing request in development:",
            error instanceof Error ? error.message : error
          );
          return noopRateLimiter.limit(identifier);
        }
        throw error;
      }
    },
  };
};

export const { slidingWindow } = Ratelimit;
