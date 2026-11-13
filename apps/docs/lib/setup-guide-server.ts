import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, count, eq, isNull } from "drizzle-orm";
import { listDomains } from "@/app/(app)/dashboard/domains/_lib/domains";
import { getPageUsage } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import {
  listPendingInvitations,
  listTeamMembers,
} from "@/app/(app)/dashboard/team/_lib/queries";
import { countThemesInScope } from "@/app/(app)/dashboard/themes/_lib/queries";
import { getCustomDomainMode } from "@/lib/feature-availability";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { type SetupTask, setupTasks } from "@/lib/setup-guide";

/** Dynamic codes made in the workspace, archived ones too (not the trash). */
async function countCodes(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(
      and(
        eq(qrCode.organizationId, scope.organizationId),
        isNull(qrCode.deletedAt),
      ),
    );
  return row?.total ?? 0;
}

async function teamSize(organizationId: string): Promise<number> {
  const [members, pending] = await Promise.all([
    listTeamMembers(organizationId),
    listPendingInvitations(organizationId),
  ]);
  return members.length + pending.length;
}

/**
 * The open workspace's "Get set up" tasks, ticked from its data. Teams and
 * custom domains count only where the plan includes them (and custom
 * domains only where this deployment can connect them).
 */
export async function getSetupTasks(scope: ActiveScope): Promise<SetupTask[]> {
  const [plan, codes, pages, themes] = await Promise.all([
    getPlanForScope(scope),
    countCodes(scope),
    getPageUsage(scope),
    countThemesInScope(scope),
  ]);
  const limits = getPlanLimits(plan);
  const withDomains =
    limits.customDomains > 0 && getCustomDomainMode() !== "disabled";
  const [team, domains] = await Promise.all([
    limits.teams ? teamSize(scope.organizationId) : null,
    withDomains ? listDomains(scope) : null,
  ]);
  return setupTasks({
    codes,
    pages: pages.used,
    themes,
    teamSize: team,
    domains: domains?.length ?? null,
  });
}
