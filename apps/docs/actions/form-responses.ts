"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assertCanManageResponses,
  deletePageResponses,
  findScopedPage,
} from "@/app/api/forms/_lib/responses";
import { HttpError } from "@/lib/error-response";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type FormResponsesErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNKNOWN_ERROR";

export type FormResponsesActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: FormResponsesErrorCode; message: string };
    };

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const deleteSchema = z.object({
  pageId: idSchema,
  ids: z.array(idSchema).min(1).max(100),
});

function failure(error: unknown): FormResponsesActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage responses." },
    };
  }
  if (
    error instanceof HttpError &&
    (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
  ) {
    return {
      success: false,
      error: { code: error.code, message: error.message },
    };
  }
  logError(error as Error, { action: "form-responses" });
  return {
    success: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: "Something went wrong. Please try again.",
    },
  };
}

/** Permanently deletes responses (up to 100 at a time) of one of the scope's pages. */
export async function deleteFormResponses(input: {
  pageId: string;
  ids: string[];
}): Promise<FormResponsesActionResult<{ deleted: number }>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose responses to delete.",
      },
    };
  }
  try {
    const scope = await getActiveScope();
    const page = await findScopedPage(scope, parsed.data.pageId);
    assertCanManageResponses(scope, page);
    const deleted = await deletePageResponses(page.id, [
      ...new Set(parsed.data.ids),
    ]);
    revalidatePath(`/dashboard/pages/${page.id}/responses`);
    return { success: true, data: { deleted } };
  } catch (error) {
    return failure(error);
  }
}
