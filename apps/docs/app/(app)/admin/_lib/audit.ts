import "server-only";
import { adminAuditLog, database as db } from "@repo/database";
import cuid from "cuid";

interface AuditEntry {
  actor: { id: string; email: string };
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog({
  actor,
  action,
  targetType,
  targetId,
  metadata,
}: AuditEntry) {
  await db.insert(adminAuditLog).values({
    id: cuid(),
    actorUserId: actor.id,
    action,
    targetType,
    targetId: targetId ?? null,
    // Actor email is copied so the entry stays readable if the account is deleted.
    metadata: { actorEmail: actor.email, ...metadata },
    createdAt: new Date(),
  });
}
