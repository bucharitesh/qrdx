"use server";

import { ADMIN_ROLE } from "@repo/auth/admin";
import { auth } from "@repo/auth/server";
import { communityTheme, database as db, qrPreset, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { writeAuditLog } from "./_lib/audit";
import { assertAdmin } from "./_lib/guard";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().max(500).optional();

const banSchema = z.object({
  userId: idSchema,
  reason: reasonSchema,
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
const userSchema = z.object({ userId: idSchema });
const roleSchema = z.object({
  userId: idSchema,
  role: z.enum(["user", ADMIN_ROLE]),
});
const removeThemeSchema = z.object({
  communityThemeId: idSchema,
  reason: reasonSchema,
});

const invalid = (): AdminActionResult => ({
  ok: false,
  error: "Invalid input",
});

function failure(error: unknown): AdminActionResult {
  console.error("Admin action failed:", error);
  // Only Better Auth APIError messages are surfaced ("You cannot ban yourself", ...).
  const isApiError =
    error instanceof Error && "statusCode" in error && Boolean(error.message);
  return { ok: false, error: isApiError ? error.message : "Action failed" };
}

async function findUser(userId: string) {
  const [found] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return found ?? null;
}

export async function banUserAction(
  input: z.input<typeof banSchema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { userId, reason, expiresInDays } = parsed.data;

  try {
    const target = await findUser(userId);
    if (!target) return { ok: false, error: "User not found" };

    // Also deletes the user's sessions.
    await auth.api.banUser({
      body: {
        userId,
        banReason: reason || undefined,
        banExpiresIn: expiresInDays ? expiresInDays * 24 * 60 * 60 : undefined,
      },
      headers: await headers(),
    });
    await writeAuditLog({
      actor: admin,
      action: "user.ban",
      targetType: "user",
      targetId: userId,
      metadata: {
        targetEmail: target.email,
        reason: reason || null,
        expiresInDays: expiresInDays ?? null,
      },
    });
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function unbanUserAction(
  input: z.input<typeof userSchema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { userId } = parsed.data;

  try {
    const target = await findUser(userId);
    if (!target) return { ok: false, error: "User not found" };

    await auth.api.unbanUser({ body: { userId }, headers: await headers() });
    await writeAuditLog({
      actor: admin,
      action: "user.unban",
      targetType: "user",
      targetId: userId,
      metadata: { targetEmail: target.email },
    });
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setUserRoleAction(
  input: z.input<typeof roleSchema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { userId, role } = parsed.data;

  if (userId === admin.id && role !== ADMIN_ROLE) {
    return { ok: false, error: "You cannot remove your own admin role" };
  }

  try {
    const target = await findUser(userId);
    if (!target) return { ok: false, error: "User not found" };

    await auth.api.setRole({
      body: { userId, role },
      headers: await headers(),
    });
    await writeAuditLog({
      actor: admin,
      action: "user.set_role",
      targetType: "user",
      targetId: userId,
      metadata: { targetEmail: target.email, from: target.role, to: role },
    });
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function revokeUserSessionsAction(
  input: z.input<typeof userSchema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { userId } = parsed.data;

  try {
    const target = await findUser(userId);
    if (!target) return { ok: false, error: "User not found" };

    await auth.api.revokeUserSessions({
      body: { userId },
      headers: await headers(),
    });
    await writeAuditLog({
      actor: admin,
      action: "user.revoke_sessions",
      targetType: "user",
      targetId: userId,
      metadata: { targetEmail: target.email },
    });
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * community_theme has no soft-delete column, so this unpublishes: the
 * community row (with its likes and tags) is deleted, the owner's saved
 * qr_preset is kept.
 */
export async function removeCommunityThemeAction(
  input: z.input<typeof removeThemeSchema>,
): Promise<AdminActionResult> {
  const admin = await assertAdmin();
  const parsed = removeThemeSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { communityThemeId, reason } = parsed.data;

  try {
    const [target] = await db
      .select({
        themeId: communityTheme.themeId,
        ownerId: communityTheme.userId,
        likeCount: communityTheme.likeCount,
        publishedAt: communityTheme.publishedAt,
        name: qrPreset.name,
      })
      .from(communityTheme)
      .innerJoin(qrPreset, eq(qrPreset.id, communityTheme.themeId))
      .where(eq(communityTheme.id, communityThemeId))
      .limit(1);
    if (!target) return { ok: false, error: "Community theme not found" };

    await db
      .delete(communityTheme)
      .where(eq(communityTheme.id, communityThemeId));
    await writeAuditLog({
      actor: admin,
      action: "community_theme.remove",
      targetType: "community_theme",
      targetId: communityThemeId,
      metadata: {
        themeId: target.themeId,
        themeName: target.name,
        ownerId: target.ownerId,
        likeCount: target.likeCount,
        publishedAt: target.publishedAt.toISOString(),
        reason: reason || null,
      },
    });
  } catch (error) {
    return failure(error);
  }

  revalidateTag("community-themes", "max");
  revalidateTag("community-tag-counts", "max");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
