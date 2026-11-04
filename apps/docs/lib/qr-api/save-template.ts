import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { HttpError } from "@/lib/error-response";
import type { ActiveScope } from "@/lib/scope";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";
import { resolveLogo } from "./logo";
import { type ApiStyle, themeFieldsOf } from "./style";

// The MCP save_template tool: a design saved as a theme in the API key's
// workspace, with the same rules as the editor's "Save theme" and the
// community's "Copy to workspace" (actions/qr-themes.ts,
// lib/community/copies.ts):
// - the key's own workspace: the creator's themes, up to their plan's
//   saved-theme limit (Free: 10);
// - a team workspace: its shared themes, for owners and admins, on plans
//   with team themes, up to the team plan's limit.
// The data layer is passed in (ThemeStore) so tests never touch a database.

export const TEMPLATE_NAME_MAX = 50;

export interface ThemeTarget {
  userId: string;
  organizationId: string | null;
  where: "own" | "team";
}

export interface ThemeStore {
  /** The saved-theme limit for the target (Infinity for unlimited) */
  limit(target: ThemeTarget, scope: ActiveScope): Promise<number>;
  /** Whether the workspace's plan shares themes with a team */
  teamThemes(scope: ActiveScope): Promise<boolean>;
  /** The cheapest plan with team themes, for the message */
  teamThemesPlanName(): Promise<string>;
  count(target: ThemeTarget): Promise<number>;
  insert(
    target: ThemeTarget,
    theme: { name: string; style: ThemeStyles },
  ): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
}

export interface SavedTemplate {
  id: string;
  name: string;
  where: ThemeTarget["where"];
  organizationId: string | null;
}

/** The API's LIMIT_REACHED (402), as /v1 sends it. */
export function themeLimitReached(limit: number): HttpError {
  return new HttpError(
    402,
    "LIMIT_REACHED",
    `This workspace's plan includes ${limit} saved themes. Delete one or upgrade to Pro for unlimited themes.`,
  );
}

async function targetFor(
  scope: ActiveScope,
  store: ThemeStore,
): Promise<ThemeTarget> {
  if (
    scope.organizationId === null ||
    isOwnWorkspaceOf(scope.organizationId, scope.userId)
  ) {
    return {
      userId: scope.userId,
      organizationId: scope.organizationId,
      where: "own",
    };
  }
  if (!(scope.role === "owner" || scope.role === "admin")) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only workspace owners and admins can add shared themes. This key's creator is a member of its workspace.",
    );
  }
  if (!(await store.teamThemes(scope))) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      `Shared themes are part of the ${await store.teamThemesPlanName()} plan (based on the workspace owner's plan).`,
    );
  }
  return {
    userId: scope.userId,
    organizationId: scope.organizationId,
    where: "team",
  };
}

/**
 * Saves `style` as a theme named `name` in the key's workspace. Throws the
 * API's errors: VALIDATION_ERROR, FORBIDDEN, PLAN_REQUIRED, LIMIT_REACHED.
 */
export async function saveTemplate(
  scope: ActiveScope,
  input: { name: string; style: ApiStyle },
  store: ThemeStore,
): Promise<SavedTemplate> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > TEMPLATE_NAME_MAX) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `The name must be 1 to ${TEMPLATE_NAME_MAX} characters.`,
    );
  }
  const target = await targetFor(scope, store);
  const limit = await store.limit(target, scope);
  if (Number.isFinite(limit) && (await store.count(target)) >= limit) {
    throw themeLimitReached(limit);
  }

  const logo = await resolveLogo(input.style, scope, "save");
  const style: ThemeStyles = {
    ...themeFieldsOf(input.style),
    ...(logo?.saved ? { showLogo: true, customLogo: logo.saved } : {}),
  };
  const parsed = themeStylePropsSchema.safeParse(style);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "The style isn't valid.");
  }

  const { id } = await store.insert(target, { name, style: parsed.data });
  // Concurrent saves can both pass the check; keep only what the plan allows.
  if (Number.isFinite(limit) && (await store.count(target)) > limit) {
    await store.remove(id);
    throw themeLimitReached(limit);
  }
  return {
    id,
    name,
    where: target.where,
    organizationId: target.organizationId,
  };
}

/** The saved themes in the database (qr_preset), for the MCP route. */
export const databaseThemeStore: ThemeStore = {
  async limit(target, scope) {
    const { getPlan, getPlanForScope, getPlanLimits } = await import(
      "@/lib/plans"
    );
    return target.where === "team"
      ? getPlanLimits(await getPlanForScope(scope)).savedThemes
      : getPlanLimits(await getPlan(target.userId)).savedThemes;
  },
  async teamThemes(scope) {
    const { getPlanForScope, getPlanLimits } = await import("@/lib/plans");
    return getPlanLimits(await getPlanForScope(scope)).teamThemes;
  },
  async teamThemesPlanName() {
    const { teamThemesPlanName } = await import(
      "@/app/dashboard/themes/_lib/queries"
    );
    return teamThemesPlanName();
  },
  async count(target) {
    const { countThemesInScope } = await import(
      "@/app/dashboard/themes/_lib/queries"
    );
    return countThemesInScope(target);
  },
  async insert(target, theme) {
    const [{ database: db, qrPreset }, { default: cuid }] = await Promise.all([
      import("@repo/database"),
      import("cuid"),
    ]);
    const id = cuid();
    const now = new Date();
    await db.insert(qrPreset).values({
      id,
      userId: target.userId,
      organizationId: target.organizationId,
      name: theme.name,
      style: theme.style,
      createdAt: now,
      updatedAt: now,
    });
    // The dashboard and the editor's theme lists show it at once.
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard", "layout");
    return { id };
  },
  async remove(id) {
    const [{ database: db, qrPreset }, { eq }] = await Promise.all([
      import("@repo/database"),
      import("drizzle-orm"),
    ]);
    await db.delete(qrPreset).where(eq(qrPreset.id, id));
  },
};
