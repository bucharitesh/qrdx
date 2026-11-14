import { Ratelimit, type RatelimitConfig } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
  createCircuitBreaker,
  createMemoryLimiter,
  type LimitResult,
  parseDuration,
  withFallback,
} from "./fallback";
import { keys } from "./keys";

export {
  createCircuitBreaker,
  createMemoryLimiter,
  parseDuration,
  withFallback,
} from "./fallback";

type RateLimitResponse = Awaited<ReturnType<Ratelimit["limit"]>>;

export interface RateLimiter {
  /**
   * Counts one request against `identifier`'s window, or `rate` of them (one
   * HTTP request that does several requests' work, such as a JSON-RPC batch).
   */
  limit: (identifier: string, rate?: number) => Promise<RateLimitResponse>;
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

// One quick retry at most: a dead Upstash should fail fast (the breaker
// below then moves limits to memory).
export const redis = credentials
  ? new Redis({ ...credentials, retry: { retries: 1, backoff: () => 50 } })
  : null;

let warnedNoopInProduction = false;

// One breaker per instance: every limiter talks to the same Upstash.
const breaker = createCircuitBreaker();

type Limiter = NonNullable<RatelimitConfig["limiter"]>;

/** The window each limiter was built with, for the in-memory fallback. */
const windows = new WeakMap<
  Limiter,
  { tokens: number; windowMs: number; sliding: boolean }
>();

/** Ratelimit.slidingWindow, remembering its window for the fallback. */
export const slidingWindow = (
  ...args: Parameters<typeof Ratelimit.slidingWindow>
): Limiter => {
  const limiter = Ratelimit.slidingWindow(...args);
  const [tokens, window] = args;
  windows.set(limiter, {
    tokens,
    windowMs: parseDuration(window),
    sliding: true,
  });
  return limiter;
};

/**
 * Ratelimit.fixedWindow, remembering its window for the fallback. Windows
 * start at multiples of the duration since the epoch, so "1 d" runs from
 * 00:00 to 24:00 UTC, in Upstash and in the fallback alike.
 */
export const fixedWindow = (
  ...args: Parameters<typeof Ratelimit.fixedWindow>
): Limiter => {
  const limiter = Ratelimit.fixedWindow(...args);
  const [tokens, window] = args;
  windows.set(limiter, {
    tokens,
    windowMs: parseDuration(window),
    sliding: false,
  });
  return limiter;
};

const DEFAULT_TOKENS = 10;
const DEFAULT_WINDOW = "10 s";

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

  const limiter =
    props.limiter ?? slidingWindow(DEFAULT_TOKENS, DEFAULT_WINDOW);
  const ratelimit = new Ratelimit({
    redis,
    limiter,
    prefix: props.prefix ?? "qrdx",
    // Upstash allows the request itself when a check takes longer than
    // this; the fallback judges it in memory instead.
    timeout: 1000,
  });
  const memory = createMemoryLimiter(
    windows.get(limiter) ?? {
      tokens: DEFAULT_TOKENS,
      windowMs: parseDuration(DEFAULT_WINDOW),
    }
  );
  const limit = withFallback(
    (identifier, rate) =>
      ratelimit.limit(
        identifier,
        rate === undefined ? undefined : { rate }
      ) as Promise<LimitResult>,
    memory,
    breaker
  );

  return {
    limit: (identifier, rate) =>
      limit(identifier, rate) as Promise<RateLimitResponse>,
  };
};
