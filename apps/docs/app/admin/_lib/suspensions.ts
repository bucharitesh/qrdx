import "server-only";

import { adminAuditLog, database as db } from "@repo/database";
import { and, desc, eq, inArray } from "drizzle-orm";

const SUSPEND = "oauth_app.suspend";
const UNSUSPEND = "oauth_app.unsuspend";

/**
 * True when the QRdx team suspended the OAuth app and hasn't lifted it. The
 * audit log is the record (no extra column): its latest suspend / unsuspend
 * entry for the app decides, via the (target_type, target_id) index.
 */
export async function isOAuthAppSuspended(appId: string): Promise<boolean> {
  const [latest] = await db
    .select({ action: adminAuditLog.action })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.targetType, "oauth_app"),
        eq(adminAuditLog.targetId, appId),
        inArray(adminAuditLog.action, [SUSPEND, UNSUSPEND]),
      ),
    )
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(1);
  return latest?.action === SUSPEND;
}
