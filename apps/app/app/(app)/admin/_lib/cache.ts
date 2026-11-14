import "server-only";

const entries = new Map<string, { expires: number; value: Promise<unknown> }>();

/**
 * Per-instance memo for slow, read-only admin probes. The promise itself is
 * kept, so concurrent page loads share one call, and failures are cached too
 * so a dead service isn't hammered: for `failureTtlMs` when given (a long
 * cache shouldn't keep a passing outage for hours), else for `ttlMs`.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  failureTtlMs = ttlMs,
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load();
  const entry = { expires: now + ttlMs, value };
  entries.set(key, entry);
  if (failureTtlMs < ttlMs) {
    value.catch(() => {
      entry.expires = Math.min(entry.expires, Date.now() + failureTtlMs);
    });
  }
  return value;
}

/** Rejects with "Timed out" after `ms`; the signal aborts the work too. */
export async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
