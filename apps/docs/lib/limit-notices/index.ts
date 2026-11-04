import "server-only";

import { after } from "next/server";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { NoticeLimitId } from "./levels";

export type { NoticeLimitId } from "./levels";

// The write paths call noteLimitUsage after they add something a plan caps
// (codes, pages, themes, files, AI art, form responses). It returns at once
// and does the rest after the response: read the usage, claim the notice
// (limit_notice, manual-sql/0015) and email the owners (./notify.tsx).
// Never throws, and never touches the database where email can't go out:
// local dev and previews share the live database, so a notice "sent" there
// would stop the real one.

export interface LimitScope {
  userId: string;
  organizationId: string;
}

/** Usage the caller already counted, to skip counting again. */
export interface KnownUsage {
  used: number;
  /** null = unlimited */
  limit: number | null;
  /** AI art: shared by the workspace (else counted per person) */
  pooled?: boolean;
}

/** Email can reach people from here (production, Resend configured). */
export function limitNoticesCanSend(): boolean {
  return isOutboundDeliveryAllowed() && isFeatureAvailable("email");
}

function runInBackground(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    // Outside a request (scripts, tests): run detached.
    void task();
  }
}

/** Checks `limit` for the workspace after this request; never throws. */
export function noteLimitUsage(
  scope: LimitScope,
  limit: NoticeLimitId,
  known?: KnownUsage,
): void {
  if (!scope.organizationId || !limitNoticesCanSend()) return;
  // A known count without a cap needs nothing more.
  if (known && known.limit === null) return;
  runInBackground(async () => {
    try {
      const { sendLimitNotice } = await import("./notify");
      await sendLimitNotice(
        { userId: scope.userId, organizationId: scope.organizationId },
        limit,
        known,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "limit_notice.failed",
          limit,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
}
