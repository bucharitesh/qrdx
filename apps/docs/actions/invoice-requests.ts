"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { HttpError } from "@/lib/error-response";
import {
  type InvoiceRequestInput,
  sendInvoiceRequest,
} from "@/lib/invoice-requests";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveWorkspace } from "@/lib/scope";
import { getCurrentUser, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// "Pay by invoice" on the pricing page (agency tools): signed-in people only,
// a few requests a day each.

export type InvoiceRequestResult =
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

export async function requestInvoiceAction(
  input: InvoiceRequestInput,
): Promise<InvoiceRequestResult> {
  try {
    const user = await getCurrentUser();
    await enforceRateLimits([
      { limiter, key: `invoice-request:user:${user.id}` },
    ]);
    const workspace = await getActiveWorkspace()
      .then(({ workspace: w }) => ({ name: w.name, slug: w.slug }))
      .catch(() => null);
    await sendInvoiceRequest(
      {
        company: String(input?.company ?? ""),
        billingEmail: String(input?.billingEmail ?? ""),
        country: String(input?.country ?? ""),
        taxId: String(input?.taxId ?? ""),
        address: String(input?.address ?? ""),
        notes: String(input?.notes ?? ""),
      },
      { id: user.id, email: user.email, workspace },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Sign in to ask for an invoice.",
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
    logError(error as Error, { action: "requestInvoice" });
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      error: "Something went wrong. Email enterprise@qrdx.dev instead.",
    };
  }
}
