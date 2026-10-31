import "server-only";

import { communityTheme, database as db, qrPreset } from "@repo/database";
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getPlanLimits, PLANS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import type { ThemeStyles } from "@/types/theme";
import type { SavedTheme } from "./theme";

type ScopeRef = Pick<ActiveScope, "userId" | "organizationId">;
type ThemeOwner = { userId: string; organizationId: string | null };

/** Name of the cheapest plan that shares themes with a team (from lib/plans). */
export const teamThemesPlanName = () =>
  PLAN_NAMES[
    PLANS.find((plan) => getPlanLimits(plan).teamThemes) ?? "business"
  ];

/** Team themes are visible to every member; owners and admins manage them. */
export const canManageTeamThemes = (scope: Pick<ActiveScope, "role">) =>
  scope.role === "owner" || scope.role === "admin";

export function personalThemesWhere(userId: string) {
  return and(eq(qrPreset.userId, userId), isNull(qrPreset.organizationId));
}

/** A scope's own themes: the active team's, or the user's personal ones. */
export function themeScopeWhere(scope: ScopeRef) {
  return scope.organizationId
    ? eq(qrPreset.organizationId, scope.organizationId)
    : personalThemesWhere(scope.userId);
}

/** The scope a theme row belongs to (its team, or its creator's personal space). */
export const ownerScope = (theme: ThemeOwner): ScopeRef => ({
  userId: theme.userId,
  organizationId: theme.organizationId,
});

/** Personal themes always; team themes as an owner/admin of that active team. */
export function canEditTheme(scope: ActiveScope, theme: ThemeOwner): boolean {
  if (theme.organizationId === null) return theme.userId === scope.userId;
  return (
    theme.organizationId === scope.organizationId && canManageTeamThemes(scope)
  );
}

/** Personal themes plus, inside a team, the team's shared themes. */
export async function listVisibleThemes(
  scope: ActiveScope,
): Promise<SavedTheme[]> {
  const personal = personalThemesWhere(scope.userId);
  const rows = await db
    .select({
      id: qrPreset.id,
      userId: qrPreset.userId,
      name: qrPreset.name,
      organizationId: qrPreset.organizationId,
      isDefault: qrPreset.isDefault,
      style: qrPreset.style,
      createdAt: qrPreset.createdAt,
      updatedAt: qrPreset.updatedAt,
      isPublished: sql<boolean>`${communityTheme.id} is not null`,
    })
    .from(qrPreset)
    .leftJoin(communityTheme, eq(qrPreset.id, communityTheme.themeId))
    .where(
      scope.organizationId
        ? or(personal, eq(qrPreset.organizationId, scope.organizationId))
        : personal,
    )
    .orderBy(desc(qrPreset.createdAt));

  return rows.map((row) => toSavedTheme(scope, row));
}

type ThemeRow = Omit<
  SavedTheme,
  "scope" | "canEdit" | "isActiveDefault" | "isPublished"
> & { isPublished: unknown };

/** Adds where a row lives and what the scope's user may do with it. */
export function toSavedTheme(scope: ActiveScope, row: ThemeRow): SavedTheme {
  const isTeam = row.organizationId !== null;
  return {
    ...row,
    isPublished: Boolean(row.isPublished),
    scope: isTeam ? "team" : "personal",
    canEdit: canEditTheme(scope, row),
    // A personal default only applies in the personal workspace.
    isActiveDefault: row.isDefault && isTeam === Boolean(scope.organizationId),
  };
}

export async function countThemesInScope(scope: ScopeRef): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(qrPreset)
    .where(themeScopeWhere(scope));
  return row?.value ?? 0;
}

export async function findThemeById(id: string) {
  const [row] = await db
    .select({
      id: qrPreset.id,
      userId: qrPreset.userId,
      organizationId: qrPreset.organizationId,
      name: qrPreset.name,
      style: qrPreset.style,
      isDefault: qrPreset.isDefault,
    })
    .from(qrPreset)
    .where(eq(qrPreset.id, id))
    .limit(1);
  return row ?? null;
}

/** Makes `id` the only default theme in its scope, in one statement. */
export async function setOnlyDefaultTheme(scope: ScopeRef, id: string) {
  await db
    .update(qrPreset)
    .set({ isDefault: sql<boolean>`(${qrPreset.id} = ${id})` })
    .where(
      and(
        themeScopeWhere(scope),
        or(eq(qrPreset.id, id), eq(qrPreset.isDefault, true)),
      ),
    );
}

/** Style of the scope's default theme (what new dynamic codes start from). */
export async function getDefaultThemeStyle(
  scope: ScopeRef,
): Promise<ThemeStyles | null> {
  const [row] = await db
    .select({ style: qrPreset.style })
    .from(qrPreset)
    .where(and(themeScopeWhere(scope), eq(qrPreset.isDefault, true)))
    .orderBy(desc(qrPreset.updatedAt))
    .limit(1);
  return row?.style ?? null;
}
