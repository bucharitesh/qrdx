import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { QrCodeStatus } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  getCodeUsage,
  listCodes,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getPageUsage } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { getTeam } from "@/app/(app)/dashboard/team/_lib/queries";
import type { Plan } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";

export interface RecentCode {
  id: string;
  title: string;
  shortLink: string;
  scans: number;
  status: QrCodeStatus;
  paused: boolean;
}

export interface HomeData {
  plan: Plan;
  /** The workspace's name */
  teamName: string | null;
  codes: { used: number; limit: number | null };
  pages: number;
  /** Every scan of the workspace's codes (archived included, trash not) */
  totalScans: number;
  recent: RecentCode[];
}

function codesWhere(scope: ActiveScope): SQL {
  return and(
    eq(qrCode.organizationId, scope.organizationId),
    isNull(qrCode.deletedAt),
  ) as SQL;
}

async function totalScans(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${qrCode.scanCount}), 0)::int`,
    })
    .from(qrCode)
    .where(codesWhere(scope));
  return Number(row?.total ?? 0);
}

/**
 * Home: counts and the newest codes, from real data. The setup checklist
 * is the app shell's launcher now (lib/setup-guide-server.ts).
 */
export async function getHomeData(scope: ActiveScope): Promise<HomeData> {
  const [codeUsage, pageUsage, scans, recent, team] = await Promise.all([
    getCodeUsage(scope),
    getPageUsage(scope),
    totalScans(scope),
    listCodes(scope, { limit: 5, sort: "newest" }),
    getTeam(scope.organizationId),
  ]);

  return {
    plan: codeUsage.plan,
    teamName: team?.name ?? null,
    codes: { used: codeUsage.used, limit: codeUsage.limit },
    pages: pageUsage.used,
    totalScans: scans,
    recent: recent.codes.map((code) => ({
      id: code.id,
      title: code.title?.trim() || code.destinationUrl,
      shortLink: code.shortLink.replace(/^https?:\/\//, ""),
      scans: code.scanCount,
      status: code.status,
      paused: code.pausedAt !== null,
    })),
  };
}
