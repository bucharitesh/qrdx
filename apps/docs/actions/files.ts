"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/app/admin/_lib/guard";
import { HttpError } from "@/lib/error-response";
import { type AdminFileView, setFileBlocked } from "@/lib/files/admin";
import { deleteFile, fileIdSchema } from "@/lib/files/service";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type FileActionErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "IN_USE"
  | "NOT_RESTORABLE"
  | "STORAGE_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

export type FileActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: FileActionErrorCode; message: string } };

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "FORBIDDEN",
  "IN_USE",
  "NOT_RESTORABLE",
  "STORAGE_NOT_CONFIGURED",
  "RATE_LIMITED",
]);

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

function failure(error: unknown, action: string): FileActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage files." },
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
          ? (error.code as FileActionErrorCode)
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

/** The scope always comes from the session, never from the client. */
async function mutate<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
): Promise<FileActionResult<T>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `files:mutate:user:${scope.userId}` },
    ]);
    const data = await fn(scope);
    revalidatePath("/dashboard/files");
    return { success: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

const deleteSchema = z.object({
  id: fileIdSchema,
  /** Delete even when pages or codes still use the file */
  force: z.boolean().default(false),
});

export async function deleteFileAction(
  input: z.input<typeof deleteSchema>,
): Promise<FileActionResult<{ id: string }>> {
  return mutate("deleteFile", (scope) => {
    const { id, force } = parse(deleteSchema, input);
    return deleteFile(scope, id, { force });
  });
}

const blockSchema = z.object({
  id: fileIdSchema,
  blocked: z.boolean(),
  reason: z.string().trim().max(500).optional(),
  /** Also delete the stored object (irreversible) */
  deleteContent: z.boolean().default(false),
});

/** Admin takedown: block (or restore) a file everywhere it's used. */
export async function adminSetFileBlocked(
  input: z.input<typeof blockSchema>,
): Promise<FileActionResult<AdminFileView>> {
  try {
    const admin = await assertAdmin();
    const { id, blocked, reason, deleteContent } = parse(blockSchema, input);
    const file = await setFileBlocked(admin, id, blocked, {
      reason,
      deleteContent,
    });
    revalidatePath("/admin", "layout");
    return { success: true, data: file };
  } catch (error) {
    if (error instanceof Error && error.message === "Not found") {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Not found." },
      };
    }
    return failure(error, "adminSetFileBlocked");
  }
}
