import "server-only";

import {
  database as db,
  organization,
  slackBotInstallation,
  slackUserLink,
  user,
} from "@repo/database";
import { decryptApiKey, encryptApiKey } from "@repo/integrations";
import cuid from "cuid";
import { and, asc, eq, isNull } from "drizzle-orm";
import { isMissingSchemaError } from "@/lib/community/tables";
import { installationUpsert } from "./install-upsert";

// The bot's two tables (packages/database/schema.ts, manual-sql/
// 2026-11-10-slack-bot.sql). Only called while the bot is configured
// (isFeatureAvailable("slackBot")); before the SQL is applied every call
// here fails with SlackBotStoreUnavailableError, which callers turn into
// "not available yet". Bot tokens are encrypted at rest and decrypted only
// to post a reply.

/** The tables aren't there yet (manual-sql/2026-11-10-slack-bot.sql). */
export class SlackBotStoreUnavailableError extends Error {
  constructor() {
    super("The Slack bot tables don't exist yet");
    this.name = "SlackBotStoreUnavailableError";
  }
}

async function guarded<T>(query: () => PromiseLike<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) throw new SlackBotStoreUnavailableError();
    throw error;
  }
}

/**
 * A Slack workspace: its id and, on Enterprise Grid, its org's (null
 * outside Grid). Without `enterpriseId` the workspace id alone is matched
 * (link tokens carry only that; Slack workspace ids are unique anyway).
 */
export interface SlackTeamRef {
  teamId: string;
  enterpriseId?: string | null;
}

const sameTeam = ({ teamId, enterpriseId }: SlackTeamRef) =>
  enterpriseId === undefined
    ? eq(slackBotInstallation.teamId, teamId)
    : and(
        eq(slackBotInstallation.teamId, teamId),
        enterpriseId
          ? eq(slackBotInstallation.enterpriseId, enterpriseId)
          : isNull(slackBotInstallation.enterpriseId),
      );

export interface SlackInstallation {
  id: string;
  teamId: string;
  enterpriseId: string | null;
  teamName: string | null;
  botUserId: string;
}

export async function findInstallation(
  team: SlackTeamRef,
): Promise<SlackInstallation | null> {
  const [row] = await guarded(() =>
    db
      .select({
        id: slackBotInstallation.id,
        teamId: slackBotInstallation.teamId,
        enterpriseId: slackBotInstallation.enterpriseId,
        teamName: slackBotInstallation.teamName,
        botUserId: slackBotInstallation.botUserId,
      })
      .from(slackBotInstallation)
      .where(sameTeam(team))
      .limit(1),
  );
  return row ?? null;
}

/** The decrypted bot token of a workspace's install, or null. */
export async function findBotToken(team: SlackTeamRef): Promise<{
  token: string;
  botUserId: string;
} | null> {
  const [row] = await guarded(() =>
    db
      .select({
        botToken: slackBotInstallation.botToken,
        botUserId: slackBotInstallation.botUserId,
      })
      .from(slackBotInstallation)
      .where(sameTeam(team))
      .limit(1),
  );
  if (!row) return null;
  return { token: decryptApiKey(row.botToken), botUserId: row.botUserId };
}

/**
 * Adds the workspace's install, or updates it on a reinstall: one upsert on
 * the (team_id, coalesce(enterprise_id, '')) index, so two installs at once
 * can't race (./install-upsert.ts).
 */
export async function saveInstallation(input: {
  teamId: string;
  enterpriseId: string | null;
  teamName: string | null;
  botUserId: string;
  botToken: string;
  scopes: string | null;
  installedByUserId: string;
}): Promise<void> {
  await guarded(() =>
    db.execute(
      installationUpsert({
        id: cuid(),
        teamId: input.teamId,
        enterpriseId: input.enterpriseId,
        teamName: input.teamName,
        botUserId: input.botUserId,
        botToken: encryptApiKey(input.botToken),
        scopes: input.scopes,
        installedByUserId: input.installedByUserId,
        now: new Date(),
      }),
    ),
  );
}

/**
 * The app was removed from a Slack workspace, or its bot token revoked:
 * forget the install and every link made there.
 */
export async function forgetTeam(team: SlackTeamRef): Promise<void> {
  await guarded(() => db.delete(slackBotInstallation).where(sameTeam(team)));
  await guarded(() =>
    db.delete(slackUserLink).where(eq(slackUserLink.teamId, team.teamId)),
  );
}

export interface SlackUserLinkRow {
  id: string;
  userId: string;
  organizationId: string;
}

