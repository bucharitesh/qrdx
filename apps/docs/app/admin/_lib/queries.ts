import "server-only";
import {
  abuseReport,
  adminAuditLog,
  aiUsage,
  communityTheme,
  database as db,
  formResponse,
  integration,
  landingPage,
  qrCode,
  qrPreset,
  qrScan,
  session,
  subscription,
  user,
  webhookDelivery,
} from "@repo/database";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { JOB_STORE_PROVIDER } from "@/lib/migrate/server/repo";
import { type Plan, planForSubscriptionProduct } from "@/lib/plans";

export const PAGE_SIZE = 25;
// Same as lib/subscription.ts: these statuses grant a paid plan.
const ENTITLED = ["active", "trialing"];
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
    [sessions],
    [ai],
    integrationsByProvider,
    subscriptionsByStatus,
    signupSeries,
    aiSeries,
  ] = await Promise.all([
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
    dailySeries(user, user.createdAt, 30),
    dailySeries(aiUsage, aiUsage.createdAt, 30),
  ]);

  return {
    sessions,
    ai,
    integrationsByProvider,
    subscriptionsByStatus,
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
            productId: subscription.productId,
          })
          .from(subscription)
          .where(inArray(subscription.userId, ids))
          .orderBy(subscription.userId, desc(subscription.createdAt)),
      ])
    : [[], []];

  const usageByUser = new Map(usage.map((row) => [row.userId, row.total]));
  const subscriptionByUser = new Map(
    subscriptions.map((row) => [row.userId, row]),
  );

  return {
    total,
    users: rows.map((row) => {
      const latest = subscriptionByUser.get(row.id);
      const plan: Plan =
        latest && ENTITLED.includes(latest.status)
          ? planForSubscriptionProduct(latest.productId)
          : "free";
      return {
        ...row,
        aiUsageCount: usageByUser.get(row.id) ?? 0,
        subscriptionStatus: latest?.status ?? null,
        plan,
      };
    }),
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

// The importer keeps its job history in an integration row; it isn't a connection.
const realIntegration = ne(integration.provider, JOB_STORE_PROVIDER);

export function getIntegrationCounts() {
  return db
    .select({
      provider: integration.provider,
      status: integration.status,
      total: count(),
    })
    .from(integration)
    .where(realIntegration)
    .groupBy(integration.provider, integration.status)
    .orderBy(integration.provider, integration.status);
}

export async function listIntegrations({
  provider,
  status,
  page,
}: {
  provider?: string;
  status?: string;
  page: number;
}) {
  const where = and(
    realIntegration,
    provider ? eq(integration.provider, provider) : undefined,
    status ? eq(integration.status, status) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    // Never select tokens.
    db
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
      .where(where)
      .orderBy(desc(integration.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(integration).where(where),
  ]);
  return { total, integrations: rows };
}

// Audit log

export async function listAuditLog({
  page,
  q,
}: {
  page: number;
  /** An action ("user.ban", or a prefix like "user."), or a target / actor id */
  q?: string;
}) {
  const term = q?.trim();
  const where = term
    ? or(
        ilike(adminAuditLog.action, `${escapeLike(term)}%`),
        eq(adminAuditLog.targetId, term),
        eq(adminAuditLog.actorUserId, term),
        sql`${adminAuditLog.metadata}::jsonb ->> 'subjectUserId' = ${term}`,
      )
    : undefined;
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
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(adminAuditLog).where(where),
  ]);

  return { total, entries: rows };
}

// Dynamic QR codes

export type AdminCodeStatus = "all" | "active" | "archived" | "disabled";

const codeStatusWhere: Record<AdminCodeStatus, SQL | undefined> = {
  all: undefined,
  active: sql`${qrCode.isActive} and ${qrCode.archivedAt} is null and ${qrCode.deletedAt} is null`,
  archived: isNotNull(qrCode.archivedAt),
  disabled: eq(qrCode.isActive, false),
};

export async function listDynamicCodes({
  q,
  status,
  kind,
  page,
}: {
  q?: string;
  status: AdminCodeStatus;
  kind?: "redirect" | "page";
  page: number;
}) {
  const term = q?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : null;
  const where = and(
    codeStatusWhere[status],
    kind ? eq(qrCode.kind, kind) : undefined,
    term && pattern
      ? or(
          eq(qrCode.slug, term),
          eq(qrCode.id, term),
          eq(qrCode.userId, term),
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
        kind: qrCode.kind,
        title: qrCode.title,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        pausedAt: qrCode.pausedAt,
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

// Dashboard

/** The numbers on /admin, each linking to the list behind it. */
export async function getDashboardStats() {
  const today = startOfUtcDay();
  const last7d = daysAgo(7);

  const [
    [users],
    [paid],
    [codes],
    [scans],
    [pages],
    [responses],
    [reports],
    [deliveries],
    [integrationErrors],
  ] = await Promise.all([
    db
      .select({ total: count(), last7d: countSince(user.createdAt, last7d) })
      .from(user),
    db
      .select({ total: countDistinct(subscription.userId) })
      .from(subscription)
      .where(inArray(subscription.status, ENTITLED)),
    db
      .select({
        total: count(),
        live: sql<number>`count(*) filter (where ${codeStatusWhere.active})`.mapWith(
          Number,
        ),
      })
      .from(qrCode),
    db
      .select({ last7d: count(), today: countSince(qrScan.scannedAt, today) })
      .from(qrScan)
      .where(gte(qrScan.scannedAt, last7d)),
    db.select({ total: count() }).from(landingPage),
    db
      .select({
        total: count(),
        last7d: countSince(formResponse.createdAt, last7d),
      })
      .from(formResponse),
    db
      .select({ open: count() })
      .from(abuseReport)
      .where(eq(abuseReport.status, "open")),
    db
      .select({
        failed7d:
          sql<number>`count(*) filter (where ${and(eq(webhookDelivery.status, "failed"), gte(webhookDelivery.createdAt, last7d))})`.mapWith(
            Number,
          ),
        overdue:
          sql<number>`count(*) filter (where ${and(eq(webhookDelivery.status, "pending"), lte(webhookDelivery.nextAttemptAt, new Date(Date.now() - 60 * 60 * 1000)))})`.mapWith(
            Number,
          ),
      })
      .from(webhookDelivery)
      .where(inArray(webhookDelivery.status, ["failed", "pending"])),
    db
      .select({ total: count() })
      .from(integration)
      .where(and(realIntegration, eq(integration.status, "error"))),
  ]);

  return {
    users: users ?? { total: 0, last7d: 0 },
    paidUsers: paid?.total ?? 0,
    codes: codes ?? { total: 0, live: 0 },
    scans: scans ?? { last7d: 0, today: 0 },
    pages: pages?.total ?? 0,
    responses: responses ?? { total: 0, last7d: 0 },
    attention: {
      openReports: reports?.open ?? 0,
      failedDeliveries7d: deliveries?.failed7d ?? 0,
      overdueDeliveries: deliveries?.overdue ?? 0,
      integrationErrors: integrationErrors?.total ?? 0,
    },
  };
}
