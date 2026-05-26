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

function isUpstashConfigured() {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = keys();
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

export const redis = isUpstashConfigured()
  ? new Redis({
      url: keys().UPSTASH_REDIS_REST_URL!,
      token: keys().UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export const createRateLimiter = (
  props: Omit<RatelimitConfig, "redis">,
): RateLimiter => {
  if (!redis) {
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
            error instanceof Error ? error.message : error,
          );
          return noopRateLimiter.limit(identifier);
        }
        throw error;
      }
    },
  };
};

export const { slidingWindow } = Ratelimit;
