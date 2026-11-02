// Upstash outage handling: a circuit breaker that stops calling Upstash after
// repeated failures, and a per-instance in-memory limiter that enforces the
// same limits while it is open. Pure (clock and logger are injectable), so
// the tests drive it without Redis.

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
  reason?: string;
}

// ─── Durations ──────────────────────────────────────────────────────────────

const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

/** Upstash duration strings ("60 s", "10m", "1 d") in milliseconds. */
export function parseDuration(duration: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)\s*$/.exec(duration);
  if (!match) throw new Error(`Invalid rate limit window "${duration}"`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

// ─── In-memory sliding window ───────────────────────────────────────────────

interface WindowState {
  /** Start of the current fixed window */
  start: number;
  current: number;
  previous: number;
}

/** Most keys one limiter keeps in memory; the oldest are dropped beyond it. */
const MAX_KEYS = 10_000;

/**
 * Sliding window (the weighted two-window approximation Upstash uses), or a
 * plain fixed window with `sliding: false` (Upstash fixedWindow: nothing
 * carries over into the next window), kept in this instance's memory. Only
 * used while Upstash is unreachable, so the limits hold per instance rather
 * than globally, which is far better than no limits at all.
 */
export function createMemoryLimiter(
  {
    tokens,
    windowMs,
    sliding = true,
  }: { tokens: number; windowMs: number; sliding?: boolean },
  now: () => number = Date.now,
  maxKeys: number = MAX_KEYS
) {
  const windows = new Map<string, WindowState>();

  function prune(at: number) {
    for (const [key, state] of windows) {
      if (at - state.start >= 2 * windowMs) windows.delete(key);
    }
    // Still full: drop the oldest entries (a Map keeps insertion order).
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return {
    limit(identifier: string): LimitResult {
      const at = now();
      const start = Math.floor(at / windowMs) * windowMs;
      let state = windows.get(identifier);
      if (!state) {
        if (windows.size >= maxKeys) prune(at);
        state = { start, current: 0, previous: 0 };
        windows.set(identifier, state);
      } else if (state.start !== start) {
        state.previous = start - state.start === windowMs ? state.current : 0;
        state.current = 0;
        state.start = start;
      }
      const weight = sliding ? 1 - (at - start) / windowMs : 0;
      const used = Math.floor(state.previous * weight) + state.current;
      const success = used < tokens;
      if (success) state.current++;
      return {
        success,
        limit: tokens,
        remaining: Math.max(0, tokens - used - (success ? 1 : 0)),
        reset: start + windowMs,
        pending: Promise.resolve(),
        reason: "memory",
      };
    },
    /** Keys currently held (for tests). */
    get size() {
      return windows.size;
    },
  };
}

// ─── Circuit breaker ────────────────────────────────────────────────────────

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Consecutive failures (errors or timeouts) that open the breaker */
  failureThreshold?: number;
  /** How long it stays open before one request probes Upstash again */
  cooldownMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * closed: every check goes to Upstash; `failureThreshold` failures in a row
 * open it. open: checks use the in-memory limiter for `cooldownMs`.
 * half-open: one check probes Upstash (the rest stay in memory); success
 * closes the breaker, failure opens it for another cooldown. Logs once when
 * Upstash is given up on and once when it is back, not per request.
 */
export function createCircuitBreaker({
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  now = Date.now,
  log = (message) => console.error(message),
}: BreakerOptions = {}) {
  let state: BreakerState = "closed";
  let failures = 0;
  let openedAt = 0;
  let probing = false;

  return {
    get state(): BreakerState {
      if (state === "open" && now() - openedAt >= cooldownMs) {
        return "half-open";
      }
      return state;
    },
    /**
     * Whether this check may call Upstash. In half-open, only the first
     * caller gets true (the probe) until it reports back.
     */
    tryAcquire(): boolean {
      if (state === "closed") return true;
      if (state === "open") {
        if (now() - openedAt < cooldownMs) return false;
        state = "half-open";
      }
      if (probing) return false;
      probing = true;
      return true;
    },
    onSuccess() {
      if (state !== "closed") {
        log("[rate-limit] Upstash is reachable again; using it for limits.");
      }
      state = "closed";
      failures = 0;
      probing = false;
    },
    onFailure(detail?: string) {
      probing = false;
      if (state === "half-open") {
        // Still down: stay on memory for another cooldown, without a new log.
        state = "open";
        openedAt = now();
        return;
      }
      failures++;
      if (state === "closed" && failures >= failureThreshold) {
        state = "open";
        openedAt = now();
        log(
          `[rate-limit] Upstash failed ${failures} times in a row${detail ? ` (${detail})` : ""}; using in-memory limits per instance, retrying in ${Math.round(cooldownMs / 1000)} s.`
        );
      }
    },
  };
}

export type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;
export type MemoryLimiter = ReturnType<typeof createMemoryLimiter>;

/**
 * One limiter: Upstash while the breaker allows it, the in-memory window
 * otherwise. An Upstash timeout (Upstash itself allows the request) or error
 * counts as a failure and the request is judged in memory instead, so an
 * outage never turns limits off.
 */
export function withFallback(
  upstash: (identifier: string) => Promise<LimitResult>,
  memory: MemoryLimiter,
  breaker: CircuitBreaker
): (identifier: string) => Promise<LimitResult> {
  return async (identifier) => {
    if (!breaker.tryAcquire()) return memory.limit(identifier);
    try {
      const result = await upstash(identifier);
      if (result.reason === "timeout") {
        breaker.onFailure("timeout");
        return memory.limit(identifier);
      }
      breaker.onSuccess();
      return result;
    } catch (error) {
      breaker.onFailure(error instanceof Error ? error.message : String(error));
      return memory.limit(identifier);
    }
  };
}
