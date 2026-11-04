import "server-only";

import { randomBytes } from "node:crypto";
import {
  codePublicStats,
  customDomain,
  database as db,
  qrCode,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import {
  PUBLIC_STATS_RANGES,
  type PublicStats,
  type PublicStatsRange,
  type PublicStatsShare,
  publicStatsPath,
} from "@/lib/public-stats-shared";
import { getScanAnalytics } from "@/lib/scans";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { codeLinks } from "@/lib/short-links";

// Public analytics pages (the Dub study's gap 9, after Dub's shared
// dashboards; the flow, not the code): an owner or editor turns one on for a
// code and gets /stats/<token>, a read-only page with scans over time, top
// countries, devices and referrer hosts. No row = off; a new token = a reset
// link. The table comes from manual-sql/0016; until it's applied, sharing
// says it isn't available and every /stats link is a 404.

export type {
  PublicStats,
  PublicStatsRange,
  PublicStatsShare,
} from "@/lib/public-stats-shared";

/** 24 random bytes as 32 URL-safe characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const newToken = () => randomBytes(24).toString("base64url");

/** The code_public_stats table isn't there yet (manual-sql/0016). */
export class PublicStatsUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "UNAVAILABLE",
      "Sharing analytics isn't available on this server yet.",
    );
    this.name = "PublicStatsUnavailableError";
  }
}

let missingLogged = false;

async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!missingLogged) {
        missingLogged = true;
        logError(error as Error, {
          action: "public-stats",
          hint: "Apply packages/database/manual-sql/0016_public_stats.sql",
        });
      }
      throw new PublicStatsUnavailableError();
    }
    throw error;
  }
}

// Owners and editors (everyone who can change a code today); an explicit
// list, so a role added later (a read-only viewer) can't share until
// someone decides it may.
const SHARE_ROLES = new Set(["owner", "admin", "member"]);

export const canSharePublicStats = (scope: Pick<ActiveScope, "role">) =>
  SHARE_ROLES.has(scope.role);

export const publicStatsUrl = (token: string) =>
  new URL(publicStatsPath(token), baseUrl.origin).toString();

const notFound = () => new HttpError(404, "NOT_FOUND", "QR code not found");

/** A code of the scope that isn't in the trash (others look missing). */
async function findCode(scope: ActiveScope, codeId: string) {
  const [row] = await db
    .select({
      id: qrCode.id,
      userId: qrCode.userId,
      organizationId: qrCode.organizationId,
    })
    .from(qrCode)
    .where(and(eq(qrCode.id, codeId), isNull(qrCode.deletedAt)))
    .limit(1);
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

async function findShare(codeId: string) {
  const [row] = await guarded(() =>
    db
      .select()
      .from(codePublicStats)
      .where(eq(codePublicStats.qrCodeId, codeId))
      .limit(1),
  );
  return row ?? null;
}

function toShare(
  scope: ActiveScope,
  row: { token: string; createdAt: Date } | null,
): PublicStatsShare {
  return {
    available: true,
    canManage: canSharePublicStats(scope),
    url: row ? publicStatsUrl(row.token) : null,
    since: row ? row.createdAt.toISOString() : null,
  };
}

function assertCanShare(scope: ActiveScope) {
  if (!canSharePublicStats(scope)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only owners and editors can share a code's analytics.",
    );
  }
}

/** Whether the code's analytics are shared, and the link when they are. */
export async function getPublicStatsShare(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  await findCode(scope, codeId);
  try {
    return toShare(scope, await findShare(codeId));
  } catch (error) {
    if (error instanceof PublicStatsUnavailableError) {
      return {
        available: false,
        canManage: false,
        url: null,
        since: null,
      };
    }
    throw error;
  }
}

