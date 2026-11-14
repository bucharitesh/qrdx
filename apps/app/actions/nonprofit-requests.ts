"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { HttpError } from "@/lib/error-response";
import {
  NONPROFIT_REQUEST_TO,
  type NonprofitRequestInput,
  sendNonprofitRequest,
} from "@/lib/nonprofit-requests";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveWorkspace } from "@/lib/scope";
import { getCurrentUser, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// "Ask for a code" on the pricing page (non-profit discount): signed-in
// people only, a few requests a day each, like pay-by-invoice requests.

export type NonprofitRequestResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "VALIDATION_ERROR"
        | "UNAVAILABLE"
        | "NOT_SENT"
        | "RATE_LIMITED"
        | "UNKNOWN_ERROR";
      error: string;
    };

const limiter = createRateLimiter({ limiter: slidingWindow(3, "1 d") });

const KNOWN = new Set([
  "VALIDATION_ERROR",
  "UNAVAILABLE",
  "NOT_SENT",
  "RATE_LIMITED",
]);

export async function requestNonprofitDiscountAction(
  input: NonprofitRequestInput,
): Promise<NonprofitRequestResult> {
  try {
    const user = await getCurrentUser();
    await enforceRateLimits([
      { limiter, key: `nonprofit-request:user:${user.id}` },
    ]);
    const workspace = await getActiveWorkspace()
      .then(({ workspace: w }) => ({ name: w.name, slug: w.slug }))
      .catch(() => null);
    await sendNonprofitRequest(
      {
        organization: String(input?.organization ?? ""),
        country: String(input?.country ?? ""),
        registration: String(input?.registration ?? ""),
        contactEmail: String(input?.contactEmail ?? ""),
        plan: String(input?.plan ?? "") as NonprofitRequestInput["plan"],
      },
      { id: user.id, email: user.email, workspace },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Sign in to ask for the non-profit discount.",
      };
    }
    if (error instanceof HttpError && KNOWN.has(error.code)) {
      return {
        ok: false,
        code: error.code as "VALIDATION_ERROR",
        error:
          error.code === "RATE_LIMITED"
            ? "You've sent a few requests today. We'll reply to those."
            : error.message,
      };
    }
    logError(error as Error, { action: "requestNonprofitDiscount" });
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      error: `Something went wrong. Email ${NONPROFIT_REQUEST_TO} instead.`,
    };
  }
}
