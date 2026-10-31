"use server";

import { database as db, qrPreset as themeTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import {
  canEditTheme,
  canManageTeamThemes,
  countThemesInScope,
  findThemeById,
  listVisibleThemes,
  ownerScope,
  setOnlyDefaultTheme,
  teamThemesPlanName,
  themeScopeWhere,
} from "@/app/dashboard/themes/_lib/queries";
import type {
  SavedTheme,
  ThemeActionResult,
} from "@/app/dashboard/themes/_lib/theme";
import { getPlan, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  actionError,
  actionSuccess,
  ErrorCode,
  QRCodeThemeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/types/errors";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

const mutationLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, "Theme name cannot be empty")
  .max(50, "Theme name too long");
const idSchema = z.string().trim().min(1, "Theme ID required").max(64);

const createThemeSchema = z.object({
  name: nameSchema,
  style: themeStylePropsSchema,
});

const updateThemeSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  styles: themeStylePropsSchema.optional(),
});

const TOO_MANY = "Too many changes. Please wait a minute and try again.";

/** Expected errors (signed out, bad input, not found) aren't worth reporting. */
function report(error: unknown, context: Record<string, unknown>) {
  if (
    error instanceof UnauthorizedError ||
    error instanceof ValidationError ||
    error instanceof QRCodeThemeNotFoundError
  ) {
    return;
  }
  logError(error as Error, context);
}

function fail(error: string, upgrade = false): ThemeActionResult<never> {
  return upgrade ? { ok: false, error, upgrade } : { ok: false, error };
}

function failure(error: unknown, action: string): ThemeActionResult<never> {
  if (error instanceof UnauthorizedError)
    return fail("Sign in to manage themes.");
  report(error, { action });
  return fail("Something went wrong. Please try again.");
}

async function allowMutation(userId: string): Promise<boolean> {
  const { success } = await mutationLimiter.limit(`themes:${userId}`);
  return success;
}

function revalidate() {
  revalidatePath("/dashboard/themes");
}

/**
 * Themes the signed-in user can pick from: their personal themes plus, while
 * a team is active, the team's shared themes. Empty when signed out.
 */
export async function getThemes(): Promise<SavedTheme[]> {
  try {
    return await listVisibleThemes(await getActiveScope());
  } catch (error) {
    if (error instanceof UnauthorizedError) return [];
    report(error, { action: "getThemes" });
    throw error;
  }
}

/** Public by id: saved themes are shared as /playground/<id> links. */
export const getTheme = cache(async (themeId: string) => {
  try {
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) throw new QRCodeThemeNotFoundError();

    const [theme] = await db
      .select()
      .from(themeTable)
      .where(eq(themeTable.id, parsed.data))
      .limit(1);
    if (!theme) throw new QRCodeThemeNotFoundError();

    return theme;
  } catch (error) {
    report(error, { action: "getTheme", themeId });
    throw error;
  }
});