/** Turns the page on (the existing link stays when it's already on). */
export async function enablePublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  await guarded(() =>
    db
      .insert(codePublicStats)
      .values({
        id: cuid(),
        qrCodeId: codeId,
        token: newToken(),
        createdBy: scope.userId,
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
  );
  return toShare(scope, await findShare(codeId));
}

/** A new link; the old one stops working at once. */
export async function resetPublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  const [row] = await guarded(() =>
    db
      .update(codePublicStats)
      .set({
        token: newToken(),
        createdBy: scope.userId,
        createdAt: new Date(),
      })
      .where(eq(codePublicStats.qrCodeId, codeId))
      .returning(),
  );
  if (!row) return enablePublicStats(scope, codeId);
  return toShare(scope, row);
}

/** Turns the page off; its link becomes a 404 at once. */
export async function disablePublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  await guarded(() =>
    db.delete(codePublicStats).where(eq(codePublicStats.qrCodeId, codeId)),
  );
  return toShare(scope, null);
}

// ─── The public page ─────────────────────────────────────────────────────────

/**
 * Aggregates only (counts per day, country, device type and referrer
 * host), cached for a few minutes per code and range. The token is looked
 * up on every request, so turning sharing off or resetting the link
 * applies at once even while the numbers are cached.
 */
const cachedAnalytics = unstable_cache(
  async (codeId: string, days: number) => {
    const analytics = await getScanAnalytics(codeId, days);
    return {
      days: analytics.days,
      total: analytics.total,
      unique: analytics.unique,
      series: analytics.series,
      countries: analytics.countries,
      devices: analytics.devices,
      referrers: analytics.referrers,
    };
  },
  ["public-stats-analytics"],
  { revalidate: 300 },
);

/** The page for a token, or null (unknown token, code gone or switched off). */
export async function loadPublicStats(
  token: string,
  range: PublicStatsRange,
): Promise<PublicStats | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  let row:
    | {
        codeId: string;
        title: string | null;
        slug: string;
        slugScope: string;
        destinationUrl: string;
        isActive: boolean;
        createdAt: Date;
        userId: string;
        organizationId: string | null;
        hostname: string | null;
        verified: boolean | null;
      }
    | undefined;
  try {
    [row] = await guarded(() =>
      db
        .select({
          codeId: qrCode.id,
          title: qrCode.title,
          slug: qrCode.slug,
          slugScope: qrCode.slugScope,
          destinationUrl: qrCode.destinationUrl,
          isActive: qrCode.isActive,
          createdAt: qrCode.createdAt,
          userId: qrCode.userId,
          organizationId: qrCode.organizationId,
          hostname: customDomain.hostname,
          verified: customDomain.verified,
        })
        .from(codePublicStats)
        .innerJoin(qrCode, eq(qrCode.id, codePublicStats.qrCodeId))
        .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
        .where(and(eq(codePublicStats.token, token), isNull(qrCode.deletedAt)))
        .limit(1),
    );
  } catch (error) {
    if (error instanceof PublicStatsUnavailableError) return null;
    throw error;
  }
  // A code an admin switched off (abuse review) isn't shown either.
  if (!row?.isActive) return null;

  // Never further back than the workspace's plan keeps scans.
  const retention = getPlanLimits(
    await getPlanForScope({
      userId: row.userId,
      organizationId: row.organizationId,
    }),
  ).analyticsRetentionDays;
  const ranges = PUBLIC_STATS_RANGES.filter(
    (key) => RANGE_DAYS[key] <= retention,
  );
  const chosen = ranges.includes(range) ? range : (ranges.at(-1) ?? "7d");
  const analytics = await cachedAnalytics(row.codeId, RANGE_DAYS[chosen]);

  let destinationHost: string | null = null;
  try {
    destinationHost = new URL(row.destinationUrl).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    destinationHost = null;
  }
  const { link } = codeLinks(
    { slug: row.slug, slugScope: row.slugScope },
    row.hostname
      ? { hostname: row.hostname, verified: Boolean(row.verified) }
      : null,
  );

  return {
    code: {
      title: row.title,
      shortLink: link,
      destinationHost,
      createdAt: row.createdAt.toISOString(),
    },
    range: chosen,
    ranges,
    analytics,
  };
}

const RANGE_DAYS: Record<PublicStatsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
