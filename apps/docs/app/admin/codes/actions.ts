"use server";

import { database as db, qrCode, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import { adminId, requiredReason } from "../_lib/rules";

const activeSchema = z.object({
  codeId: adminId,
  active: z.boolean(),
  reason: requiredReason,
});
const pauseSchema = z.object({
  codeId: adminId,
  paused: z.boolean(),
  reason: requiredReason,
});

async function findCode(codeId: string) {
  const [target] = await db
    .select({
      slug: qrCode.slug,
      kind: qrCode.kind,
      destinationUrl: qrCode.destinationUrl,
      isActive: qrCode.isActive,
      pausedAt: qrCode.pausedAt,
      ownerId: qrCode.userId,
      ownerEmail: user.email,
      organizationId: qrCode.organizationId,
    })
    .from(qrCode)
    .innerJoin(user, eq(user.id, qrCode.userId))
    .where(eq(qrCode.id, codeId))
    .limit(1);
  if (!target) throw adminError("QR code not found", 404);
  return target;
}

const codeAudit = (
  codeId: string,
  target: Awaited<ReturnType<typeof findCode>>,
) => ({
  audit: {
    targetType: "qr_code",
    targetId: codeId,
    subjectUserId: target.ownerId,
    metadata: {
      slug: target.slug,
      kind: target.kind,
      destinationUrl: target.destinationUrl,
      ownerId: target.ownerId,
      ownerEmail: target.ownerEmail,
      organizationId: target.organizationId,
    },
  },
});

/**
 * Anti-phishing control: a disabled code (or hosted page, which is a code of
 * kind "page") stops redirecting, its scans show the "no longer active" page
 * and its owner cannot turn it back on.
 */
export async function setDynamicCodeActiveAction(
  input: z.input<typeof activeSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.set_active", schema: activeSchema },
    input,
    async (_admin, { codeId, active }) => {
      const target = await findCode(codeId);
      if (target.isActive === active) return null;
      await db
        .update(qrCode)
        .set({ isActive: active })
        .where(eq(qrCode.id, codeId));
      const outcome = codeAudit(codeId, target);
      return {
        audit: {
          ...outcome.audit,
          action: active ? "qr_code.enable" : "qr_code.disable",
        },
      };
    },
  );
}

/**
 * Support pause, e.g. on the owner's request: the code sends visitors to its
 * fallback (or the "paused" page) like a pause from the dashboard, and the
 * owner can resume it themselves.
 */
export async function setDynamicCodePausedAction(
  input: z.input<typeof pauseSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.set_paused", schema: pauseSchema },
    input,
    async (_admin, { codeId, paused }) => {
      const target = await findCode(codeId);
      if (Boolean(target.pausedAt) === paused) return null;
      await db
        .update(qrCode)
        .set({ pausedAt: paused ? new Date() : null })
        .where(eq(qrCode.id, codeId));
      const outcome = codeAudit(codeId, target);
      return {
        audit: {
          ...outcome.audit,
          action: paused ? "qr_code.pause" : "qr_code.resume",
        },
      };
    },
  );
}
