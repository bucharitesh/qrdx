import "server-only";
import {
  ADMIN_ROLE,
  hasAdminRole,
  isAdmin,
  isBootstrapAdmin,
} from "@repo/auth/admin";
import { auth } from "@repo/auth/server";
import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { writeAuditLog } from "./audit";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
}

/**
 * Resolves the current admin (deduped per request) or null. Users matched only
 * by ADMIN_EMAILS / ADMIN_USER_IDS get role "admin" persisted so Better Auth's
 * admin endpoints authorize them too.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  const current = session?.user;

  if (!(current && isAdmin(current)) || current.banned) {
    return null;
  }

  let role: string | null = current.role ?? null;
  if (!hasAdminRole(role) && isBootstrapAdmin(current)) {
    await db
      .update(user)
      .set({ role: ADMIN_ROLE, updatedAt: new Date() })
      .where(eq(user.id, current.id));
    await writeAuditLog({
      actor: { id: current.id, email: current.email },
      action: "user.bootstrap_admin",
      targetType: "user",
      targetId: current.id,
      metadata: { previousRole: role },
    });
    role = ADMIN_ROLE;
  }

  return { id: current.id, email: current.email, name: current.name, role };
});

/** For pages and layouts: non-admins get a plain 404. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    notFound();
  }
  return admin;
}

/** For server actions and route handlers: throws without revealing the panel. */
export async function assertAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    throw new Error("Not found");
  }
  return admin;
}
