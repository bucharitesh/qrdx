"use server";

import { ADMIN_ROLE } from "@repo/auth/admin";
import { auth } from "@repo/auth/server";
import { communityTheme, database as db, qrPreset, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "./_lib/action";
import { adminId, optionalReason, requiredReason } from "./_lib/rules";

export type { AdminActionResult } from "./_lib/action";

const banSchema = z.object({
  userId: adminId,
  reason: requiredReason,
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
const userSchema = z.object({ userId: adminId, reason: requiredReason });
const roleSchema = z.object({
  userId: adminId,
  role: z.enum(["user", ADMIN_ROLE]),
  reason: requiredReason,
});
const removeThemeSchema = z.object({
  communityThemeId: adminId,
  reason: optionalReason,
});

async function findUser(userId: string) {
  const [found] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!found) throw adminError("User not found", 404);
  return found;
}

const userAudit = (
  target: { id: string; email: string },
  metadata: Record<string, unknown> = {},
) => ({
  audit: {
    targetType: "user",
    targetId: target.id,
    subjectUserId: target.id,
    metadata: { targetEmail: target.email, ...metadata },
  },
});

export async function banUserAction(
  input: z.input<typeof banSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.ban", schema: banSchema },
    input,
    async (admin, { userId, reason, expiresInDays }) => {
      if (userId === admin.id) throw adminError("You cannot ban yourself");
      const target = await findUser(userId);
      // Also deletes the user's sessions.
      await auth.api.banUser({
        body: {
          userId,
          banReason: reason,
          banExpiresIn: expiresInDays
            ? expiresInDays * 24 * 60 * 60
            : undefined,
        },
        headers: await headers(),
      });
      return userAudit(target, { expiresInDays: expiresInDays ?? null });
    },
  );
}

export async function unbanUserAction(
  input: z.input<typeof userSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.unban", schema: userSchema },
    input,
    async (_admin, { userId }) => {
      const target = await findUser(userId);
      await auth.api.unbanUser({ body: { userId }, headers: await headers() });
      return userAudit(target);
    },
  );
}

export async function setUserRoleAction(
  input: z.input<typeof roleSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.set_role", schema: roleSchema },
    input,
    async (admin, { userId, role }) => {
      if (userId === admin.id && role !== ADMIN_ROLE) {
        throw adminError("You cannot remove your own admin role");
      }
      const target = await findUser(userId);
      if ((target.role ?? "user") === role) return null;
      await auth.api.setRole({
        body: { userId, role },
        headers: await headers(),
      });
      return userAudit(target, { from: target.role, to: role });
    },
  );
}

export async function revokeUserSessionsAction(
  input: z.input<typeof userSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "user.revoke_sessions", schema: userSchema },
    input,
    async (_admin, { userId }) => {
      const target = await findUser(userId);
      await auth.api.revokeUserSessions({
        body: { userId },
        headers: await headers(),
      });
      return userAudit(target);
    },
  );
}

/**
 * community_theme has no soft-delete column, so this unpublishes: the
 * community row (with its likes and tags) is deleted, the owner's saved
 * qr_preset is kept.
 */
export async function removeCommunityThemeAction(
  input: z.input<typeof removeThemeSchema>,
): Promise<AdminActionResult> {
  const result = await runAdminAction(
    { action: "community_theme.remove", schema: removeThemeSchema },
    input,
    async (_admin, { communityThemeId }) => {
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
      if (!target) throw adminError("Community theme not found", 404);

      await db
        .delete(communityTheme)
        .where(eq(communityTheme.id, communityThemeId));
      return {
        audit: {
          targetType: "community_theme",
          targetId: communityThemeId,
          subjectUserId: target.ownerId,
          metadata: {
            themeId: target.themeId,
            themeName: target.name,
            ownerId: target.ownerId,
            likeCount: target.likeCount,
            publishedAt: target.publishedAt.toISOString(),
          },
        },
      };
    },
  );
  if (result.ok) {
    revalidateTag("community-themes", "max");
    revalidateTag("community-tag-counts", "max");
  }
  return result;
}
