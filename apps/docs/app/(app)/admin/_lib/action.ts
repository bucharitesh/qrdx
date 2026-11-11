import "server-only";

import {
  createRateLimiter,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { writeAuditLog } from "./audit";
import { type AdminUser, assertAdmin } from "./guard";

export type AdminActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** What a successful action writes to the audit log. */
export interface AdminAuditRecord {
  /** Overrides the action name, e.g. "qr_code.enable" vs "qr_code.disable" */
  action?: string;
  targetType: string;
  targetId: string | null;
  /** The user the action affected, so their 360 page lists it */
  subjectUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AdminActionOutcome<T> {
  audit: AdminAuditRecord;
  data?: T;
}

/** Per admin and action: 30 a minute, or 5 an hour for the heavy ones. */
const limiters: Record<"standard" | "sensitive", RateLimiter> = {
  standard: createRateLimiter({
    limiter: slidingWindow(30, "60 s"),
    prefix: "qrdx:admin",
  }),
  sensitive: createRateLimiter({
    limiter: slidingWindow(5, "1 h"),
    prefix: "qrdx:admin-sensitive",
  }),
};

/** Thrown inside an action for a problem the admin should read. */
export const adminError = (message: string, status = 400) =>
  new HttpError(status, "ADMIN_ACTION", message);

/**
 * Every admin server action runs through here, in this order:
 * 1. re-check admin from the session (throws "Not found" for anyone else,
 *    before any input is read or any query runs);
 * 2. rate limit per admin and action;
 * 3. validate the input;
 * 4. run the action, then write its audit entry (with the reason);
 * 5. revalidate the panel.
 */
export async function runAdminAction<S extends z.ZodType, T = undefined>(
  options: {
    /** Audit action name, e.g. "user.ban" */
    action: string;
    schema: S;
    limit?: "standard" | "sensitive";
    /** Defaults to the whole admin panel */
    revalidate?: string[];
  },
  input: unknown,
  body: (
    admin: AdminUser,
    input: z.output<S>,
  ) => Promise<AdminActionOutcome<T> | null>,
): Promise<AdminActionResult<T>> {
  const admin = await assertAdmin();

  try {
    await enforceRateLimits([
      {
        limiter: limiters[options.limit ?? "standard"],
        key: `${options.action}:${admin.id}`,
      },
    ]);
  } catch (error) {
    return failure(error, options.action);
  }

  const parsed = options.schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  let outcome: AdminActionOutcome<T> | null;
  try {
    outcome = await body(admin, parsed.data);
    // null: nothing to change (already in the requested state), no entry.
    if (outcome) {
      const reason =
        typeof (parsed.data as { reason?: unknown })?.reason === "string"
          ? (parsed.data as { reason: string }).reason
          : null;
      await writeAuditLog({
        actor: admin,
        action: outcome.audit.action ?? options.action,
        targetType: outcome.audit.targetType,
        targetId: outcome.audit.targetId,
        metadata: {
          ...outcome.audit.metadata,
          reason,
          ...(outcome.audit.subjectUserId
            ? { subjectUserId: outcome.audit.subjectUserId }
            : {}),
        },
      });
    }
  } catch (error) {
    return failure(error, options.action);
  }

  for (const path of options.revalidate ?? ["/admin"]) {
    revalidatePath(path, "layout");
  }
  return outcome?.data === undefined
    ? { ok: true }
    : { ok: true, data: outcome.data };
}

function failure(error: unknown, action: string): AdminActionResult<never> {
  if (error instanceof HttpError) return { ok: false, error: error.message };
  // Better Auth APIError messages are safe to show ("You cannot ban yourself").
  if (error instanceof Error && "statusCode" in error && error.message) {
    return { ok: false, error: error.message };
  }
  console.error(
    JSON.stringify({
      event: "admin.action_failed",
      action,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return { ok: false, error: "Action failed" };
}