export async function findUserLink(
  teamId: string,
  slackUserId: string,
): Promise<SlackUserLinkRow | null> {
  const [row] = await guarded(() =>
    db
      .select({
        id: slackUserLink.id,
        userId: slackUserLink.userId,
        organizationId: slackUserLink.organizationId,
      })
      .from(slackUserLink)
      .where(
        and(
          eq(slackUserLink.teamId, teamId),
          eq(slackUserLink.slackUserId, slackUserId),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

/** A Slack person's current link and the name of its QRdx workspace. */
export async function describeUserLink(
  teamId: string,
  slackUserId: string,
): Promise<(SlackUserLinkRow & { workspaceName: string | null }) | null> {
  const [row] = await guarded(() =>
    db
      .select({
        id: slackUserLink.id,
        userId: slackUserLink.userId,
        organizationId: slackUserLink.organizationId,
        workspaceName: organization.name,
      })
      .from(slackUserLink)
      .leftJoin(organization, eq(organization.id, slackUserLink.organizationId))
      .where(
        and(
          eq(slackUserLink.teamId, teamId),
          eq(slackUserLink.slackUserId, slackUserId),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

/**
 * Links a Slack person to a QRdx user and workspace. Replaces their link:
 * the confirm page asks first (app/(app)/integrations/slack/link/actions.ts).
 */
export async function saveUserLink(input: {
  teamId: string;
  slackUserId: string;
  userId: string;
  organizationId: string;
}): Promise<void> {
  const now = new Date();
  await guarded(() =>
    db
      .insert(slackUserLink)
      .values({ id: cuid(), ...input, createdAt: now })
      .onConflictDoUpdate({
        target: [slackUserLink.teamId, slackUserLink.slackUserId],
        set: {
          userId: input.userId,
          organizationId: input.organizationId,
          createdAt: now,
        },
      }),
  );
}

/** /qr unlink. True when there was a link. */
export async function deleteUserLink(
  teamId: string,
  slackUserId: string,
): Promise<boolean> {
  const removed = await guarded(() =>
    db
      .delete(slackUserLink)
      .where(
        and(
          eq(slackUserLink.teamId, teamId),
          eq(slackUserLink.slackUserId, slackUserId),
        ),
      )
      .returning({ id: slackUserLink.id }),
  );
  return removed.length > 0;
}

/** Settings → Unlink: only a link of this QRdx user. */
export async function deleteUserLinkOf(
  userId: string,
  linkId: string,
): Promise<boolean> {
  const removed = await guarded(() =>
    db
      .delete(slackUserLink)
      .where(
        and(eq(slackUserLink.id, linkId), eq(slackUserLink.userId, userId)),
      )
      .returning({ id: slackUserLink.id }),
  );
  return removed.length > 0;
}

export interface SlackInstallSummary {
  teamId: string;
  teamName: string | null;
  installedAt: Date;
}

/** Slack workspaces this QRdx user added the bot to (Settings). */
export async function listInstallationsBy(
  userId: string,
): Promise<SlackInstallSummary[]> {
  return guarded(() =>
    db
      .select({
        teamId: slackBotInstallation.teamId,
        teamName: slackBotInstallation.teamName,
        installedAt: slackBotInstallation.createdAt,
      })
      .from(slackBotInstallation)
      .where(eq(slackBotInstallation.installedByUserId, userId))
      .orderBy(asc(slackBotInstallation.createdAt)),
  );
}

export interface SlackLinkSummary {
  id: string;
  teamId: string;
  teamName: string | null;
  slackUserId: string;
  workspaceName: string | null;
  linkedAt: Date;
}

/** This QRdx user's linked Slack identities (Settings). */
export async function listUserLinks(
  userId: string,
): Promise<SlackLinkSummary[]> {
  return guarded(() =>
    db
      .select({
        id: slackUserLink.id,
        teamId: slackUserLink.teamId,
        teamName: slackBotInstallation.teamName,
        slackUserId: slackUserLink.slackUserId,
        workspaceName: organization.name,
        linkedAt: slackUserLink.createdAt,
      })
      .from(slackUserLink)
      .leftJoin(
        slackBotInstallation,
        eq(slackBotInstallation.teamId, slackUserLink.teamId),
      )
      .leftJoin(organization, eq(organization.id, slackUserLink.organizationId))
      .where(eq(slackUserLink.userId, userId))
      .orderBy(asc(slackUserLink.createdAt)),
  );
}

export interface WorkspaceSlackLink {
  id: string;
  teamId: string;
  teamName: string | null;
  slackUserId: string;
  /** The QRdx member whose account the Slack person acts as */
  userId: string;
  memberName: string | null;
  memberEmail: string | null;
  linkedAt: Date;
}

/**
 * The Slack people linked to a QRdx workspace (its admins' settings), or
 * just the link `linkId` when it's one of them.
 */
export async function listWorkspaceLinks(
  organizationId: string,
  linkId?: string,
): Promise<WorkspaceSlackLink[]> {
  return guarded(() =>
    db
      .select({
        id: slackUserLink.id,
        teamId: slackUserLink.teamId,
        teamName: slackBotInstallation.teamName,
        slackUserId: slackUserLink.slackUserId,
        userId: slackUserLink.userId,
        memberName: user.name,
        memberEmail: user.email,
        linkedAt: slackUserLink.createdAt,
      })
      .from(slackUserLink)
      .leftJoin(
        slackBotInstallation,
        eq(slackBotInstallation.teamId, slackUserLink.teamId),
      )
      .leftJoin(user, eq(user.id, slackUserLink.userId))
      .where(
        and(
          eq(slackUserLink.organizationId, organizationId),
          linkId === undefined ? undefined : eq(slackUserLink.id, linkId),
        ),
      )
      .orderBy(asc(slackUserLink.createdAt), asc(slackUserLink.id)),
  );
}

/** Revoke: a link to this QRdx workspace only. The removed link, or null. */
export async function deleteWorkspaceLink(
  organizationId: string,
  linkId: string,
): Promise<{ teamId: string; slackUserId: string; userId: string } | null> {
  const [removed] = await guarded(() =>
    db
      .delete(slackUserLink)
      .where(
        and(
          eq(slackUserLink.id, linkId),
          eq(slackUserLink.organizationId, organizationId),
        ),
      )
      .returning({
        teamId: slackUserLink.teamId,
        slackUserId: slackUserLink.slackUserId,
        userId: slackUserLink.userId,
      }),
  );
  return removed ?? null;
}
