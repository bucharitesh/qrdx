import "server-only";
import {
  account,
  adminAuditLog,
  aiUsage,
  communityTheme,
  database as db,
  integration,
  oauthApp,
  qrCode,
  qrPreset,
  qrScan,
  session,
  subscription,
  user,
} from "@repo/database";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyPoint {
  date: string;
  count: number;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

function startOfUtcDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date;
}

const countSince = (column: PgColumn, since: Date) =>
  sql<number>`count(*) filter (where ${gte(column, since)})`.mapWith(Number);

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function dailySeries(
  table: PgTable,
  column: PgColumn,
  days: number,
): Promise<DailyPoint[]> {
  const since = startOfUtcDay(days - 1);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(table)
    .where(gte(column, since))
    .groupBy(sql`1`);

  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });
}

// Overview

export async function getOverviewStats() {
  const today = startOfUtcDay();
  const last7d = daysAgo(7);
  const last30d = daysAgo(30);

  const [
    [users],
    [sessions],
    [presets],
    [community],
    [ai],
    integrationsByProvider,
    subscriptionsByStatus,
    [oauthApps],
    signupSeries,
    aiSeries,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        today: countSince(user.createdAt, today),
        last7d: countSince(user.createdAt, last7d),
        last30d: countSince(user.createdAt, last30d),
      })
      .from(user),
    db
      .select({
        activeUsers: sql<number>`count(distinct ${session.userId})`.mapWith(
          Number,
        ),
        sessions: count(),
      })
      .from(session)
      .where(
        and(gte(session.updatedAt, last7d), gt(session.expiresAt, new Date())),
      ),
    db.select({ total: count() }).from(qrPreset),
    db.select({ total: count() }).from(communityTheme),
    db
      .select({
        total: count(),
        today: countSince(aiUsage.createdAt, today),
        last7d: countSince(aiUsage.createdAt, last7d),
        last30d: countSince(aiUsage.createdAt, last30d),
      })
      .from(aiUsage),
    getIntegrationCounts(),
    getSubscriptionStatusCounts(),
    db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${eq(oauthApp.isActive, true)})`.mapWith(
            Number,
          ),
      })
      .from(oauthApp),
    dailySeries(user, user.createdAt, 30),
    dailySeries(aiUsage, aiUsage.createdAt, 30),
  ]);

  return {
    users,
    sessions,
    presets: presets.total,
    communityThemes: community.total,
    ai,
    integrationsByProvider,
    subscriptionsByStatus,
    oauthApps,
    signupSeries,
    aiSeries,
  };
}

// Users

export async function listUsers({ q, page }: { q?: string; page: number }) {
  const term = q?.trim();
  const where = term
    ? or(
        ilike(user.email, `%${escapeLike(term)}%`),
        ilike(user.name, `%${escapeLike(term)}%`),
        eq(user.id, term),
      )
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(user).where(where),
  ]);

  const ids = rows.map((row) => row.id);
  const [usage, subscriptions] = ids.length
    ? await Promise.all([
        db
          .select({ userId: aiUsage.userId, total: count() })
          .from(aiUsage)
          .where(inArray(aiUsage.userId, ids))
          .groupBy(aiUsage.userId),
        db
          .selectDistinctOn([subscription.userId], {
            userId: subscription.userId,
            status: subscription.status,
          })
          .from(subscription)
          .where(inArray(subscription.userId, ids))
          .orderBy(subscription.userId, desc(subscription.createdAt)),
      ])
    : [[], []];

  const usageByUser = new Map(usage.map((row) => [row.userId, row.total]));
  const statusByUser = new Map(
    subscriptions.map((row) => [row.userId, row.status]),
  );

  return {
    total,
    users: rows.map((row) => ({
      ...row,
      aiUsageCount: usageByUser.get(row.id) ?? 0,
      subscriptionStatus: statusByUser.get(row.id) ?? null,
    })),
  };
}

export async function getUserDetail(userId: string) {
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

  if (!found) {
    return null;
  }

  const now = new Date();
  const [
    themes,
    integrations,
    subscriptions,
    [usage],
    recentUsage,
    [sessions],
    providers,
    auditEntries,
  ] = await Promise.all([
    db
      .select({
        id: qrPreset.id,
        name: qrPreset.name,
        createdAt: qrPreset.createdAt,
        communityThemeId: communityTheme.id,
        likeCount: communityTheme.likeCount,
      })
      .from(qrPreset)
      .leftJoin(communityTheme, eq(communityTheme.themeId, qrPreset.id))
      .where(eq(qrPreset.userId, userId))
      .orderBy(desc(qrPreset.createdAt)),
    // Never select tokens.
    db
      .select({
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        scopes: integration.scopes,
        lastSyncAt: integration.lastSyncAt,
        createdAt: integration.createdAt,
      })
      .from(integration)
      .where(eq(integration.userId, userId))
      .orderBy(desc(integration.createdAt)),
    db
      .select({
        id: subscription.id,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        recurringInterval: subscription.recurringInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .orderBy(desc(subscription.createdAt)),
    db
      .select({
        total: count(),
        last30d: countSince(aiUsage.createdAt, daysAgo(30)),
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId)),
    db
      .select({
        id: aiUsage.id,
        modelId: aiUsage.modelId,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .orderBy(desc(aiUsage.createdAt))
      .limit(10),
    db
      .select({
        active: count(),
        lastSeenAt: sql<Date | null>`max(${session.updatedAt})`.mapWith(
          session.updatedAt,
        ),
      })
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, now))),
    db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select()
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, "user"),
          eq(adminAuditLog.targetId, userId),
        ),
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(20),
  ]);

  return {
    user: found,
    themes,
    integrations,
    subscriptions,
    usage,
    recentUsage,
    sessions,
    providers: providers.map((row) => row.providerId),
    auditEntries,
  };
}

// Themes

export type ThemeView = "community" | "saved";

export async function listThemes({
  view,
  page,
}: {
  view: ThemeView;
  page: number;
}) {
  const where: SQL | undefined =
    view === "community" ? isNotNull(communityTheme.id) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: qrPreset.id,
        name: qrPreset.name,
        createdAt: qrPreset.createdAt,
        ownerId: user.id,
        ownerEmail: user.email,
        communityThemeId: communityTheme.id,
        publishedAt: communityTheme.publishedAt,
        likeCount: communityTheme.likeCount,
      })
      .from(qrPreset)
      .innerJoin(user, eq(user.id, qrPreset.userId))
      .leftJoin(communityTheme, eq(communityTheme.themeId, qrPreset.id))
      .where(where)
      .orderBy(
        view === "community"
          ? desc(communityTheme.publishedAt)
          : desc(qrPreset.createdAt),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(qrPreset)
      .leftJoin(communityTheme, eq(communityTheme.themeId, qrPreset.id))
      .where(where),
  ]);

  return { total, themes: rows };
}

// AI usage

const numericSum = (column: PgColumn) =>
  sql<number>`coalesce(sum(case when ${column} ~ '^[0-9]+$' then ${column}::bigint else 0 end), 0)`.mapWith(
    Number,
  );

export async function getAiUsageStats() {
  const last30d = daysAgo(30);

  const [series, topUsers, byModel] = await Promise.all([
    dailySeries(aiUsage, aiUsage.createdAt, 30),
    db
      .select({
        userId: aiUsage.userId,
        email: user.email,
        name: user.name,
        total: count(),
      })
      .from(aiUsage)
      .innerJoin(user, eq(user.id, aiUsage.userId))
      .where(gte(aiUsage.createdAt, last30d))
      .groupBy(aiUsage.userId, user.email, user.name)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({
        modelId: aiUsage.modelId,
        total: count(),
        promptTokens: numericSum(aiUsage.promptTokens),
        completionTokens: numericSum(aiUsage.completionTokens),
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, last30d))
      .groupBy(aiUsage.modelId)
      .orderBy(desc(count())),
  ]);

  return { series, topUsers, byModel };
}

// Subscriptions

export function getSubscriptionStatusCounts() {
  return db
    .select({ status: subscription.status, total: count() })
    .from(subscription)
    .groupBy(subscription.status)
    .orderBy(desc(count()));
}

/**
 * MRR estimate from active rows in the DB. Polar is deliberately not queried so
 * the panel works for self-hosters; Polar's metrics API could replace this later.
 */
export async function getEstimatedMrr() {
  const rows = await db
    .select({
      currency: subscription.currency,
      interval: subscription.recurringInterval,
      amount: sql<number>`coalesce(sum(${subscription.amount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(subscription)
    .where(eq(subscription.status, "active"))
    .groupBy(subscription.currency, subscription.recurringInterval);

  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    const monthly = row.interval === "year" ? row.amount / 12 : row.amount;
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + monthly);
  }
  return Array.from(byCurrency, ([currency, cents]) => ({ currency, cents }));
}

