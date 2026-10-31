"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addDomain,
  type CustomDomainView,
  type DomainOptions,
  getDomainOptions,
  MAX_HOSTNAME_INPUT,
  removeDomain,
  verifyDomain,
} from "@/app/dashboard/domains/_lib/domains";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type CustomDomainErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "PLAN_REQUIRED"
  | "LIMIT_REACHED"
  | "ALREADY_EXISTS"
  | "DOMAIN_TAKEN"
  | "DOMAIN_REJECTED"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

export type CustomDomainActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: CustomDomainErrorCode; message: string };
    };

const KNOWN_CODES = new Set<string>([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "PLAN_REQUIRED",
  "LIMIT_REACHED",
  "ALREADY_EXISTS",
  "DOMAIN_TAKEN",
  "DOMAIN_REJECTED",
  "UNAVAILABLE",
  "RATE_LIMITED",
]);

// Verify talks to DNS and the Vercel API, so mutations are capped per user.
const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});

const hostnameInputSchema = z.object({
  hostname: z.string().trim().min(1, "Enter a domain").max(MAX_HOSTNAME_INPUT),
});
const idInputSchema = z.object({ id: z.string().trim().min(1).max(64) });

function failure(
  error: unknown,
  action: string,
): CustomDomainActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage custom domains.",
      },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as CustomDomainErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, { action });
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return result.data;
}

/** The caller's scope always comes from the session, never from the client. */
async function mutate<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
): Promise<CustomDomainActionResult<T>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      {
        limiter: mutationLimiter,
        key: `custom-domains:user:${scope.userId}`,
      },
    ]);
    const data = await fn(scope);
    // Domains page and every code view (short links depend on domains).
    revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

export async function addCustomDomain(
  input: z.input<typeof hostnameInputSchema>,
): Promise<CustomDomainActionResult<CustomDomainView>> {
  return mutate("addCustomDomain", (scope) =>
    addDomain(scope, parse(hostnameInputSchema, input).hostname),
  );
}

export async function verifyCustomDomain(
  input: z.input<typeof idInputSchema>,
): Promise<CustomDomainActionResult<CustomDomainView>> {
  return mutate("verifyCustomDomain", (scope) =>
    verifyDomain(scope, parse(idInputSchema, input).id),
  );
}

export async function removeCustomDomain(
  input: z.input<typeof idInputSchema>,
): Promise<CustomDomainActionResult<{ id: string; hostname: string }>> {
  return mutate("removeCustomDomain", (scope) =>
    removeDomain(scope, parse(idInputSchema, input).id),
  );
}

/** Verified domains of the active scope, for the code dialog's domain picker. */
export async function getCustomDomainOptions(): Promise<
  CustomDomainActionResult<DomainOptions>
> {
  try {
    return { success: true, data: await getDomainOptions(await getActiveScope()) };
  } catch (error) {
    return failure(error, "getCustomDomainOptions");
  }
}
