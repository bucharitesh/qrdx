import "server-only";

const entries = new Map<string, { expires: number; value: Promise<unknown> }>();

/**
 * Per-instance memo for slow, read-only admin probes. The promise itself is
 * kept, so concurrent page loads share one call, and failures are cached for
 * the same time so a dead service isn't hammered.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { expires: now + ttlMs, value });
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