export async function listSubscriptions({
  status,
  page,
}: {
  status?: string;
  page: number;
}) {
  const where = status ? eq(subscription.status, status) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: subscription.id,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        recurringInterval: subscription.recurringInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        userId: user.id,
        email: user.email,
      })
      .from(subscription)
      .leftJoin(user, eq(user.id, subscription.userId))
      .where(where)
      .orderBy(desc(subscription.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(subscription).where(where),
  ]);

  return { total, subscriptions: rows };
}

// Integrations

export function getIntegrationCounts() {
  return db
    .select({
      provider: integration.provider,
      status: integration.status,
      total: count(),
    })
    .from(integration)
    .groupBy(integration.provider, integration.status)
    .orderBy(integration.provider, integration.status);
}

export function listRecentIntegrations() {
  // Never select tokens.
  return db
    .select({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      lastSyncAt: integration.lastSyncAt,
      createdAt: integration.createdAt,
      userId: user.id,
      email: user.email,
    })
    .from(integration)
    .innerJoin(user, eq(user.id, integration.userId))
    .orderBy(desc(integration.createdAt))
    .limit(50);
}

// Audit log

export async function listAuditLog({ page }: { page: number }) {
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        metadata: adminAuditLog.metadata,
        createdAt: adminAuditLog.createdAt,
        actorUserId: adminAuditLog.actorUserId,
        actorEmail: user.email,
      })
      .from(adminAuditLog)
      .leftJoin(user, eq(user.id, adminAuditLog.actorUserId))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(adminAuditLog),
  ]);

  return { total, entries: rows };
}

