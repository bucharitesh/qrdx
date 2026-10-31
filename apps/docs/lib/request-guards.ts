import "server-only";

import {
  createRateLimiter,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import type { z } from "zod";
import { ValidationError } from "@/types/errors";
import { HttpError } from "./error-response";

const aiUserRateLimiter = createRateLimiter({
  limiter: slidingWindow(10, "10 s"),
});
const aiIpRateLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function enforceRateLimits(
  checks: Array<{ limiter: RateLimiter; key: string }>,
): Promise<void> {
  const results = await Promise.all(
    checks.map(({ limiter, key }) => limiter.limit(key)),
  );
  const blocked = results.filter((result) => !result.success);

  if (blocked.length > 0) {
    const reset = Math.max(...blocked.map((result) => result.reset));
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((reset - Date.now()) / 1000),
    );
    throw new HttpError(
      429,
      "RATE_LIMITED",
      "Rate limit exceeded. Please try again later.",
      { "Retry-After": String(retryAfterSeconds) },
    );
  }
}

/** Rate limits an AI route per signed-in user and per client IP. */
export function enforceAIRateLimit(
  req: Request,
  route: string,
  userId: string,
): Promise<void> {
  return enforceRateLimits([
    { limiter: aiUserRateLimiter, key: `${route}:user:${userId}` },
    { limiter: aiIpRateLimiter, key: `${route}:ip:${getClientIp(req)}` },
  ]);
}

/** Reads and parses a JSON body, aborting once it exceeds `maxBytes`. */
export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  const tooLarge = new HttpError(
    413,
    "PAYLOAD_TOO_LARGE",
    "Request body is too large.",
  );

  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) {
    throw tooLarge;
  }

  if (!req.body) {
    throw new ValidationError("Request body is required");
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge;
    }
    chunks.push(value);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function parseWithSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      "Invalid request body",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
