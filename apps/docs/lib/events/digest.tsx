import "server-only";

import { createHash } from "node:crypto";
import {
  database as db,
  formResponse,
  landingPage,
  member,
  notificationSetting,
  qrCode,
  qrScan,
  user,
} from "@repo/database";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { codeLabel } from "@/lib/email/templates/parts";
import {
  WeeklyDigestEmail,
  type WeeklyDigestEmailProps,
} from "@/lib/email/templates/weekly-digest";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { workspaceTitle } from "./notify";
import type { EventScope } from "./subscribers";
import { unsubscribeUrl } from "./unsubscribe";

// Weekly digest: the cron runs hourly on Mondays and each run handles the
// settings whose id hashes to the current UTC hour, spreading sends over the
// day (Resend allows a few requests per second) without any stored cursor.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DIGEST_SHARDS = 24;
// Stay under Resend's default rate limit (2 requests / second).
const SEND_SPACING_MS = 550;

/** Monday 00:00 UTC of the week before the one containing `now`, and the Monday after. */
export function previousWeek(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (end.getUTCDay() + 6) % 7;
  end.setTime(end.getTime() - daysSinceMonday * DAY_MS);
  return { start: new Date(end.getTime() - 7 * DAY_MS), end };
}

export function digestShard(settingId: string): number {
  return (
    createHash("sha256").update(settingId).digest().readUInt32BE(0) %
    DIGEST_SHARDS
  );
}

