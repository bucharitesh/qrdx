"use server";

import { auth } from "@repo/auth/server";
import {
  brandKit,
  customDomain,
  database as db,
  member,
  qrCode,
  subscription,
  user as userTable,
} from "@repo/database";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { isBillingConfigured, polar } from "@/lib/polar";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  type ActionResult,
  actionError,
  actionSuccess,
  ErrorCode,
} from "@/types/errors";

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };
const roleRank = (role: string) =>
  Math.min(...role.split(",").map((r) => ROLE_RANK[r.trim()] ?? 3));

/**
 * Codes never die for teams: qr_code / brand_kit / custom_domain rows cascade
 * with their user, so team-owned rows are first handed to another member of
 * that team (owners, then admins, then the longest-standing member). When the
 * user is a team's only owner, that member is promoted so the team stays
 * manageable. Personal rows go with the account; teams without other members
 * are left as they are.
 */
async function handOverTeamResources(userId: string) {
  const [codeTeams, kitTeams, domainTeams, memberships] = await Promise.all([
    db
      .selectDistinct({ organizationId: qrCode.organizationId })
      .from(qrCode)
      .where(and(eq(qrCode.userId, userId), isNotNull(qrCode.organizationId))),
    db
      .selectDistinct({ organizationId: brandKit.organizationId })
      .from(brandKit)
      .where(
        and(eq(brandKit.userId, userId), isNotNull(brandKit.organizationId)),
      ),
    db
      .selectDistinct({ organizationId: customDomain.organizationId })
      .from(customDomain)
      .where(
        and(
          eq(customDomain.userId, userId),
          isNotNull(customDomain.organizationId),
        ),
      ),
    db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, userId)),
  ]);

  const organizationIds = new Set<string>(
    memberships.map((m) => m.organizationId),
  );
  for (const row of [...codeTeams, ...kitTeams, ...domainTeams]) {
    if (row.organizationId) organizationIds.add(row.organizationId);
  }

  const requestHeaders = await headers();

  await Promise.all(
    [...organizationIds].map(async (organizationId) => {
      const others = await db
        .select({
          id: member.id,
          userId: member.userId,
          role: member.role,
          createdAt: member.createdAt,
        })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            ne(member.userId, userId),
          ),
        );
      if (others.length === 0) return;

      const [successor] = others.sort(
        (a, b) =>
          roleRank(a.role) - roleRank(b.role) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );

      const membership = memberships.find(
        (m) => m.organizationId === organizationId,
      );
      if (
        membership &&
        roleRank(membership.role) === 0 &&
        roleRank(successor.role) !== 0
      ) {
        try {
          // Through the organization plugin, acting as the (still existing) owner.
          await auth.api.updateMemberRole({
            headers: requestHeaders,
            body: { memberId: successor.id, role: "owner", organizationId },
          });
        } catch (error) {
          logError(error as Error, {
            action: "deleteAccount.promoteOwner",
            organizationId,
          });
        }
      }

      const handOver = { userId: successor.userId };
      await Promise.all([
        db
          .update(qrCode)
          .set(handOver)
          .where(
            and(
              eq(qrCode.userId, userId),
              eq(qrCode.organizationId, organizationId),
            ),
          ),
        db
          .update(brandKit)
          .set(handOver)
          .where(
            and(
              eq(brandKit.userId, userId),
              eq(brandKit.organizationId, organizationId),
            ),
          ),
        db
          .update(customDomain)
          .set(handOver)
          .where(
            and(
              eq(customDomain.userId, userId),
              eq(customDomain.organizationId, organizationId),
            ),
          ),
      ]);
    }),
  );
}

export async function deleteAccount(): Promise<ActionResult<boolean>> {
  try {
    const userId = await getCurrentUserId();

    // Must succeed before anything is deleted, or team codes would cascade away.
    await handOverTeamResources(userId);

    if (isBillingConfigured) {
      try {
        await polar.customers.deleteExternal({ externalId: userId });
      } catch (_e) {
        // Expected for free users — no Polar customer exists
      }
    }

    await db.delete(subscription).where(eq(subscription.userId, userId));

    await db.delete(userTable).where(eq(userTable.id, userId));

    return actionSuccess(true);
  } catch (error) {
    logError(error as Error, { action: "deleteAccount" });
    return actionError(
      ErrorCode.UNKNOWN_ERROR,
      "Failed to delete account. Please try again.",
    );
  }
}