// Dynamic QR codes

export type AdminCodeStatus = "all" | "active" | "archived" | "disabled";

const codeStatusWhere: Record<AdminCodeStatus, SQL | undefined> = {
  all: undefined,
  active: sql`${qrCode.isActive} and ${qrCode.archivedAt} is null`,
  archived: isNotNull(qrCode.archivedAt),
  disabled: eq(qrCode.isActive, false),
};

export async function listDynamicCodes({
  q,
  status,
  page,
}: {
  q?: string;
  status: AdminCodeStatus;
  page: number;
}) {
  const term = q?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : null;
  const where = and(
    codeStatusWhere[status],
    term && pattern
      ? or(
          eq(qrCode.slug, term),
          eq(qrCode.id, term),
          ilike(qrCode.destinationUrl, pattern),
          ilike(qrCode.title, pattern),
          ilike(user.email, pattern),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: qrCode.id,
        slug: qrCode.slug,
        title: qrCode.title,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        archivedAt: qrCode.archivedAt,
        scanCount: qrCode.scanCount,
        lastScannedAt: qrCode.lastScannedAt,
        createdAt: qrCode.createdAt,
        organizationId: qrCode.organizationId,
        ownerId: user.id,
        ownerEmail: user.email,
      })
      .from(qrCode)
      .innerJoin(user, eq(user.id, qrCode.userId))
      .where(where)
      .orderBy(desc(qrCode.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(qrCode)
      .innerJoin(user, eq(user.id, qrCode.userId))
      .where(where),
  ]);

  return { total, codes: rows };
}

export async function getDynamicCodeStats() {
  const [[codes], [scans]] = await Promise.all([
    db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${codeStatusWhere.active})`.mapWith(
            Number,
          ),
        disabled:
          sql<number>`count(*) filter (where ${codeStatusWhere.disabled})`.mapWith(
            Number,
          ),
        scans: sql<number>`coalesce(sum(${qrCode.scanCount}), 0)`.mapWith(
          Number,
        ),
      })
      .from(qrCode),
    db
      .select({ last7d: count() })
      .from(qrScan)
      .where(gte(qrScan.scannedAt, daysAgo(7))),
  ]);

  return { ...codes, scansLast7d: scans.last7d };
}
