import "server-only";

import { isOwnWorkspaceOf, ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { communityTheme, database as db, qrPreset } from "@repo/database";
import { and, count, desc, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import { getPlanLimits, PLANS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import type { ThemeStyles } from "@/types/theme";
import type { SavedTheme } from "./theme";

/** A workspace's themes (`organizationId`) as seen by `userId`. */
type ScopeRef = { userId: string; organizationId: string | null };
type ThemeOwner = { userId: string; organizationId: string | null };

/** Name of the cheapest plan that shares themes with a team (from lib/plans). */
export const teamThemesPlanName = () =>
  PLAN_NAMES[
    PLANS.find((plan) => getPlanLimits(plan).teamThemes) ?? "business"
  ];

/** Team themes are visible to every member; owners and admins manage them. */
export const canManageTeamThemes = (scope: Pick<ActiveScope, "role">) =>
  scope.role === "owner" || scope.role === "admin";

/**
 * "Your themes" are the ones in your own workspace: saved from the editor,
 * picked in every workspace, published to the community. Rows from before
 * workspaces (no organization yet, until the backfill moves them) count too.
 */
export function personalThemesWhere(userId: string) {
  return or(
    eq(qrPreset.organizationId, ownWorkspaceId(userId)),
    and(eq(qrPreset.userId, userId), isNull(qrPreset.organizationId)),
  ) as SQL;
}

/** True for a theme in `userId`'s own workspace (or from before workspaces). */
export const isPersonalTheme = (theme: ThemeOwner, userId: string) =>
  theme.organizationId === null
    ? theme.userId === userId
    : isOwnWorkspaceOf(theme.organizationId, userId);

const inOwnWorkspace = (scope: ScopeRef) =>
  scope.organizationId === null ||
  isOwnWorkspaceOf(scope.organizationId, scope.userId);

/** A workspace's own themes: your own workspace's are your themes. */
export function themeScopeWhere(scope: ScopeRef) {
  return inOwnWorkspace(scope) || scope.organizationId === null
    ? personalThemesWhere(scope.userId)
    : eq(qrPreset.organizationId, scope.organizationId);
}

/** The scope a theme row belongs to (its workspace, seen by its creator). */
export const ownerScope = (theme: ThemeOwner): ScopeRef => ({
  userId: theme.userId,
  organizationId: theme.organizationId,
});

/**
 * Your themes always; another workspace's themes as an owner or admin of
 * that workspace while it's open.
 */
export function canEditTheme(scope: ActiveScope, theme: ThemeOwner): boolean {
  if (isPersonalTheme(theme, scope.userId)) return true;
  return (
    theme.organizationId === scope.organizationId && canManageTeamThemes(scope)
  );
}

/** Your themes plus, in another workspace, that workspace's shared themes. */
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
      inOwnWorkspace(scope)
        ? personal
        : or(personal, eq(qrPreset.organizationId, scope.organizationId)),
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
  const isTeam = !isPersonalTheme(row, scope.userId);
  return {
    ...row,
    isPublished: Boolean(row.isPublished),
    scope: isTeam ? "team" : "personal",
    canEdit: canEditTheme(scope, row),
    // Your default applies in your own workspace; elsewhere, the workspace's.
    isActiveDefault: row.isDefault && isTeam === !inOwnWorkspace(scope),
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
