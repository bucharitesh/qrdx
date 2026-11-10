import "server-only";

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { auth } from "@repo/auth/server";
import {
  barcode,
  brandKit,
  communityItem,
  communityLike,
  communitySave,
  communityTheme,
  customDomain,
  database as db,
  fileAsset,
  folder,
  landingPage,
  member,
  organization,
  qrCode,
  qrPreset,
  subscription,
  tag,
  themeLike,
  user as userTable,
  webhookEndpoint,
} from "@repo/database";
import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
// Role changes and deleted teams are recorded by packages/auth/workspace-audit.ts.
import "@/ee/audit-log/auth-changes";
import { scheduleWorkspaceAuditCleanup } from "@/ee/audit-log/retention";
import { anonymiseAffiliatePayouts } from "@/lib/affiliates/program";
import { isMissingSchemaError } from "@/lib/community/tables";
import {
  getCustomDomainMode,
  removeVercelProjectDomain,
} from "@/lib/custom-domains";
import { planForSubscriptionProduct } from "@/lib/plans";
import { isBillingConfigured, polar } from "@/lib/polar";
import { PLAN_NAMES } from "@/lib/pricing";
import { logError } from "@/lib/shared";
import { deleteObject, isStorageConfigured } from "@/lib/storage/r2";
import { getMyActiveSubscription } from "@/lib/subscription";
import { avatarKeyFromImage } from "./avatar";
import type { DeletionFacts, DeletionPlan, TeamFacts } from "./deletion";

/**
 * Team-scoped tables whose rows are created by a user (user_id) inside a team
 * (organization_id). Their user_id cascades on account deletion, so the rows
 * a deleted member created in a team are handed to a remaining member first.
 */
const TEAM_CONTENT = [
  qrCode,
  brandKit,
  qrPreset,
  customDomain,
  landingPage,
  folder,
  tag,
  fileAsset,
  webhookEndpoint,
  // Saved barcodes (manual-sql/2026-11-11-barcodes.sql)
  barcode,
] as const;

/** Thrown when deletion must stop; the message is shown to the user. */
export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

async function teamsWithContent(userId: string): Promise<string[]> {
  const results = await Promise.all(
    TEAM_CONTENT.map((table) =>
      db
        .selectDistinct({ organizationId: table.organizationId })
        .from(table)
        .where(and(eq(table.userId, userId), isNotNull(table.organizationId))),
    ),
  );
  return results.flat().flatMap((row) => row.organizationId ?? []);
}

/**
 * Rows deleted with the account outright: those from before workspaces (no
 * workspace yet) and, when nobody else is in it, the own workspace's.
 */
async function countPersonal(
  table: (typeof TEAM_CONTENT)[number],
  userId: string,
  ownAlone: boolean,
): Promise<number> {
  const inOwn = ownAlone
    ? or(
        isNull(table.organizationId),
        eq(table.organizationId, ownWorkspaceId(userId)),
      )
    : isNull(table.organizationId);
  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(and(eq(table.userId, userId), inOwn));
  return row?.value ?? 0;
}

/** The own workspace exists and nobody but its person is in it. */
async function ownWorkspaceAlone(userId: string): Promise<boolean> {
  const own = ownWorkspaceId(userId);
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, own));
  return rows.length > 0 && rows.every((row) => row.userId === userId);
}

/**
 * Likes and saves the user gave on community items stop counting (their
 * rows cascade with the user). Nothing to do before manual-sql/0012.
 */
async function uncountCommunityReactions(userId: string): Promise<void> {
  try {
    await db.batch([
      db
        .update(communityItem)
        .set({ likeCount: sql`GREATEST(${communityItem.likeCount} - 1, 0)` })
        .where(
          inArray(
            communityItem.id,
            db
              .select({ id: communityLike.itemId })
              .from(communityLike)
              .where(eq(communityLike.userId, userId)),
          ),
        ),
      db
        .update(communityItem)
        .set({ saveCount: sql`GREATEST(${communityItem.saveCount} - 1, 0)` })
        .where(
          inArray(
            communityItem.id,
            db
              .select({ id: communitySave.itemId })
              .from(communitySave)
              .where(eq(communitySave.userId, userId)),
          ),
        ),
    ]);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
  }
}

