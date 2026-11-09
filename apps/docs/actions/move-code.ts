"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  listMoveTargets,
  type MoveResult,
  type MoveTarget,
  moveCodeToWorkspace,
} from "@/app/dashboard/codes/_lib/move-workspace";
import { recordCodeMove } from "@/ee/audit-log/code-events";
import { HttpError } from "@/lib/error-response";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// "Move to workspace…" in the code row menu. The rules live in
// app/dashboard/codes/_lib/move-workspace.ts.

export type MoveCodeResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

const moveLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

const moveSchema = z.object({
  id: z.string().trim().min(1).max(64),
  organizationId: z.string().trim().min(1).max(128),
});

function failure(error: unknown, action: string): MoveCodeResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to move codes." },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: { code: error.code, message: error.message },
    };
  }
  logError(error as Error, { action });
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

/** Where the open workspace's codes can go: workspaces you may add codes to. */
export async function listCodeMoveTargets(): Promise<
  MoveCodeResult<MoveTarget[]>
> {
  try {
    return {
      success: true,
      data: await listMoveTargets(await getActiveScope()),
    };
  } catch (error) {
    return failure(error, "listCodeMoveTargets");
  }
}

export async function moveQrCodeToWorkspace(input: {
  id: string;
  organizationId: string;
}): Promise<MoveCodeResult<MoveResult>> {
  try {
    const scope = await getActiveScope();
    const parsed = moveSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Pick a workspace." },
      };
    }
    const { success } = await moveLimiter.limit(`move-code:${scope.userId}`);
    if (!success) {
      return {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many moves. Please wait a minute.",
        },
      };
    }
    const result = await moveCodeToWorkspace(
      scope,
      parsed.data.id,
      parsed.data.organizationId,
    );
    recordCodeMove(scope, result.code, result.target);
    revalidatePath("/dashboard", "layout");
    return { success: true, data: result };
  } catch (error) {
    return failure(error, "moveQrCodeToWorkspace");
  }
}
