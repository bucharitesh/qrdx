import "server-only";

import { isIntegrationApiError } from "@repo/integrations";
import type { RateLimiter } from "@repo/rate-limit";
import { NextResponse } from "next/server";
import {
  getSessionUserId,
  providerErrorResponse,
} from "@/lib/connected-accounts/server";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

/** JSON error the pickers and panels show as is (never 401 for provider errors). */
export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error: message, code }, { status, headers });
}

/** Signed-in user + rate limit, or a response to return. */
export async function requireUser(
  limiter: RateLimiter,
  key: string,
): Promise<{ userId: string } | { response: Response }> {
  const userId = await getSessionUserId();
  if (!userId)
    return { response: jsonError(401, "UNAUTHORIZED", "Unauthorized") };
  try {
    await enforceRateLimits([{ limiter, key: `${key}:${userId}` }]);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        response: jsonError(429, "RATE_LIMITED", error.message, error.headers),
      };
    }
    throw error;
  }
  return { userId };
}

/** Maps HttpError / IntegrationApiError / anything else to a safe response. */
export async function dataErrorResponse(
  error: unknown,
  context: { userId: string; provider: string; action: string },
): Promise<Response> {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.code, error.message, error.headers);
  }
  if (error instanceof ValidationError) {
    return jsonError(400, "VALIDATION_ERROR", error.message);
  }
  if (isIntegrationApiError(error)) {
    return providerErrorResponse(error, context);
  }
  // Message only: never tokens, never personal data.
  console.error(
    JSON.stringify({
      event: "integrations.request_failed",
      provider: context.provider,
      action: context.action,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    }),
  );
  return jsonError(500, "INTERNAL", "Something went wrong. Try again.");
}
