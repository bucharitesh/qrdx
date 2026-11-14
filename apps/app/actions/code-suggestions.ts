"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { headers } from "next/headers";
import {
  type CodeSuggestions,
  type SuggestInput,
  suggestCodeDetails,
} from "@/lib/code-suggestions/suggest";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type SuggestResult =
  | { success: true; data: CodeSuggestions }
  | { success: false; error: { code: string; message: string } };

// A person clicking Suggest never gets near these; they cap what one
// account (or one address) can spend on the model.
const minuteLimiter = createRateLimiter({ limiter: slidingWindow(6, "60 s") });
const dayLimiter = createRateLimiter({ limiter: slidingWindow(60, "1 d") });
const ipLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

const KNOWN = new Set([
  "VALIDATION_ERROR",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "AI_NOT_CONFIGURED",
  "NOT_FOUND",
  "DOMAIN_NOT_VERIFIED",
]);

/** Back-halves and tags for the builder's "Suggest" (lib/code-suggestions). */
export async function suggestCodeDetailsAction(
  input: SuggestInput,
): Promise<SuggestResult> {
  try {
    const scope = await getActiveScope();
    const ip = getClientIp({ headers: await headers() });
    await enforceRateLimits([
      { limiter: minuteLimiter, key: `code-suggest:min:${scope.userId}` },
      { limiter: dayLimiter, key: `code-suggest:day:${scope.userId}` },
      { limiter: ipLimiter, key: `code-suggest:ip:${ip}` },
    ]);
    return { success: true, data: await suggestCodeDetails(scope, input) };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Sign in to get suggestions." },
      };
    }
    if (error instanceof HttpError && KNOWN.has(error.code)) {
      return {
        success: false,
        error: {
          code: error.code,
          message:
            error.code === "RATE_LIMITED"
              ? "That's a lot of suggestions. Try again in a minute."
              : error.code === "AI_NOT_CONFIGURED"
                ? "Suggestions aren't available on this server."
                : error.message,
        },
      };
    }
    logError(error as Error, { action: "suggestCodeDetails" });
    return {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Couldn't get suggestions right now. Try again.",
      },
    };
  }
}