/** Everything the deletion plan depends on, for one user. */
export async function loadDeletionFacts(
  userId: string,
): Promise<DeletionFacts> {
  const ownAlone = await ownWorkspaceAlone(userId);
  const own = ownWorkspaceId(userId);
  const [memberships, contentTeams, active, codes, pages, files, domains] =
    await Promise.all([
      db
        .select({
          organizationId: member.organizationId,
          role: member.role,
          name: organization.name,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(member.userId, userId)),
      teamsWithContent(userId),
      getMyActiveSubscription(userId),
      countPersonal(qrCode, userId, ownAlone),
      countPersonal(landingPage, userId, ownAlone),
      countPersonal(fileAsset, userId, ownAlone),
      countPersonal(customDomain, userId, ownAlone),
    ]);

  // Your own workspace with nobody else in it goes with the account (as the
  // personal workspace did); shared with others, it's handed over like any.
  const teamIds = [
    ...new Set([
      ...memberships.map((row) => row.organizationId),
      ...contentTeams,
    ]),
  ].filter((id) => !(ownAlone && id === own));

  const [others, names] =
    teamIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              organizationId: member.organizationId,
              memberId: member.id,
              userId: member.userId,
              role: member.role,
              createdAt: member.createdAt,
              name: userTable.name,
              email: userTable.email,
            })
            .from(member)
            .innerJoin(userTable, eq(userTable.id, member.userId))
            .where(
              and(
                inArray(member.organizationId, teamIds),
                ne(member.userId, userId),
              ),
            ),
          db
            .select({ id: organization.id, name: organization.name })
            .from(organization)
            .where(inArray(organization.id, teamIds)),
        ]);

  const nameById = new Map(names.map((row) => [row.id, row.name]));
  const teams: TeamFacts[] = teamIds
    .filter((id) => nameById.has(id))
    .map((organizationId) => ({
      organizationId,
      name: nameById.get(organizationId) ?? "Team",
      role:
        memberships.find((row) => row.organizationId === organizationId)
          ?.role ?? null,
      others: others
        .filter((row) => row.organizationId === organizationId)
        .map(({ organizationId: _id, ...row }) => row),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    teams,
    subscription: active
      ? {
          status: active.status,
          planName: PLAN_NAMES[planForSubscriptionProduct(active.productId)],
          currentPeriodEnd: active.currentPeriodEnd,
          cancelAtPeriodEnd: active.cancelAtPeriodEnd,
        }
      : null,
    billingConfigured: isBillingConfigured,
    personal: { codes, pages, files, domains },
  };
}

function isNotFound(error: unknown): boolean {
  const { statusCode, name } = error as { statusCode?: number; name?: string };
  return statusCode === 404 || name === "ResourceNotFound";
}

/**
 * Cancels the subscription and removes the Polar customer. Polar's delete
 * cancels active subscriptions immediately. Without a subscription a failure
 * is logged and ignored (most free users never had a Polar customer); with one
 * it stops the deletion, so nobody keeps paying for a deleted account.
 */
async function deletePolarCustomer(userId: string, subscribed: boolean) {
  if (!isBillingConfigured) return;
  try {
    await polar.customers.deleteExternal(userId);
  } catch (error) {
    if (isNotFound(error)) return;
    if (subscribed) {
      logError(error as Error, { action: "deleteAccount.cancelSubscription" });
      throw new AccountDeletionError(
        "We couldn't cancel your subscription, so your account wasn't deleted. Please try again in a few minutes, or email support@qrdx.dev.",
      );
    }
    logError(error as Error, { action: "deleteAccount.deletePolarCustomer" });
  }
}

/**
 * Deletes the account by `plan` (from planAccountDeletion with fresh facts).
 * Order matters: everything that can fail and leave the account usable runs
 * before the user row is deleted; storage cleanup runs after.
 */
export async function executeAccountDeletion({
  userId,
  plan,
  requestHeaders,
}: {
  userId: string;
  plan: DeletionPlan;
  requestHeaders: Headers;
}): Promise<void> {
  if (plan.blockers.length > 0) {
    throw new AccountDeletionError(plan.blockers[0]);
  }

  // 1. A team never loses its last owner: promote first, stop on failure.
  for (const team of plan.teams) {
    if (team.action !== "hand-over" || !team.promote) continue;
    try {
      // Through the organization plugin, acting as the (still existing) owner.
      await auth.api.updateMemberRole({
        headers: requestHeaders,
        body: {
          memberId: team.successor.memberId,
          role: "owner",
          organizationId: team.organizationId,
        },
      });
    } catch (error) {
      logError(error as Error, {
        action: "deleteAccount.promoteOwner",
        organizationId: team.organizationId,
      });
      throw new AccountDeletionError(
        `We couldn't make ${team.successor.name || team.successor.email} an owner of ${team.name}, so your account wasn't deleted. Make someone else an owner of the team, then try again.`,
      );
    }
  }

  // 2. Team content stays with the team.
  await Promise.all(
    plan.teams.flatMap((team) =>
      team.action === "hand-over"
        ? TEAM_CONTENT.map((table) =>
            db
              .update(table)
              .set({ userId: team.successor.userId })
              .where(
                and(
                  eq(table.userId, userId),
                  eq(table.organizationId, team.organizationId),
                ),
              ),
          )
        : [],
    ),
  );

  // 3. Paying customers are cancelled before anything is deleted.
  await deletePolarCustomer(userId, Boolean(plan.subscription));

  // 4. Teams with nobody else in them go too (their content becomes personal
  //    and is deleted with the account).
  for (const team of plan.teams) {
    if (team.action !== "delete-team") continue;
    await auth.api
      .deleteOrganization({
        headers: requestHeaders,
        body: { organizationId: team.organizationId },
      })
      .catch((error: unknown) =>
        logError(error as Error, {
          action: "deleteAccount.deleteTeam",
          organizationId: team.organizationId,
        }),
      );
  }

  // 5. What lives outside the database, collected before the rows go.
  const [files, domains, [profile]] = await Promise.all([
    db
      .select({ storageKey: fileAsset.storageKey })
      .from(fileAsset)
      .where(eq(fileAsset.userId, userId)),
    db
      .select({ hostname: customDomain.hostname })
      .from(customDomain)
      .where(eq(customDomain.userId, userId)),
    db
      .select({ image: userTable.image })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1),
  ]);

  // 5b. Your own workspace, when nobody else is in it. Not through the
  //     plugin, which never deletes an own workspace; its rows go with the
  //     user row below.
  if (await ownWorkspaceAlone(userId)) {
    await db
      .delete(organization)
      .where(eq(organization.id, ownWorkspaceId(userId)));
    scheduleWorkspaceAuditCleanup(ownWorkspaceId(userId));
  }

  // 6. Likes the user gave stop counting.
  await db
    .update(communityTheme)
    .set({ likeCount: sql`GREATEST(${communityTheme.likeCount} - 1, 0)` })
    .where(
      inArray(
        communityTheme.id,
        db
          .select({ id: themeLike.themeId })
          .from(themeLike)
          .where(eq(themeLike.userId, userId)),
      ),
    );

  // 6b. The same for community items (likes and saves), once
  //     manual-sql/0012 exists. Their own profile and items cascade with
  //     the user row.
  await uncountCommunityReactions(userId);

  // 6c. Affiliate payouts stay for the books, without the PayPal address
  //     (the affiliate and user ids are set to null with the user row).
  await anonymiseAffiliatePayouts(userId);

  // 7. The account. Sessions, linked accounts, memberships, codes (their
  //    short links then show "not found"), pages, scans, tokens and the rest
  //    cascade with the user row; subscriptions have no cascade.
  await db.delete(subscription).where(eq(subscription.userId, userId));
  await db.delete(userTable).where(eq(userTable.id, userId));

  // 8. Storage and domains, best effort: the account is already gone.
  if (getCustomDomainMode() === "vercel") {
    await Promise.all(
      domains.map(({ hostname }) =>
        removeVercelProjectDomain(hostname).catch((error) =>
          logError(error as Error, {
            action: "deleteAccount.removeDomain",
            hostname,
          }),
        ),
      ),
    );
  }
  if (isStorageConfigured) {
    const avatarKey = avatarKeyFromImage(profile?.image ?? null, userId);
    const keys = [
      ...files.map((row) => row.storageKey),
      ...(avatarKey ? [avatarKey] : []),
    ];
    const results = await Promise.allSettled(keys.map(deleteObject));
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      logError(new Error("Some stored files were not deleted"), {
        action: "deleteAccount.deleteFiles",
        failed: failed.length,
        total: keys.length,
      });
    }
  }
}