function codeScope(scope: EventScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

function pageScope(scope: EventScope): SQL {
  return scope.organizationId
    ? eq(landingPage.organizationId, scope.organizationId)
    : (and(
        eq(landingPage.userId, scope.userId),
        isNull(landingPage.organizationId),
      ) as SQL);
}

type DigestNumbers = Omit<
  WeeklyDigestEmailProps,
  "workspaceName" | "dashboardUrl" | "unsubscribeUrl"
>;

export async function buildDigest(
  scope: EventScope,
  { start, end }: { start: Date; end: Date },
): Promise<DigestNumbers> {
  const previousStart = new Date(start.getTime() - 7 * DAY_MS);
  const inWeek = and(gte(qrScan.scannedAt, start), lt(qrScan.scannedAt, end));

  const [[totals], [previous], topCodes, topCountries, [created], [responses]] =
    await db.batch([
      db
        .select({ total: count(), unique: countDistinct(qrScan.visitorHash) })
        .from(qrScan)
        .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
        .where(and(codeScope(scope), inWeek)),
      db
        .select({ total: count() })
        .from(qrScan)
        .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
        .where(
          and(
            codeScope(scope),
            gte(qrScan.scannedAt, previousStart),
            lt(qrScan.scannedAt, start),
          ),
        ),
      db
        .select({
          id: qrCode.id,
          slug: qrCode.slug,
          title: qrCode.title,
          scans: count(),
        })
        .from(qrScan)
        .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
        .where(and(codeScope(scope), inWeek))
        .groupBy(qrCode.id, qrCode.slug, qrCode.title)
        .orderBy(desc(count()))
        .limit(5),
      db
        .select({ country: qrScan.country, scans: count() })
        .from(qrScan)
        .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
        .where(and(codeScope(scope), inWeek, isNotNull(qrScan.country)))
        .groupBy(qrScan.country)
        .orderBy(desc(count()))
        .limit(3),
      db
        .select({ total: count() })
        .from(qrCode)
        .where(
          and(
            codeScope(scope),
            isNull(qrCode.deletedAt),
            gte(qrCode.createdAt, start),
            lt(qrCode.createdAt, end),
          ),
        ),
      db
        .select({ total: count() })
        .from(formResponse)
        .innerJoin(landingPage, eq(landingPage.id, formResponse.pageId))
        .where(
          and(
            pageScope(scope),
            gte(formResponse.createdAt, start),
            lt(formResponse.createdAt, end),
          ),
        ),
    ]);

  return {
    periodStart: start,
    periodEnd: end,
    scans: totals?.total ?? 0,
    previousScans: previous?.total ?? 0,
    uniqueVisitors: totals?.unique ?? 0,
    newCodes: created?.total ?? 0,
    formResponses: responses?.total ?? 0,
    topCodes: topCodes.map((code) => ({
      label: codeLabel(code),
      scans: code.scans,
      url: new URL(
        `/dashboard/codes/${encodeURIComponent(code.id)}`,
        baseUrl.origin,
      ).toString(),
    })),
    topCountries: topCountries.flatMap((row) =>
      row.country ? [{ country: row.country, scans: row.scans }] : [],
    ),
  };
}

/** Nothing worth a Monday email: no scans in two weeks and no responses. */
export const isQuietDigest = (digest: DigestNumbers) =>
  digest.scans === 0 &&
  digest.previousScans === 0 &&
  digest.formResponses === 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DigestRunSummary {
  shard: number | "all";
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  timedOut: boolean;
}

/**
 * Sends last week's digest to every opted-in email setting in the shard.
 * Re-runs within 24 hours are de-duplicated by Resend's idempotency key.
 */
export async function runWeeklyDigest({
  now = new Date(),
  shard = now.getUTCHours() % DIGEST_SHARDS,
  budgetMs = 50_000,
}: {
  now?: Date;
  shard?: number | "all";
  budgetMs?: number;
} = {}): Promise<DigestRunSummary> {
  const started = Date.now();
  const week = previousWeek(now);
  const rows = await db
    .select({
      id: notificationSetting.id,
      userId: notificationSetting.userId,
      organizationId: notificationSetting.organizationId,
      events: notificationSetting.events,
      email: user.email,
      memberId: member.id,
    })
    .from(notificationSetting)
    .innerJoin(user, eq(user.id, notificationSetting.userId))
    .leftJoin(
      member,
      and(
        eq(member.userId, notificationSetting.userId),
        eq(member.organizationId, notificationSetting.organizationId),
      ),
    )
    .where(
      and(
        eq(notificationSetting.channel, "email"),
        sql`${notificationSetting.events}::jsonb @> '["digest.weekly"]'::jsonb`,
      ),
    );

  const candidates = rows.filter(
    (row) =>
      (shard === "all" || digestShard(row.id) === shard) &&
      (!row.organizationId || row.memberId),
  );
  const summary: DigestRunSummary = {
    shard,
    candidates: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    timedOut: false,
  };
  if (!isEmailConfigured) {
    console.info(
      JSON.stringify({ event: "digest.skipped", reason: "not-configured" }),
    );
    return { ...summary, skipped: candidates.length };
  }

  for (const row of candidates) {
    if (Date.now() - started > budgetMs) {
      summary.timedOut = true;
      break;
    }
    try {
      const scope = { userId: row.userId, organizationId: row.organizationId };
      if (!getPlanLimits(await getPlanForScope(scope)).emailAlerts) {
        summary.skipped++;
        continue;
      }
      const digest = await buildDigest(scope, week);
      if (isQuietDigest(digest)) {
        summary.skipped++;
        continue;
      }
      const workspace = await workspaceTitle(scope);
      const unsubscribe = unsubscribeUrl(row.id, "digest.weekly");
      const result = await sendEmail({
        to: row.email,
        subject: `Your QRdx week: ${digest.scans.toLocaleString("en-US")} scans`,
        react: (
          <WeeklyDigestEmail
            {...digest}
            dashboardUrl={new URL(
              "/dashboard/analytics",
              baseUrl.origin,
            ).toString()}
            unsubscribeUrl={unsubscribe}
            workspaceName={workspace}
          />
        ),
        unsubscribeUrl: unsubscribe,
        idempotencyKey: `digest:${row.id}:${week.start.toISOString().slice(0, 10)}`,
        tags: [{ name: "category", value: "weekly_digest" }],
      });
      if (result.sent) summary.sent++;
      else if (result.reason === "not-configured") summary.skipped++;
      else summary.failed++;
      await sleep(SEND_SPACING_MS);
    } catch (error) {
      summary.failed++;
      console.error(
        JSON.stringify({
          event: "digest.failed",
          settingId: row.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  return summary;
}
