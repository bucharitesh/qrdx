import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { QrCodeStatus } from "@/app/dashboard/codes/_lib/qr-codes";
import { getCodeUsage, listCodes } from "@/app/dashboard/codes/_lib/qr-codes";
import { getDomainsOverview } from "@/app/dashboard/domains/_lib/domains";
import { getPageUsage } from "@/app/dashboard/pages/_lib/landing-pages";
import {
  getTeam,
  listPendingInvitations,
  listTeamMembers,
} from "@/app/dashboard/team/_lib/queries";
import { countThemesInScope } from "@/app/dashboard/themes/_lib/queries";
import { getCustomDomainMode } from "@/lib/feature-availability";
import { getPlanLimits, type Plan } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";

export interface RecentCode {
  id: string;
  title: string;
  shortLink: string;
  scans: number;
  status: QrCodeStatus;
  paused: boolean;
}

export interface SetupTask {
  id: "code" | "page" | "theme" | "team" | "domain";
  done: boolean;
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
  tasks: SetupTask[];
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

async function teamSize(organizationId: string): Promise<number> {
  const [members, pending] = await Promise.all([
    listTeamMembers(organizationId),
    listPendingInvitations(organizationId),
  ]);
  return members.length + pending.length;
}

/** Home: counts, the newest codes and the setup checklist, from real data. */
export async function getHomeData(scope: ActiveScope): Promise<HomeData> {
  const [codeUsage, pageUsage, scans, recent, themes, team] = await Promise.all(
    [
      getCodeUsage(scope),
      getPageUsage(scope),
      totalScans(scope),
      listCodes(scope, { limit: 5, sort: "newest" }),
      countThemesInScope(scope),
      getTeam(scope.organizationId),
    ],
  );
  const plan = codeUsage.plan;
  const limits = getPlanLimits(plan);

  const tasks: SetupTask[] = [
    { id: "code", done: codeUsage.used > 0 || recent.total > 0 },
    { id: "page", done: pageUsage.used > 0 },
    { id: "theme", done: themes > 0 },
  ];
  // Plan-dependent tasks appear only where the plan includes them.
  if (limits.teams) {
    tasks.push({
      id: "team",
      // Someone besides you, invited or joined.
      done: (await teamSize(scope.organizationId)) > 1,
    });
  }
  if (limits.customDomains > 0 && getCustomDomainMode() !== "disabled") {
    const domains = await getDomainsOverview(scope);
    tasks.push({ id: "domain", done: domains.domains.length > 0 });
  }

  return {
    plan,
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
    tasks,
  };
}
