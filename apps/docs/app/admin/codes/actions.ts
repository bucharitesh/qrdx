"use server";

import { database as db, qrCode, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "../_lib/audit";
import { assertAdmin } from "../_lib/guard";
import type { AdminActionResult } from "../actions";

const schema = z.object({
  codeId: z.string().trim().min(1).max(128),
  active: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Anti-phishing control: a disabled code stops redirecting (its scans show the
 * "no longer active" page) and its owner cannot turn it back on.
 */
export async function setDynamicCodeActiveAction(
  input: z.input<typeof schema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { codeId, active, reason } = parsed.data;

  try {
    const [target] = await db
      .select({
        slug: qrCode.slug,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        ownerId: qrCode.userId,
        ownerEmail: user.email,
        organizationId: qrCode.organizationId,
      })
      .from(qrCode)
      .innerJoin(user, eq(user.id, qrCode.userId))
      .where(eq(qrCode.id, codeId))
      .limit(1);
    if (!target) return { ok: false, error: "QR code not found" };
    if (target.isActive === active) return { ok: true };

    await db
      .update(qrCode)
      .set({ isActive: active })
      .where(eq(qrCode.id, codeId));
    await writeAuditLog({
      actor: admin,
      action: active ? "qr_code.enable" : "qr_code.disable",
      targetType: "qr_code",
      targetId: codeId,
      metadata: {
        slug: target.slug,
        destinationUrl: target.destinationUrl,
        ownerId: target.ownerId,
        ownerEmail: target.ownerEmail,
        organizationId: target.organizationId,
        reason: reason || null,
      },
    });
  } catch (error) {
    console.error("Admin action failed:", error);
    return { ok: false, error: "Action failed" };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
