import "server-only";

import {
  abuseReport,
  account,
  adminAuditLog,
  aiUsage,
  communityTheme,
  database as db,
  fileAsset,
  folder,
  formResponse,
  integration,
  invitation,
  landingPage,
  member,
  oauthApp,
  oauthToken,
  organization,
  qrCode,
  qrPreset,
  qrScan,
  session,
  subscription,
  tag,
  user,
  webhookDelivery,
  webhookEndpoint,
} from "@repo/database";
import { readSyncState } from "@repo/integrations/src/sinks/state";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { readJobs, summarizeJob } from "@/lib/migrate/jobs";
import { JOB_STORE_PROVIDER } from "@/lib/migrate/server/repo";
import { listAuthorizedApps } from "@/lib/oauth-apps/authorized";
import { getPlan } from "@/lib/plans";
import { parseUserAgent } from "@/lib/scans";
import { getPolarCustomerUrl } from "./polar";
import { isStuckImport } from "./rules";

// Data behind the user 360 page (/admin/users/<id>). One loader per section,
// so each section loads, streams and fails on its own. Secrets (tokens,
// password hashes, webhook secrets, client secret hashes) are never selected.

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
// Date bounds go through gte() so drizzle maps them like the column (UTC).
const countIf = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function loadProfile(userId: string) {
  const [found] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!found) return null;

  const [accounts, [sessions]] = await Promise.all([
    db
      .select({
        id: account.id,
        providerId: account.providerId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(account.createdAt),
    db
      .select({
        live: countIf(sql`${session.expiresAt} > now()`),
        lastActiveAt: sql<Date | null>`max(${session.updatedAt})`.mapWith(
          session.updatedAt,
        ),
      })
      .from(session)
      .where(eq(session.userId, userId)),
  ]);

  return {
    user: found,
    accounts,
    liveSessions: sessions?.live ?? 0,
    lastActiveAt: sessions?.lastActiveAt ?? null,
  };
}

export type UserProfile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

// ─── Plan and billing ────────────────────────────────────────────────────────

export async function loadBilling(userId: string) {
  const [plan, subscriptions] = await Promise.all([
    getPlan(userId),
    db
      .select({
        id: subscription.id,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        recurringInterval: subscription.recurringInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        endedAt: subscription.endedAt,
        customerId: subscription.customerId,
        productId: subscription.productId,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .orderBy(desc(subscription.createdAt))
      .limit(10),
  ]);
  const customerId = subscriptions[0]?.customerId ?? null;
  return {
    plan,
    subscriptions,
    customerId,
    polarUrl: customerId ? await getPolarCustomerUrl(customerId) : null,
  };
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function loadTeams(userId: string, email: string) {
  const memberships = await db
    .select({
      memberId: member.id,
      role: member.role,
      joinedAt: member.createdAt,
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt)
    .limit(50);

  const teamIds = memberships.map((row) => row.organizationId);
  const managed = memberships
    .filter((row) =>
      row.role.split(",").some((r) => ["owner", "admin"].includes(r.trim())),
    )
    .map((row) => row.organizationId);

  const [memberCounts, invitations] = await Promise.all([
    teamIds.length
      ? db
          .select({ organizationId: member.organizationId, total: count() })
          .from(member)
          .where(inArray(member.organizationId, teamIds))
          .groupBy(member.organizationId)
      : [],
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        teamName: organization.name,
        inviterId: invitation.inviterId,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(
        and(
          eq(invitation.status, "pending"),
          or(
            eq(invitation.email, email.toLowerCase()),
            managed.length
              ? inArray(invitation.organizationId, managed)
              : undefined,
          ),
        ),
      )
      .orderBy(desc(invitation.createdAt))
      .limit(20),
  ]);

  const totals = new Map(
    memberCounts.map((row) => [row.organizationId, row.total]),
  );
  return {
    teams: memberships.map((row) => ({
      ...row,
      members: totals.get(row.organizationId) ?? 1,
    })),
    invitations: invitations.map((row) => ({
      ...row,
      direction:
        row.email.toLowerCase() === email.toLowerCase()
          ? ("received" as const)
          : ("sent" as const),
    })),
  };
}

// ─── Codes ───────────────────────────────────────────────────────────────────

export async function loadCodes(userId: string) {
  const [[counts], recent] = await Promise.all([
    db
      .select({
        total: count(),
        pages: countIf(sql`${qrCode.kind} = 'page'`),
        live: countIf(
          sql`${qrCode.isActive} and ${qrCode.pausedAt} is null and ${qrCode.archivedAt} is null and ${qrCode.deletedAt} is null`,
        ),
        paused: countIf(sql`${qrCode.pausedAt} is not null`),
        disabled: countIf(sql`not ${qrCode.isActive}`),
        archived: countIf(sql`${qrCode.archivedAt} is not null`),
        trashed: countIf(sql`${qrCode.deletedAt} is not null`),
        scans: sql<number>`coalesce(sum(${qrCode.scanCount}), 0)`.mapWith(
          Number,
        ),
      })
      .from(qrCode)
      .where(eq(qrCode.userId, userId)),
    db
      .select({
        id: qrCode.id,
        slug: qrCode.slug,
        kind: qrCode.kind,
        title: qrCode.title,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        pausedAt: qrCode.pausedAt,
        archivedAt: qrCode.archivedAt,
        deletedAt: qrCode.deletedAt,
        expiresAt: qrCode.expiresAt,
        scanCount: qrCode.scanCount,
        lastScannedAt: qrCode.lastScannedAt,
        organizationId: qrCode.organizationId,
        createdAt: qrCode.createdAt,
      })
      .from(qrCode)
      .where(eq(qrCode.userId, userId))
      .orderBy(desc(qrCode.createdAt))
      .limit(10),
  ]);
  return { counts, recent };
}

// ─── Hosted pages and form responses ─────────────────────────────────────────

export async function loadPages(userId: string) {
  const [[pageCount], pages, [responses]] = await Promise.all([
    db
      .select({ total: count() })
      .from(landingPage)
      .where(eq(landingPage.userId, userId)),
    db
      .select({
        id: landingPage.id,
        title: landingPage.title,
        type: landingPage.type,
        version: landingPage.version,
        updatedAt: landingPage.updatedAt,
      })
      .from(landingPage)
      .where(eq(landingPage.userId, userId))
      .orderBy(desc(landingPage.updatedAt))
      .limit(8),
    db
      .select({
        total: count(),
        last30d: countIf(gte(formResponse.createdAt, daysAgo(30))),
      })
      .from(formResponse)
      .innerJoin(landingPage, eq(landingPage.id, formResponse.pageId))
      .where(eq(landingPage.userId, userId)),
  ]);

  const pageIds = pages.map((page) => page.id);
  const [codes, responseCounts] = pageIds.length
    ? await Promise.all([
        db
          .select({
            pageId: qrCode.pageId,
            id: qrCode.id,
            slug: qrCode.slug,
            isActive: qrCode.isActive,
          })
          .from(qrCode)
          .where(inArray(qrCode.pageId, pageIds)),
        db
          .select({
            pageId: formResponse.pageId,
            total: count(),
            lastAt: sql<Date | null>`max(${formResponse.createdAt})`.mapWith(
              formResponse.createdAt,
            ),
          })
          .from(formResponse)
          .where(inArray(formResponse.pageId, pageIds))
          .groupBy(formResponse.pageId),
      ])
    : [[], []];

  const codeByPage = new Map(codes.map((code) => [code.pageId, code]));
  const responsesByPage = new Map(
    responseCounts.map((row) => [row.pageId, row]),
  );
  return {
    total: pageCount?.total ?? 0,
    responses: {
      total: responses?.total ?? 0,
      last30d: responses?.last30d ?? 0,
    },
    pages: pages.map((page) => ({
      ...page,
      code: codeByPage.get(page.id) ?? null,
      responses: responsesByPage.get(page.id)?.total ?? 0,
      lastResponseAt: responsesByPage.get(page.id)?.lastAt ?? null,
    })),
  };
}

// ─── Themes, folders, tags, files ────────────────────────────────────────────

export async function loadLibrary(userId: string) {
  const [themes, [themeCount], folders, [folderCount], [tagCount], [files]] =
    await Promise.all([
      db
        .select({
          id: qrPreset.id,
          name: qrPreset.name,
          organizationId: qrPreset.organizationId,
          createdAt: qrPreset.createdAt,
          communityThemeId: communityTheme.id,
          likeCount: communityTheme.likeCount,
        })
        .from(qrPreset)
        .leftJoin(communityTheme, eq(communityTheme.themeId, qrPreset.id))
        .where(eq(qrPreset.userId, userId))
        .orderBy(desc(qrPreset.createdAt))
        .limit(6),
      db
        .select({
          total: count(),
          published: count(communityTheme.id),
        })
        .from(qrPreset)
        .leftJoin(communityTheme, eq(communityTheme.themeId, qrPreset.id))
        .where(eq(qrPreset.userId, userId)),
      db
        .select({
          id: folder.id,
          name: folder.name,
          organizationId: folder.organizationId,
          parentId: folder.parentId,
          createdAt: folder.createdAt,
        })
        .from(folder)
        .where(eq(folder.userId, userId))
        .orderBy(desc(folder.createdAt))
        .limit(6),
      db
        .select({ total: count() })
        .from(folder)
        .where(eq(folder.userId, userId)),
      db.select({ total: count() }).from(tag).where(eq(tag.userId, userId)),
      db
        .select({
          total: count(),
          blocked: countIf(sql`${fileAsset.status} = 'blocked'`),
          bytes: sql<number>`coalesce(sum(${fileAsset.size}), 0)`.mapWith(
            Number,
          ),
        })
        .from(fileAsset)
        .where(eq(fileAsset.userId, userId)),
    ]);
  return {
    themes,
    themeCount: themeCount?.total ?? 0,
    publishedThemes: themeCount?.published ?? 0,
    folders,
    folderCount: folderCount?.total ?? 0,
    tagCount: tagCount?.total ?? 0,
    files: files ?? { total: 0, blocked: 0, bytes: 0 },
  };
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export async function loadWebhooks(userId: string) {
  const endpoints = await db
    .select({
      id: webhookEndpoint.id,
      url: webhookEndpoint.url,
      events: webhookEndpoint.events,
      active: webhookEndpoint.active,
      organizationId: webhookEndpoint.organizationId,
      createdAt: webhookEndpoint.createdAt,
    })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.userId, userId))
    .orderBy(desc(webhookEndpoint.createdAt))
    .limit(20);
  const ids = endpoints.map((endpoint) => endpoint.id);
  if (ids.length === 0) {
    return { endpoints: [], deliveries: [], stats: [] };
  }

  const [stats, deliveries] = await Promise.all([
    db
      .select({
        endpointId: webhookDelivery.endpointId,
        succeeded: countIf(sql`${webhookDelivery.status} = 'succeeded'`),
        failed: countIf(sql`${webhookDelivery.status} = 'failed'`),
        pending: countIf(sql`${webhookDelivery.status} = 'pending'`),
        lastAt: sql<Date | null>`max(${webhookDelivery.createdAt})`.mapWith(
          webhookDelivery.createdAt,
        ),
      })
      .from(webhookDelivery)
      .where(inArray(webhookDelivery.endpointId, ids))
      .groupBy(webhookDelivery.endpointId),
    // Failures first: they are what support is asked about.
    db
      .select({
        id: webhookDelivery.id,
        endpointId: webhookDelivery.endpointId,
        event: webhookDelivery.event,
        status: webhookDelivery.status,
        attempts: webhookDelivery.attempts,
        nextAttemptAt: webhookDelivery.nextAttemptAt,
        lastError: webhookDelivery.lastError,
        createdAt: webhookDelivery.createdAt,
      })
      .from(webhookDelivery)
      .where(inArray(webhookDelivery.endpointId, ids))
      .orderBy(
        sql`case when ${webhookDelivery.status} = 'succeeded' then 1 else 0 end`,
        desc(webhookDelivery.createdAt),
      )
      .limit(12),
  ]);
  return { endpoints, deliveries, stats };
}

// ─── Integrations ────────────────────────────────────────────────────────────

export async function loadIntegrations(userId: string) {
  // Tokens are never selected; from metadata only the sync status is read.
  const rows = await db
    .select({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      scopes: integration.scopes,
      expiresAt: integration.expiresAt,
      lastSyncAt: integration.lastSyncAt,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      sync: sql<unknown>`${integration.metadata}::jsonb -> 'sync'`,
    })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        ne(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .orderBy(desc(integration.createdAt))
    .limit(30);
  return rows.map(({ sync, ...row }) => {
    const state = readSyncState(sync);
    return {
      ...row,
      sync: state
        ? {
            enabled: state.enabled,
            status: state.status,
            lastError: state.lastError,
            lastAttemptAt: state.lastAttemptAt,
            lastSuccessAt: state.lastSuccessAt,
            delivered: state.delivered,
          }
        : null,
    };
  });
}

// ─── OAuth apps ──────────────────────────────────────────────────────────────

export async function loadOAuthApps(userId: string) {
  const [owned, authorized] = await Promise.all([
    db
      .select({
        id: oauthApp.id,
        name: oauthApp.name,
        clientId: oauthApp.clientId,
        isActive: oauthApp.isActive,
        verified: oauthApp.verified,
        organizationId: oauthApp.organizationId,
        websiteUrl: oauthApp.websiteUrl,
        createdAt: oauthApp.createdAt,
      })
      .from(oauthApp)
      .where(eq(oauthApp.ownerUserId, userId))
      .orderBy(desc(oauthApp.createdAt))
      .limit(20),
    listAuthorizedApps(userId),
  ]);

  const ids = owned.map((app) => app.id);
  const [users, moderation] = ids.length
    ? await Promise.all([
        db
          .select({
            appId: oauthToken.appId,
            total: countDistinct(oauthToken.userId),
          })
          .from(oauthToken)
          .where(
            and(inArray(oauthToken.appId, ids), isNull(oauthToken.revokedAt)),
          )
          .groupBy(oauthToken.appId),
        db
          .selectDistinctOn([adminAuditLog.targetId], {
            appId: adminAuditLog.targetId,
            action: adminAuditLog.action,
          })
          .from(adminAuditLog)
          .where(
            and(
              eq(adminAuditLog.targetType, "oauth_app"),
              inArray(adminAuditLog.targetId, ids),
              inArray(adminAuditLog.action, [
                "oauth_app.suspend",
                "oauth_app.unsuspend",
              ]),
            ),
          )
          .orderBy(adminAuditLog.targetId, desc(adminAuditLog.createdAt)),
      ])
    : [[], []];

  const usersByApp = new Map(users.map((row) => [row.appId, row.total]));
  const suspended = new Set(
    moderation
      .filter((row) => row.action === "oauth_app.suspend")
      .map((row) => row.appId),
  );
  return {
    owned: owned.map((app) => ({
      ...app,
      users: usersByApp.get(app.id) ?? 0,
      suspended: suspended.has(app.id),
    })),
    authorized,
  };
}

// ─── Imports ─────────────────────────────────────────────────────────────────

export async function loadImports(userId: string) {
  const [row] = await db
    .select({ metadata: integration.metadata })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .limit(1);
  const now = new Date();
  return readJobs(row?.metadata).map((job) => ({
    ...summarizeJob(job),
    updatedAt: job.updatedAt,
    stuck: isStuckImport(job, now),
    errors: job.items
      .filter((item) => item.status === "failed" || item.redirectError)
      .slice(0, 3)
      .map((item) => ({
        link: item.shortLink ?? item.url,
        reason: item.reason ?? item.redirectError ?? "Failed",
      })),
  }));
}

// ─── Scans ───────────────────────────────────────────────────────────────────

export async function loadScans(userId: string) {
  const since = daysAgo(30);
  const ownScans = and(eq(qrCode.userId, userId), gte(qrScan.scannedAt, since));
  const [[totals], countries, devices] = await Promise.all([
    db
      .select({
        last30d: count(),
        last7d: countIf(gte(qrScan.scannedAt, daysAgo(7))),
        last24h: countIf(gte(qrScan.scannedAt, daysAgo(1))),
        visitors: countDistinct(qrScan.visitorHash),
        lastAt: sql<Date | null>`max(${qrScan.scannedAt})`.mapWith(
          qrScan.scannedAt,
        ),
      })
      .from(qrScan)
      .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
      .where(ownScans),
    db
      .select({ value: qrScan.country, total: count() })
      .from(qrScan)
      .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
      .where(and(ownScans, isNotNull(qrScan.country)))
      .groupBy(qrScan.country)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({ value: qrScan.deviceType, total: count() })
      .from(qrScan)
      .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
      .where(and(ownScans, isNotNull(qrScan.deviceType)))
      .groupBy(qrScan.deviceType)
      .orderBy(desc(count())),
  ]);
  return {
    totals: totals ?? {
      last30d: 0,
      last7d: 0,
      last24h: 0,
      visitors: 0,
      lastAt: null,
    },
    countries,
    devices,
  };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const describeDevice = (userAgent: string | null) => {
  if (!userAgent) return "Unknown device";
  const { deviceType, os, browser } = parseUserAgent(userAgent);
  const parts = [browser, os].filter(Boolean).join(" on ");
  return parts ? `${parts} (${deviceType})` : deviceType;
};

export async function loadSessions(userId: string) {
  // Never select the session token.
  const rows = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
      impersonatedBy: session.impersonatedBy,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt))
    .limit(10);
  return rows.map(({ userAgent, ...row }) => ({
    ...row,
    device: describeDevice(userAgent),
  }));
}

// ─── AI usage ────────────────────────────────────────────────────────────────

export async function loadAiUsage(userId: string) {
  const since = daysAgo(30);
  const [[totals], byModel, recent] = await Promise.all([
    db
      .select({
        total: count(),
        last30d: countIf(gte(aiUsage.createdAt, since)),
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId)),
    db
      .select({ modelId: aiUsage.modelId, total: count() })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)))
      .groupBy(aiUsage.modelId)
      .orderBy(desc(count())),
    db
      .select({
        id: aiUsage.id,
        modelId: aiUsage.modelId,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .orderBy(desc(aiUsage.createdAt))
      .limit(5),
  ]);
  return { totals: totals ?? { total: 0, last30d: 0 }, byModel, recent };
}

// ─── Abuse reports ───────────────────────────────────────────────────────────

/** Reports on their codes or pages, and reports they filed. */
export async function loadAbuseReports(userId: string, email: string) {
  const ownCodes = db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(eq(qrCode.userId, userId));
  const ownPages = db
    .select({ id: landingPage.id })
    .from(landingPage)
    .where(eq(landingPage.userId, userId));
  return db
    .select({
      id: abuseReport.id,
      reason: abuseReport.reason,
      status: abuseReport.status,
      url: abuseReport.url,
      reporterEmail: abuseReport.reporterEmail,
      createdAt: abuseReport.createdAt,
      codeSlug: qrCode.slug,
      codeOwnerId: qrCode.userId,
    })
    .from(abuseReport)
    .leftJoin(qrCode, eq(qrCode.id, abuseReport.qrCodeId))
    .where(
      or(
        inArray(abuseReport.qrCodeId, ownCodes),
        inArray(abuseReport.pageId, ownPages),
        eq(abuseReport.reporterEmail, email),
      ),
    )
    .orderBy(desc(abuseReport.createdAt))
    .limit(20);
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

/**
 * Admin actions about this user: on the account itself, or on something they
 * own (entries name the owner as subjectUserId, ownerId or ownerUserId).
 */
export function loadAuditTrail(userId: string) {
  const meta = sql`${adminAuditLog.metadata}::jsonb`;
  return db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      metadata: adminAuditLog.metadata,
      actorUserId: adminAuditLog.actorUserId,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(
      or(
        and(
          eq(adminAuditLog.targetType, "user"),
          eq(adminAuditLog.targetId, userId),
        ),
        sql`${meta} ->> 'subjectUserId' = ${userId}`,
        sql`${meta} ->> 'ownerId' = ${userId}`,
        sql`${meta} ->> 'ownerUserId' = ${userId}`,
      ),
    )
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(30);
}