/** Saves a personal theme (Free: up to the plan's saved-theme limit). */
export async function createTheme(formData: {
  name: string;
  style: ThemeStyles;
}) {
  try {
    const userId = await getCurrentUserId();

    const validation = createThemeSchema.safeParse(formData);
    if (!validation.success) {
      throw new ValidationError("Invalid input", validation.error.format());
    }
    if (!(await allowMutation(userId))) throw new ValidationError(TOO_MANY);

    const personal = { userId, organizationId: null };
    const limit = getPlanLimits(await getPlan(userId)).savedThemes;
    const limitReached = () =>
      actionError(
        ErrorCode.THEME_LIMIT_REACHED,
        `You have reached the limit of ${limit} saved themes on the Free plan. Upgrade to Pro for unlimited themes.`,
      );
    if ((await countThemesInScope(personal)) >= limit) return limitReached();

    const { name, style } = validation.data;
    const now = new Date();
    const [insertedTheme] = await db
      .insert(themeTable)
      .values({
        id: cuid(),
        userId,
        name,
        style,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Concurrent saves can both pass the check above; keep only what the plan allows.
    if (
      Number.isFinite(limit) &&
      (await countThemesInScope(personal)) > limit
    ) {
      await db.delete(themeTable).where(eq(themeTable.id, insertedTheme.id));
      return limitReached();
    }

    revalidate();
    return actionSuccess(insertedTheme);
  } catch (error) {
    report(error, { action: "createTheme" });
    throw error;
  }
}

/** Editing is always allowed, even over the plan limit (e.g. after a downgrade). */
export async function updateTheme(formData: {
  id: string;
  name?: string;
  styles?: ThemeStyles;
}) {
  try {
    const scope = await getActiveScope();

    const validation = updateThemeSchema.safeParse(formData);
    if (!validation.success) {
      throw new ValidationError("Invalid input", validation.error.format());
    }
    const { id: themeId, name, styles } = validation.data;
    if (!name && !styles) {
      throw new ValidationError("No update data provided");
    }
    if (!(await allowMutation(scope.userId))) {
      throw new ValidationError(TOO_MANY);
    }

    const theme = await findThemeById(themeId);
    if (!theme || !canEditTheme(scope, theme)) {
      throw new QRCodeThemeNotFoundError(
        "Theme not found or you can't edit it",
      );
    }

    const updateData: Partial<typeof themeTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name) updateData.name = name;
    if (styles) updateData.style = styles;

    const [updatedTheme] = await db
      .update(themeTable)
      .set(updateData)
      .where(
        and(eq(themeTable.id, themeId), themeScopeWhere(ownerScope(theme))),
      )
      .returning();
    if (!updatedTheme) throw new QRCodeThemeNotFoundError();

    revalidate();
    return updatedTheme;
  } catch (error) {
    report(error, { action: "updateTheme", themeId: formData.id });
    throw error;
  }
}

export async function deleteTheme(themeId: string) {
  try {
    const scope = await getActiveScope();

    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) throw new ValidationError("Theme ID required");
    if (!(await allowMutation(scope.userId))) {
      throw new ValidationError(TOO_MANY);
    }

    const theme = await findThemeById(parsed.data);
    if (!theme || !canEditTheme(scope, theme)) {
      throw new QRCodeThemeNotFoundError(
        "Theme not found or you can't delete it",
      );
    }

    const [deletedTheme] = await db
      .delete(themeTable)
      .where(
        and(eq(themeTable.id, parsed.data), themeScopeWhere(ownerScope(theme))),
      )
      .returning({ id: themeTable.id, name: themeTable.name });
    if (!deletedTheme) throw new QRCodeThemeNotFoundError();

    revalidate();
    return deletedTheme;
  } catch (error) {
    report(error, { action: "deleteTheme", themeId });
    throw error;
  }
}

/**
 * Sets (or clears) the default theme of the theme's own scope: new dynamic
 * codes and fresh playground sessions in that workspace start from it.
 */
export async function setDefaultTheme(
  themeId: string,
  isDefault: boolean,
): Promise<ThemeActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success || typeof isDefault !== "boolean") {
      return fail("Theme not found.");
    }
    if (!(await allowMutation(scope.userId))) return fail(TOO_MANY);

    const theme = await findThemeById(parsed.data);
    if (!theme || !canEditTheme(scope, theme)) {
      return fail(
        theme?.organizationId
          ? "Only team owners and admins can change the team's default theme."
          : "Theme not found.",
      );
    }

    if (isDefault) {
      await setOnlyDefaultTheme(ownerScope(theme), theme.id);
    } else {
      await db
        .update(themeTable)
        .set({ isDefault: false })
        .where(eq(themeTable.id, theme.id));
    }

    revalidate();
    return { ok: true, data: { id: theme.id } };
  } catch (error) {
    return failure(error, "setDefaultTheme");
  }
}

/** Copies one of your personal themes into the active team's shared themes. */
export async function copyThemeToTeam(
  themeId: string,
): Promise<ThemeActionResult<{ id: string }>> {
  try {
    const scope = await getActiveScope();
    const parsed = idSchema.safeParse(themeId);
    if (!parsed.success) return fail("Theme not found.");
    if (!scope.organizationId) {
      return fail("Switch to a team to share themes with it.");
    }
    if (!canManageTeamThemes(scope)) {
      return fail("Only team owners and admins can add team themes.");
    }
    if (!(await allowMutation(scope.userId))) return fail(TOO_MANY);

    const limits = getPlanLimits(await getPlanForScope(scope));
    if (!limits.teamThemes) {
      return fail(
        `Team themes are part of the ${teamThemesPlanName()} plan (based on the team owner's plan).`,
        scope.role === "owner",
      );
    }
    if (
      Number.isFinite(limits.savedThemes) &&
      (await countThemesInScope(scope)) >= limits.savedThemes
    ) {
      return fail(`This team's plan includes ${limits.savedThemes} themes.`);
    }

    const theme = await findThemeById(parsed.data);
    if (
      !theme ||
      theme.organizationId !== null ||
      theme.userId !== scope.userId
    ) {
      return fail("Theme not found.");
    }

    const id = cuid();
    const now = new Date();
    await db.insert(themeTable).values({
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      name: theme.name,
      style: theme.style,
      createdAt: now,
      updatedAt: now,
    });

    revalidate();
    return { ok: true, data: { id } };
  } catch (error) {
    return failure(error, "copyThemeToTeam");
  }
}
