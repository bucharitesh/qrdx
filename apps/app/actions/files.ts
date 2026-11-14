"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/app/(app)/admin/_lib/guard";
import type { FileRow } from "@/app/(app)/dashboard/files/_components/files-manager";
import { loadFileRows } from "@/app/(app)/dashboard/files/_lib/rows";
import { HttpError } from "@/lib/error-response";
import { type AdminFileView, setFileBlocked } from "@/lib/files/admin";
import { deleteFile, fileIdSchema } from "@/lib/files/service";
import { FILE_KINDS } from "@/lib/files/types";
import type { CursorPage } from "@/lib/keyset-cursor";
import { assertCan } from "@/lib/permissions-server";
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
    assertCan(scope, "content.write");
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `files:mutate:user:${scope.userId}` },
    ]);
    const data = await fn(scope);
    revalidatePath("/dashboard", "layout");
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

const readLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
});

const loadSchema = z.object({
  kind: z.enum(FILE_KINDS).nullish(),
  /** From the previous page; omit for the first */
  cursor: z.string().max(160).nullish(),
  limit: z.number().int().min(1).max(200).optional(),
});

/**
 * The Files list as it scrolls: the next page after `cursor`, or the first
 * `limit` files again after an upload or delete. Any member who can open
 * the workspace can read it, as the page itself.
 */
export async function loadFilesAction(
  input: z.input<typeof loadSchema>,
): Promise<FileActionResult<CursorPage<FileRow>>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: readLimiter, key: `files:list:user:${scope.userId}` },
    ]);
    const { kind, cursor, limit } = parse(loadSchema, input);
    return {
      success: true,
      data: await loadFileRows(scope, {
        kind: kind ?? undefined,
        cursor: cursor ?? null,
        limit,
      }),
    };
  } catch (error) {
    return failure(error, "loadFiles");
  }
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
