"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { enforceCreateRateLimit } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  createCodeForPage,
  createPage,
  createPageSchema,
  deletePage,
  getPageUsage,
  type PageUsage,
  pageIdSchema,
  publishPage,
  publishPageSchema,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type LandingPageErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSAFE_DESTINATION"
  | "UNKNOWN_ERROR";

export type LandingPageActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: LandingPageErrorCode; message: string };
    };

const KNOWN_CODES = new Set<string>([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "UNSAFE_DESTINATION",
]);

const publishLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

function failure(
  error: unknown,
  context: Record<string, unknown>,
): LandingPageActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage pages." },
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
          ? (error.code as LandingPageErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, context);
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

/** Every action resolves the caller's scope itself; nothing scope-related comes from the client. */
async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  { revalidate = false } = {},
): Promise<LandingPageActionResult<T>> {
  try {
    const data = await fn(await getActiveScope());
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, { action });
  }
}

export async function createLandingPage(
  input: z.input<typeof createPageSchema>,
): Promise<LandingPageActionResult<{ pageId: string; codeId: string }>> {
  return run(
    "createLandingPage",
    async (scope) => {
      const data = parse(createPageSchema, input);
      await enforceCreateRateLimit(scope.userId);
      return createPage(scope, data);
    },
    { revalidate: true },
  );
}

export async function publishLandingPage(
  input: z.input<typeof publishPageSchema>,
): Promise<LandingPageActionResult<{ version: number; updatedAt: Date }>> {
  return run(
    "publishLandingPage",
    async (scope) => {
      const data = parse(publishPageSchema, input);
      await enforceRateLimits([
        {
          limiter: publishLimiter,
          key: `landing-pages:publish:user:${scope.userId}`,
        },
      ]);
      return publishPage(scope, data);
    },
    { revalidate: true },
  );
}

export async function deleteLandingPage(input: {
  id: string;
}): Promise<LandingPageActionResult<{ id: string; deletedCodes: number }>> {
  return run(
    "deleteLandingPage",
    (scope) => deletePage(scope, parse(pageIdSchema, input?.id)),
    { revalidate: true },
  );
}

export async function createLandingPageCode(input: {
  id: string;
}): Promise<LandingPageActionResult<{ codeId: string }>> {
  return run(
    "createLandingPageCode",
    async (scope) => {
      const id = parse(pageIdSchema, input?.id);
      await enforceCreateRateLimit(scope.userId);
      return createCodeForPage(scope, id);
    },
    { revalidate: true },
  );
}

export async function getLandingPageUsage(): Promise<
  LandingPageActionResult<PageUsage>
> {
  return run("getLandingPageUsage", getPageUsage);
}
